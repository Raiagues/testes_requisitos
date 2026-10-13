const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const request=require('supertest');
const {Client}=require('pg');
const {createClient}=require('@supabase/supabase-js');
const {databaseOptions}=require('../../scripts/database-connection.cjs');
const {createApp}=require('../../server/app.cjs');
const {createGateway}=require('../../server/supabase.cjs');
const {readConfig}=require('../../server/config.cjs');
const {processJob}=require('../../server/jobs.cjs');
function verified(result,label){assert.equal(result.error?.code||(result.error?'provider_error':null),null,label);return result.data;}
test('colaboração real: convites, versões, revisão, presença e arquivos com escopo',{skip:process.env.RUN_HOSTED_SMOKE!=='true',timeout:300000},async()=>{
  const env=process.env; const target='pdkceggaucuanisybbak.supabase.co';
  assert.equal(new URL(env.SUPABASE_URL).hostname,target); assert.equal(env.REAL_TEST_ACK,target);
  const options=databaseOptions(env.MIGRATION_DATABASE_URL,env);assert.ok(options.host==='db.'+target||options.host.endsWith('.pooler.supabase.com')&&options.user==='postgres.pdkceggaucuanisybbak');
  const site=env.HOSTED_TEST_SITE||'http://127.0.0.1:8080';assert.ok(['http://127.0.0.1:8080','https://testes-requisitos.onrender.com'].includes(site));
  const remote=site.startsWith('https:');const config=readConfig({...env,NODE_ENV:remote?'production':'test',SITE_URL:site});const gateway=createGateway(config);const app=remote?site:createApp({config,gateway});
  const sql=new Client(options);await sql.connect();const run=crypto.randomUUID();const users=[];const directs=[];
  const manifest=path.join(__dirname,'../../test-results/hosted-team-'+run+'.json');fs.mkdirSync(path.dirname(manifest),{recursive:true});
  async function fixture(label){const email='norte-team-'+run+'-'+label+'@example.invalid';const password=crypto.randomBytes(24).toString('base64url');const data=verified(await gateway.service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{fixture_run:run}}),'Criar fixture de equipe');const user={id:data.user.id,email,password};users.push(user);fs.writeFileSync(manifest,JSON.stringify({project:target,run,userIds:users.map(u=>u.id)}),{mode:0o600});const agent=request.agent(app);const init=await agent.get('/api/bootstrap');assert.equal(init.status,200);const session={...user,agent,headers:{Origin:site,'X-CSRF-Token':init.body.csrfToken}};await call(session,'post','/api/auth/login',{email,password});return session;}
  async function call(s,method,url,body,status=200){const response=await s.agent[method](url).set(s.headers).send(body).timeout(45000);assert.equal(response.status,status,url+' '+(response.body?.error||''));return response.body;}
  async function direct(s){const client=createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});verified(await client.auth.signInWithPassword({email:s.email,password:s.password}),'Login direto de fixture');directs.push(client);return client;}
  const passed=name=>console.log(JSON.stringify({integration:remote?'Render + Supabase reais':'BFF local + Supabase real',verified:name,syntheticData:true,emailDeliveryTested:false}));
  try{
    const owner=await fixture('owner');const editor=await fixture('editor');const reviewer=await fixture('reviewer');const outsider=await fixture('outsider');const db=await direct(editor);
    let p=await call(owner,'post','/api/projects',{name:'Colaboração sintética '+run,type:'software',profile:'NASA',start:'2026-10-13',template:'empty'},201);const base='/api/projects/'+p.id;
    const grant={role:'editor',scope:'project',documents:{},expires:new Date(Date.now()+86400000).toISOString()};
    await call(owner,'post',base+'/team',{action:'invite',version:p.team_version,email:editor.email,...grant},403);await call(owner,'post','/api/trial',{});
    p.payload.requirements=[{id:'REQ-1',version:1,text:'Requisito da versão original',status:'pending'}];
    p.payload.engineering.customDocs=['A','B'].map(id=>({id:'EMP-'+id,code:'EMP-'+id,title:'Documento '+id,kind:'company',content:'custom',source:'',clause:'',reviews:[],flow:'input',maturity:'Rascunho',state:'Rascunho',body:id==='A'?'Documento liberado':'CANARIO_DOCUMENTO_PRIVADO'}));
    p=await call(owner,'put',base,{version:p.version,payload:p.payload});
    async function team(action,data){const current=await call(owner,'get',base+'/team');return call(owner,'post',base+'/team',{action,version:current.version,...data});}
    let invitation=await team('invite',{email:editor.email,...grant});assert.equal((await call(outsider,'get','/api/invitations')).length,0);await call(outsider,'post','/api/invitations/'+invitation.invitationId,{accept:true},403);await call(editor,'post','/api/invitations/'+invitation.invitationId,{accept:true});await call(editor,'post','/api/invitations/'+invitation.invitationId,{accept:true},403);
    invitation=await team('invite',{email:reviewer.email,...grant,role:'reviewer'});await call(reviewer,'post','/api/invitations/'+invitation.invitationId,{accept:true});
    assert.equal((await call(editor,'get',base)).access.role,'editor');await call(outsider,'get',base,undefined,404);await call(editor,'put',base,{version:p.version,payload:p.payload},404);
    passed('convite confirmado e de uso único; Essencial permanece individual; editor não publica');
    const proposal=structuredClone(p.payload);proposal.requirements[0].text='Alteração proposta pelo editor';let change=await call(editor,'put',base+'/draft',{changeId:null,revision:0,version:p.version,payload:proposal});
    await call(reviewer,'get',base+'/changes/'+change.id,undefined,404);assert.equal((await call(owner,'get',base+'/changes')).length,0);
    const concurrent=await Promise.all([editor.agent.put(base+'/draft').set(editor.headers).send({changeId:change.id,revision:change.revision,version:p.version,payload:proposal}),editor.agent.put(base+'/draft').set(editor.headers).send({changeId:change.id,revision:change.revision,version:p.version,payload:proposal})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);change=concurrent.find(r=>r.status===200).body;
    async function action(who,type,data={},status=200){return call(who,'post',base+'/changes/'+change.id,{action:type,revision:change.revision,...data},status);}
    change=await action(editor,'submit',{title:'Revisar requisito'});await action(editor,'review',{decision:'approve'},403);await action(owner,'merge',{},403);await action(reviewer,'review',{decision:'approve',comment:'Conferido'});await action(editor,'merge',{},403);change=await action(owner,'merge');assert.equal(change.status,'merged');p=await call(owner,'get',base);assert.equal(p.payload.requirements[0].text,proposal.requirements[0].text);
    passed('rascunho privado, duas abas com conflito, aprovação independente e incorporação oficial');
    const mine=structuredClone(p.payload);mine.requirements[0].text='Minha proposta';change=await call(editor,'put',base+'/draft',{changeId:null,revision:0,version:p.version,payload:mine});
    p.payload.requirements[0].text='Mudança concorrente';p.payload.engineering.customDocs[0].body='Texto oficial preservado';p=await call(owner,'put',base,{version:p.version,payload:p.payload});mine.requirements[0].text='Última edição ainda não salva';
    const conflicts=await call(editor,'post',base+'/changes/'+change.id+'/rebase',{version:p.version,revision:change.revision,pending:mine});assert.equal(conflicts.merged,false);assert.ok(conflicts.conflicts.some(c=>c.path==='/requirements/REQ-1/text'));
    const rebased=await call(editor,'post',base+'/changes/'+change.id+'/rebase',{version:p.version,revision:change.revision,pending:mine,resolutions:conflicts.conflicts.map(c=>({path:c.path,choice:'mine'}))});assert.equal(rebased.merged,true);change=rebased.change;assert.equal(change.after.engineering.customDocs[0].body,'Texto oficial preservado');assert.equal(change.after.requirements[0].text,'Última edição ainda não salva');
    change=await action(editor,'submit',{title:'Comparação após concorrência'});await action(reviewer,'review',{decision:'approve'});change=await action(owner,'merge');p=await call(owner,'get',base);
    await team('protection',{required:true});await call(owner,'put',base,{version:p.version,payload:p.payload},403);
    passed('rebase mantém dados independentes e edição pendente; revisão obrigatória vale para proprietário');
    async function generate(format){const job=await call(owner,'post',base+'/generate',{version:p.version,key:crypto.randomUUID(),format,documents:['REQ']},202);if(!remote){const claim=await sql.query("update norte_jobs set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid() where id=$1 and user_id=$2 and status='queued' returning *",[job.id,owner.id]);if(claim.rows.length)await processJob(gateway,claim.rows[0]);}let state;for(let i=0;i<35;i++){state=await call(owner,'get','/api/jobs/'+job.id);if(['ready','failed'].includes(state.status))break;await new Promise(r=>setTimeout(r,1000));}assert.equal(state.status,'ready');return job;}
    const pdf=await generate('pdf');const zip=await generate('zip');
    await team('update',{userId:editor.id,...grant,scope:'documents',documents:{'EMP-A':'edit',REQ:'view'}});
    const limited=await call(editor,'get',base);assert.equal(limited.payload.requirements.length,0);assert.doesNotMatch(JSON.stringify(limited),/CANARIO_DOCUMENTO_PRIVADO/);await call(editor,'get',base+'/export',undefined,404);await call(editor,'get',base+'/documents/EMP-B',undefined,404);
    assert.deepEqual(verified(await db.from('norte_projects').select('id,payload').eq('id',p.id),'RLS de projeto real'),[]);assert.deepEqual(verified(await db.from('norte_versions').select('version,payload').eq('project_id',p.id),'RLS de versões real'),[]);assert.ok((await db.from('norte_jobs').select('snapshot').eq('id',pdf.id)).error);
    const document=await call(editor,'get',base+'/documents/REQ');assert.doesNotMatch(JSON.stringify(document),/CANARIO_DOCUMENTO_PRIVADO/);assert.ok(document.document.sections.length);
    for(const method of ['get','head']){assert.equal((await editor.agent[method]('/api/jobs/'+pdf.id+'/download').set('Range','bytes=0-4')).status,206);assert.equal((await editor.agent[method]('/api/jobs/'+zip.id+'/download')).status,404);}
    const storagePath=(await sql.query('select storage_path from norte_jobs where id=$1 and user_id=$2',[pdf.id,owner.id])).rows[0].storage_path;assert.ok((await db.storage.from('norte-projects').download(storagePath)).error,'Downloads diretos são negados; a API autenticada acima entrega o arquivo autorizado');
    const cache=(await sql.query("select metadata->>'cacheControl' as value from storage.objects where bucket_id='norte-projects' and name=$1",[storagePath])).rows[0].value;assert.equal(cache,'max-age=0','Arquivos privados não mantêm cache após revogação');
    assert.ok((await db.storage.from('norte-projects').createSignedUrl(storagePath,3600)).error,'Links assinados que ignoram revogação são negados');
    await call(owner,'post',base+'/presence',{tabId:crypto.randomUUID(),module:'requirements',editing:'REQ-1'});const online=await call(editor,'post',base+'/presence',{tabId:crypto.randomUUID(),module:'documents',editing:'EMP-A'});assert.equal(online.people.length,2);assert.equal(online.people.find(u=>u.userId===owner.id).editing,'');
    passed('prévia e PDF autorizados, pacote/colunas privados negados, Storage e presença reais');
    change=await call(editor,'put',base+'/draft',{changeId:null,revision:0,version:p.version,documentId:'EMP-A',payload:{body:'Texto aprovado pelo fluxo'}});change=await action(editor,'submit',{title:'Documento da equipe'});await action(reviewer,'review',{decision:'approve'});await team('revoke',{userId:reviewer.id});await action(owner,'merge',{},403);await action(owner,'review',{decision:'approve'});change=await action(owner,'merge');p=await call(owner,'get',base);assert.equal(p.payload.engineering.customDocs[0].body,'Texto aprovado pelo fluxo');assert.equal(p.payload.engineering.customDocs[1].body,'CANARIO_DOCUMENTO_PRIVADO');
    change=await call(editor,'put',base+'/draft',{changeId:null,revision:0,version:p.version,documentId:'EMP-A',payload:{body:'Não incorporar após revogação'}});change=await action(editor,'submit',{title:'Proposta pendente'});await action(owner,'review',{decision:'approve'});await team('revoke',{userId:editor.id});await action(owner,'merge',{},403);await call(editor,'get',base,undefined,404);assert.equal((await editor.agent.get('/api/jobs/'+pdf.id+'/download').set('Range','bytes=0-4')).status,404);assert.ok((await db.storage.from('norte-projects').download(storagePath)).error);
    passed('revogação invalida aprovação/autoria e bloqueia API e Storage imediatamente');
  }finally{
    for(const client of directs)await client.auth.signOut().catch(()=>{});
    const ids=users.map(u=>u.id);try{if(ids.length){const files=(await sql.query('select storage_path from norte_jobs where user_id=any($1::uuid[]) and storage_path is not null',[ids])).rows;if(files.length)verified(await gateway.service.storage.from('norte-projects').remove(files.map(r=>r.storage_path)),'Remover somente arquivos sintéticos');await sql.query('begin');await sql.query('delete from norte_jobs where user_id=any($1::uuid[])',[ids]);await sql.query('delete from norte_private.usage where user_id=any($1::uuid[])',[ids]);await sql.query('delete from norte_projects where owner_id=any($1::uuid[])',[ids]);await sql.query('commit');for(const user of users)verified(await gateway.service.auth.admin.deleteUser(user.id),'Remover somente conta sintética');fs.unlinkSync(manifest);console.log(JSON.stringify({syntheticUsersRemoved:ids.length,syntheticFilesRemoved:files.length,auditRetained:true}));}}finally{await sql.end();}
  }
});
