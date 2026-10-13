const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {Client} = require('pg');
const {migrate} = require('./migrate.cjs');
async function connectReady(connection) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const client = new Client({...connection,connectionTimeoutMillis:1000});
    try { await client.connect(); await client.query({text:'select 1',query_timeout:1000}); return client; }
    catch { await client.end().catch(() => {}); await new Promise(resolve => setTimeout(resolve,250)); }
  }
  throw new Error('PostgreSQL isolado não ficou pronto em 30 segundos; nenhum teste foi omitido.');
}
async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'norte-pg-'));
  const bin = process.env.POSTGRES_BIN || '/usr/lib/postgresql/16/bin';
  const data = path.join(root,'data');
  const socket = path.join(root,'socket'); fs.mkdirSync(socket);
  let started = false;
  let container = '';
  try {
    let connection;
    if (fs.existsSync(path.join(bin,'initdb'))) {
      execFileSync(path.join(bin,'initdb'),['-D',data,'-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
      execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h '' -k ${socket} -p 55439`,'-w','start'],{stdio:'pipe'}); started = true;
      connection = {host:socket,port:55439,database:'postgres',user:os.userInfo().username};
    } else {
      container = 'norte-test-' + Date.now();
      const password = crypto.randomUUID();
      const image = 'postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
      execFileSync('docker',['run','--rm','-d','--name',container,'--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_PASSWORD=' + password,'-p','127.0.0.1::5432',image],{stdio:'pipe'});
      const port = Number(execFileSync('docker',['inspect','--format','{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',container],{encoding:'utf8'}).trim());
      connection = {host:'127.0.0.1',port,database:'postgres',user:'postgres',password};
    }
    const client = await connectReady(connection);
    try {
      const bootstrap = fs.readFileSync(path.join(__dirname,'..','supabase','tests','bootstrap.sql'),'utf8'); await client.query(bootstrap);
      await migrate(client); await migrate(client);
      const {runDatabaseTests} = require('../tests/database.cjs'); await runDatabaseTests(client,connection);
      const {testRestore} = require('../tests/restore.cjs'); await testRestore(client,connection,bootstrap);
    } finally { await client.end(); }
    console.log('PostgreSQL local: migrações idempotentes e testes de permissões concluídos. Auth/Storage são contratos locais, não serviços Supabase hospedados.');
  } finally { if (started) { execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'}); } if (container) { execFileSync('docker',['stop',container],{stdio:'pipe'}); } fs.rmSync(root,{recursive:true,force:true}); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
