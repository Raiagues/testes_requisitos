const {test} = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('node:crypto');
const {createApp} = require('../server/app.cjs');
const {readConfig} = require('../server/config.cjs');
const {AppError} = require('../server/errors.cjs');
const config = readConfig({NODE_ENV:'test',SITE_URL:'http://127.0.0.1:8080'});
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
function fakeGateway() {
  const actions = []; const sent = []; const serviceReads = [];
  const currentOffer = {version:1,operationally_approved:false,offer:{},limits:{}};
  const project = {id:A,owner_id:A,classification:'public',ai_authorized:true,version:1,payload:{requirements:[{id:'REQ-1',version:1,text:'Texto sintético'}]}};
  function query(table,privileged = false) {
    const filters = []; let single = false;
    const q = {select(){ return q; },eq(key,value){ filters.push([key,value]); return q; },in(){ return q; },is(){ return q; },order(){ return q; },limit(){ return q; },maybeSingle(){ single = true; return q; },single(){ single = true; return q; },insert(value){ actions.push({table,value}); return q; },update(value){ actions.push({table,value}); return q; },then(resolve){ if (privileged) { serviceReads.push(table); } let rows = table === 'norte_config' ? [currentOffer] : table === 'norte_controls' ? [{ai_enabled:true,generation_enabled:true}] : table === 'norte_projects' ? [project] : table === 'norte_source_adoptions' ? [{source_id:'SOURCE-1'}] : table === 'norte_sources' ? [{id:'SOURCE-1'}] : table === 'norte_citations' ? [{id:'CIT-1',source_id:'SOURCE-1',clause:'C.4',page_index:0,exact_text:'One thought.'}] : []; rows = rows.filter(row => filters.every(([key,value]) => row[key] === undefined || row[key] === value)); return Promise.resolve({data:single ? rows[0] || null : rows,error:null}).then(resolve); }}; return q;
  }
  const db = {from:table => query(table),rpc:async (name,args) => ({data:name === 'norte_project_context' ? (args.p_id === A ? project : null) : name === 'norte_is_admin' ? false : name === 'norte_can_read' ? false : {tier:'essential',limits:{}},error:null})};
  const gateway = {fresh:() => ({from:table => query(table),auth:{signInWithPassword:async () => ({data:{session:{access_token:'synthetic-token',refresh_token:'synthetic-refresh'},user:{id:A,email_confirmed_at:'now'}},error:null})}}),service:{from:table => query(table,true),rpc:async (name,args) => { actions.push({name,args}); return {data:[],error:null}; }},rate:async (key) => { sent.push(key); return true; },audit:async () => {},resolveSession:async id => { if (id !== 'synthetic-session') { throw new AppError('not_authenticated',401); } return {id,user:{id:A,email:'synthetic@example.invalid'},tokens:{access_token:'synthetic-token'},db,authClient:{auth:{getClaims:async () => ({data:{claims:{aal:'aal1'}}})}}}; },saveSession:async () => 'synthetic-session',rpc:async name => { if (name === 'norte_ai_slot') { return A; } actions.push({name}); return null; }};
  return {gateway,actions,sent,serviceReads,db};
}
async function bootstrap(app) { const agent = request.agent(app); const init = await agent.get('/api/bootstrap'); return {agent,token:init.body.csrfToken}; }
test('página publica URLs versionadas pelo conteúdo para atualizar CSS e scripts no navegador',async () => {
  const app = createApp({config,gateway:null}); const page = await request(app).get('/'); assert.equal(page.status,200);
  const assets = [...page.text.matchAll(/(?:src|href)="(\/assets\/(?:norte\.css|platform\.js)\?v=([a-f0-9]{12}))"/g)]; assert.equal(assets.length,2);
  for (const [,url,version] of assets) { const response = await request(app).get(url); assert.equal(response.status,200); assert.equal(crypto.createHash('sha256').update(response.text).digest('hex').slice(0,12),version); }
});
test('configuração ausente fecha operações, segredos e arquivos internos',async () => { const app = createApp({config,gateway:null}); for (const path of ['/api/projects','/api/admin','/.env','/.git/config','/server/config.cjs','/templates.json','/assets/../.env']) { const response = await request(app).get(path); assert.ok([403,404,503].includes(response.status),path); assert.doesNotMatch(response.text,/SESSION_ENCRYPTION_KEY|SUPABASE_SECRET_KEY|stack|postgres/); } assert.equal((await request(app).get('/api/health')).status,200); assert.equal((await request(app).get('/api/ready')).status,503); });
test('CSRF e origem exigidos também no login; Host e X-Forwarded não autorizam',async () => { const fake = fakeGateway(); const app = createApp({config,gateway:fake.gateway}); const {agent,token} = await bootstrap(app); const body = {email:'a@example.invalid',password:'synthetic-password'};
  assert.equal((await agent.post('/api/auth/login').set('Origin',config.siteUrl).send(body)).status,403);
  assert.equal((await agent.post('/api/auth/login').set('Origin','https://evil.invalid').set('X-CSRF-Token',token).send(body)).status,403);
  assert.equal((await agent.post('/api/auth/login').set('Origin','https://evil.invalid').set('Host','evil.invalid').set('X-Forwarded-Host','evil.invalid').set('X-CSRF-Token',token).send(body)).status,403);
  const login = await agent.post('/api/auth/login').set('Origin',config.siteUrl).set('X-CSRF-Token',token).send(body); assert.equal(login.status,200); assert.doesNotMatch(login.text,/synthetic-token|synthetic-refresh/); assert.match(login.headers['set-cookie'][0],/HttpOnly/); assert.match(login.headers['set-cookie'][0],/SameSite=Strict/);
});
test('HTTP GET, HEAD, Range, exportação e jobs não acessam outro projeto',async () => { const fake = fakeGateway(); const app = createApp({config,gateway:fake.gateway}); for (const url of ['/api/projects/' + B,'/api/projects/' + B + '/export','/api/projects/' + B + '/versions','/api/projects/' + B + '/jobs','/api/jobs/' + B,'/api/jobs/' + B + '/download']) { for (const method of ['get','head']) { const response = await request(app)[method](url).set('Cookie','norte-session=synthetic-session').set('Range','bytes=0-10'); assert.equal(response.status,404,url); assert.doesNotMatch(response.text || '',/Texto sintético/); } } assert.equal(fake.serviceReads.includes('norte_jobs'),false); });
test('admin sem MFA bloqueado, inclusive usuário comum e chaves no cliente',async () => { const fake = fakeGateway(); const app = createApp({config,gateway:fake.gateway}); assert.equal((await request(app).get('/api/admin').set('Cookie','norte-session=synthetic-session')).status,403); const html = await request(app).get('/'); assert.doesNotMatch(html.text,/synthetic-token|service_role|SUPABASE_SECRET_KEY/); assert.match(html.headers['content-security-policy'],/frame-ancestors 'none'/); assert.match(html.headers['content-security-policy'],/script-src 'self'/); });
test('chamada direta ao chat rejeita dados privados e só envia tópico aprovado',async () => { const fake = fakeGateway(); let providerBody; const aiConfig = {...config,helpApproved:true,geminiKey:'synthetic-secret',geminiModel:'fixture'}; const app = createApp({config:aiConfig,gateway:fake.gateway,fetcher:async (_url,options) => { providerBody = JSON.parse(options.body); return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({topic:'plans',tools:['shell']})}]}}]})); }}); const {agent,token} = await bootstrap(app);
  const headers = {'Origin':config.siteUrl,'X-CSRF-Token':token}; const denied = await agent.post('/api/help').set(headers).send({topic:'plans',projectId:B,messages:[{role:'system',content:'private-secret'}]}); assert.equal(denied.status,422); assert.equal(providerBody,undefined);
  const result = await agent.post('/api/help').set(headers).send({topic:'plans'}); assert.equal(result.status,200); assert.equal(result.body.mode,'local'); assert.doesNotMatch(JSON.stringify(providerBody),/private-secret|synthetic-secret|synthetic@example|Texto sintético/); assert.deepEqual(fake.actions,[]);
});
test('resposta técnica manipulada na rota real não grava nem executa ações',async () => { const fake = fakeGateway(); const aiConfig = {...config,requirementsProvider:'gemini',requirementsApproved:true,requirementsKey:'synthetic-tech-secret',requirementsModel:'fixture'}; let calls = 0;
  const app = createApp({config:aiConfig,gateway:fake.gateway,fetcher:async () => { calls += 1; return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({suggestions:[],tools:[{name:'sql',command:'update prices'}],secret:'fictional-secret'})}]}}]})); }});
  const {agent,token} = await bootstrap(app); const response = await agent.post('/api/projects/' + A + '/analyse').set('Cookie','norte-session=synthetic-session').set('Origin',config.siteUrl).set('X-CSRF-Token',token).send({version:1}); assert.equal(response.status,422); assert.equal(calls,1); assert.deepEqual(fake.actions,[]); assert.doesNotMatch(response.text,/fictional-secret|update prices|synthetic-tech-secret/);
});
test('uploads fechados mesmo com tipo falso ou estrutura ativa',async () => { const fake = fakeGateway(); const app = createApp({config,gateway:fake.gateway}); const {agent,token} = await bootstrap(app); const response = await agent.post('/api/projects/' + A + '/uploads').set('Cookie','norte-session=synthetic-session').set('Origin',config.siteUrl).set('X-CSRF-Token',token).send({filename:'../active.pdf',mime:'application/pdf',contents:'<script>evil</script>'}); assert.equal(response.status,503); assert.deepEqual(fake.actions,[]); });
test('e-mail não configurado ou falha de SMTP não finge enviar confirmação; login continua disponível',async () => {
  const fake = fakeGateway(); const original = fake.gateway.fresh; let providerCalls = 0;
  const unavailable = async () => { providerCalls += 1; return {error:{code:'email_address_not_authorized',message:'provider-secret-do-not-return'}}; };
  fake.gateway.fresh = () => { const client = original(); Object.assign(client.auth,{signUp:unavailable,resetPasswordForEmail:unavailable}); return client; };
  for (const ready of [false,true]) {
    const app = createApp({config:{...config,authEmailReady:ready},gateway:fake.gateway}); const {agent,token} = await bootstrap(app); const headers = {Origin:config.siteUrl,'X-CSRF-Token':token};
    for (const kind of ['signup','recover']) { const response = await agent.post('/api/auth/' + kind).set(headers).send({email:'fixture@example.invalid',...(kind === 'signup' ? {password:'synthetic-password'} : {})}); assert.equal(response.status,503); assert.equal(response.body.error,'auth_email_unavailable'); assert.doesNotMatch(response.text,/provider-secret|email_address_not_authorized/); }
    assert.equal(providerCalls,ready ? 2 : 0);
    assert.equal((await agent.post('/api/auth/login').set(headers).send({email:'fixture@example.invalid',password:'synthetic-password'})).status,200);
  }
});
test('equipe rejeita aprovação, cargo, preço e comandos forjados antes de chamar o banco',async () => {
  const fake = fakeGateway(); const calls = []; fake.db.rpc = async (name,args) => { calls.push({name,args}); return {data:null,error:null}; };
  const app=createApp({config,gateway:fake.gateway}); const {agent,token}=await bootstrap(app); calls.length=0;
  const headers={Cookie:'norte-session=synthetic-session',Origin:config.siteUrl,'X-CSRF-Token':token};
  const url='/api/projects/'+A;
  const cases=[
    ['post',url+'/team',{action:'invite',version:1,email:'person@example.invalid',role:'owner',scope:'project',documents:{},expires:new Date(Date.now()+86400000).toISOString()}],
    ['post',url+'/team',{action:'protection',version:1,required:false,role:'admin'}],
    ['post',url+'/changes/'+B,{action:'merge',revision:1,approved:true,reviewerId:A}],
    ['post',url+'/changes/'+B,{action:'review',revision:1,decision:'approve',authorId:B,tools:['shell']}],
    ['put',url+'/draft',{changeId:null,revision:0,version:1,documentId:'EMP-A',payload:{body:'Texto legítimo',price:0,permissions:'all'}}]
  ];
  for(const [method,path,body] of cases) { const result=await agent[method](path).set(headers).send(body); assert.equal(result.status,422,path); }
  assert.deepEqual(calls,[]); assert.deepEqual(fake.actions,[]);
});
test('rebase preserva edições ainda não salvas, exige escolhas de conflito e versão exata',async () => {
  const base={requirements:[{id:'REQ-1',version:1,text:'Original'}],verifications:[],engineering:{profile:'NASA',customDocs:[],schedules:{}},settings:{},lifecycle:{durations:{}}};
  const current=structuredClone(base); current.requirements[0].text='Outra alteração';
  const pending=structuredClone(base); pending.requirements[0].text='Meu texto ainda não salvo';
  const change={id:B,authorId:A,projectId:A,baseVersion:1,revision:3,before:base,after:base,documentId:null}; let saved;
  const fake=fakeGateway(); fake.db.rpc=async(name,args)=>({data:name==='norte_project_context'?{id:A,version:2,payload:current}:name==='norte_changes'?change:name==='norte_change_save'?(saved=args,{...change,after:args.p_payload,revision:4}):null,error:null});
  const app=createApp({config,gateway:fake.gateway}); const {agent,token}=await bootstrap(app); const headers={Cookie:'norte-session=synthetic-session',Origin:config.siteUrl,'X-CSRF-Token':token};
  const url='/api/projects/'+A+'/changes/'+B+'/rebase';
  const conflict=await agent.post(url).set(headers).send({revision:3,version:2,pending}); assert.equal(conflict.status,200); assert.equal(conflict.body.merged,false); assert.equal(conflict.body.conflicts[0].mine,'Meu texto ainda não salvo'); assert.equal(saved,undefined);
  const done=await agent.post(url).set(headers).send({revision:3,version:2,pending,resolutions:[{path:'/requirements/REQ-1/text',choice:'mine'}]}); assert.equal(done.status,200); assert.equal(done.body.merged,true); assert.equal(saved.p_payload.requirements[0].text,pending.requirements[0].text); assert.equal(saved.p_version,2);
  saved=undefined; const stale=await agent.post(url).set(headers).send({revision:2,version:2,pending}); assert.equal(stale.status,409); assert.equal(saved,undefined);
  const forged=await agent.post(url).set(headers).send({revision:3,version:2,pending:{...pending,role:'admin'}}); assert.equal(forged.status,422); assert.equal(saved,undefined);
});
