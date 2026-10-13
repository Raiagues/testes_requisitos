const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Client} = require('pg');
async function migrate(client) {
  await client.query('create table if not exists public.norte_migrations(name text primary key, sha256 text not null, applied_at timestamptz not null default now())');
  await client.query('alter table public.norte_migrations enable row level security');
  await client.query('revoke all on public.norte_migrations from anon, authenticated');
  const directory = path.join(__dirname,'..','supabase','migrations');
  for (const name of fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(directory,name),'utf8');
    const digest = crypto.createHash('sha256').update(sql).digest('hex');
    const existing = await client.query('select sha256 from public.norte_migrations where name = $1',[name]);
    if (existing.rows.length) { if (existing.rows[0].sha256 !== digest) { throw new Error('Migração já aplicada foi alterada: ' + name); } continue; }
    await client.query('begin');
    try { await client.query(sql); await client.query('insert into public.norte_migrations(name,sha256) values($1,$2)',[name,digest]); await client.query('commit'); console.log('Aplicada: ' + name); }
    catch (error) { await client.query('rollback'); throw error; }
  }
}
async function main() {
  if (!process.env.MIGRATION_DATABASE_URL) { throw new Error('Configure MIGRATION_DATABASE_URL somente no terminal de migração.'); }
  if (process.env.MIGRATION_SSL === 'disable-local-only' && !['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.MIGRATION_DATABASE_URL).hostname)) { throw new Error('TLS é obrigatório fora do banco local.'); }
  const client = new Client({connectionString:process.env.MIGRATION_DATABASE_URL,ssl:process.env.MIGRATION_SSL === 'disable-local-only' ? false : {rejectUnauthorized:true}});
  await client.connect(); try { await migrate(client); } finally { await client.end(); }
}
if (require.main === module) { main().catch(() => { console.error('Migração não concluída. Verifique a conexão, TLS e os privilégios no ambiente de migração.'); process.exitCode = 1; }); }
module.exports = {migrate};
