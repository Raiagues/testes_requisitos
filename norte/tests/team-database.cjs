const assert = require('node:assert/strict');
const {Client} = require('pg');
const crypto = require('node:crypto');
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const R='00000000-0000-4000-8000-000000000003';
async function runTeamTests(root,connection) {
  let passed=0;
  async function sql(who,query,args=[],operation='object.get_authenticated') { const client=new Client(connection); await client.connect(); try { await client.query('begin'); await client.query('set local role authenticated'); await client.query("select set_config('request.jwt.claims',$1,true),set_config('storage.operation',$2,true)",[JSON.stringify({sub:who,aal:'aal1'}),operation]); const result=await client.query(query,args); await client.query('commit'); return result; } catch(error) { await client.query('rollback'); throw error; } finally { await client.end(); } }
  async function rpc(who,name,args=[]) { return (await sql(who,`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) as value`,args)).rows[0].value; }
  async function test(name,fn) { await fn(); passed+=1; console.log('PASS TEAM '+name); }
  let p=(await root.query('select * from norte_projects where owner_id=$1 order by created_at limit 1',[A])).rows[0];
  let team=await rpc(A,'norte_team',[p.id]);
  const grant={role:'editor',scope:'project',documents:{},expires:new Date(Date.now()+86400000).toISOString()};
  const invite=async (email,access=grant) => { team=await rpc(A,'norte_team',[p.id,'invite',{version:team.version,email,...access}]); return team.invitationId; };
  await test('convites continuam negados no Essencial',async()=>{ await assert.rejects(invite('b@example.invalid'),/single_user_plan/); });
  // Preparação explícita da fixture avançada, sem alterar funções ou proteções.
  await root.query("update norte_accounts set trial_ends_at=now()+interval '1 day' where user_id=$1",[A]);
  p=await rpc(A,'norte_save_project',[p.id,p.version,{...p.payload,engineering:{...p.payload.engineering,customDocs:[{id:'EMP-A',code:'EMP-A',title:'Documento autorizado',kind:'company',content:'custom',source:'',clause:'',reviews:[],flow:'input',maturity:'Rascunho',state:'Rascunho',body:'Corpo autorizado'},{id:'EMP-B',code:'EMP-B',title:'Documento restrito',kind:'company',content:'custom',source:'',clause:'',reviews:[],flow:'input',maturity:'Rascunho',state:'Rascunho',body:'CANARIO_DOCUMENTO_PRIVADO'}]}}]);
  await test('documentos falsificados não usam IDs reservados, campos de comando ou estruturas nulas',async()=>{
    for(const docs of [null,[{...p.payload.engineering.customDocs[0],id:'REQ'}],[{...p.payload.engineering.customDocs[0],command:'shell'}],[p.payload.engineering.customDocs[0],p.payload.engineering.customDocs[0]]]) { const payload=structuredClone(p.payload); payload.engineering.customDocs=docs; await assert.rejects(rpc(A,'norte_save_project',[p.id,p.version,payload]),/invalid_fields/); }
    await assert.rejects(rpc(A,'norte_team',[p.id,'invite',null]),/version_conflict|invalid_fields/);
  });
  await test('convite só é aceito pelo e-mail confirmado indicado e uma única vez',async()=>{
    const id=await invite('b@example.invalid'); assert.equal((await rpc(B,'norte_invitations')).length,1); assert.equal((await rpc(R,'norte_invitations')).length,0);
    await assert.rejects(rpc(R,'norte_invitation_reply',[id,true]),/invitation_unavailable/); await rpc(B,'norte_invitation_reply',[id,true]); await assert.rejects(rpc(B,'norte_invitation_reply',[id,true]),/invitation_unavailable/);
    team=await rpc(A,'norte_team',[p.id]); const review=await invite('admin@example.invalid',{...grant,role:'reviewer'}); await rpc(R,'norte_invitation_reply',[review,true]); team=await rpc(A,'norte_team',[p.id]);
    assert.equal((await rpc(B,'norte_project_context',[p.id])).access.role,'editor');
  });
  await test('editor não concede acesso, não muda política, não salva versão oficial',async()=>{
    await assert.rejects(rpc(B,'norte_team',[p.id,'protection',{version:team.version,required:false}]),/not_found/);
    await assert.rejects(rpc(B,'norte_save_project',[p.id,p.version,p.payload]),/not_found/);
    await assert.rejects(sql(B,'select * from norte_private.members'),/permission denied/);
    await assert.rejects(sql(B,'select norte_private.apply_payload($1,$2,$3,true)',[p.id,p.version,p.payload]),/permission denied/);
  });
  let change;
  const edited=structuredClone(p.payload); edited.requirements[0].text='Proposta do editor, ainda não oficial.';
  await test('rascunho é privado, persistido e duas abas não sobrescrevem uma à outra',async()=>{
    change=await rpc(B,'norte_change_save',[p.id,null,0,p.version,edited]);
    assert.equal((await rpc(R,'norte_changes',[p.id])).length,0); assert.equal((await rpc(A,'norte_project_context',[p.id])).payload.requirements[0].text,p.payload.requirements[0].text);
    const result=await Promise.allSettled([rpc(B,'norte_change_save',[p.id,change.id,change.revision,p.version,edited]),rpc(B,'norte_change_save',[p.id,change.id,change.revision,p.version,edited])]); assert.equal(result.filter(r=>r.status==='fulfilled').length,1); change=result.find(r=>r.status==='fulfilled').value;
    const forged={...edited,tools:[{name:'sql',command:'alter prices'}],owner_id:B}; await assert.rejects(rpc(B,'norte_change_save',[p.id,change.id,change.revision,p.version,forged]),/invalid_fields/);
  });
  const action=(who,type,data={})=>rpc(who,'norte_change_action',[p.id,change.id,change.revision,type,data]);
  await test('aprovação exige outro revisor, versão exata e incorporação pelo proprietário',async()=>{
    change=await action(B,'submit',{title:'Melhorar declaração',description:'Proposta sintética'});
    await assert.rejects(action(B,'review',{decision:'approve',comment:''}),/review_not_authorized/);
    await assert.rejects(action(A,'merge'),/review_required/);
    await action(R,'review',{decision:'approve',comment:'Conferido na fixture'});
    await assert.rejects(action(R,'merge'),/review_not_authorized/);
    await assert.rejects(rpc(A,'norte_change_action',[p.id,change.id,change.revision+1,'merge',{}]),/version_conflict/);
    change=await action(A,'merge'); assert.equal(change.status,'merged');
    p=await rpc(A,'norte_project_context',[p.id]); assert.equal(p.payload.requirements[0].text,edited.requirements[0].text); assert.equal(p.payload.requirements[0].version,3);
    await assert.rejects(action(A,'merge'),/version_conflict/);
  });
  await test('editar proposta aprovada invalida a aprovação; versão oficial nova bloqueia merge',async()=>{
    const payload=structuredClone(p.payload); payload.requirements[0].text+=' segunda proposta'; change=await rpc(B,'norte_change_save',[p.id,null,0,p.version,payload]); change=await action(B,'submit',{title:'Nova proposta'}); await action(R,'review',{decision:'approve'});
    payload.requirements[0].text+=' modificada'; change=await rpc(B,'norte_change_save',[p.id,change.id,change.revision,p.version,payload]); change=await action(B,'submit',{title:'Nova proposta modificada'}); await assert.rejects(action(A,'merge'),/review_required/);
    await action(R,'review',{decision:'approve'}); p=await rpc(A,'norte_save_project',[p.id,p.version,{...p.payload,settings:{...p.payload.settings,quality:false}}]); await assert.rejects(action(A,'merge'),/version_conflict/);
    change=await action(B,'close');
  });
  await test('proteção de revisão também bloqueia PUT/RPC do próprio proprietário',async()=>{
    team=await rpc(A,'norte_team',[p.id,'protection',{version:team.version,required:true}]);
    await assert.rejects(rpc(A,'norte_save_project',[p.id,p.version,p.payload]),/review_required/);
    const proposed=structuredClone(p.payload); proposed.requirements[0].text+=' revisão do proprietário'; change=await rpc(A,'norte_change_save',[p.id,null,0,p.version,proposed]); change=await action(A,'submit',{title:'Alteração do proprietário'}); await assert.rejects(action(A,'review',{decision:'approve'}),/review_not_authorized/); await action(R,'review',{decision:'approve'}); change=await action(A,'merge'); p=await rpc(A,'norte_project_context',[p.id]);
  });
  await test('acesso por documento bloqueia payload, versões, consultas e pacotes do projeto',async()=>{
    team=await rpc(A,'norte_team',[p.id,'update',{version:team.version,userId:B,...grant,scope:'documents',documents:{'EMP-A':'edit',REQ:'view'}}]);
    const context=await rpc(B,'norte_project_context',[p.id]); assert.equal(context.payload.requirements.length,0); assert.deepEqual(context.payload.engineering.customDocs.map(d=>d.id),['EMP-A']); assert.doesNotMatch(JSON.stringify(context),/CANARIO_DOCUMENTO_PRIVADO/);
    for(const table of ['norte_projects','norte_requirements','norte_verifications','norte_versions','norte_analyses','norte_source_adoptions']) { const key=table==='norte_projects'?'id':'project_id'; assert.equal((await sql(B,`select * from ${table} where ${key}=$1`,[p.id])).rowCount,0); }
    const snapshot=await rpc(B,'norte_document_snapshot',[p.id,'REQ']); assert.ok(snapshot.payload.requirements.length); assert.equal(snapshot.payload.requirements[0].history,undefined); assert.doesNotMatch(JSON.stringify(snapshot),/CANARIO_DOCUMENTO_PRIVADO/);
    await assert.rejects(rpc(B,'norte_document_snapshot',[p.id,'EMP-B']),/not_found/); await assert.rejects(rpc(B,'norte_change_save',[p.id,null,0,p.version,{body:'x'},'EMP-B']),/not_found/);
    await assert.rejects(rpc(B,'norte_change_save',[p.id,null,0,p.version,p.payload]),/not_found/);
    const pdf=await rpc(A,'norte_reserve_job',[p.id,p.version,crypto.randomUUID(),{format:'pdf',documents:['REQ']},'team-pdf']);
    const zip=await rpc(A,'norte_reserve_job',[p.id,p.version,crypto.randomUUID(),{format:'zip',documents:['REQ']},'team-zip']);
    for(const job of [pdf,zip]) { const pathname=A+'/'+p.id+'/'+job.id+'/synthetic'; await root.query("update norte_jobs set status='ready',storage_path=$2,filename='synthetic',mime='application/pdf',sha256='fixture' where id=$1",[job.id,pathname]); await root.query("insert into storage.objects(bucket_id,name) values('norte-projects',$1)",[pathname]); }
    assert.equal(await rpc(B,'norte_job_allowed',[pdf.id]),true); assert.equal(await rpc(B,'norte_job_allowed',[zip.id]),false); assert.equal((await sql(B,'select id from norte_jobs where id=$1',[zip.id])).rowCount,0);
    assert.equal(await rpc(B,'norte_file_allowed',['norte-projects',A+'/'+p.id+'/'+zip.id+'/synthetic']),false);
    const file=A+'/'+p.id+'/'+pdf.id+'/synthetic';
    // Mesmo um leitor autorizado usa o download da aplicação, com revalidação.
    assert.equal((await sql(B,'select id from storage.objects where name=$1',[file])).rowCount,0);
    for(const operation of ['object.sign','object.list','']) { assert.equal((await sql(B,'select id from storage.objects where name=$1',[file],operation)).rowCount,0); }
  });
  await test('editor restrito propõe somente o corpo autorizado e o proprietário revisa',async()=>{
    change=await rpc(B,'norte_change_save',[p.id,null,0,p.version,{body:'Texto proposto no documento'},'EMP-A']); assert.equal(change.after.body,'Texto proposto no documento'); assert.doesNotMatch(JSON.stringify(change),/CANARIO_DOCUMENTO_PRIVADO/);
    change=await action(B,'submit',{title:'Atualizar documento da equipe'}); await action(A,'review',{decision:'approve'}); change=await action(A,'merge'); p=await rpc(A,'norte_project_context',[p.id]); assert.equal(p.payload.engineering.customDocs[0].body,'Texto proposto no documento'); assert.equal(p.payload.engineering.customDocs[1].body,'CANARIO_DOCUMENTO_PRIVADO');
  });
  await test('presença simultânea expira e não informa páginas sem autorização',async()=>{
    await rpc(A,'norte_presence',[p.id,crypto.randomUUID(),'requirements','REQ-0']); const tab=crypto.randomUUID(); const result=await rpc(B,'norte_presence',[p.id,tab,'documents','EMP-A']); assert.equal(result.people.length,2); assert.equal(result.people.find(u=>u.userId===A).editing,'');
    await assert.rejects(rpc(B,'norte_presence',[p.id,tab,'requirements','REQ-0']),/not_found/);
    await root.query("update norte_private.presence set seen_at=now()-interval '70 seconds' where user_id=$1",[A]); const later=await rpc(B,'norte_presence',[p.id,tab,'documents','EMP-A']); assert.equal(later.people.length,1);
  });
  await test('revogação de revisor invalida sua aprovação e revogação de autor bloqueia merge',async()=>{
    change=await rpc(B,'norte_change_save',[p.id,null,0,p.version,{body:'Outra proposta'},'EMP-A']); change=await action(B,'submit',{title:'Alteração a revisar'}); await action(R,'review',{decision:'approve'});
    team=await rpc(A,'norte_team',[p.id,'revoke',{version:team.version,userId:R}]); await assert.rejects(action(A,'merge'),/review_required/);
    await action(A,'review',{decision:'approve'}); team=await rpc(A,'norte_team',[p.id,'revoke',{version:team.version,userId:B}]); await assert.rejects(action(A,'merge'),/review_not_authorized/);
    await assert.rejects(rpc(B,'norte_project_context',[p.id]),/not_found/); await assert.rejects(rpc(B,'norte_changes',[p.id,change.id]),/not_found/); assert.equal((await sql(B,"select * from storage.objects where bucket_id='norte-projects'")).rowCount,0);
  });
  await test('identidade suspensa ou e-mail não confirmado não participa por RPC',async()=>{
    const id=await invite('b@example.invalid'); await root.query('update auth.users set email_confirmed_at=null where id=$1',[B]); await assert.rejects(rpc(B,'norte_invitation_reply',[id,true]),/not_authenticated/); await root.query('update auth.users set email_confirmed_at=now() where id=$1',[B]);
    await root.query('update norte_accounts set suspended=true where user_id=$1',[B]); await assert.rejects(rpc(B,'norte_invitation_reply',[id,true]),/not_authenticated/); await root.query('update norte_accounts set suspended=false where user_id=$1',[B]);
    await rpc(B,'norte_invitation_reply',[id,false]);
  });
  await test('revogação pelo endpoint anterior também encerra novos acessos sem apagar propostas',async()=>{
    team=await rpc(A,'norte_team',[p.id]); const id=await invite('b@example.invalid'); await rpc(B,'norte_invitation_reply',[id,true]);
    await rpc(A,'norte_project_access',[p.id,B,'revoke',grant.expires]);
    await assert.rejects(rpc(B,'norte_project_context',[p.id]),/not_found/);
    assert.equal((await root.query('select count(*) from norte_private.changes where project_id=$1',[p.id])).rows[0].count==='0',false);
  });
  console.log(`${passed} testes de colaboração PostgreSQL passaram.`);
}
module.exports={runTeamTests};
