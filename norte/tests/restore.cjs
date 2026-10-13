const {Client} = require('pg');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {capture,restore,seal,unseal} = require('../scripts/backup.cjs');
async function testRestore(source,connection,bootstrap) {
  const avatarOwner = '00000000-0000-4000-8000-000000000002';
  const avatarBytes = await require('sharp')({create:{width:256,height:256,channels:3,background:'#82533d'}}).webp().toBuffer();
  await source.query('update norte_private.profiles set avatar=$1,avatar_version=avatar_version+1 where user_id=$2',[avatarBytes,avatarOwner]);
  const files = new Map((await source.query('select bucket_id,name from storage.objects')).rows.map(row => [row.bucket_id + '/' + row.name,Buffer.from('%PDF-synthetic-backup') ]));
  const backup = await capture(source,{read:async (bucket,name) => files.get(bucket + '/' + name)});
  const key = crypto.randomBytes(32).toString('hex'); const encoded = seal(backup,key); const decoded = unseal(encoded,key);
  assert.ok(!encoded.includes(Buffer.from('Sintético'))); const broken = Buffer.from(encoded); broken[40] ^= 1; assert.throws(() => unseal(broken,key)); assert.equal(backup.tables['norte_private.sessions'],undefined);
  await source.query('create database norte_restore_test'); const target = new Client({...connection,database:'norte_restore_test'}); await target.connect();
  try {
    await target.query(bootstrap.replace(/^create role .*;\n/gm,''));
    const restoredFiles = new Map(); const deleted = backup.tables['public.norte_projects'][0].id;
    const storage = {read:async (bucket,name) => restoredFiles.get(bucket + '/' + name),write:async (bucket,name,bytes) => { restoredFiles.set(bucket + '/' + name,bytes); await target.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,name]); }};
    await restore(target,storage,decoded,[deleted]);
    assert.equal((await target.query('select count(*) from auth.users')).rows[0].count,'3');
    assert.equal((await target.query('select deleted_at is not null as gone from norte_projects where id=$1',[deleted])).rows[0].gone,true);
    assert.equal((await target.query("select count(*) from norte_jobs where status in ('running','queued')")).rows[0].count,'0');
    assert.equal((await target.query('select ai_enabled from norte_controls')).rows[0].ai_enabled,false);
    assert.deepEqual((await target.query('select avatar from norte_private.profiles where user_id=$1',[avatarOwner])).rows[0].avatar,avatarBytes);
    assert.equal((await target.query('select count(*) from norte_private.prototype_observers where enabled')).rows[0].count,'0');
    assert.equal((await target.query('select count(*) from norte_plan_catalog where approved')).rows[0].count,'0');
    assert.ok(restoredFiles.size > 0); for (const [name,bytes] of restoredFiles) { assert.deepEqual(bytes,files.get(name)); }
    const triggers = await target.query("select tgname from pg_trigger where tgrelid in (select oid from pg_class where relname like 'norte_%') and tgenabled='D'"); assert.equal(triggers.rowCount,0);
    await target.query('set role authenticated'); await target.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:'00000000-0000-4000-8000-000000000002',aal:'aal1'})]);
    assert.equal((await target.query('select norte_can_read($1) allowed',[deleted])).rows[0].allowed,false);
    console.log('PASS RESTORE banco isolado, bytes de Storage simulado, integridade, exclusões e permissões preservadas.');
  } finally { await target.end(); }
}
module.exports = {testRestore};
