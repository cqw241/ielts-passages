/* Two isolated browsers, actual production scripts, deterministic Supabase HTTP
   contract. SQL/RLS/CAS are independently exercised by verify-sync-sql.cjs. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=(process.env.PASSAGE_TEST_URL||'http://127.0.0.1:8765/_site/').replace(/\/?$/,'/');
const backup=fs.readFileSync('passage-wordbook-2026-10-14.json','utf8'),seed=JSON.parse(backup);
const hash=crypto.createHash('sha256').update(backup).digest('hex');
const clone=x=>structuredClone(x);
let cloud=null,versions=[],failRead=false,failSave=false,loseReply=false,forceRace=false,puts=0,refreshes=0,holdSave=null;
const seedSnapshot=()=>({schema:1,entries:Object.fromEntries(seed.entries.map(e=>[e.id,e])),lessonProgress:Object.fromEntries(Object.entries(seed.lessonProgress).map(([f,p])=>[f,Object.fromEntries(Object.entries(p).filter(([k])=>!['saved','recall','recalled'].includes(k)))]))});
async function setup(browser){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.route('**/assets/sync-config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.PASSAGE_SYNC_CONFIG={url:'https://test.supabase.co',publishableKey:'sb_publishable_test'};"}));
 await context.route('https://freedictionaryapi.com/**',r=>r.fulfill({json:{entries:[]}}));
 await context.route('https://test.supabase.co/**',async r=>{
  const path=new URL(r.request().url()).pathname,body=r.request().postDataJSON();
  const send=json=>r.fulfill({json});
  if(path==='/auth/v1/token') {
   if(new URL(r.request().url()).searchParams.get('grant_type')==='refresh_token')refreshes++;
   return send({access_token:'test-jwt',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'test-user',email:'learner@example.com'}});
  }
  if(path==='/auth/v1/logout')return send({});
  if(path==='/rest/v1/passage_snapshots'){
   if(failRead){failRead=false;return r.fulfill({status:503,json:{message:'Unavailable'}});}
   return send(cloud?[clone(cloud)]:[]);
  }
  if(path==='/rest/v1/rpc/passage_initialize'){
   assert.equal(crypto.createHash('sha256').update(body.p_backup).digest('hex'),hash);
   if(!cloud){cloud={version:1,seed_hash:hash,snapshot:seedSnapshot()};versions.push(clone(cloud));}
   return send({ok:true,version:cloud.version});
  }
  if(path==='/rest/v1/rpc/passage_save'){
   puts++;
   if(holdSave){const hold=holdSave;holdSave=null;await hold();}
   if(failSave){failSave=false;return r.fulfill({status:503,json:{}});}
   if(forceRace){forceRace=false;cloud.version++;cloud.snapshot.lessonProgress['26.9.6'].challenge='Saved by another device during upload.';versions.push(clone(cloud));}
   if(!cloud || body.p_expected_version!==cloud.version)return send({ok:false,conflict:true});
   cloud={...cloud,version:cloud.version+1,snapshot:clone(body.p_snapshot)};versions.push(clone(cloud));
   if(loseReply){loseReply=false;return r.abort('failed');}
   return send({ok:true,version:cloud.version});
  }
  throw new Error('Unexpected API '+path);
 });
 const page=await context.newPage();await page.goto(base+'wordbook.html');
 return {context,page,errors};
}
const sync=page=>page.evaluate(()=>PassageSync.sync());
const snap=page=>page.evaluate(()=>PassageSync.capture());
const login=page=>page.evaluate(()=>PassageSync.signIn('learner@example.com','test-password'));
const note=(page,id,text)=>page.evaluate(({id,text})=>Wordbook.update(id,{note:text}),{id,text});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
  const a=await setup(browser),b=await setup(browser);
  await login(a.page);assert.equal(await a.page.locator('#sync-login').isHidden(),true);assert.equal(cloud,null);assert.equal(Object.keys((await snap(a.page)).entries).length,0);assert.equal(puts,0,'Blank Ubuntu cannot initialize');
  await assert.rejects(a.page.evaluate(()=>PassageSync.initialize(new File(['{}'],'passage-wordbook-2026-10-14.json'))),/differs/);
  failRead=true;
  await assert.rejects(a.page.evaluate(raw=>PassageSync.initialize(new File([raw],'passage-wordbook-2026-10-14.json')),backup),/Cloud request failed/);
  assert.equal(Object.keys((await snap(a.page)).entries).length,0,'No download before successful cloud read-back');
  assert.equal(cloud.version,1,'Upload was committed to cloud');
  await sync(a.page);assert.equal(Object.keys((await snap(a.page)).entries).length,45);
  for(const e of seed.entries)assert.deepEqual((await snap(a.page)).entries[e.id].learning,e.learning,'Initial histories survive');
  await login(b.page);assert.deepEqual(await snap(a.page),await snap(b.page),'Second device downloads');
  const id=seed.entries.find(e=>e.kind!=='sentence').id,id2=seed.entries.filter(e=>e.kind!=='sentence')[1].id;
  await note(a.page,id,'A note from home.');await sync(a.page);await sync(b.page);assert.equal((await snap(b.page)).entries[id].note,'A note from home.');
  // Offline writes remain local; online event/retry converges without reimport.
  await a.context.setOffline(true);await note(a.page,id2,'Offline revision.');await sync(a.page);
  assert.notEqual(cloud.snapshot.entries[id2].note,'Offline revision.');
  await a.context.setOffline(false);await sync(a.page);await sync(b.page);assert.equal((await snap(b.page)).entries[id2].note,'Offline revision.');
  // Independent words merge, while deleting a word remains a deletion.
  await note(a.page,id,'First independent change.');await note(b.page,id2,'Second independent change.');
  await sync(a.page);await sync(b.page);await sync(a.page);
  assert.deepEqual(await snap(a.page),await snap(b.page));
  const deleteId=seed.entries.find(e=>e.kind==='sentence').id;
  await a.page.evaluate(id=>Wordbook.remove(id),deleteId);await sync(a.page);await sync(b.page);assert.equal((await snap(b.page)).entries[deleteId],undefined);
  // Same-word simultaneous reviews must never splice history or silently choose.
  await a.page.evaluate(id=>{const e=Wordbook.get(id);const d=Wordbook.read();d.entries.find(x=>x.id===id).learning.recognition.due=Date.now()-1000;localStorage.setItem('passage-wordbook-v1',JSON.stringify(d));Wordbook.selectStatus(id,'recognition');const token=Wordbook.beginReview(id,'recognition');Wordbook.revealReview(token);Wordbook.rate(id,'recognition','good','Home answer',Date.now(),token);},id);
  await b.page.evaluate(id=>{const d=Wordbook.read();d.entries.find(x=>x.id===id).learning.recognition.due=Date.now()-1000;localStorage.setItem('passage-wordbook-v1',JSON.stringify(d));Wordbook.selectStatus(id,'recognition');const token=Wordbook.beginReview(id,'recognition');Wordbook.revealReview(token);Wordbook.rate(id,'recognition','hard','Dorm answer',Date.now(),token);},id);
  await sync(a.page);const atConflict=cloud.version;await sync(b.page);
  assert.match(await b.page.locator('#sync-status').innerText(),/Conflict/);assert.equal(cloud.version,atConflict);
  assert.match(await b.page.locator('#sync-conflicts').innerText(),/Home answer/);assert.match(await b.page.locator('#sync-conflicts').innerText(),/Dorm answer/);
  await b.page.locator('#sync-conflicts input[value="local"]').check();await b.page.locator('#sync-conflicts button').click();
  await b.page.waitForFunction(()=>PassageSync.status.startsWith('Synced'));
  assert.equal(cloud.snapshot.entries[id].learning.recognition.history.at(-1).answer,'Dorm answer');
  const recoveries=await b.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('passage-cloud-recovery-v1-')).map(k=>JSON.parse(localStorage.getItem(k))));
  assert.ok(recoveries.some(r=>r.cloud?.entries[id]?.learning.recognition.history.at(-1).answer==='Home answer'),'Unselected review retained');
  await sync(a.page);
  // Delete-versus-edit conflicts preserve both alternatives.
  await a.page.evaluate(id=>Wordbook.remove(id),id2);await note(b.page,id2,'Edited during delete.');await sync(a.page);await sync(b.page);
  assert.match(await b.page.locator('#sync-conflicts').innerText(),/\[Deleted\]/);
  await b.page.locator('#sync-conflicts input[value="remote"]').check();await b.page.locator('#sync-conflicts button').click();await b.page.waitForFunction(()=>PassageSync.status.startsWith('Synced'));
  assert.equal(cloud.snapshot.entries[id2],undefined);
  // Progress updates refresh an already open lesson, including deletion/reset.
  await a.page.goto(base+'26.9.6/index.html#writing');await sync(a.page);
  await a.page.locator('#writing-editor').fill('A draft written at home.');await sync(a.page);
  await b.page.goto(base+'26.9.6/index.html#writing');await sync(b.page);assert.equal(await b.page.locator('#writing-editor').inputValue(),'A draft written at home.');
  await a.page.locator('#writing-editor').fill('');await sync(a.page);await sync(b.page);assert.equal(await b.page.locator('#writing-editor').inputValue(),'');
  // Version race and ambiguous network failure after a committed upload.
  await a.page.locator('#writing-editor').fill('CAS candidate.');forceRace=true;await sync(a.page);await sync(a.page);
  assert.equal(cloud.snapshot.lessonProgress['26.9.6'].writing,'CAS candidate.');assert.equal(cloud.snapshot.lessonProgress['26.9.6'].challenge,'Saved by another device during upload.');
  await a.page.locator('#writing-editor').fill('Committed but response lost.');loseReply=true;await sync(a.page);await sync(a.page);
  assert.equal(cloud.snapshot.lessonProgress['26.9.6'].writing,'Committed but response lost.');
  await a.page.locator('#writing-editor').fill('Retry after server failure.');failSave=true;await sync(a.page);assert.equal(await a.page.locator('#writing-editor').inputValue(),'Retry after server failure.');await sync(a.page);
  // Session refresh and startup pull; reloading preserves offline base/version.
  await a.page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('passage-cloud-session-v1'));s.expires_at=1;localStorage.setItem('passage-cloud-session-v1',JSON.stringify(s));});await sync(a.page);assert.ok(refreshes>0);
  await a.page.reload();await sync(a.page);await sync(b.page);assert.deepEqual(await snap(a.page),await snap(b.page));
  // A stale second tab must load current progress before saving another field.
  const tab=await a.context.newPage();await tab.goto(base+'26.9.6/index.html#writing');await sync(tab);
  await a.page.locator('#writing-editor').fill('Shared across tabs.');await tab.waitForFunction(()=>document.querySelector('#writing-editor').value==='Shared across tabs.');
  await tab.goto(base+'26.9.6/index.html#reading');await tab.locator('[data-action="read"][data-id="A"]').click();await sync(tab);
  assert.equal(cloud.snapshot.lessonProgress['26.9.6'].writing,'Shared across tabs.');await tab.close();
  // Quota failure before apply cannot advance the base or erase local records.
  await note(b.page,id,'New cloud note.');await sync(b.page);
  const before=await snap(a.page),meta=await a.page.evaluate(()=>localStorage.getItem('passage-cloud-base-v1'));
  await a.page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='passage-wordbook-v1')throw new DOMException('Full','QuotaExceededError');return originalSet.call(this,k,v);};});
  await sync(a.page);assert.match(await a.page.locator('#sync-status').innerText(),/storage is full/);
  assert.deepEqual(await snap(a.page),before);assert.equal(await a.page.evaluate(()=>localStorage.getItem('passage-cloud-base-v1')),meta);
  await a.page.evaluate(()=>{Storage.prototype.setItem=originalSet;});
  // Crash recovery is tested on reload, before another cloud read.
  await a.page.reload();await sync(a.page);assert.equal((await snap(a.page)).entries[id].note,'New cloud note.');
  // A user can keep typing while an earlier upload is still in flight.
  let reached,release;
  const entered=new Promise(r=>reached=r),proceed=new Promise(r=>release=r);
  holdSave=async()=>{reached();await proceed;};
  await note(a.page,id,'An edit being uploaded.');const flight=sync(a.page);await entered;
  await note(a.page,id,'A newer edit while uploading.');release();await flight;await sync(a.page);
  assert.equal(cloud.snapshot.entries[id].note,'A newer edit while uploading.');
  // Selections are bound to the exact local content and remote version shown.
  await sync(b.page);await note(a.page,id,'Cloud version one.');await note(b.page,id,'Local conflict.');await sync(a.page);await sync(b.page);
  await note(a.page,id,'Cloud version two.');await sync(a.page);
  await b.page.locator('#sync-conflicts input[value="remote"]').check();await b.page.locator('#sync-conflicts button').click();
  await b.page.waitForFunction(()=>document.querySelector('#sync-conflicts').textContent.includes('Cloud version two.'));
  assert.match(await b.page.locator('#sync-status').innerText(),/Conflict/);
  await b.page.locator('#sync-conflicts input[value="remote"]').check();await b.page.locator('#sync-conflicts button').click();await b.page.waitForFunction(()=>PassageSync.status.startsWith('Synced'));
  // New devices with old backups must explicitly exclude cloud-deleted records.
  const old=await setup(browser);await old.page.evaluate(raw=>Wordbook.importBackup(raw),backup);
  const priorVersion=cloud.version;await login(old.page);assert.match(await old.page.locator('#sync-status').innerText(),/Conflict/);assert.equal(cloud.version,priorVersion);
  const count=await old.page.locator('#sync-conflicts input[value="remote"]').count();assert.ok(count>1);
  for(const input of await old.page.locator('#sync-conflicts input[value="remote"]').all())await input.check();
  await old.page.locator('#sync-conflicts button').click();await old.page.waitForFunction(()=>PassageSync.status.startsWith('Synced'));
  assert.equal(cloud.snapshot.entries[deleteId],undefined);assert.equal(cloud.snapshot.entries[id2],undefined);
  await old.context.close();
  // Corrupt local lesson state must pause; it cannot be treated as a deletion.
  const beforeCorrupt=cloud.version;
  await a.page.evaluate(()=>localStorage.setItem(Wordbook.lessons[0].storageKey,'null'));await sync(a.page);
  assert.match(await a.page.locator('#sync-status').innerText(),/could not be read/);assert.equal(cloud.version,beforeCorrupt);
  for(const width of [1280,375]){

   await b.page.setViewportSize({width,height:900});await b.page.locator('#sync-panel').evaluate(el=>el.open=true);
   assert.equal(await b.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   fs.mkdirSync('.preview/sync',{recursive:true});await b.page.screenshot({path:`.preview/sync/cloud-${width}.png`,animations:'disabled'});
  }
  assert.deepEqual([...a.errors,...b.errors],[]);
  console.log('PASS: exact-backup migration gate, read-back failure, 45 records/18 histories, two devices, offline restore, independent merges, review/delete conflicts and recovery copies, live drafts/reset, CAS retry, lost responses, refresh, reload, cross-tab writes, quota rollback and responsive sync UI.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
