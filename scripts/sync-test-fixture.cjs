/* Public synthetic fixture. Only isolated test copies substitute its hash;
   shipped JavaScript and cloud SQL keep the approved personal-backup hash. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const backup=fs.readFileSync(path.join(__dirname,'fixtures/sync-backup.json'),'utf8');
const hash=crypto.createHash('sha256').update(backup).digest('hex');
const core=fs.readFileSync(path.join(__dirname,'../assets/cloud-sync-core.js'),'utf8');
const approved=core.match(/const SEED_HASH = '([a-f0-9]{64})'/)[1];
function testCopy(source,count){assert.equal(source.split(approved).length-1,count,'Production migration gates must agree');return source.replaceAll(approved,hash);}
module.exports={backup,hash,core:testCopy(core,1),sql:testCopy(fs.readFileSync(path.join(__dirname,'../supabase/sync.sql'),'utf8'),2)};
