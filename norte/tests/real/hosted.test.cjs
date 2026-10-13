const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const {Client} = require('pg');
const {createClient} = require('@supabase/supabase-js');
const {databaseOptions} = require('../../scripts/database-connection.cjs');
const {TARGET} = require('../../scripts/setup-cloud.cjs');
const {createApp} = require('../../server/app.cjs');
const {readConfig} = require('../../server/config.cjs');
const {createGateway} = require('../../server/supabase.cjs');
const {processJob} = require('../../server/jobs.cjs');
function verified(result,label) { assert.equal(result.error?.code || (result.error ? 'provider_error' : null),null,label); return result.data; }
function totp(secret) {
  const bits = [...secret].map(char => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5,'0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte,2))); const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hmac = crypto.createHmac('sha1',key).update(counter).digest(); const offset = hmac.at(-1) & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6,'0');
}
test('Supabase hospedado: Auth, MFA, RLS, sessões e arquivos reais com fixtures removidas',{skip:process.env.RUN_HOSTED_SMOKE !== 'true',timeout:300000},async () => {
  const env = process.env; const expected = TARGET.project + '.supabase.co';
  assert.equal(new URL(env.SUPABASE_URL).hostname,expected); assert.equal(env.REAL_TEST_ACK,expected);
  const options = databaseOptions(env.MIGRATION_DATABASE_URL,env);
  assert.ok(options.host === 'db.' + expected || options.host.endsWith('.pooler.supabase.com') && options.user === 'postgres.' + TARGET.project);
  const site = env.HOSTED_TEST_SITE || 'http://127.0.0.1:8080';
  assert.ok(['http://127.0.0.1:8080','https://testes-requisitos.onrender.com'].includes(site));
  const remote = site.startsWith('https:'); const config = readConfig({...env,NODE_ENV:remote ? 'production' : 'test',SITE_URL:site});
  const gateway = createGateway(config); const app = remote ? site : createApp({config,gateway});
  const sql = new Client(options); await sql.connect();
  const users = []; const clients = []; const run = crypto.randomUUID();
  const manifest = path.join(__dirname,'../../test-results/hosted-' + run + '.json'); fs.mkdirSync(path.dirname(manifest),{recursive:true});
  function record(user) { users.push(user); fs.writeFileSync(manifest,JSON.stringify({project:TARGET.project,run,userIds:users.map(item => item.id)}),{mode:0o600}); }
  async function fixture(label) {
    const email = 'norte-fixture-' + run + '-' + label + '@example.invalid'; const password = crypto.randomBytes(24).toString('base64url');
    const data = verified(await gateway.service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{fixture_run:run}}),'Criar conta sintética');
    const user = {id:data.user.id,email,password}; record(user); return user;
  }
  async function browser() { const agent = request.agent(app); const init = await agent.get('/api/bootstrap'); assert.equal(init.status,200,'Bootstrap real'); return {agent,headers:{Origin:site,'X-CSRF-Token':init.body.csrfToken}}; }
  async function post(session,url,body,status = 200) { const response = await session.agent.post(url).set(session.headers).send(body).timeout(45000); assert.equal(response.status,status,url); return response; }
  async function login(user) { const session = await browser(); const response = await post(session,'/api/auth/login',{email:user.email,password:user.password}); assert.doesNotMatch(response.text,/access_token|refresh_token/); assert.match(response.headers['set-cookie'].join(';'),/HttpOnly/); if (remote) { assert.match(response.headers['set-cookie'].join(';'),/Secure/); } return session; }
  async function direct(user) { const client = createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}); verified(await client.auth.signInWithPassword({email:user.email,password:user.password}),'Login direto sintético'); clients.push(client); return client; }
  function passed(name) { console.log(JSON.stringify({integration:remote ? 'Render + Supabase reais' : 'BFF local + Supabase real',verified:name,emailDeliveryTested:false})); }
  try {
    const a = await fixture('a'); const b = await fixture('b'); const c = await fixture('admin');
    const first = await login(a); const second = await login(b); const admin = await login(c); const anonymous = await browser(); const dbA = await direct(a); const dbB = await direct(b);
    assert.equal((await anonymous.agent.get('/api/projects')).status,401);
    assert.equal((await first.agent.post('/api/auth/login').set('Origin','https://attacker.invalid').set('X-CSRF-Token',first.headers['X-CSRF-Token']).send({email:a.email,password:a.password})).status,403);
    passed('login, cookie protegido, CSRF e acesso anônimo');
    let project = (await post(first,'/api/projects',{name:'Fixture de homologação ' + run,type:'software',profile:'NASA',start:'2026-10-13',template:'empty'},201)).body;
    project.payload.requirements = [{id:'REQ-T1',version:1,text:'O sistema deve registrar α ≤ 3 °C.',status:'pending'}];
    project.payload.verifications = [{id:'VER-T1',title:'Verificação sintética',requirementIds:['REQ-T1'],method:'Teste',result:'Evidência sintética preservada',evidence:'FIXTURE-1'}];
    require('../../server/schemas.cjs').payload.parse(project.payload);
    const update = await first.agent.put('/api/projects/' + project.id).set(first.headers).send({version:project.version,payload:project.payload}); assert.equal(update.status,200); project = update.body;
    const saved = await first.agent.get('/api/projects/' + project.id); assert.equal(saved.body.payload.requirements[0].text,project.payload.requirements[0].text);
    const conflict = await first.agent.put('/api/projects/' + project.id).set(first.headers).send({version:1,payload:project.payload}); assert.equal(conflict.status,409);
    assert.equal((await second.agent.put('/api/projects/' + project.id).set(second.headers).send({version:project.version,payload:project.payload})).status,404);
    for (const suffix of ['', '/export','/versions','/jobs','/sources']) { const response = await second.agent.get('/api/projects/' + project.id + suffix); assert.equal(response.status,404,suffix); assert.doesNotMatch(response.text,/Evidência sintética|registrar α/); }
    const rows = verified(await dbB.from('norte_projects').select('id,payload').eq('id',project.id),'RLS real'); assert.deepEqual(rows,[]);
    assert.ok((await dbB.rpc('norte_save_project',{p_id:project.id,p_version:project.version,p_payload:project.payload})).error);
    assert.ok((await dbB.rpc('norte_manage_project',{p_id:project.id,p_version:project.version,p_action:'delete',p_name:project.name})).error);
    assert.ok((await dbA.from('norte_accounts').update({plan:'professional'}).eq('user_id',a.id)).error);
    assert.ok((await dbA.from('norte_projects').update({owner_id:b.id}).eq('id',project.id)).error);
    assert.ok((await dbA.from('norte_config').update({operationally_approved:true}).eq('active',true)).error);
    assert.ok((await dbA.rpc('norte_claim_job')).error);
    await dbA.auth.updateUser({data:{role:'commercial',is_admin:true}}); assert.equal(verified(await dbA.rpc('norte_is_admin'),'Cargo autoritativo'),false);
    passed('criação, salvamento, conflito, RLS e bloqueio de promoção, preços e comandos internos');
    await sql.query('insert into norte_private.admins(user_id,role) values($1,$2)',[c.id,'commercial']);
    assert.equal((await admin.agent.get('/api/admin')).status,403);
    const factor = (await post(admin,'/api/auth/mfa/enroll',{})).body;
    await post(admin,'/api/auth/mfa/verify',{factorId:factor.id,code:totp(factor.secret)});
    assert.equal((await admin.agent.get('/api/admin')).status,200);
    assert.equal((await admin.agent.get('/api/projects/' + project.id)).status,404);
    assert.equal((await first.agent.get('/api/admin')).status,403);
    passed('MFA TOTP real; administrador comercial continua sem acesso ao projeto');
    const input = {version:project.version,key:crypto.randomUUID(),format:'pdf',documents:['REQ']};
    const job = (await post(first,'/api/projects/' + project.id + '/generate',input,202)).body;
    const repeat = (await post(first,'/api/projects/' + project.id + '/generate',input,202)).body; assert.equal(repeat.id,job.id);
    if (!remote) {
      // Somente esta tarefa sintética; não reivindica tarefas de terceiros.
      const claimed = await sql.query("update public.norte_jobs set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid() where id=$1 and user_id=$2 and status='queued' returning *",[job.id,a.id]);
      if (claimed.rows.length) { await processJob(gateway,claimed.rows[0]); }
    }
    let status;
    for (let attempt = 0; attempt < 30; attempt += 1) { status = (await first.agent.get('/api/jobs/' + job.id)).body.status; if (status === 'ready' || status === 'failed') { break; } await new Promise(resolve => setTimeout(resolve,1000)); }
    assert.equal(status,'ready','Geração PDF e upload no Storage real');
    const download = await first.agent.get('/api/jobs/' + job.id + '/download').buffer(true); assert.equal(download.status,200); assert.equal(download.body.subarray(0,5).toString(),'%PDF-'); assert.match(download.headers['cache-control'],/no-store/);
    const partial = await first.agent.get('/api/jobs/' + job.id + '/download').set('Range','bytes=0-4').buffer(true); assert.equal(partial.status,206); assert.equal(partial.body.toString(),'%PDF-');
    const head = await first.agent.head('/api/jobs/' + job.id + '/download'); assert.equal(head.status,200);
    for (const session of [second,admin,anonymous]) { for (const method of ['get','head']) { const response = await session.agent[method]('/api/jobs/' + job.id + '/download').set('Range','bytes=0-4'); assert.equal(response.status,session === anonymous ? 401 : 404); } }
    const stored = (await sql.query('select storage_path from public.norte_jobs where id=$1 and user_id=$2',[job.id,a.id])).rows[0];
    assert.ok((await dbB.storage.from('norte-projects').download(stored.storage_path)).error);
    const publicFile = await fetch(env.SUPABASE_URL + '/storage/v1/object/public/norte-projects/' + stored.storage_path,{redirect:'error'}); assert.ok(!publicFile.ok);
    await post(first,'/api/projects/' + project.id + '/access',{userId:b.id,scope:'read',expires:new Date(Date.now()+3600000).toISOString()},403);
    await post(first,'/api/trial',{});
    await post(first,'/api/projects/' + project.id + '/access',{userId:b.id,scope:'read',expires:new Date(Date.now()+3600000).toISOString()});
    assert.equal((await second.agent.get('/api/jobs/' + job.id + '/download').set('Range','bytes=0-4')).status,206);
    await post(first,'/api/projects/' + project.id + '/access',{userId:b.id,scope:'revoke',expires:new Date(Date.now()+3600000).toISOString()});
    assert.equal((await second.agent.get('/api/jobs/' + job.id + '/download').set('Range','bytes=0-4')).status,404);
    passed('PDF real, idempotência, Storage privado, GET/HEAD/Range e revogação imediata');
    const recovery = verified(await gateway.service.auth.admin.generateLink({type:'recovery',email:a.email}),'Link de recuperação sem envio');
    const recover = await browser(); await post(recover,'/api/auth/confirm',{token_hash:recovery.properties.hashed_token,type:'recovery'});
    await post(await browser(),'/api/auth/confirm',{token_hash:recovery.properties.hashed_token,type:'recovery'},400);
    const newPassword = crypto.randomBytes(24).toString('base64url'); await post(recover,'/api/auth/password',{password:newPassword}); a.password = newPassword;
    assert.equal((await first.agent.get('/api/projects')).status,401); const renewed = await login(a);
    await post(renewed,'/api/auth/logout',{}); assert.equal((await renewed.agent.get('/api/projects')).status,401);
    const signupEmail = 'norte-fixture-' + run + '-signup@example.invalid';
    const signup = verified(await gateway.service.auth.admin.generateLink({type:'signup',email:signupEmail,password:crypto.randomBytes(24).toString('base64url')}),'Link de confirmação sem envio'); record({id:signup.user.id,email:signupEmail});
    const confirmation = await browser(); await post(confirmation,'/api/auth/confirm',{token_hash:signup.properties.hashed_token,type:'signup'});
    await post(await browser(),'/api/auth/confirm',{token_hash:signup.properties.hashed_token,type:'signup'},400);
    assert.equal((await confirmation.agent.get('/api/projects')).status,200);
    passed('confirmação, repetição de links, recuperação, troca de senha e logout reais; sem teste de entrega SMTP');
  } finally {
    for (const client of clients) { await client.auth.signOut().catch(() => {}); }
    const ids = users.map(user => user.id);
    try {
      if (ids.length) {
        const owned = await sql.query('select storage_path from public.norte_jobs where user_id=any($1::uuid[]) and storage_path is not null',[ids]);
        if (owned.rows.length) { verified(await gateway.service.storage.from('norte-projects').remove(owned.rows.map(row => row.storage_path)),'Remover somente arquivos sintéticos'); }
        await sql.query('begin');
        await sql.query('delete from public.norte_jobs where user_id=any($1::uuid[])',[ids]);
        await sql.query('delete from norte_private.usage where user_id=any($1::uuid[])',[ids]);
        await sql.query('delete from public.norte_projects where owner_id=any($1::uuid[])',[ids]);
        await sql.query('commit');
        for (const user of users) { verified(await gateway.service.auth.admin.deleteUser(user.id),'Remover somente usuário sintético'); }
        fs.unlinkSync(manifest); console.log(JSON.stringify({syntheticUsersRemoved:ids.length,syntheticFilesRemoved:owned.rows.length,auditRetained:true}));
      }
    } finally { await sql.end(); }
  }
});
