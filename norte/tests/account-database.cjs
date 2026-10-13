const assert=require('node:assert/strict');
const {Client}=require('pg');
const crypto=require('node:crypto');
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const R='00000000-0000-4000-8000-000000000003';
async function runAccountTests(root,connection) {
  let count=0; const mfa={aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]};
  async function sql(who,text,args=[],claims={}) { const c=new Client(connection); await c.connect(); try { await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:who,aal:'aal1',...claims})]); const r=await c.query(text,args); await c.query('commit'); return r; } catch(error) { await c.query('rollback'); throw error; } finally { await c.end(); } }
  const rpc=async(who,name,args=[],claims={})=>(await sql(who,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args,claims)).rows[0].result;
  async function test(name,fn) { await fn(); count++; console.log('PASS ACCOUNT '+name); }
  await root.query("update norte_accounts set suspended=false,trial_ends_at=now()+interval '1 day' where user_id=$1",[A]);
  await root.query("insert into norte_private.admins(user_id,role) values($1,'commercial') on conflict(user_id) do update set role='commercial'",[R]);
  const p=(await root.query('select * from norte_projects where owner_id=$1 and deleted_at is null order by created_at limit 1',[A])).rows[0];
  const input={name:'Pessoa sintética',company:'Organização',jobTitle:'Admin',discipline:'Sistemas',bio:'Texto <script> não executável'};
  await test('perfil tem CAS, campos estritos e cargo não promove administrador',async()=>{
    const home=await rpc(B,'norte_account_profile'); const updated=await rpc(B,'norte_account_profile',[input,home.profile.version]); assert.equal(updated.profile.name,input.name); assert.equal(updated.adminRole,null); assert.equal(updated.profile.jobTitle,'Admin');
    await assert.rejects(rpc(B,'norte_account_profile',[input,home.profile.version]),/version_conflict/);
    for(const fields of [{...input,role:'commercial'},{...input,plan:'professional'},{...input,userId:A},{...input,avatar:'anything'}]) { await assert.rejects(rpc(B,'norte_account_profile',[fields,updated.profile.version]),/invalid_fields/); }
    await assert.rejects(sql(B,'select * from norte_private.profiles'),/permission denied/);
    assert.equal((await rpc(B,'norte_entitlements')).tier,'essential');
  });
  await test('avatar só aceita escrita interna e a leitura revalida acesso',async()=>{
    const image=Buffer.concat([Buffer.from('RIFF0000WEBP'),Buffer.alloc(20)]).toString('base64');
    await assert.rejects(rpc(B,'norte_avatar_write',[A,image,0]),/permission denied/);
    await root.query('select norte_avatar_write($1,$2,0)',[A,image]);
    assert.ok(await rpc(A,'norte_avatar_read',[A])); await assert.rejects(rpc(B,'norte_avatar_read',[A]),/admin_mfa_recent_required|not_found/);
    await root.query("insert into norte_private.members(project_id,user_id,role,scope,expires_at,granted_by) values($1,$2,'viewer','project',now()+interval '1 day',$3)",[p.id,B,A]);
    assert.ok(await rpc(B,'norte_avatar_read',[A]));
    await root.query('delete from norte_private.members where project_id=$1 and user_id=$2',[p.id,B]);
    await assert.rejects(rpc(B,'norte_avatar_read',[A]),/admin_mfa_recent_required|not_found/);
    await root.query('select norte_avatar_write($1,null,1)',[A]);
    const home=await rpc(A,'norte_account_profile'); assert.equal(home.profile.hasAvatar,false); assert.equal(home.profile.avatarVersion,2);
  });
  await test('acompanhamento fica fechado sem concessão, sem MFA e com concessão expirada',async()=>{
    await assert.rejects(rpc(R,'norte_prototype_overview',[],mfa),/not_found/);
    await root.query("insert into norte_private.prototype_observers(user_id,enabled,expires_at) values($1,true,now()+interval '30 days')",[R]);
    await assert.rejects(rpc(R,'norte_prototype_overview'),/admin_mfa_recent_required/);
    await assert.rejects(rpc(R,'norte_prototype_project',[p.id],{aal:'aal2',amr:[{method:'totp',timestamp:1}]}),/admin_mfa_recent_required/);
    await assert.rejects(rpc(B,'norte_prototype_overview',[],mfa),/admin_mfa_recent_required/);
    await root.query("update norte_private.prototype_observers set expires_at=now()-interval '1 second' where user_id=$1",[R]); await assert.rejects(rpc(R,'norte_prototype_overview',[],mfa),/not_found/);
    await root.query("update norte_private.prototype_observers set expires_at=now()+interval '30 days' where user_id=$1",[R]);
  });
  await test('consulta autorizada é auditada sem liberar APIs normais de projeto',async()=>{
    await rpc(B,'norte_account_presence'); const overview=await rpc(R,'norte_prototype_overview',['Pessoa',0],mfa); assert.equal(overview.users[0].id,B); assert.equal(overview.users[0].online,true);
    assert.ok(!(JSON.stringify(overview).includes('encrypted_password'))); const detail=await rpc(R,'norte_prototype_user',[A],mfa); assert.ok(detail.projects.some(x=>x.id===p.id));
    assert.equal((await rpc(R,'norte_prototype_project',[p.id],mfa)).id,p.id); assert.ok((await root.query("select 1 from norte_audit where actor_id=$1 and event='prototype_project_inspected'",[R])).rowCount);
    assert.equal((await sql(R,'select * from norte_projects where id=$1',[p.id],mfa)).rowCount,0);
    await assert.rejects(rpc(R,'norte_save_project',[p.id,p.version,p.payload],mfa),/not_found/);
    await root.query('update norte_private.prototype_observers set enabled=false'); await assert.rejects(rpc(R,'norte_prototype_project',[p.id],mfa),/not_found/); await root.query('update norte_private.prototype_observers set enabled=true');
  });
  const send=(who,project,doc,support,body,key=crypto.randomUUID(),claims={})=>rpc(who,'norte_message_send',[project,doc,support,key,body],claims);
  await test('chat exige acesso ao projeto e confirmação por identidade real',async()=>{
    await assert.rejects(send(B,p.id,'',null,'intruso'),/not_found/);
    const x=await send(A,p.id,'',null,'Mensagem <img src=x onerror=alert(1)>');
    const rows=await rpc(A,'norte_messages',[p.id]); assert.equal(rows.at(-1).id,x.id); assert.equal(rows.at(-1).authorId,A);
    await assert.rejects(rpc(B,'norte_messages',[p.id]),/not_found/);
    await assert.rejects(sql(A,'select * from norte_private.messages'),/permission denied/);
    await assert.rejects(send(A,p.id,'',B,'duas conversas'),/not_found/);
  });
  await test('conversa por documento não revela conversa geral ou outro documento',async()=>{
    await root.query("insert into norte_private.members(project_id,user_id,role,scope,documents,expires_at,granted_by) values($1,$2,'viewer','documents','{\"EMP-A\":\"view\"}',now()+interval '1 day',$3)",[p.id,B,A]);
    await send(A,p.id,'EMP-B',null,'CANARIO_OUTRO_DOCUMENTO'); await send(B,p.id,'EMP-A',null,'Dúvida permitida');
    const rows=await rpc(B,'norte_messages',[p.id,'EMP-A']); assert.equal(rows.length,1); assert.doesNotMatch(JSON.stringify(rows),/CANARIO/);
    await assert.rejects(rpc(B,'norte_messages',[p.id]),/not_found/); await assert.rejects(rpc(B,'norte_messages',[p.id,'EMP-B']),/not_found/);
    await root.query('delete from norte_private.members where project_id=$1 and user_id=$2',[p.id,B]); await assert.rejects(rpc(B,'norte_messages',[p.id,'EMP-A']),/not_found/);
  });
  await test('suporte é individual; administrador precisa MFA para ler e responder',async()=>{
    const key=crypto.randomUUID(); const first=await send(B,null,'',B,'Preciso de ajuda',key); const again=await send(B,null,'',B,'Preciso de ajuda',key); assert.equal(first.id,again.id);
    await assert.rejects(send(B,null,'',B,'corpo trocado',key),/idempotency_conflict/);
    await assert.rejects(rpc(A,'norte_messages',[null,'',B]),/admin_mfa_recent_required/);
    await assert.rejects(send(R,null,'',B,'resposta sem MFA'),/admin_mfa_recent_required/);
    await send(R,null,'',B,'Resposta de suporte',crypto.randomUUID(),mfa); const rows=await rpc(B,'norte_messages',[null,'',B]); assert.equal(rows.length,2); assert.equal(rows[1].authorId,R);
    assert.equal((await rpc(R,'norte_support_inbox',[],mfa))[0].userId,B);
  });
  await test('cota e tamanho de mensagens são impostos no banco',async()=>{
    await assert.rejects(send(B,null,'',B,'x'.repeat(2001)),/invalid_fields/);
    await root.query("insert into norte_private.messages(support_user,author_id,client_id,body) select $1,$1,gen_random_uuid(),'limite sintético' from generate_series(1,30)",[B]);
    await assert.rejects(send(B,null,'',B,'acima do limite'),/rate_limit/);
  });
  const selection={kind:'company',company:'Empresa sintética',editors:2,reviewers:1,viewers:3};
  let quote; let request;
  await test('cotação vem do catálogo e rejeita preço, cargo ou desconto manipulado',async()=>{
    quote=await rpc(B,'norte_plan_quote',[selection]); assert.equal(quote.monthlyCents,24600); assert.equal(quote.paymentsProcessed,false);
    for(const value of [{...selection,monthlyCents:1},{...selection,discount:100},{...selection,editors:-1},{...selection,editors:0.5},{...selection,editors:19,reviewers:19},{...selection,kind:'individual'},{...selection,editors:null}]) { await assert.rejects(rpc(B,'norte_plan_quote',[value]),/invalid_fields|invalid input/); }
    await assert.rejects(rpc(B,'norte_plan_request',[crypto.randomUUID(),selection,quote.version,1]),/quote_expired_or_changed/);
  });
  await test('pedido é idempotente e não ativa um plano; outros usuários não o veem',async()=>{
    const key=crypto.randomUUID(); request=await rpc(B,'norte_plan_request',[key,selection,quote.version,quote.monthlyCents]); assert.equal((await rpc(B,'norte_plan_request',[key,selection,quote.version,quote.monthlyCents])).id,request.id);
    assert.equal((await rpc(B,'norte_entitlements')).tier,'essential'); assert.equal((await rpc(A,'norte_plan_requests')).length,0); await assert.rejects(rpc(A,'norte_plan_cancel',[request.id,1]),/version_conflict/);
    await assert.rejects(rpc(B,'norte_plan_requests',[true]),/admin_mfa_recent_required/);
    await assert.rejects(rpc(B,'norte_admin_plan_request',[request.id,1,'confirmed',true]),/admin_mfa_recent_required/);
  });
  await test('confirmação exige catálogo validado, segundo fator e concordância explícita',async()=>{
    await assert.rejects(rpc(R,'norte_admin_plan_request',[request.id,1,'confirmed',true],mfa),/offer_pending/);
    await rpc(R,'norte_admin_plan_catalog',[quote.version,{individual:7900,company:14900,editor:3900,reviewer:1900},true],mfa);
    await assert.rejects(rpc(R,'norte_admin_plan_request',[request.id,1,'confirmed',true],mfa),/quote_expired_or_changed/);
    quote=await rpc(B,'norte_plan_quote',[selection]); request=await rpc(B,'norte_plan_request',[crypto.randomUUID(),selection,quote.version,quote.monthlyCents]);
    await assert.rejects(rpc(R,'norte_admin_plan_request',[request.id,1,'confirmed',false],mfa),/offer_pending/);
    await rpc(R,'norte_admin_plan_request',[request.id,1,'confirmed',true],mfa); assert.equal((await rpc(B,'norte_entitlements')).tier,'professional');
    await assert.rejects(rpc(R,'norte_admin_plan_request',[request.id,1,'confirmed',true],mfa),/version_conflict/);
    const paid=await rpc(B,'norte_entitlements'); assert.equal(paid.seats.editors,2); assert.ok(Date.parse(paid.professionalUntil)>Date.now()+29*86400000);
  });
  await test('vencimento encerra novos recursos e mantém o conteúdo original',async()=>{
    await root.query("update norte_accounts set professional_until=now()-interval '1 second' where user_id=$1",[B]); assert.equal((await rpc(B,'norte_entitlements')).tier,'essential');
    assert.ok((await rpc(B,'norte_project_list')).length); await root.query("update norte_accounts set professional_until=now()+interval '30 days' where user_id=$1",[B]);
  });
  await test('licenças contam participantes distintos por função em todos os projetos',async()=>{
    const bp=(await root.query('select id from norte_projects where owner_id=$1 and deleted_at is null limit 1',[B])).rows[0];
    await root.query("update norte_accounts set seats='{\"editors\":0,\"reviewers\":1,\"viewers\":1}' where user_id=$1",[B]);
    let team=await rpc(B,'norte_team',[bp.id]); const base={version:team.version,role:'editor',scope:'project',documents:{},expires:new Date(Date.now()+86400000).toISOString(),email:'a@example.invalid'};
    await assert.rejects(rpc(B,'norte_team',[bp.id,'invite',base]),/seat_limit/);
    team=await rpc(B,'norte_team',[bp.id,'invite',{...base,role:'reviewer'}]); await rpc(A,'norte_invitation_reply',[team.invitationId,true]); team=await rpc(B,'norte_team',[bp.id]);
    await assert.rejects(rpc(B,'norte_team',[bp.id,'invite',{...base,version:team.version,email:'third@example.invalid',role:'reviewer'}]),/seat_limit/);
    await assert.rejects(rpc(B,'norte_project_access',[bp.id,R,'review',base.expires]),/seat_limit/);
    await rpc(B,'norte_project_access',[bp.id,R,'read',base.expires]);
    assert.equal((await root.query('select norte_private.seat_usage($1) as seats',[B])).rows[0].seats.viewers,1);
  });
  console.log(`${count} testes de perfis, mensagens, acompanhamento e planos PostgreSQL passaram.`);
}
module.exports={runAccountTests};
