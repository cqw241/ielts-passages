/* End-to-end learning and responsive regression using isolated Chrome. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const lessons=JSON.parse(fs.readFileSync('lessons.json','utf8')).lessons;
const base=(process.env.PASSAGE_TEST_URL||'http://127.0.0.1:8765/_site/').replace(/\/?$/,'/');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],missing=[];
  page.on('pageerror',e=>errors.push(page.url()+' '+e.stack));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)missing.push(r.url());});
  await page.route('https://freedictionaryapi.com/**',r=>r.fulfill({json:{entries:[]}}));
  const initial=new Date('2026-10-08T10:00:00+08:00');await page.clock.install({time:initial});
  await page.goto(base+'26.9.6/index.html#vocabulary');
  assert.equal(await page.locator('[data-learning="status"]').count(),30);
  assert.equal(await page.locator('.learning-hint').filter({hasText:'Suggested: Active'}).count(),6);
  assert.equal(await page.locator('.learning-hint').filter({hasText:'Suggested: Recognition'}).count(),10);
  assert.equal(await page.evaluate(()=>Wordbook.read().entries.length),0,'Suggestions never auto-enrol');
  assert.deepEqual(await page.evaluate(()=>Wordbook.lessons.flatMap(l=>l.words.filter(w=>!VocabularyLearningUI.mask(w.example,w.word).includes('_____')).map(w=>w.word))),[],'Every preset has a usable new-context gap');
  await page.locator('[data-learning="status"][data-word="01"]').selectOption('active');
  const id=await page.evaluate(()=>Wordbook.read().entries[0].id);
  assert.equal(await page.locator('[data-action="save-word"][data-id="01"]').getAttribute('aria-pressed'),'true');
  await page.reload();assert.equal(await page.locator('[data-learning="status"][data-word="01"]').inputValue(),'active');
  await page.goto(base);assert.match(await page.locator('#learning-dashboard').innerText(),/2 first attempts ready/);
  await page.locator('#learning-dashboard a').click();
  await page.locator('[data-learning="start"]').click();
  assert.match(await page.locator('.review-card .eyebrow').first().innerText(),/RECOGNITION/);
  assert.equal(await page.locator('[data-learning="rate"]').count(),0,'Rate only after comparing');
  await page.locator('#review-answer').fill('The capacity to recover after a setback.');
  await page.locator('[data-learning="reveal"]').click();
  assert.equal(await page.locator('#review-answer').inputValue(),'The capacity to recover after a setback.');
  await page.locator('[data-learning="rate"][data-rating="good"]').click();
  assert.match(await page.locator('.review-card .eyebrow').first().innerText(),/PRODUCTION/);
  assert.equal(await page.locator('.review-queue').count(),0,'No answer list alongside retrieval');
  assert.ok(!(await page.locator('.review-card').innerText()).toLowerCase().includes('resilience'),'Retrieval hides target and context');
  await page.locator('#review-answer').fill('resilience');await page.locator('[data-learning="reveal"]').click();await page.locator('[data-learning="rate"][data-rating="good"]').click();
  const recognition=await page.evaluate(id=>JSON.stringify(Wordbook.get(id).learning.recognition),id);
  // Complete successive due production attempts. Recognition remains overdue and unchanged.
  for(const [days,step,answer] of [[1,1,'resilience'],[4,2,'resilience'],[11,3,'Local employers help the town recover, strengthening its resilience.'],[25,4,'Regular practice builds my resilience when a difficult task goes wrong.']]) {
   const due=await page.evaluate(id=>Wordbook.get(id).learning.production.due,id);await page.clock.setFixedTime(new Date(due+1000));await page.reload();
   await page.locator('#review-track').selectOption('production');await page.locator('[data-learning="start"]').click();
   assert.match(await page.locator('.review-card .eyebrow').first().innerText(),new RegExp(`STEP ${step}`));
   if(step===2)assert.match(await page.locator('.review-card blockquote').innerText(),/_____/,'New context contains a real gap');
   await page.locator('#review-answer').fill(answer);await page.locator('[data-learning="reveal"]').click();
   await page.locator('[data-learning="rate"][data-rating="good"]').click();
   assert.equal(await page.evaluate(id=>JSON.stringify(Wordbook.get(id).learning.recognition),id),recognition);
  }
  assert.equal(await page.evaluate(id=>VocabularyLearning.mastered(Wordbook.get(id).learning.production,'production'),id),true);
  await page.goto(base+'wordbook.html');
  await page.locator('[data-learning="history"]').click();assert.match(await page.locator('#learning-history').innerText(),/Regular practice builds my resilience/);await page.locator('[data-learning="close-history"]').click();
  await page.locator('[data-learning="status"]').selectOption('known');await page.goto(base+'review.html');
  assert.equal(await page.locator('.review-queue li').count(),0);assert.match(await page.locator('#learning-dashboard').innerText(),/0 \/ 0/,'Already know is not mastery');
  await page.goto(base+'wordbook.html');await page.locator('[data-learning="status"]').selectOption('recognition');
  await page.goto(base+'review.html');assert.equal(await page.locator('.review-queue li').count(),1);assert.match(await page.locator('.review-queue').innerText(),/Recognition/);
  const backup=await page.evaluate(()=>Wordbook.exportBackup());
  const second=await context.newPage();await second.goto(base+'wordbook.html');
  await page.evaluate(id=>Wordbook.selectStatus(id,'skip'),id);
  await second.waitForFunction(()=>document.querySelector('[data-learning="status"]').value==='skip');await second.close();
  await page.goto(base+'wordbook.html');await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.locator('#wb-import').setInputFiles({name:'v3.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await page.waitForFunction(()=>document.querySelector('#wb-notice').textContent.includes('Import complete'));
  assert.equal(await page.evaluate(()=>Wordbook.read().entries[0].learning.production.history.length),5);
  // Responsive smoke preserves every lesson route and checks all local resources.
  fs.mkdirSync('.preview/v2',{recursive:true});
  for(const width of [1440,768,375]) {
   await page.setViewportSize({width,height:1000});
   for(const route of ['', 'wordbook.html','review.html',...lessons.map(l=>l.folder).flatMap(f=>['overview','reading','vocabulary','grammar','exercises','writing','speaking','review','recall'].map(v=>`${f}/index.html#${v}`))]) {
    await page.goto(base+route);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`No horizontal overflow: ${width} ${route}`);
    assert.ok(!(await page.locator('body').innerText()).includes('undefined'),`No missing content: ${route}`);
   }
   await page.goto(base+'26.9.6/index.html#vocabulary');await page.screenshot({path:`.preview/v2/lesson-${width}.png`,fullPage:false});
   await page.goto(base+'wordbook.html');await page.screenshot({path:`.preview/v2/wordbook-${width}.png`,fullPage:false});
   await page.goto(base+'review.html');await page.locator('[data-learning="start"]').click();await page.locator('[data-learning="reveal"]').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Review card ${width}`);
   await page.screenshot({path:`.preview/v2/review-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[],'No application errors');assert.deepEqual(missing,[],'No missing local resources');
  console.log('PASS: opt-in goals, recommendations, hidden retrieval, all four production stages, independent schedules, history, paused goals, cross-tab changes, v3 import, registered route/viewport combinations and review cards.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
