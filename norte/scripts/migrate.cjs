const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Client} = require('pg');
const {databaseOptions,databaseError} = require('./database-connection.cjs');
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
  const client = new Client(databaseOptions(process.env.MIGRATION_DATABASE_URL));
  try { await client.connect(); await migrate(client); console.log('Migrações concluídas. Banco preparado e checksums conferidos.'); } finally { await client.end(); }
}
if (require.main === module) { main().catch(error => { console.error(databaseError(error)); process.exitCode = 1; }); }
module.exports = {migrate};
