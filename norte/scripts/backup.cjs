const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Client} = require('pg');
const {createClient} = require('@supabase/supabase-js');
const {migrate} = require('./migrate.cjs');
const TABLES = ['auth.users','auth.identities','public.norte_config','public.norte_accounts','norte_private.admins','norte_private.storage_limits','public.norte_projects','public.norte_access','public.norte_requirements','public.norte_verifications','public.norte_links','public.norte_versions','public.norte_sources','public.norte_source_access','public.norte_citations','public.norte_source_adoptions','public.norte_jobs','norte_private.usage','public.norte_analyses','public.norte_feedback','public.norte_orders','norte_private.outbox','public.norte_controls','public.norte_audit','public.norte_events','public.norte_alerts'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function seal(value,key) { if (!/^[a-f0-9]{64}$/i.test(key || '')) { throw new Error('Configure uma chave de backup de 32 bytes.'); } const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv); const body = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]); return Buffer.concat([Buffer.from('NORTE-B1'),iv,cipher.getAuthTag(),body]); }
function unseal(bytes,key) { if (bytes.subarray(0,8).toString() !== 'NORTE-B1' || !/^[a-f0-9]{64}$/i.test(key || '')) { throw new Error('Backup ou chave inválidos.'); } const cipher = crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),bytes.subarray(8,20)); cipher.setAuthTag(bytes.subarray(20,36)); return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(36)),cipher.final()]).toString()); }
async function capture(client,storage) {
  const tables = {}; let size = 0;
  await client.query('begin isolation level repeatable read read only');
  try {
    for (const table of TABLES) { if (!(await client.query('select to_regclass($1) as name',[table])).rows[0].name) { continue; } const suffix = table === 'auth.users' ? ' where id in (select user_id from public.norte_accounts union select user_id from norte_private.admins)' : table === 'auth.identities' ? ' where user_id in (select user_id from public.norte_accounts union select user_id from norte_private.admins)' : ''; tables[table] = (await client.query('select * from ' + table + suffix)).rows; }
    const objects = [];
    const files = (await client.query("select bucket_id,name,metadata from storage.objects where bucket_id in ('norte-projects','norte-sources','norte-quarantine') order by bucket_id,name")).rows;
    for (const file of files) { const bytes = await storage.read(file.bucket_id,file.name); size += bytes.length; if (size > 512 * 1024 * 1024) { throw new Error('O backup excede o limite operacional de 512 MiB deste exportador.'); } objects.push({bucket:file.bucket_id,name:file.name,mime:file.metadata?.mimetype || 'application/octet-stream',sha256:digest(bytes),bytes:bytes.toString('base64')}); }
    const migrations = (await client.query('select name,sha256 from norte_migrations order by name')).rows;
    await client.query('commit'); return {format:1,createdAt:new Date().toISOString(),migrations,tables,objects};
  } catch (error) { await client.query('rollback'); throw error; }
}
async function restore(client,storage,backup,deletedIds = []) {
  if (backup.format !== 1 || !Array.isArray(backup.objects) || Object.keys(backup.tables).some(table => !TABLES.includes(table))) { throw new Error('Manifesto inválido.'); }
  if ((await client.query('select count(*) from auth.users')).rows[0].count !== '0') { throw new Error('Restauração exige ambiente isolado sem usuários.'); }
  const existing = (await client.query("select to_regclass('public.norte_projects') as name")).rows[0].name;
  if (existing && (await client.query('select count(*) from norte_projects')).rows[0].count !== '0') { throw new Error('Destino contém projetos.'); }
  if ((await client.query("select count(*) from storage.objects where bucket_id like 'norte-%'")).rows[0].count !== '0') { throw new Error('Storage de destino deve estar vazio.'); }
  await migrate(client);
  const applied = (await client.query('select name,sha256 from norte_migrations order by name')).rows;
  if (JSON.stringify(applied) !== JSON.stringify(backup.migrations)) { throw new Error('Use a mesma versão das migrações do backup.'); }
  const tombstones = new Set([...deletedIds,...(backup.tables['public.norte_projects'] || []).filter(p => p.deleted_at).map(p => p.id)]);
  for (const object of backup.objects) { if (!['norte-projects','norte-sources','norte-quarantine'].includes(object.bucket) || object.name.includes('..') || object.name.startsWith('/') || !object.name || digest(Buffer.from(object.bytes,'base64')) !== object.sha256) { throw new Error('Integridade ou caminho de objeto inválido.'); } }
  await client.query('begin');
  try {
    const selected = TABLES.filter(table => backup.tables[table]);
    for (const table of selected.filter(name => !name.startsWith('auth.'))) { await client.query('alter table ' + table + ' disable trigger user'); }
    for (const table of [...selected].reverse()) { await client.query('delete from ' + table); }
    for (const table of selected) {
      const rows = backup.tables[table]; if (!rows.length) { continue; }
      const columns = (await client.query("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped and attgenerated='' order by attnum",[table])).rows.map(c => '"' + c.attname.replaceAll('"','""') + '"');
      await client.query(`insert into ${table} (${columns.join(',')}) overriding system value select ${columns.map(c => 'r.' + c).join(',')} from jsonb_populate_recordset(null::${table},$1) r`,[JSON.stringify(rows)]);
    }
    await client.query("update norte_private.usage u set used=greatest(0,u.used-x.cost) from (select user_id,quota_period,sum(cost) cost from norte_jobs where status in ('queued','running') and not refunded group by user_id,quota_period) x where u.user_id=x.user_id and u.period=x.quota_period");
    await client.query("update norte_jobs set status='cancelled',refunded=true,snapshot='{}',lease_token=null,lease_until=null where status in ('queued','running')");
    await client.query("update norte_controls set ai_enabled=false,generation_enabled=false,imports_enabled=false");
    await client.query("update norte_config set operationally_approved=false");
    await client.query("update norte_private.outbox set status='restore_paused',lease_until=null");
    for (const id of tombstones) { await client.query("update norte_projects set deleted_at=coalesce(deleted_at,now()),payload='{}' where id=$1",[id]); await client.query('delete from norte_links where project_id=$1',[id]); for (const table of ['norte_requirements','norte_verifications','norte_versions','norte_analyses','norte_source_adoptions']) { await client.query('delete from ' + table + ' where project_id=$1',[id]); } }
    await client.query('select norte_cleanup()');
    for (const table of ['norte_audit','norte_events','norte_alerts']) { await client.query(`select setval(pg_get_serial_sequence('public.${table}','id'),greatest(1,coalesce((select max(id) from public.${table}),0)),true)`); }
    for (const object of backup.objects) { if (object.bucket === 'norte-projects' && tombstones.has(object.name.split('/')[1])) { continue; } const bytes = Buffer.from(object.bytes,'base64'); await storage.write(object.bucket,object.name,bytes,object.mime); if (digest(await storage.read(object.bucket,object.name)) !== object.sha256) { throw new Error('Falha de integridade na restauração.'); } }
    for (const table of selected.filter(name => !name.startsWith('auth.'))) { await client.query('alter table ' + table + ' enable trigger user'); }
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; }
}
function storageAdapter(url,key) { const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}); return {read:async (bucket,name) => { const result = await client.storage.from(bucket).download(name); if (result.error) { throw new Error('Leitura de Storage falhou.'); } return Buffer.from(await result.data.arrayBuffer()); },write:async (bucket,name,bytes,mime) => { const result = await client.storage.from(bucket).upload(name,bytes,{contentType:mime,upsert:false}); if (result.error) { throw new Error('Restauração de Storage falhou.'); } }}; }
async function main() {
  const restoring = process.argv[2] === 'restore'; const env = process.env;
  const url = restoring ? env.RESTORE_DATABASE_URL : env.BACKUP_DATABASE_URL;
  if (!url) { throw new Error('Configure a conexão operacional do banco.'); }
  const target = new URL(url);
  if (restoring && (env.RESTORE_TARGET_ACK !== target.hostname || env.RESTORE_SUPABASE_URL === env.SUPABASE_URL || !env.RESTORE_DELETIONS_FILE)) { throw new Error('Destino isolado e registro recente de exclusões são obrigatórios.'); }
  const client = new Client({connectionString:url,ssl:{rejectUnauthorized:true}}); await client.connect();
  try {
    if (process.argv[2] === 'deletions') { const deleted = (await client.query('select id from norte_projects where deleted_at is not null')).rows.map(row => row.id); fs.writeFileSync(process.argv[3],seal({createdAt:new Date().toISOString(),deletedIds:deleted},env.BACKUP_ENCRYPTION_KEY),{mode:0o600,flag:'wx'}); return; }
    const storage = storageAdapter(restoring ? env.RESTORE_SUPABASE_URL : env.SUPABASE_URL,restoring ? env.RESTORE_SUPABASE_SECRET_KEY : env.SUPABASE_SECRET_KEY);
    if (restoring) { const backup = unseal(fs.readFileSync(process.argv[3]),env.BACKUP_ENCRYPTION_KEY); const deletions = unseal(fs.readFileSync(env.RESTORE_DELETIONS_FILE),env.BACKUP_ENCRYPTION_KEY); if (deletions.createdAt < backup.createdAt) { throw new Error('O registro de exclusões deve ser mais recente que o backup.'); } await restore(client,storage,backup,deletions.deletedIds); console.log('Restaurado em ambiente isolado. Integrações e tarefas permanecem suspensas até conferência.'); }
    else { if (!env.BACKUP_DIRECTORY) { throw new Error('Configure BACKUP_DIRECTORY fora da pasta pública.'); } fs.mkdirSync(env.BACKUP_DIRECTORY,{recursive:true,mode:0o700}); const backup = await capture(client,storage); const filename = path.join(env.BACKUP_DIRECTORY,'norte-' + Date.now() + '.enc'); fs.writeFileSync(filename,seal(backup,env.BACKUP_ENCRYPTION_KEY),{mode:0o600,flag:'wx'}); console.log('Backup criptografado concluído no diretório operacional.'); }
  } finally { await client.end(); }
}
if (require.main === module) { main().catch(() => { console.error('Operação de backup não concluída. Confira configuração, destino vazio, versão e permissões; nenhum segredo foi registrado.'); process.exitCode = 1; }); }
module.exports = {capture,restore,seal,unseal,digest};
