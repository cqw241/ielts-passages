/* Sentence collection regression checks, using an isolated browser profile. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = (process.env.PASSAGE_TEST_URL || 'http://127.0.0.1:8765/_site/').replace(/\/?$/, '/');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const page = await context.newPage(), errors = [], dictionaryRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://freedictionaryapi.com/**', route => { dictionaryRequests.push(route.request().url()); return route.fulfill({json:{entries:[]}}); });
    await page.goto(base+'wordbook.html');
    const legacyBackup = await page.evaluate(() => {
      const l = Wordbook.lessons[0], w = l.words[0];
      Wordbook.add(w.word,{folder:l.folder,location:w.location,label:w.label,quote:w.article,selectedText:w.word});
      const data = Wordbook.read();delete data.entries[0].kind;
      localStorage.setItem('passage-wordbook-v1',JSON.stringify(data));
      localStorage.setItem(l.storageKey,JSON.stringify({saved:[w.id],writing:'Keep this essay.',read:['A']}));
      return JSON.stringify({format:'passage-wordbook',version:1,entries:data.entries});
    });
    await page.reload();
    assert.equal(await page.locator('.wb-row').count(),1,'Untyped legacy word preserved');
    assert.equal(await page.locator('#wb-sentence-count').innerText(),'0');
    await page.goto(base+'26.9.7/index.html#reading');
    const original = await page.evaluate(() => {
      const paragraph=document.querySelector('.english-passage');
      const text=[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(paragraph.textContent)][0].segment.trim();
      const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT), range=document.createRange();
      let node,remaining=text.length;
      node=walker.nextNode();range.setStart(node,0);
      do { if(remaining<=node.textContent.length){range.setEnd(node,remaining);break;} remaining-=node.textContent.length; }while(node=walker.nextNode());
      getSelection().removeAllRanges();getSelection().addRange(range);
      paragraph.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return text;
    });
    assert.ok(original.length>100,'Long selection must bypass word limit');
    await page.locator('#wb-save-sentence').waitFor({state:'visible'});
    assert.equal(await page.locator('#wb-selection').isVisible(),false,'Long sentences do not become truncated words');
    await page.locator('#wb-save-sentence').click();
    assert.match(await page.locator('#wb-toast').innerText(),/Sentence saved/);
    let sentence = await page.evaluate(() => Wordbook.read().entries.find(e=>e.kind==='sentence'));
    assert.equal(sentence.term,original);assert.equal(sentence.sources[0].selectedText,original);assert.equal(sentence.sources[0].location,'reading-A');
    assert.equal(dictionaryRequests.length,0,'Sentences are never sent to a word dictionary');
    await page.locator('#wb-toast [data-wb="edit"]').click();
    assert.equal(await page.locator('.wb-editor-sentence').innerText(),original);
    assert.equal(await page.locator('#wb-candidates').count(),0);
    await page.locator('#wb-edit-form [name="definition"]').fill('My understanding of this sentence.');
    await page.locator('#wb-edit-form [name="note"]').fill('Pay attention to the contrast.');
    await page.locator('#wb-edit-form button[type="submit"]').click();
    await page.goto(base+'wordbook.html#sentences');
    assert.equal(await page.locator('#wb-sentences-tab').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('.wb-sentence-row').count(),1);
    assert.equal(await page.locator('.wb-sentence-text').innerText(),original);
    assert.match(await page.locator('.wb-sentence-source a').getAttribute('href'),/26\.9\.7\/index\.html#reading-A$/);
    assert.equal(await page.locator('[data-wb="recall"]').isVisible(),false,'Word-only controls stay hidden');
    await page.locator('#wb-search').fill('contrast');assert.equal(await page.locator('.wb-row').count(),1);
    await page.locator('#wb-search').fill('absent-query');assert.equal(await page.locator('.wb-row').count(),0);
    await page.locator('#wb-search').fill('');
    // Repeated sentences merge contexts while preserving original punctuation and notes.
    await page.evaluate(text=>Wordbook.addSentence(text.replace(/ /g,'  '),{folder:'26.9.6',location:'reading-B',label:'Paragraph B',quote:text,selectedText:text}),original);
    assert.equal(await page.locator('.wb-sentence-row').count(),1);
    sentence = await page.evaluate(() => Wordbook.read().entries.find(e=>e.kind==='sentence'));
    assert.equal(sentence.term,original);assert.equal(sentence.sources.length,2);assert.equal(sentence.note,'Pay attention to the contrast.');
    await page.evaluate(text=>{const e=Wordbook.read().entries.find(e=>e.kind==='sentence');Wordbook.addSentence(text,{...e.sources[0],selectedText:text.toUpperCase().replace(/ /g,'  ')});},original);
    assert.equal(await page.evaluate(()=>Wordbook.read().entries.find(e=>e.kind==='sentence').sources.length),2,'Repeated context does not create duplicate sources');
    await page.locator('#wb-lesson').selectOption('26.9.6');assert.equal(await page.locator('.wb-row').count(),1);
    await page.locator('#wb-lesson').selectOption('');
    // Separate types never merge or alter lesson word bookmarks.
    await page.evaluate(()=>{Wordbook.addSentence('resilience',{folder:'26.9.6',location:'reading-A',label:'Paragraph A',quote:'resilience',selectedText:'resilience'});});
    assert.equal(await page.evaluate(()=>Wordbook.read().entries.filter(e=>e.term==='resilience').length),2);
    assert.equal(await page.evaluate(()=>Wordbook.bookmarked('26.9.6','resilience')),true);
    const typedShortId = await page.evaluate(()=>Wordbook.read().entries.find(e=>e.kind==='sentence'&&e.term==='resilience').id);
    await page.evaluate(id=>Wordbook.remove(id),typedShortId);
    assert.equal(await page.evaluate(()=>Wordbook.bookmarked('26.9.6','resilience')),true);
    const backup=await page.evaluate(()=>Wordbook.exportBackup());assert.equal(JSON.parse(backup).version,2);
    await page.evaluate(id=>Wordbook.update(id,{note:'Keep my current edit.'}),sentence.id);
    await page.locator('#wb-import').setInputFiles({name:'combined.json',mimeType:'application/json',buffer:Buffer.from(backup)});
    await page.waitForFunction(()=>document.querySelector('#wb-notice').textContent.includes('Import complete'));
    assert.equal(await page.evaluate(id=>Wordbook.get(id).note,sentence.id),'Keep my current edit.');
    await page.locator('#wb-import').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(legacyBackup)});
    await page.waitForFunction(()=>document.querySelector('#wb-notice').textContent.includes('Import complete'));
    const downloadPromise=page.waitForEvent('download');await page.locator('[data-wb="export"]').click();assert.match((await downloadPromise).suggestedFilename(),/\.json$/);
    await page.locator('[data-wb="delete"]').click();assert.equal(await page.locator('.wb-row').count(),0);
    await page.locator('[data-wb="undo"]').click();assert.equal(await page.locator('.wb-row').count(),1);
    await page.reload();assert.equal(await page.locator('.wb-row').count(),1);
    // A clean browser can import both words and full-length sentences from the same backup.
    const restored=await browser.newContext(), restoredPage=await restored.newPage();await restoredPage.goto(base+'wordbook.html#sentences');
    await restoredPage.evaluate(raw=>Wordbook.importBackup(raw),backup);
    assert.equal(await restoredPage.locator('.wb-sentence-text').innerText(),original);
    assert.equal(await restoredPage.evaluate(()=>Wordbook.read().entries.filter(e=>Wordbook.kind(e)==='word').length),1);
    await restored.close();
    // Tabs support arrow keys and direct links; words keep their original functionality.
    await page.locator('#wb-sentences-tab').focus();await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#wb-words-tab').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('.wb-row').count(),1);assert.equal(await page.locator('[data-wb="recall"]').isVisible(),true);
    await page.keyboard.press('End');assert.equal(await page.locator('#wb-sentences-tab').getAttribute('aria-selected'),'true');
    await page.locator('.wb-heading [data-wb="add"]').click();
    await page.locator('#wb-add-form [name="term"]').fill('A manually saved sentence, with its punctuation intact.');
    await page.locator('#wb-add-form button[type="submit"]').click();await page.locator('#wb-dialog [data-wb="close"]').first().click();
    assert.equal(await page.locator('.wb-sentence-row').count(),2);
    const invalid=await page.evaluate(()=>{const before=Wordbook.read().entries.length;let rejected=false;try{Wordbook.importBackup(JSON.stringify({format:'passage-wordbook',version:2,entries:[{kind:'sentence',term:'Valid sentence.',sources:[]},{kind:'unknown',term:'Bad.',sources:[]}]}));}catch{rejected=true;}return {rejected,unchanged:Wordbook.read().entries.length===before};});
    assert.deepEqual(invalid,{rejected:true,unchanged:true});
    for(const width of [1280,1440,1920]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Desktop layout');}
    assert.equal(await page.evaluate(()=>/[\u3400-\u9fff]/.test(document.body.innerText)),false,'English-only UI');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(Wordbook.lessons[0].storageKey)).writing),'Keep this essay.');
    assert.deepEqual(errors,[]);assert.equal(dictionaryRequests.length,0);
    console.log('PASS: long sentence selection, exact text, notes, sources, deduplication, typed isolation, legacy/combined backup, deletion/undo, tabs, persistence and desktop UI.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
