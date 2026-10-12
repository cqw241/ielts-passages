/* Focused follow-up regression: semantic meaning identity and Markdown review inputs. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=(process.env.PASSAGE_TEST_URL||'http://127.0.0.1:8765/_site/').replace(/\/?$/,'/');
const plain='Resilience means the ability to recover after a setback.';
const formatted='> **Resilience** means the *ability* to `recover` after [a setback.](https://example.com)';
const table='| Resilience means | the **ability** |\n| --- | --- |\n| to `recover` | after [a setback.](https://example.com) |';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://freedictionaryapi.com/**',r=>r.fulfill({json:{entries:[]}}));
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});
  await page.goto(base+'wordbook.html');
  const id=await page.evaluate(definition=>{
   const id=Wordbook.add('resilience');Wordbook.update(id,{definition,definitionSource:'personal'});Wordbook.selectStatus(id,'active');
   Wordbook.rate(id,'production','good','resilience');Wordbook.rate(id,'recognition','good','Recovery after setbacks.');return id;
  },plain);
  const learning=await page.evaluate(id=>Wordbook.get(id).learning,id);
  assert.equal(learning.recognition.history.length,1);assert.equal(learning.production.history.length,1);
  const originalBackup=await page.evaluate(()=>Wordbook.exportBackup());
  await page.locator(`[data-entry="${id}"] .wb-row-actions [data-wb="edit"]`).click();
  await page.locator('#wb-edit-definition').fill(formatted);
  assert.equal(await page.locator('#wb-learning-reset').innerText(),'','Formatting must not warn about resetting progress');
  await page.locator('#wb-edit-form button[type="submit"]').click();
  assert.deepEqual(await page.evaluate(id=>Wordbook.get(id).learning,id),learning,'Formatting keeps both entire schedules/history');
  for(const definition of [formatted.replace('https://example.com','https://example.org'), '**Resilience**\n\n- means the *ability*\n- to `recover` after [a setback.](https://example.org)', '# '+plain+'\n\n---', plain+'\n===', table]) {
   await page.evaluate(({id,definition})=>Wordbook.update(id,{definition,definitionSource:'personal'}),{id,definition});
   assert.deepEqual(await page.evaluate(id=>Wordbook.get(id).learning,id),learning,'Link destination and block/list formatting are cosmetic');
  }
  const backup=await page.evaluate(()=>Wordbook.exportBackup());
  await page.evaluate(raw=>{localStorage.clear();Wordbook.importBackup(raw);},backup);
  const restored=await page.evaluate(()=>Wordbook.read().entries[0]);
  assert.deepEqual(restored.learning,learning);assert.equal(restored.definition,JSON.parse(backup).entries[0].definition);
  // A newer plain-text backup shares history with an equivalent formatted meaning.
  const newer=JSON.parse(originalBackup);
  newer.entries[0].learning=await page.evaluate(l=>{
   for(const track of VocabularyLearning.tracks)l[track]=VocabularyLearning.schedule(l[track],'good',l[track].due+1000,'A later answer.',track==='production'?1:0,track);
   return l;
  },JSON.parse(JSON.stringify(learning)));
  await page.evaluate(raw=>Wordbook.importBackup(raw),JSON.stringify(newer));
  assert.deepEqual(await page.evaluate(()=>Wordbook.read().entries[0].learning),newer.entries[0].learning,'Equivalent backup merges latest tracks');
  assert.equal(await page.evaluate(()=>Wordbook.read().entries[0].definition),restored.definition,'Backup retains current raw Markdown');
  await page.evaluate(id=>Wordbook.update(id,{definition:'The ability to prevent all setbacks.',definitionSource:'personal'}),restored.id);
  const reset=await page.evaluate(id=>Wordbook.get(id).learning,restored.id);
  assert.equal(reset.recognition.history.length,0);assert.equal(reset.production.history.length,0);
  assert.equal(reset.recognition.due,null);assert.equal(reset.production.due,null);assert.equal(reset.status,'active');assert.ok(reset.resetAt);
  await page.evaluate(raw=>Wordbook.importBackup(raw),backup);
  assert.deepEqual(await page.evaluate(id=>Wordbook.get(id).learning,restored.id),reset,'Different meanings cannot import old mastery');
  await page.evaluate(({id,definition})=>Wordbook.update(id,{definition,definitionSource:'personal'}),{id:restored.id,definition:formatted});
  await page.evaluate(raw=>Wordbook.importBackup(raw),backup);
  assert.equal(await page.evaluate(id=>Wordbook.get(id).learning.production.history.length,restored.id),0,'Older backup cannot undo semantic reset');
  // Exercise actual review rendering at all production stages and Recognition.
  await page.goto(base+'review.html');
  assert.equal(await page.evaluate(()=>WordbookMarkdown.text('| Part | Meaning |\n| :--- | :--- |\n| **resilience** | Recovery after a setback. |').replace(/\s+/g,' ').trim()),'Part Meaning resilience Recovery after a setback.','Tables extract cell text without separators');
  for(const track of ['production','recognition'])for(const level of track==='production'?[-1,1,2,3]:[-1]) {
   await page.evaluate(({definition,track,level})=>{
    localStorage.clear();const id=Wordbook.add('resilience');
    Wordbook.update(id,{definition,note:'A **useful** [memory clue](https://example.com).',definitionSource:'personal'});Wordbook.selectStatus(id,'active');
    const data=Wordbook.read(),e=data.entries[0];
    for(let n=0;n<=level;n++)e.learning[track]=VocabularyLearning.schedule(e.learning[track],'good',Date.now()-(10-n)*VocabularyLearning.DAY,'A previous answer.',Math.min(n,3),track);
    if(level>=0)e.learning[track].due=Date.now()-1000;
    localStorage.setItem('passage-wordbook-v1',JSON.stringify(data));
   },{definition:track==='recognition'?table:'# '+formatted.slice(2)+'\n\n---',track,level});
   await page.reload();await page.locator('#review-track').selectOption(track);await page.locator('[data-learning="start"]').click();
   const before=await page.locator('.review-card').innerText();
   assert.ok(!/\*\*|`|\]\(|https:\/\/example|^#+\s|^---$|^\s*\|/m.test(before),'Prompts/context do not show Markdown syntax or link destinations');
   if(track==='production'&&level===-1)assert.ok(!/resilience/i.test(before),'Expression retrieval keeps the target hidden');
   if(track==='production'&&level===1) {
    const cloze=await page.locator('.review-card blockquote').innerText();
    assert.ok(cloze.includes('_____')&&!/resilience/i.test(cloze),'New-context fallback still masks the extracted target');
   }
   await page.locator('#review-answer').fill('My independent answer.');await page.locator('[data-learning="reveal"]').click();
   const reference=await page.locator('.review-reference').innerText();
   assert.ok(!/\*\*|`|\]\(|https:\/\/example|^#+\s|^---$|^\s*\|/m.test(reference),'Reference strips Markdown');
   if(track==='recognition'||level>=2)assert.ok(reference.replace(/\s+/g,' ').includes(plain),'Reference keeps the visible meaning');
   if(track==='production'&&level>=2)assert.ok(reference.includes('A useful memory clue.'),'Personal note is also plain');
  }
  await page.evaluate(({plain,formatted})=>{
   localStorage.clear();const id=Wordbook.add('resilience');
   Wordbook.update(id,{definition:plain,definitionSource:'personal'});Wordbook.selectStatus(id,'active');
   const token=Wordbook.beginReview(id,'production');Wordbook.revealReview(token);
   Wordbook.update(id,{definition:formatted,definitionSource:'personal'});
   Wordbook.rate(id,'production','good','resilience',Date.now(),token);
  },{plain,formatted});
  assert.equal(await page.evaluate(()=>Wordbook.read().entries[0].learning.production.history.length),1,'Formatting does not invalidate an already revealed attempt');
  assert.deepEqual(errors,[]);
  console.log('PASS: formatted histories/schedules, semantic resets, equivalent/different JSON backups, Markdown review prompts/references and target masking.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
