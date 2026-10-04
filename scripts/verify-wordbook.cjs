/* Focused browser integration checks. Run with Playwright and an installed Chrome. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = (process.env.PASSAGE_TEST_URL || 'http://127.0.0.1:8765/_site/').replace(/\/?$/, '/');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://freedictionaryapi.com/**', route => route.fulfill({json:{entries:[{language:{code:'en',name:'English'},partOfSpeech:'noun',pronunciations:[{type:'ipa',text:'/test/'}],senses:[{definition:'A first general dictionary meaning.'},{definition:'A second meaning for the saved context.'}]}],source:{url:'https://en.wiktionary.org/wiki/test',license:{name:'CC BY-SA 4.0',url:'https://creativecommons.org/licenses/by-sa/4.0/'}}}}));
  await page.goto(base);
  await page.evaluate(() => {
    localStorage.clear();
    const all=window.COURSE_VOCABULARY;
    localStorage.setItem(all[0].storageKey,JSON.stringify({saved:[all[0].words[0].id,all[0].words[1].id],writing:'A draft that must survive migration.',read:['A'],answers:{1:'TRUE'}}));
    localStorage.setItem(all[1].storageKey,JSON.stringify({saved:[all[1].words[0].id],writing:'A second draft.'}));
  });
  await page.reload();
  assert.equal(await page.evaluate(()=>Wordbook.read().entries.length),3,'Root migrates all lessons');
  await page.reload();
  assert.equal(await page.evaluate(()=>Wordbook.read().entries.length),3,'Migration is idempotent');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(COURSE_VOCABULARY[0].storageKey)).writing),'A draft that must survive migration.');
  await page.goto(base+'26.9.6/index.html#reading');
  // Double-clicking an existing glossary word selects it without opening its dialog.
  await page.locator('.word-mark').first().dblclick();
  await page.locator('#wb-selection').waitFor({state:'visible'});
  assert.equal(await page.locator('#detail-dialog').evaluate(d=>d.open),false);
  await page.evaluate(()=>getSelection().removeAllRanges());
  await page.locator('.word-mark').first().click();
  await page.waitForFunction(()=>document.querySelector('#detail-dialog').open);
  // Free selection remains usable inside the existing vocabulary dialog's top layer.
  await page.evaluate(()=>{const p=document.querySelector('#dialog-content .definition');const n=p.firstChild;const r=document.createRange();r.setStart(n,4);r.setEnd(n,11);getSelection().removeAllRanges();getSelection().addRange(r);p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
  await page.locator('#wb-selection').waitFor({state:'visible'});
  assert.equal(await page.locator('#wb-selection').evaluate(b=>b.closest('dialog')?.id),'detail-dialog');
  await page.locator('#wb-selection').click();
  await page.locator('#detail-dialog [data-action="close-dialog"]').click();
  // Remove the dialog-only test entry before checking the main collection size.
  await page.evaluate(()=>{for(const e of Wordbook.read().entries.filter(e=>e.sources.some(s=>s.label==='Reading'&&s.location==='reading')))Wordbook.remove(e.id);});
  // Select a word without a predefined glossary entry, including its real text node.
  const selected = await page.evaluate(() => {
    const p=document.querySelector('.english-passage'), walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);
    let node;
    while(node=walker.nextNode()) {
      const match=[...node.textContent.matchAll(/[A-Za-z]{6,}/g)].find(m=>!Wordbook.lessons[0].words.some(w=>Wordbook.normalize(w.word)===Wordbook.normalize(m[0])));
      if(match){const r=document.createRange();r.setStart(node,match.index);r.setEnd(node,match.index+match[0].length);getSelection().removeAllRanges();getSelection().addRange(r);p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return match[0];}
    }
  });
  assert.ok(selected);
  await page.locator('#wb-selection').waitFor({state:'visible'});
  await page.locator('#wb-selection').click();
  await page.waitForFunction(value=>Wordbook.read().entries.find(e=>e.key===Wordbook.normalize(value))?.dictionaryStatus==='ready',selected);
  let entry=await page.evaluate(value=>Wordbook.read().entries.find(e=>e.key===Wordbook.normalize(value)),selected);
  assert.equal(entry.definition,'','Dictionary candidates do not silently claim contextual correctness');
  assert.ok(entry.sources[0].quote.includes(selected));
  assert.equal(entry.sources[0].location,'reading-A');
  await page.locator('#wb-toast [data-wb="edit"]').click();
  await page.locator('[data-wb="sense"]').nth(1).click();
  await page.locator('#wb-edit-form [name="note"]').fill('My own memory clue.');
  await page.locator('#wb-edit-form button[type="submit"]').click();
  await page.goto(base+'wordbook.html');
  assert.equal(await page.locator('.wb-row').count(),4);
  // Manual add, speech button and editor are exercised through the actual UI.
  await page.locator('.wb-heading [data-wb="add"]').click();
  await page.locator('#wb-add-form [name="term"]').fill('manual phrase');
  await page.locator('#wb-add-form button[type="submit"]').click();
  await page.locator('#wb-edit-form [name="definition"]').fill('A phrase I entered myself.');
  await page.locator('#wb-edit-form button[type="submit"]').click();
  await page.evaluate(()=>{window.spoken=[];speechSynthesis.speak=u=>window.spoken.push(u.text);});
  await page.locator('.wb-row').filter({hasText:'manual phrase'}).locator('[data-wb="speak"]').click();
  assert.deepEqual(await page.evaluate(()=>window.spoken),['manual phrase']);
  await page.locator('#wb-search').fill(selected);
  assert.equal(await page.locator('.wb-row').count(),1);
  assert.match(await page.locator('.wb-meaning').innerText(),/second meaning/);
  // Shared deduplication and multiple sources survive edits and lookup retries.
  await page.evaluate(value=>Wordbook.add(' '+value.toUpperCase()+'! ',{folder:'26.9.7',location:'reading-C',label:'Paragraph C',quote:'A second lesson contains '+value+'.',selectedText:value}),selected);
  entry=await page.evaluate(value=>Wordbook.read().entries.find(e=>e.key===Wordbook.normalize(value)),selected);
  assert.equal(entry.sources.length,2);
  assert.equal(entry.note,'My own memory clue.');
  await page.evaluate(id=>Wordbook.lookup(id,true),entry.id);
  assert.equal(await page.evaluate(id=>Wordbook.get(id).definition,entry.id),'A second meaning for the saved context.');
  assert.match(await page.evaluate(id=>Wordbook.get(id).definitionAttribution.url,entry.id),/wiktionary/);
  // Editing to a base form keeps original selections; merged terms keep context.
  await page.evaluate(id=>{Wordbook.add('baseform');Wordbook.update(id,{term:'baseform',definition:'An edited meaning.'});},entry.id);
  assert.equal(await page.evaluate(()=>Wordbook.read().entries.filter(e=>e.key==='baseform').length),1);
  assert.equal(await page.evaluate(id=>Wordbook.get(id).sources[0].selectedText,entry.id),selected);
  await page.locator('#wb-search').fill('');
  // JSON import merges, keeps current edits and rejects malformed backups atomically.
  const backup=await page.evaluate(()=>Wordbook.exportBackup());
  const importResult=await page.evaluate(text=>{const b=JSON.parse(text);b.entries.find(e=>e.key==='baseform').definition='An imported override.';return Wordbook.importBackup(JSON.stringify(b));},backup);
  assert.equal(importResult.added,0);
  assert.equal(await page.evaluate(id=>Wordbook.get(id).definition,entry.id),'An edited meaning.');
  const invalid=await page.evaluate(()=>{const before=Wordbook.exportBackup();let rejected=false;try{Wordbook.importBackup(JSON.stringify({format:'passage-wordbook',version:1,entries:[{term:'valid',sources:[]},{term:'bad',sources:null}]}));}catch{rejected=true;}return {rejected,same:JSON.stringify(JSON.parse(before).entries)===JSON.stringify(Wordbook.read().entries)};});
  assert.deepEqual(invalid,{rejected:true,same:true});
  await page.locator('#wb-search').fill('baseform');
  await page.locator('[data-wb="delete"]').click();
  assert.equal(await page.locator('.wb-row').count(),0);
  await page.locator('[data-wb="undo"]').click();
  assert.equal(await page.locator('.wb-row').count(),1);
  await page.locator('[data-wb="recall"]').click();
  assert.equal(await page.locator('.wb-recall-answer').count(),0);
  await page.locator('[data-wb="reveal"]').click();
  await page.locator('[data-wb="rate"][data-rating="remembered"]').click();
  await page.locator('#wb-dialog [data-wb="close"]').first().click();
  assert.equal(await page.evaluate(id=>Wordbook.get(id).review,entry.id),'remembered');
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-wb="export"]').click();
  assert.match((await downloadPromise).suggestedFilename(),/^passage-wordbook-.*\.json$/);
  await page.locator('#wb-import').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await page.waitForFunction(()=>document.querySelector('#wb-notice').textContent.includes('Import complete'));
  // Dictionary failure and empty result retain an editable saved entry, and retry succeeds.
  await page.unroute('https://freedictionaryapi.com/**');
  await page.route('https://freedictionaryapi.com/**', route=>route.abort());
  const failedId=await page.evaluate(()=>Wordbook.add('unavailableword'));
  await page.waitForFunction(id=>Wordbook.get(id)?.dictionaryStatus==='error',failedId);
  assert.ok(await page.evaluate(id=>!!Wordbook.get(id),failedId));
  await page.unroute('https://freedictionaryapi.com/**');
  await page.route('https://freedictionaryapi.com/**', route=>route.fulfill({json:{entries:[]}}));
  await page.evaluate(id=>Wordbook.lookup(id,true),failedId);
  assert.equal(await page.evaluate(id=>Wordbook.get(id).dictionaryStatus,failedId),'missing');
  const builtInId=await page.evaluate(()=>Wordbook.add('constructor'));
  await page.waitForFunction(id=>Wordbook.get(id)?.dictionaryStatus==='missing',builtInId);
  assert.ok(Array.isArray(await page.evaluate(id=>Wordbook.get(id).candidates,builtInId)),'Cache does not read inherited object properties');
  // A base-form change while the old lookup is running must query the new form.
  await page.unroute('https://freedictionaryapi.com/**');
  const requested=[];
  await page.route('https://freedictionaryapi.com/**',async route=>{requested.push(route.request().url());await new Promise(resolve=>setTimeout(resolve,150));await route.fulfill({json:{entries:[]}});});
  const renamedId=await page.evaluate(()=>{const id=Wordbook.add('runninglookup');Wordbook.update(id,{term:'newlookup'});Wordbook.lookup(id);return id;});
  await page.waitForFunction(id=>Wordbook.get(id)?.key==='newlookup'&&Wordbook.get(id)?.dictionaryStatus==='missing',renamedId);
  // Wait for the request for the new form, rather than the immediate post-edit status.
  await page.waitForResponse(response=>response.url().includes('/newlookup'),{timeout:3000});
  assert.ok(requested.some(url=>url.includes('/runninglookup'))&&requested.some(url=>url.includes('/newlookup')));
  // Per-lesson unlink does not delete the global entry or another lesson's association.
  await page.evaluate(()=>{
    const a=Wordbook.lessons[0],v=a.words[0];Wordbook.add(v.word,{folder:'26.9.7',location:'reading-A',label:'Paragraph A',quote:'Another context.',selectedText:v.word});
    Wordbook.togglePreset(a.folder,v.id);
  });
  assert.equal(await page.evaluate(()=>Wordbook.bookmarked('26.9.6',Wordbook.lessons[0].words[0].word)),false);
  assert.equal(await page.evaluate(()=>Wordbook.bookmarked('26.9.7',Wordbook.lessons[0].words[0].word)),true);
  await page.reload();
  assert.equal(await page.evaluate(()=>Wordbook.bookmarked('26.9.6',Wordbook.lessons[0].words[0].word)),false,'No migration resurrection');
  await page.goto(base+'26.9.6/index.html#vocabulary');
  await page.locator('[data-action="save-word"][data-id="01"]').click();
  assert.equal(await page.locator('[data-action="save-word"][data-id="01"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-action="save-word"][data-id="01"]').click();
  assert.equal(await page.locator('[data-action="save-word"][data-id="01"]').getAttribute('aria-pressed'),'false');
  // Keyboard selection in an existing draft also captures context.
  await page.goto(base+'26.9.6/index.html#writing');
  await page.locator('#writing-editor').focus();
  await page.evaluate(()=>{const field=document.querySelector('#writing-editor');field.setSelectionRange(2,7);});
  await page.keyboard.press('Shift+ArrowRight');
  await page.locator('#wb-selection').waitFor({state:'visible'});
  await page.locator('#wb-selection').click();
  assert.ok(await page.evaluate(()=>Wordbook.read().entries.some(e=>e.sources.some(s=>s.location==='writing'&&s.quote.includes('draft')))));
  const another=await context.newPage();await another.goto(base+'26.9.7/index.html#review');
  await page.evaluate(()=>Wordbook.add('crosswindow',{folder:'26.9.7',location:'reading-A',label:'Paragraph A',quote:'A cross-window word.',selectedText:'crosswindow'}));
  await another.waitForFunction(()=>document.querySelector('.wb-course-review').textContent.includes('crosswindow'));
  await another.close();
  // Relevant pre-existing lesson routes still render and preserve drafts.
  for(const folder of ['26.9.6','26.9.7']) {
    await page.goto(base+folder+'/index.html#writing');
    assert.ok((await page.locator('#writing-editor').inputValue()).includes('draft'));
    for(const view of ['reading','vocabulary','grammar','exercises','speaking','review']){
      await page.evaluate(v=>location.hash=v,view);await page.waitForFunction(v=>document.querySelector(`[data-view="${v}"]`).getAttribute('aria-current')==='page',view);
      assert.ok(await page.locator('#main').innerText());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,view+' overflow');
    }
  }
  await page.goto(base+'wordbook.html');
  for(const width of [1280,1440,1920]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Wordbook overflow');}
  assert.equal(await page.evaluate(()=>/[\u3400-\u9fff]/.test(document.body.innerText)),false,'English-only UI');
  assert.equal(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size;}),true,'Unique UI IDs');
  const broken=await browser.newContext();
  const brokenPage=await broken.newPage();await brokenPage.goto(base);
  await brokenPage.evaluate(()=>localStorage.setItem('passage-wordbook-v1',JSON.stringify({version:1,entries:[{}],migrated:[],cache:{}})));
  await brokenPage.goto(base+'wordbook.html');
  assert.match(await brokenPage.locator('#wb-notice').innerText(),/could not be read/);
  assert.equal(await brokenPage.evaluate(()=>JSON.parse(localStorage.getItem('passage-wordbook-v1')).entries.length),1,'Corrupt data is preserved');
  await broken.close();
  assert.deepEqual(errors,[],'No page errors');
  console.log('PASS: migration, context selection, senses, shared entries, edits, recall, JSON, failures, unlink, cross-window, lesson regression and desktop layouts.');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
