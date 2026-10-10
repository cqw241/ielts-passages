/* Verify the published artifact and a real learner journey in an isolated browser. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const lessons=JSON.parse(fs.readFileSync('lessons.json','utf8')).lessons;
const base=(process.env.PASSAGE_TEST_URL||'http://127.0.0.1:8765/_site/').replace(/\/?$/,'/');
// Git may check text out as CRLF on Windows; Linux Pages builds use LF.
const digest=bytes=>crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);assert.equal(await page.locator('.library-lesson').count(),lessons.length);
  // Use the learner's browser network path (including system proxy settings).
  const files=['assets/vocabulary-learning.js','assets/vocabulary-learning-ui.js','assets/wordbook-store.js','assets/course-vocabulary.js','assets/lesson.js','assets/wordbook.js','review.html',...lessons.flatMap(l=>[`${l.folder}/lesson-data.js`,`${l.folder}/lesson-notes.js`])];
  const published=await page.evaluate(async files=>Promise.all(files.map(async file=>{
   const response=await fetch(file),bytes=new TextEncoder().encode((await response.text()).replace(/\r\n/g,'\n'));
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   return {file,status:response.status,hash};
  })),files);
  for(const {file,status,hash} of published) { assert.equal(status,200,file);assert.equal(hash,digest(fs.readFileSync('_site/'+file)),`Published ${file} matches the local build`); }
  assert.equal(await page.locator('#learning-dashboard').count(),1);
  for(const folder of lessons.map(l=>l.folder)) {
   await page.goto(base+folder+'/index.html#reading');assert.equal(await page.locator('.english-passage').count(),10);
  }
  await page.goto(base+'26.9.6/index.html#vocabulary');
  await page.locator('[data-learning="status"][data-word="01"]').selectOption('active');
  const id=await page.evaluate(()=>Wordbook.read().entries[0].id);
  await page.goto(base+'wordbook.html');assert.equal(await page.locator('[data-learning="status"]').inputValue(),'active');
  await page.locator('[data-wb="recall"]').click();
  await page.locator('[data-learning="start"]').click();
  assert.match(await page.locator('.review-card .eyebrow').innerText(),/PRODUCTION/);
  assert.ok(!(await page.locator('.review-card').innerText()).toLowerCase().includes('resilience'));
  await page.locator('#review-answer').fill('I could not retrieve it.');await page.locator('[data-learning="reveal"]').click();await page.locator('[data-learning="rate"][data-rating="again"]').click();
  await page.locator('#review-answer').fill('The ability to recover after difficulty.');await page.locator('[data-learning="reveal"]').click();await page.locator('[data-learning="rate"][data-rating="good"]').click();
  await page.reload();
  const learning=await page.evaluate(id=>Wordbook.get(id).learning,id);
  assert.equal(learning.recognition.history[0].rating,'good');assert.equal(learning.production.history[0].rating,'again');
  assert.ok(learning.production.due<=learning.recognition.due);
  await page.goto(base+'wordbook.html');
  const download=page.waitForEvent('download');await page.locator('[data-wb="export"]').click();assert.match((await download).suggestedFilename(),/passage-wordbook/);
  await page.setViewportSize({width:375,height:900});
  for(const route of ['','wordbook.html','review.html','26.9.6/index.html#vocabulary']) {
   await page.goto(base+route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: published asset hashes, all registered articles, goal selection, Wordbook, independent review/ratings, persistence, backup download and mobile layout.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
