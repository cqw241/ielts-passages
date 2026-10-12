/* Deterministic scheduler/storage checks; no network or browser dependencies. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const records=new Map();
const context={window:{dispatchEvent(){},addEventListener(){},crypto:{randomUUID:()=>String(records.size)+Math.random()}},localStorage:{getItem:k=>records.get(k)||null,setItem:(k,v)=>records.set(k,v)},CustomEvent:function(){},Date,URL,fetch:()=>Promise.reject(new Error('Offline')),AbortController,setTimeout,clearTimeout};
for(const file of ['course-vocabulary','vocabulary-learning','wordbook-store'])vm.runInNewContext(fs.readFileSync(`assets/${file}.js`,'utf8'),context);
const V=context.window.VocabularyLearning,W=context.window.Wordbook;
const now=new Date('2026-10-08T10:00:00+08:00').getTime(),day=V.DAY;
let t=V.fresh().recognition;
for(const interval of [1,3,7,14,30,60]) { t=V.schedule(t,'good',now);assert.equal(t.interval,interval); }
assert.equal(V.schedule(t,'again',now).due,now+600000);
assert.ok(V.schedule(t,'hard',now).interval<t.interval);
assert.ok(V.schedule(V.fresh().recognition,'easy',now).interval>1);
assert.equal(V.mastered(t,'recognition'),true);
assert.equal(V.mastered(t,'production'),false,'Recognition does not imply independent production');
t=V.schedule(t,'good',now+90*day,'Independent sentence.',3);
assert.equal(V.mastered(t,'production'),true);
assert.equal(t.history.at(-1).gapDays,90);
assert.ok(t.history.at(-1).lateDays>=30);
const l=W.lessons[0];
const id=W.selectPreset(l.folder,l.words[0].id,'active');
assert.equal(W.get(id).learning.recognition.due,null,'Selection alone does not claim learning');
W.rate(id,'production','again','Could not retrieve.',now);
assert.equal(W.get(id).learning.recognition.history.length,0,'Production leaves recognition unchanged');
assert.equal(W.get(id).learning.production.due,now+day,'Independent production retries on the following day');
const production=JSON.stringify(W.get(id).learning.production);
W.rate(id,'recognition','good','Meaning recalled.',now);
assert.equal(JSON.stringify(W.get(id).learning.production),production,'Recognition leaves production unchanged');
assert.ok(!V.queue(W.read().entries,now).items.some(i=>i.track==='production'),'Recognition does not cue an immediate production test');
assert.throws(()=>W.rate(id,'production','good','',now),'Cannot grade a track again before due');
W.selectStatus(id,'known');assert.equal(V.queue(W.read().entries,now+day).items.length,0);
W.selectStatus(id,'recognition');assert.equal(V.queue(W.read().entries,now+day).items.filter(i=>i.track==='production').length,0);
W.selectStatus(id,'active');assert.ok(V.queue(W.read().entries,now+day).items.some(i=>i.track==='production'));
const entries=Array.from({length:30},(_,i)=>({id:String(i),kind:'word',definition:'meaning',learning:V.fresh()}));
entries.forEach(e=>e.learning.status='active');
assert.equal(new Set(V.queue(entries,now).items.map(i=>i.id)).size,6,'Daily new-word admission is bounded');
entries.slice(0,10).forEach(e=>{e.learning.startedAt=now-day;for(const track of V.tracks)e.learning[track]=V.schedule(V.fresh()[track],'good',now-day);});
assert.equal(V.queue(entries,now).due,20);assert.equal(V.queue(entries,now).items.length,20,'Backlog excludes new words');
entries.forEach(e=>e.learning.status='recognition');
entries.slice(0,6).forEach(e=>e.learning.startedAt=now);
assert.equal(V.queue(entries,now).items.filter(i=>Number(i.id)>=10).length,0,'Reload does not reset the daily quota');
const backup=W.exportBackup(),original=JSON.stringify(W.get(id).learning);
records.clear();W.importBackup(backup);
assert.equal(JSON.stringify(W.read().entries[0].learning),original,'Both histories and dates survive a fresh import');
const imported=W.read().entries[0];W.selectStatus(imported.id,'skip');
const malicious=JSON.parse(backup);malicious.entries[0].learning.production.due='tomorrow';
const before=W.exportBackup();assert.throws(()=>W.importBackup(JSON.stringify(malicious)));assert.equal(JSON.stringify(JSON.parse(W.exportBackup()).entries),JSON.stringify(JSON.parse(before).entries),'Bad schedule imports are atomic');
records.set(l.storageKey,JSON.stringify({writing:'A saved draft.',read:['A'],answers:{1:'TRUE'}}));
const complete=W.exportBackup();records.clear();W.importBackup(complete);
assert.equal(JSON.parse(records.get(l.storageKey)).writing,'A saved draft.','Full backup restores lesson drafts into a new browser');
records.set(l.storageKey,JSON.stringify({writing:'A newer draft.'}));W.importBackup(complete);
assert.equal(JSON.parse(records.get(l.storageKey)).writing,'A newer draft.','Existing drafts win');
const badProgress=JSON.parse(complete);badProgress.lessonProgress[l.folder].answers=null;
const priorEntries=JSON.stringify(W.read().entries);assert.throws(()=>W.importBackup(JSON.stringify(badProgress)));assert.equal(JSON.stringify(W.read().entries),priorEntries,'Invalid lesson state is rejected before importing words');
const stats=V.stats([{...imported,learning:{...imported.learning,status:'active',recognition:t}}],now);
assert.equal(stats.delayedTotal,1);assert.equal(stats.delayedPassed,1);assert.equal(stats.lateTotal,1);
console.log('PASS: intervals, adaptive ratings, independent tracks, paused goals, daily limits, backlog, delayed metrics, backup validation and draft preservation.');
// Defaults affect new interactive additions only; old goals/imports stay intact.
records.clear();
const manual=W.add('new word');assert.equal(W.get(manual).learning.status,'active');
assert.equal(V.queue(W.read().entries,now).items.length,0,'Missing meanings block review, not enrollment');
W.update(manual,{definition:'A new expression.'});
assert.equal(V.queue(W.read().entries,now).items.length,2,'Adding a meaning enables both tracks');
W.selectStatus(manual,'skip');W.add('new word');assert.equal(W.get(manual).learning.status,'skip','Saving again preserves the chosen goal');
W.togglePreset(l.folder,l.words[1].id);
assert.equal(W.learningFor(l.words[1].word).status,'active','New bookmarks default Active');
records.clear();records.set(l.storageKey,JSON.stringify({saved:[l.words[0].id]}));W.migrate();
assert.equal(W.learningFor(l.words[0].word).status,'exposure','Legacy bookmarks are not enrolled by migration');
const legacy=JSON.parse(W.exportBackup());delete legacy.entries[0].learning;records.clear();W.importBackup(JSON.stringify(legacy));
assert.equal(W.read().entries[0].learning.status,'exposure','Unclassified imports keep the legacy default');
const active=()=>({...V.fresh(),status:'active'});
const mixed=[
 {id:'new',definition:'Meaning',learning:active()},
 {id:'missing',definition:'  ',learning:active()},
 {id:'paused',definition:'Meaning',learning:V.fresh()},
 {id:'known',definition:'Meaning',learning:{...V.fresh(),status:'known'}},
 {id:'mastered',definition:'Meaning',learning:{...active(),startedAt:now-day,recognition:t,production:t}},
 {id:'sentence',kind:'sentence',definition:'Meaning'}
];
const totals=V.stats(mixed,now);
assert.equal(totals.totalWords,5);assert.equal(totals.enrolledWords,3);assert.equal(totals.missingWords,1);
assert.equal(totals.unenrolledWords,2);assert.equal(totals.newWordsReady,1,'Dual tracks count as one new word');
assert.equal(totals.masteredWords,1,'All enabled tracks must meet mastery; Already know does not claim mastery');
const capped=Array.from({length:8},(_,i)=>({id:String(i),definition:'Meaning',learning:active()}));
for(const e of capped.slice(0,6)){e.learning.startedAt=now;e.learning.exposedAt=now;for(const n of V.tracks)e.learning[n]=V.schedule(e.learning[n],'good',now);}
const capStats=V.stats(capped,now);assert.equal(capStats.totalWords,8);assert.equal(capStats.newWordsReady,0);assert.equal(capStats.blockedWords,2);
assert.equal(capStats.futureTasks.recognition,6);assert.equal(capStats.nextByTrack.production,now+day);
for(const backlog of [18,19,20]) {
 const boundary=Array.from({length:backlog},(_,i)=>({id:String(i),definition:'Meaning',learning:{...V.fresh(),status:'recognition',startedAt:now-2*day,recognition:V.schedule(V.fresh().recognition,'good',now-2*day)}}));
 boundary.push({id:'new-active',definition:'Meaning',learning:active()});
 const s=V.stats(boundary,now);
 assert.equal(s.backlog,backlog);assert.equal(s.newWordsReady,backlog===18?1:0);
 assert.equal(s.blockedWords,backlog===18?0:1);assert.equal(s.items.length,backlog===18?20:backlog);
 assert.equal(s.paused,backlog===20,'Keep the existing pause threshold while explaining insufficient capacity at 19');
 assert.equal(s.items.filter(i=>i.id!=='new-active').length,backlog,'Capacity never removes existing reviews');
}
console.log('PASS: Active defaults, missing-meaning admission, preserved goals/migrations/imports, distinct word/task metrics, established criteria and daily-cap inventory.');
