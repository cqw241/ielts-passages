/* Real PostgreSQL integration in a disposable container. No host DB is touched.
   Uses an already installed Docker and postgres:15-alpine image. */
const {execFileSync, spawn}=require('node:child_process');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fixture=require('./sync-test-fixture.cjs');
const name='passage-sync-test-'+process.pid;
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
function sql(text,ok=true) {
 try { const out=execFileSync('docker',['exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-At'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}); if(!ok) assert.fail('Expected SQL rejection');return out.trim(); }
 catch(e) { if(ok || e.code==='ERR_ASSERTION')throw e;return e.stderr.toString(); }
}
const as=(id,text)=>`set role authenticated; set request.jwt.claim.sub='${id}'; ${text}`;
(async()=>{
 try {
  execFileSync('docker',['run','--rm','-d','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:15-alpine'],{stdio:'pipe'});
  for(let i=0;i<60;i++){try {execFileSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'pipe'});break;}catch {await new Promise(r=>setTimeout(r,200));}}
  sql(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${owner}'),('${other}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  sql(fixture.sql);sql(fixture.sql);
  sql(`insert into public.passage_account(user_id) values ('${owner}');`);
  assert.match(sql("set role anon; select public.passage_initialize('{}');",false),/permission denied/);
  assert.match(sql(as(other,"select public.passage_initialize('{}');"),false),/Account not allowed/);
  assert.match(sql(as(owner,"select public.passage_initialize('{}');"),false),/approved/);
  const blank=`'{"schema":1,"entries":{},"lessonProgress":{}}'::jsonb`;
  assert.equal(JSON.parse(sql(as(owner,`select public.passage_save(0,${blank});`)).split('\n').at(-1)).ok,false,'Empty device cannot create row');
  const backup=Buffer.from(fixture.backup);
  assert.equal(crypto.createHash('sha256').update(backup).digest('hex'),fixture.hash);
  const init=`select public.passage_initialize(convert_from(decode('${backup.toString('hex')}','hex'),'UTF8'));`;
  assert.equal(JSON.parse(sql(as(owner,init)).split('\n').at(-1)).version,1);
  assert.equal(JSON.parse(sql(as(owner,init)).split('\n').at(-1)).version,1,'Initialization is idempotent');
  assert.equal(sql(as(other,'select count(*) from public.passage_snapshots;')).split('\n').at(-1),'0','RLS hides other user snapshot');
  assert.equal(sql(as(other,'select count(*) from public.passage_revisions;')).split('\n').at(-1),'0');
  assert.match(sql(as(other,`select public.passage_save(1,${blank});`),false),/Account not allowed/);
  assert.match(sql(as(owner,'update public.passage_snapshots set version=99;'),false),/permission denied/);
  assert.match(sql(as(owner,'delete from public.passage_revisions;'),false),/permission denied/);
  assert.match(sql(as(owner,"select public.passage_save(1,'{}');"),false),/Invalid snapshot/);
  const snapshot=JSON.parse(sql(as(owner,'select snapshot from public.passage_snapshots;')).split('\n').at(-1));
  const original=JSON.parse(backup);assert.equal(Object.keys(snapshot.entries).length,original.entries.length);
  for(const e of original.entries)assert.deepEqual(snapshot.entries[e.id],e,'Seed entries are lossless');
  // Independent PostgreSQL connections race against the same version.
  async function race(){return new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-At']);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('exit',c=>c?reject(new Error(err)):resolve(JSON.parse(out.trim().split('\n').at(-1))));p.stdin.end(as(owner,`select public.passage_save(1,${blank});`));});}
  const results=await Promise.all([race(),race()]);assert.equal(results.filter(x=>x.ok).length,1,'CAS admits exactly one writer');
  assert.equal(sql('select count(*) from public.passage_revisions;'),'2','Rejected writer adds no revision');
  assert.equal(sql('select version from public.passage_snapshots;'),'2');
  assert.equal(sql('select count(*) from public.passage_revisions r, jsonb_object_keys(r.snapshot->\'entries\') where version=1;'),String(original.entries.length),'Pre-deletion revision retained');
  console.log('PASS: real PostgreSQL SQL install/re-run, seed hash and lossless entries, empty-device gate, single-account authorization, RLS, RPC-only writes, concurrent CAS and revision retention.');
 } finally {execFileSync('docker',['rm','-f',name],{stdio:'pipe'});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
