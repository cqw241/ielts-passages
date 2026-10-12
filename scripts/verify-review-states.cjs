/* Focused browser checks for default enrollment, word counts and actionable idle states. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=(process.env.PASSAGE_TEST_URL||'http://127.0.0.1:8765/_site/').replace(/\/?$/,'/');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://freedictionaryapi.com/**',r=>r.fulfill({json:{entries:[]}}));
  await page.clock.install({time:new Date('2026-10-12T10:00:00+08:00')});
  const count=key=>page.locator(`[data-learning-count="${key}"] strong`).innerText();
  const reason=key=>page.locator(`[data-review-reason="${key}"]`);
  async function seed(configs) {
   await page.goto(base+'review.html');
   await page.evaluate(configs=>{
    localStorage.clear();
    for(const [i,c] of configs.entries()){
     const id=Wordbook.add('sample '+String.fromCharCode(97+i));
     Wordbook.update(id,{definition:c.missing?'---':'An English meaning.'});Wordbook.selectStatus(id,c.status||'active');
    }
    const data=Wordbook.read(),now=Date.now();
    for(const [i,e] of data.entries.entries()){
     const c=configs[i];
     if(c.future||c.due){
      const at=c.due?now-2*VocabularyLearning.DAY:now;
      e.learning.startedAt=at;
      for(const n of VocabularyLearning.tracks)e.learning[n]=VocabularyLearning.schedule(e.learning[n],'good',at,'An answer.',0,n);
     }
     if(c.cooldown){e.learning.startedAt=now;e.learning.exposedAt=now;}
    }
    localStorage.setItem('passage-wordbook-v1',JSON.stringify(data));
   },configs);
   await page.reload();
  }
  // Bookmarking actually saves and enrolls, while merely visiting a lesson does not.
  await page.goto(base+'26.9.6/index.html#vocabulary');
  assert.equal(await page.evaluate(()=>Wordbook.read().entries.length),0);
  await page.locator('[data-action="save-word"][data-id="01"]').click();
  assert.equal(await page.evaluate(()=>Wordbook.read().entries[0].learning.status),'active');
  await page.evaluate(()=>localStorage.clear());
  await page.goto(base+'wordbook.html');await page.locator('.wb-heading [data-wb="add"]').click();
  await page.locator('#wb-add-form [name="term"]').fill('new expression');await page.locator('#wb-add-form button[type="submit"]').click();
  assert.equal(await page.evaluate(()=>Wordbook.read().entries[0].learning.status),'active');
  await page.locator('#wb-dialog [data-wb="close"]').first().click();
  assert.match(await page.locator('.learning-controls').innerText(),/Enrolled. Add a meaning/);
  await page.goto(base+'review.html');assert.match(await reason('missing').innerText(),/1 word needs a meaning/);
  assert.equal(await count('enrolledWords'),'1');assert.equal(await count('newWordsReady'),'0');
  await reason('missing').locator('a').click();await page.waitForLoadState();assert.equal(await page.locator('#wb-status').inputValue(),'missing');
  await page.locator('.wb-row-actions [data-wb="edit"]').click();await page.locator('#wb-edit-definition').fill('**A newly learned phrase.**');
  await page.locator('#wb-edit-form button[type="submit"]').click();await page.goto(base+'review.html');
  assert.equal(await count('newWordsReady'),'1');assert.match(await page.locator('[data-learning="start"]').innerText(),/Start 2 tasks/);
  await seed([{status:'exposure'},{missing:true},{status:'known'}]);
  assert.equal(await count('totalWords'),'3');assert.equal(await count('enrolledWords'),'1');assert.equal(await count('missingWords'),'1');
  assert.equal(await count('masteredWords'),'0');assert.match(await reason('unenrolled').innerText(),/2 words are not enrolled/);
  await reason('unenrolled').locator('a').click();await page.waitForLoadState();assert.equal(await page.locator('#wb-status').inputValue(),'unenrolled');
  assert.equal(await page.locator('.wb-row').count(),2,'Goal link opens only unenrolled words');
  await seed([...Array.from({length:6},()=>({future:true})),{},{}]);
  assert.equal(await count('totalWords'),'8');assert.equal(await count('newWordsReady'),'0');
  assert.match(await reason('limit').innerText(),/6 started today \(limit 6\). 2 new words are waiting/);
  assert.match(await reason('scheduled').innerText(),/12 tasks are not due yet. Next review:/);
  assert.match(await page.locator('#learning-dashboard').innerText(),/Daily learning limit: 6 new words/);
  fs.mkdirSync('.preview/review-states',{recursive:true});
  await page.screenshot({path:'.preview/review-states/desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'.preview/review-states/mobile.png',fullPage:true});
  await page.clock.setFixedTime(new Date('2026-10-13T10:00:01+08:00'));await page.reload();
  assert.equal(await count('newWordsReady'),'2','Next local day opens new slots without deleting saved words');
  assert.equal(await reason('limit').count(),0);
  await seed([{future:true}]);assert.match(await reason('scheduled').innerText(),/2 tasks are not due yet/);
  assert.equal(await reason('limit').count(),0);assert.match(await page.locator('.wb-empty h2').innerText(),/done for now/);
  await seed([{cooldown:true}]);await page.locator('#review-track').selectOption('production');
  assert.match(await page.locator('[data-review-deferred]').innerText(),/1 Production task available .*24 hours/);
  assert.match(await reason('track').innerText(),/1 task is ready in the other track/);
  await page.locator('[data-learning="all-tracks"]').click();assert.equal(await page.locator('#review-track').inputValue(),'all');
  assert.equal(await page.locator('[data-learning="start"]').isEnabled(),true);
  await seed([...Array.from({length:10},()=>({due:true})),{}]);
  assert.equal(await count('due'),'20');assert.equal(await count('newWordsReady'),'0');
  await page.locator('#review-track').selectOption('production');
  // All Production tasks remain available: the threshold pauses new words, never existing reviews.
  assert.match(await page.locator('[data-learning="start"]').innerText(),/Start 10 tasks/);
  await seed([...Array.from({length:20},()=>({due:true,status:'recognition'})),{}]);
  await page.locator('#review-track').selectOption('production');
  assert.match(await reason('backlog').innerText(),/1 new word is waiting behind 20 existing review tasks/);
  assert.match(await reason('track').innerText(),/20 tasks are ready in the other track/);
  await seed([]);assert.equal(await page.locator('[data-learning="start"]').isDisabled(),true);
  assert.match(await page.locator('.wb-empty').innerText(),/No words saved yet/);
  assert.deepEqual(errors,[]);
  console.log('PASS: default bookmark/manual enrollment, meaning actions, word/task counts, goal filters, quota/day rollover, future dates, cooldown/track switching, backlog and mobile layout.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
