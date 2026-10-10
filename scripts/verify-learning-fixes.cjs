/* Focused regression for review integrity, editorial recommendations and retired recall. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const records=new Map(),context={window:{dispatchEvent(){},addEventListener(){},crypto:{randomUUID:()=>Math.random().toString()}},localStorage:{getItem:k=>records.get(k)||null,setItem:(k,v)=>records.set(k,v)},CustomEvent:function(){},Date,URL,fetch:()=>Promise.reject(new Error('Offline')),AbortController,setTimeout,clearTimeout};
for(const f of ['course-vocabulary','vocabulary-learning','wordbook-store'])vm.runInNewContext(fs.readFileSync(`assets/${f}.js`,'utf8'),context);
const V=context.window.VocabularyLearning,W=context.window.Wordbook,now=Date.UTC(2026,9,10),results=[];
function check(label,fn){try{fn();results.push(`PASS: ${label}`);}catch(e){results.push(`FAIL: ${label}: ${e.message}`);process.exitCode=1;}}
check('Independent sentence must follow the latest lapse',()=>{
 let t=V.schedule(V.fresh().production,'easy',now,'A sentence.',3);
 t=V.schedule(t,'again',now+V.DAY);
 for(let i=0;i<2;i++)t=V.schedule(t,'easy',now+(i+2)*V.DAY,'Retrieved expression.',V.stage(t));
 assert.equal(V.mastered(t,'production'),false);
 t=V.schedule(t,'good',now+6*V.DAY,'A fresh independent sentence.',3);
 assert.equal(V.mastered(t,'production'),true);
});
check('Renaming a learned word clears both tracks',()=>{
 const l=W.lessons[0],id=W.selectPreset(l.folder,l.words[0].id,'active');
 W.rate(id,'production','good','resilience',now);
 W.update(id,{term:'accountability'});
 assert.equal(W.get(id).learning.production.history.length,0);
 assert.equal(W.get(id).learning.recognition.due,null);
 assert.equal(W.get(id).learning.status,'active');
});
check('Cosmetic edits keep progress; changed meanings and older backups do not restore it',()=>{
 const l=W.lessons[1],id=W.selectPreset(l.folder,l.words[0].id,'active');
 W.rate(id,'production','good','milestone',now);
 const before=JSON.stringify(W.get(id).learning),meaning=W.get(id).definition;
 W.update(id,{term:' MILESTONE ',note:'A note.'});assert.equal(JSON.stringify(W.get(id).learning),before);
 const backup=W.exportBackup();
 W.update(id,{definition:'A different sense.'});assert.equal(W.get(id).learning.production.history.length,0);
 W.importBackup(backup);assert.equal(W.get(id).learning.production.history.length,0,'Different meanings do not share mastery');
 W.update(id,{definition:meaning});W.importBackup(backup);
 assert.equal(W.get(id).learning.production.history.length,0,'A backup predating the reset cannot resurrect mastery');
});
check('A stale revealed attempt cannot grade a changed word',()=>{
 const l=W.lessons[1],id=W.selectPreset(l.folder,'07','active'),time=Date.now();
 const token=W.beginReview(id,'production',time);W.revealReview(token);
 assert.ok(!V.queue(W.read().entries,time).items.some(i=>i.id===id && i.track==='production'));
 W.update(id,{term:'complementary'});
 assert.throws(()=>W.rate(id,'production','good','intervention',time,token));
 assert.equal(W.get(id).learning.production.history.length,0);
});
check('Saved sentences remain editable and separate from vocabulary learning',()=>{
 const id=W.addSentence('A complete saved sentence.');W.update(id,{definition:'My understanding.',note:'My note.'});
 const sentence=W.get(id);assert.equal(sentence.term,'A complete saved sentence.');assert.equal(sentence.definition,'My understanding.');assert.equal(sentence.learning,undefined);
 const before=W.exportBackup();W.importBackup(before);assert.equal(W.read().entries.filter(e=>W.kind(e)==='sentence').length,1);
});
check('Active recommendations have explicit teaching reasons',()=>{
 for(const l of W.lessons){
  const notes={window:{}};vm.runInNewContext(fs.readFileSync(`${l.folder}/lesson-notes.js`,'utf8'),notes);
  assert.ok(notes.window.LESSON_NOTES.learningRecommendations);
  const active=l.words.filter(w=>w.recommendation==='active');assert.ok(active.length>=5&&active.length<=6);
  for(const w of active)assert.ok(w.recommendationReason?.length>25);
  for(const w of l.words){
   const expected=notes.window.LESSON_NOTES.learningRecommendations[w.id];
   assert.equal(w.recommendation,expected?.goal||'exposure','Suggestions follow explicit teaching metadata, independent of list position');
   assert.equal(w.recommendationReason,expected?.reason||'');
  }
 }
});
check('Generated lessons omit obsolete recall and fixed schedules',()=>{
 for(const l of W.lessons){const c={window:{}};vm.runInNewContext(fs.readFileSync(`${l.folder}/lesson-data.js`,'utf8'),c);
  assert.equal(c.window.LESSON.recall,undefined);
  assert.equal(c.window.LESSON.sections['SPACED-REPETITION REVIEW — 20 WORDS'],undefined);
  assert.equal(c.window.LESSON.sections['VOCABULARY REVIEW LEDGER'],undefined);
 }
});
console.log(results.join('\n'));
