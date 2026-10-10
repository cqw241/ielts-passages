// Integration coverage for variable lesson counts and an evidence-based self-check.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = (process.env.PASSAGE_TEST_URL || 'http://127.0.0.1:8765/_site/').replace(/\/?$/, '/');
(async()=>{
  const browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const page = await context.newPage(), errors=[], failures=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('response', r=>{if(r.status()>=400)failures.push(r.status()+' '+r.url());});
    await page.goto(base);
    assert.equal(await page.locator('.library-lesson').count(),3);
    await page.getByRole('link',{name:'Open the latest lesson'}).click();
    await page.locator('.hero').waitFor();
    assert.match(page.url(),/26\.10\.10/);
    assert.equal(await page.locator('[data-view="grammar"] .nav-count').innerText(),'3');
    await page.screenshot({path:'.preview/10-10-desktop.png',fullPage:true});
    const openView=async view=>{await page.locator(`[data-view="${view}"]`).click();await page.locator(`[data-view="${view}"].active`).waitFor();};
    const sourceData = await page.evaluate(()=>({paragraphs:LESSON.paragraphs,grammar:LESSON.grammar,practice:LESSON.practice,storageKey:LESSON.storageKey}));
    assert.equal(sourceData.storageKey,'passage-2026-10-10-v1');
    assert.equal(sourceData.practice.length,9);
    for(const view of ['reading','vocabulary','grammar','exercises','writing','speaking','review']){
      await page.locator(`[data-view="${view}"]`).click();
      await page.locator(`[data-view="${view}"].active`).waitFor();
      assert.equal(await page.locator('#main').innerText().then(t=>/undefined|\*\*/.test(t)),false,view+' has no unresolved content');
    }
    await openView('reading');
    const rendered = await page.locator('.english-passage').allTextContents();
    assert.deepEqual(rendered,sourceData.paragraphs.map(p=>p.text.replace(/\*/g,'')),'Original paragraphs and punctuation preserved');
    assert.equal(await page.locator('#paragraph-C [data-action="word"][data-id="02"]').innerText(),'traced back to');
    await page.locator('#paragraph-A [data-action="read"]').click();
    await page.locator('[data-diagram="H"][data-index="1"]').click();
    assert.match(await page.locator('#concept-H').innerText(),/Not established/);
    await page.locator('#paragraph-G').screenshot({path:'.preview/10-10-evidence.png'});
    await openView('vocabulary');
    await page.locator('[data-action="filter"][data-value="core"]').click();
    assert.equal(await page.locator('.vocab-card').count(),10);
    await page.locator('[data-action="save-word"][data-id="01"]').click();
    await page.locator('[data-learning="status"][data-word="01"]').selectOption('active');
    assert.equal(await page.evaluate(()=>Wordbook.read().entries[0].learning.status),'active');
    await openView('exercises');
    const questions = await page.evaluate(()=>LESSON.reading);
    assert.equal(await page.locator('#reading-form fieldset').count(),10);
    assert.equal(await page.locator('.vocab-question').count(),9);
    assert.equal(await page.locator('.vocab-question textarea').count(),3);
    for(const q of questions){
      if(q.options.length)await page.locator(`input[name="q${q.id}"][value="${q.answer}"]`).check();
      else await page.locator(`[name="q${q.id}"]`).fill(q.marking==='self-check'?'Long-lasting benefits; reliable gene delivery':q.answer);
    }
    await page.getByRole('button',{name:'Check my answers'}).click();
    assert.match(await page.locator('#reading-score').innerText(),/^9 \/ 9 · Auto-marked score · 1 self-check$/);
    assert.equal(await page.locator('#feedback-1 a').getAttribute('href'),'#reading-B','Multi-paragraph evidence retains a valid starting paragraph');
    assert.match(await page.locator('#feedback-9').innerText(),/excluded from the automatic score/);
    assert.equal(await page.locator('#feedback-9 .incorrect').count(),0);
    await openView('writing');
    await page.locator('#writing-editor').fill('Fundamental research can lead to practical benefits.');
    await page.locator('#challenge-editor').fill('The prototype may shed light on how learners practise. It still needs larger studies to translate research into classroom routines.');
    assert.match(await page.locator('#challenge-used').innerText(),/2 \/ 3/);
    await page.locator('summary').filter({hasText:'Full writing plan'}).click();
    assert.match(await page.locator('.source-fold .prose').innerText(),/Long-term value/);
    await openView('speaking');
    assert.equal(await page.locator('.speaking-card').count(),2);
    await page.getByRole('button',{name:'Practise for 2 minutes'}).first().click();
    assert.match(await page.locator('#timer-output').innerText(),/Question 1/);
    await page.reload();
    assert.match(await page.locator('#read-count').innerText(),/^1 \/ 10$/);
    await openView('writing');
    assert.equal(await page.locator('#writing-editor').inputValue(),'Fundamental research can lead to practical benefits.');
    await page.getByRole('button',{name:'Source material'}).click();
    assert.equal(await page.locator('#dialog-content .source-link').count(),5);
    const downloadLink = await page.locator('#dialog-content a[download]').getAttribute('href');
    const download = await page.request.get(new URL(downloadLink,page.url()).href);
    assert.equal(download.status(),200);
    assert.match(await download.text(),/^# A Switch Made of Light/);
    await page.getByRole('button',{name:'Close dialog'}).click();
    await page.goto(base+'wordbook.html');
    assert.equal(await page.locator('.wb-row').count(),1,'New lesson preset joins shared wordbook');
    for(const folder of ['26.9.6','26.9.7']){
      for(const view of ['overview','reading','vocabulary','grammar','exercises','writing','speaking','review']){
        await page.goto(base+folder+'/index.html#'+view);
        await page.locator('#main > *').first().waitFor();
        assert.equal(await page.locator('#main').innerText().then(t=>t.includes('undefined')),false,folder+' '+view);
      }
    }
    await page.setViewportSize({width:390,height:844});
    for(const view of ['overview','reading','vocabulary','grammar','exercises','writing','speaking','review']){
      await page.goto(base+'26.10.10/index.html#'+view);
      await page.locator('#main > *').first().waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile overflow: '+view);
      if(view==='overview')await page.screenshot({path:'.preview/10-10-mobile.png',fullPage:true});
      if(view==='reading'){
        await page.getByRole('button',{name:'Open lesson navigation'}).click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('nav-open')),false);
      }
    }
    // All six suggested active expressions support a genuine new-context gap,
    // including phrases with an object between their two fixed parts.
    for(const id of ['01','02','03','04','05','06']){
      const isolated=await browser.newContext(), probe=await isolated.newPage();
      await probe.clock.install({time:new Date('2026-10-11T12:00:00+08:00')});
      await probe.goto(base+'review.html');
      const entryId=await probe.evaluate(id=>Wordbook.selectPreset('26.10.10',id,'active'),id);
      for(let attempt=0;attempt<2;attempt++){
        await probe.locator('#review-track').selectOption('production');
        await probe.locator('[data-learning="start"]').click();
        await probe.locator('#review-answer').fill('My retrieved expression.');
        await probe.locator('[data-learning="reveal"]').click();
        await probe.locator('[data-learning="rate"][data-rating="good"]').click();
        const available=await probe.evaluate(id=>VocabularyLearning.availableAt(Wordbook.get(id).learning,'production'),entryId);
        await probe.clock.setFixedTime(new Date(available+1000));
        await probe.reload();
      }
      await probe.locator('#review-track').selectOption('production');
      await probe.locator('[data-learning="start"]').click();
      assert.match(await probe.locator('.review-card blockquote').innerText(),/_____/,'New-context gap for '+id);
      assert.equal(await probe.locator('.review-reference').count(),0,'Reference stays hidden before reveal');
      await isolated.close();
    }
    assert.deepEqual(errors,[],'No browser errors');
    assert.deepEqual(failures,[],'No missing assets');
    console.log('Verified new lesson content, all views, scoring/self-check, saves, wordbook, source download, old lessons and mobile layouts.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
