const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const request=require('supertest');
const sharp=require('sharp');
const {Client}=require('pg');
const {databaseOptions}=require('../../scripts/database-connection.cjs');
const {createApp}=require('../../server/app.cjs');
const {createGateway}=require('../../server/supabase.cjs');
const {readConfig}=require('../../server/config.cjs');
function totp(secret){const bits=[...secret].map(c=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0')).join('');const key=Buffer.from(bits.match(/.{8}/g).map(byte=>parseInt(byte,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const digest=crypto.createHmac('sha1',key).update(counter).digest();return String((digest.readUInt32BE(digest.at(-1)&15)&0x7fffffff)%1000000).padStart(6,'0');}
test('perfis, fotos, chat, pedidos e acompanhamento com Auth/MFA/PostgreSQL reais',{skip:process.env.RUN_HOSTED_SMOKE!=='true',timeout:300000},async()=>{
  const env=process.env;const target='pdkceggaucuanisybbak.supabase.co';assert.equal(new URL(env.SUPABASE_URL).hostname,target);assert.equal(env.REAL_TEST_ACK,target);
  const options=databaseOptions(env.MIGRATION_DATABASE_URL,env);assert.ok(options.host==='db.'+target||options.host.endsWith('.pooler.supabase.com')&&options.user==='postgres.pdkceggaucuanisybbak');
  const site=env.HOSTED_TEST_SITE||'http://127.0.0.1:8080';assert.ok(['http://127.0.0.1:8080','https://testes-requisitos.onrender.com'].includes(site));const remote=site.startsWith('https:');
  const config=readConfig({...env,PROTOTYPE_ADMIN_ENABLED:'true',NODE_ENV:remote?'production':'test',SITE_URL:site});const gateway=createGateway(config);const app=remote?site:createApp({config,gateway});const sql=new Client(options);await sql.connect();
  const users=[];const run=crypto.randomUUID();const manifest=path.join(__dirname,'../../test-results/hosted-account-'+run+'.json');
  const verified=(result,label)=>{assert.equal(result.error?.code||(result.error?'provider_error':null),null,label);return result.data};
  async function call(s,method,url,body,status=200){const response=await s.agent[method](url).set(s.headers).send(body).timeout(45000);assert.equal(response.status,status,url+' '+(response.body?.error||''));return response.body;}
  async function fixture(label){const email='norte-account-'+run+'-'+label+'@example.invalid';const password=crypto.randomBytes(24).toString('base64url');const data=verified(await gateway.service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{fixture_run:run}}),'fixture');const user={id:data.user.id,email,password};users.push(user);fs.writeFileSync(manifest,JSON.stringify({run,target,userIds:users.map(u=>u.id)}),{mode:0o600});const agent=request.agent(app);const initial=await agent.get('/api/bootstrap');assert.equal(initial.status,200);const s={...user,agent,headers:{Origin:site,'X-CSRF-Token':initial.body.csrfToken}};await call(s,'post','/api/auth/login',{email,password});await call(s,'get','/api/bootstrap');return s;}
  const pass=verified=>console.log(JSON.stringify({integration:remote?'Render + Supabase reais':'BFF local + Supabase real',verified,syntheticData:true,paymentProcessed:false,emailSent:false}));
  try{
    const owner=await fixture('owner');const member=await fixture('member');const admin=await fixture('observer');
    let home=await call(owner,'get','/api/account');home=await call(owner,'put','/api/account',{version:home.profile.version,profile:{name:'Responsável sintético',company:'Empresa de teste',jobTitle:'Admin',discipline:'Sistemas',bio:'Dados de teste'}});assert.equal(home.adminRole,null);
    await call(owner,'put','/api/account',{version:1,profile:{name:'Texto antigo',company:'',jobTitle:'',discipline:'',bio:''}},409);
    const png=await sharp({create:{width:500,height:400,channels:3,background:'#82533d'}}).png().toBuffer();await call(owner,'put','/api/account/avatar',{version:0,bytes:png.toString('base64')});
    const image=await owner.agent.get('/api/people/'+owner.id+'/avatar').set(owner.headers);assert.equal(image.status,200);assert.equal(image.headers['content-type'],'image/webp');assert.equal((await sharp(image.body).metadata()).width,256);assert.match(image.headers['cache-control'],/no-store/);
    await call(member,'get','/api/people/'+owner.id+'/avatar',undefined,403);await call(owner,'put','/api/account/avatar',{version:1,bytes:Buffer.from('<svg><script>bad</script></svg>').toString('base64')},422);
    pass('perfil persistido, concorrência recusada, foto reprocessada e privada');
    await sql.query("insert into norte_private.admins(user_id,role) values($1,'commercial')",[admin.id]);await sql.query("insert into norte_private.prototype_observers(user_id,enabled,expires_at) values($1,true,now()+interval '1 hour')",[admin.id]);
    await call(admin,'get','/api/admin/people',undefined,403);const factor=await call(admin,'post','/api/auth/mfa/enroll',{});await call(admin,'post','/api/auth/mfa/verify',{factorId:factor.id,code:totp(factor.secret)});
    await call(owner,'post','/api/account/presence',{});const overview=await call(admin,'get','/api/admin/people?q='+encodeURIComponent(owner.email));assert.equal(overview.users[0].id,owner.id);assert.equal(overview.users[0].online,true);assert.ok(overview.users[0].lastLogin);
    await call(owner,'post','/api/trial',{});const p=await call(owner,'post','/api/projects',{name:'Projeto de perfil sintético',type:'software',profile:'NASA',start:'2026-10-13',template:'empty'},201);const base='/api/projects/'+p.id;
    assert.equal((await call(admin,'get','/api/admin/inspect/'+p.id)).id,p.id);await call(admin,'get',base,undefined,404);await call(admin,'put',base,{version:p.version,payload:p.payload},404);
    await call(member,'get','/api/admin/people',undefined,403);await call(member,'get','/api/admin/inspect/'+p.id,undefined,403);
    pass('MFA real, último login real, presença e inspeção auditada sem escrita ou impersonação');
    let team=await call(owner,'get',base+'/team');team=await call(owner,'post',base+'/team',{action:'invite',version:team.version,email:member.email,role:'editor',scope:'project',documents:{},expires:new Date(Date.now()+86400000).toISOString()});await call(member,'post','/api/invitations/'+team.invitationId,{accept:true});
    const channel={projectId:p.id,documentId:'',supportUser:null};const key=crypto.randomUUID();await call(member,'post','/api/messages',{channel,key,body:'Mensagem da equipe <img src=x>'},201);await call(member,'post','/api/messages',{channel,key,body:'Mensagem da equipe <img src=x>'},201);let rows=await call(owner,'post','/api/messages/read',{channel,after:0});assert.equal(rows.length,1);assert.equal(rows[0].authorId,member.id);
    team=await call(owner,'get',base+'/team');await call(owner,'post',base+'/team',{action:'revoke',version:team.version,userId:member.id});await call(member,'post','/api/messages/read',{channel,after:0},404);
    const support={projectId:null,documentId:'',supportUser:member.id};await call(member,'post','/api/messages',{channel:support,key:crypto.randomUUID(),body:'Atendimento sintético'},201);await call(admin,'post','/api/messages',{channel:support,key:crypto.randomUUID(),body:'Resposta sintética'},201);rows=await call(member,'post','/api/messages/read',{channel:support,after:0});assert.equal(rows.length,2);await call(owner,'post','/api/messages/read',{channel:support,after:0},403);
    const inbox=await call(admin,'get','/api/admin/inbox');assert.ok(inbox.some(c=>c.userId===member.id));pass('chat de equipe e suporte com identidades distintas; revogação fecha leitura');
    const selection={kind:'company',company:'Empresa sintética',editors:2,reviewers:1,viewers:3};const quote=await call(member,'post','/api/plans/quote',selection);const request=await call(member,'post','/api/plans/requests',{key:crypto.randomUUID(),selection,version:quote.version,expectedCents:quote.monthlyCents,consent:true},201);assert.equal(request.status,'requested');assert.equal((await call(member,'get','/api/bootstrap')).entitlements.tier,'essential');await call(owner,'post','/api/plans/requests/'+request.id+'/cancel',{version:1},409);await call(member,'post','/api/plans/requests/'+request.id+'/cancel',{version:1});pass('cotação canônica, solicitação manual persistida e cancelamento por proprietário; nenhuma ativação ou cobrança real');
    await call(owner,'put','/api/account/avatar',{version:1,bytes:null});await call(owner,'get','/api/people/'+owner.id+'/avatar',undefined,404);
    for(const s of[owner,member,admin])await call(s,'post','/api/auth/logout',{});
  }finally{
    try{const ids=users.map(u=>u.id);if(ids.length){await sql.query('begin');await sql.query('delete from norte_private.messages where author_id=any($1::uuid[]) or support_user=any($1::uuid[])',[ids]);await sql.query('delete from norte_private.plan_requests where user_id=any($1::uuid[])',[ids]);await sql.query('delete from norte_projects where owner_id=any($1::uuid[])',[ids]);await sql.query('commit');for(const u of users)verified(await gateway.service.auth.admin.deleteUser(u.id),'cleanup fixture');fs.unlinkSync(manifest);console.log(JSON.stringify({syntheticUsersRemoved:ids.length,auditRetained:true}));}}finally{await sql.end();}
  }
});
