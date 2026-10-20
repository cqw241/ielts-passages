/* Pure conflict rules: deletion semantics, identities and unbased old devices. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={window:{},structuredClone};vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/cloud-sync-core.js','utf8'),ctx);
const C=ctx.window.PassageSyncCore,copy=structuredClone;
const word=(id,key,note='')=>({id,key,term:key,note});
const base=C.empty();base.entries.a=word('a','alpha');base.entries.b=word('b','beta');
let l=copy(base),r=copy(base);delete l.entries.a;r.entries.b.note='Independent';
let result=C.merge(base,l,r);assert.equal(result.conflicts.length,0);assert.equal(result.snapshot.entries.a,undefined);assert.equal(result.snapshot.entries.b.note,'Independent');
r.entries.a.note='Changed during delete';result=C.merge(base,l,r);assert.equal(result.conflicts.length,1);
const key=result.conflicts[0].key;result=C.merge(base,l,r,{[key]:'remote'});assert.equal(result.snapshot.entries.a.note,'Changed during delete');
// An unbased old copy cannot resurrect a deleted cloud record automatically.
l=C.empty();l.entries.old=word('old','deleted word','An old note');r=C.empty();
assert.equal(C.merge(C.empty(),l,r,{}, {firstDevice:true}).conflicts.length,1);
r.entries.a=word('a','other word');assert.equal(C.merge(C.empty(),l,r,{}, {firstDevice:true}).conflicts.length,1);
l.lessonProgress.x={writing:'Old draft'};assert.equal(C.merge(C.empty(),l,r,{}, {firstDevice:true}).conflicts.length,2);
// Independent additions of one logical word compare as one complete entry.
l=copy(base);r=copy(base);l.entries.l=word('l','gamma','Local');r.entries.r=word('r','gamma','Remote');
result=C.merge(base,l,r);assert.equal(result.conflicts.length,1);assert.equal(result.conflicts[0].path[1],'r');
assert.equal(Object.values(result.snapshot.entries).filter(e=>e.key==='gamma').length,1);
// A known stale device receives a deletion, including clearing progress fields.
l=copy(base);r=copy(base);delete r.entries.a;assert.equal(C.merge(base,l,r).snapshot.entries.a,undefined);
const p=C.empty();p.lessonProgress.x={writing:'Draft',answers:{1:'TRUE',2:'FALSE'},read:['A']};l=copy(p);r=copy(p);l.lessonProgress.x.writing='';r.lessonProgress.x.answers[2]='TRUE';
result=C.merge(p,l,r);assert.equal(result.conflicts.length,0);assert.equal(result.snapshot.lessonProgress.x.writing,'');assert.equal(result.snapshot.lessonProgress.x.answers[2],'TRUE');
l=copy(p);r=copy(p);l.lessonProgress.x.writing='Home';r.lessonProgress.x.writing='Dorm';assert.equal(C.merge(p,l,r).conflicts.length,1);
assert.equal(C.meaningful({entries:{},lessonProgress:{x:{read:[],writing:'',answers:{1:''},saved:['01']}}}),false);
console.log('PASS: independent merges, delete/edit conflicts, known deletions, unbased stale-copy gate, logical identities, progress resets, draft conflicts and blank-device detection.');
