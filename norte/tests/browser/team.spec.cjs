const {test,expect} = require('@playwright/test');
const template = require('../../dist/templates.json');
const OWNER='00000000-0000-4000-8000-000000000001';
const EDITOR='00000000-0000-4000-8000-000000000002';
const REVIEWER='00000000-0000-4000-8000-000000000003';
const PROJECT='00000000-0000-4000-8000-000000000010';
const CHANGE='00000000-0000-4000-8000-000000000020';
const custom = {id:'EMP-A',code:'EMP-A',title:'Plano da equipe',kind:'company',content:'custom',source:'',clause:'Decisão da equipe',reviews:[],flow:'input',maturity:'Rascunho',state:'Rascunho',body:'Texto original'};
function project(role='owner',scope='project') {
  return {id:PROJECT,owner_id:OWNER,name:'Missão Compartilhada',profile:'NASA',phase:'Concepção',start_date:'2026-10-13',version:3,team_version:1,review_required:false,access:{role,scope,documents:scope==='documents'?{'EMP-A':'edit',REQ:'view'}:{},advanced:true},payload:{requirements:scope==='documents'?[]:structuredClone(template.requirements),verifications:scope==='documents'?[]:structuredClone(template.verifications),engineering:{...structuredClone(template.engineering),customDocs:[custom]},settings:{standard:'NASA'},lifecycle:{durations:{}}}};
}
async function setup(page,row,userId) {
  await page.setViewportSize({width:1440,height:900});
  await page.route('**/api/bootstrap',route=>route.fulfill({json:{csrfToken:'synthetic',configured:true,authEmailReady:true,user:{id:userId,email:'synthetic@example.invalid'},entitlements:{tier:'trial',limits:{projects:3,requirements:200,verifications:60,generations:10}}}}));
  await page.route('**/api/projects/'+PROJECT,route=>route.fulfill({json:row}));
  await page.route('**/api/projects/'+PROJECT+'/presence',route=>route.fulfill({json:{people:[{userId:OWNER,name:'Responsável',role:'owner',module:'requirements',editing:''},{userId:EDITOR,name:'Colaboradora',role:'editor',module:'documents',editing:'EMP-A'}],projectVersion:row.version,teamVersion:row.team_version}}));
  await page.goto('/'); await page.evaluate(async row=>{await platform.ready;applyProject(row)},row);
}
test('proprietário convida por e-mail e escolhe documentos e cargo (transporte simulado)',async({page})=>{
  const row=project(); let sent; let version=1;
  await page.route('**/api/projects/'+PROJECT+'/team',async route=>{if(route.request().method()==='POST'){sent=route.request().postDataJSON();version+=1;}await route.fulfill({json:{version,reviewRequired:false,advanced:true,ownerId:OWNER,members:[],invitations:sent?[{id:CHANGE,email:sent.email,role:sent.role,scope:sent.scope,expires:sent.expires}]:[]}})});
  await setup(page,row,OWNER); await page.locator('[data-team=team]').click(); await page.getByRole('button',{name:'Convidar pessoa',exact:true}).click();
  const form=page.locator('[data-team-form=grant]'); await form.getByLabel('E-mail',{exact:true}).fill('pessoa@example.invalid'); await form.getByLabel('Cargo',{exact:true}).selectOption('editor'); await form.getByLabel('Acesso',{exact:true}).selectOption('documents'); await form.getByLabel('Permissão para Plano da equipe').selectOption('edit'); await form.getByRole('button',{name:'Criar convite'}).click();
  await expect.poll(()=>sent?.documents).toEqual({'EMP-A':'edit'}); expect(sent.role).toBe('editor'); expect(sent.scope).toBe('documents'); expect(sent.version).toBe(1); await expect(page.locator('#side-panel')).toContainText('Convite pendente');
  await page.screenshot({path:'test-results/team-invitation.png'});
});
test('editor salva rascunho e envia proposta sem chamar o salvamento oficial (transporte simulado)',async({page})=>{
  const row=project('editor'); let working=null; let officialWrites=0;
  await page.route('**/api/projects/'+PROJECT+'/draft',async route=>{const input=route.request().postDataJSON();working={id:CHANGE,projectId:PROJECT,authorId:EDITOR,authorName:'Colaboradora',title:'',description:'',baseVersion:3,revision:(working?.revision||0)+1,status:'draft',documentId:null,before:row.payload,after:input.payload,reviews:[]};await route.fulfill({json:working})});
  await page.route('**/api/projects/'+PROJECT+'/changes',route=>route.fulfill({json:working?[working]:[]}));
  await page.route('**/api/projects/'+PROJECT+'/changes/'+CHANGE,async route=>{if(route.request().method()==='POST'){const input=route.request().postDataJSON();expect(input.action).toBe('submit');expect(input.revision).toBe(working.revision);working={...working,title:input.title,description:input.description,status:'open'};}await route.fulfill({json:working})});
  await setup(page,row,EDITOR);
  await page.route('**/api/projects/'+PROJECT,async route=>{if(route.request().method()==='PUT'){officialWrites+=1;}await route.fulfill({json:{...row,workingCopy:working}})});
  await page.locator('#rows tr').first().click(); await page.getByRole('button',{name:'Editar requisito',exact:true}).click(); await page.locator('[data-edit=text]').fill('O sistema deve preservar a proposta da equipe.'); await page.getByRole('button',{name:'Salvar e analisar',exact:true}).click();
  await expect.poll(()=>working?.after.requirements[0].text).toBe('O sistema deve preservar a proposta da equipe.'); expect(officialWrites).toBe(0);
  await page.locator('[data-team=my-change]').click(); const form=page.locator('[data-team-form=submit]'); await form.getByLabel('Título da proposta').fill('Ajustar requisito de telemetria'); await form.getByLabel('Motivo').fill('Precisar o comportamento esperado'); await form.getByRole('button',{name:'Enviar para revisão'}).click(); await expect(page.locator('.change-meta')).toContainText('Em revisão');
  await expect(page.locator('.change-after')).toContainText(['O sistema deve preservar a proposta da equipe.']); await page.screenshot({path:'test-results/team-proposal.png'}); expect(officialWrites).toBe(0);
});
test('revisor confere e aprova a versão, sem botões de editar ou incorporar (transporte simulado)',async({page})=>{
  const row=project('reviewer'); const proposal={id:CHANGE,authorId:EDITOR,authorName:'Colaboradora',title:'Melhorar texto',description:'',baseVersion:3,revision:2,status:'open',before:{text:'Original'},after:{text:'<script>window.compromised=true</script>'},reviews:[]};let decision;
  await page.route('**/api/projects/'+PROJECT+'/changes',route=>route.fulfill({json:[proposal]}));
  await page.route('**/api/projects/'+PROJECT+'/changes/'+CHANGE,async route=>{if(route.request().method()==='POST'){decision=route.request().postDataJSON();proposal.reviews.push({reviewerName:'Revisora',revision:2,decision:decision.decision,comment:decision.comment});}await route.fulfill({json:proposal})});
  await setup(page,row,REVIEWER); await expect(page.locator('#add-req-button')).toBeHidden(); await page.locator('#rows tr').first().click(); await expect(page.getByRole('button',{name:'Editar requisito',exact:true})).toBeHidden();
  await page.locator('[data-team=changes]').click(); await page.locator('[data-team=change]').click(); await expect(page.locator('[data-team=merge]')).toHaveCount(0); expect(await page.evaluate(()=>window.compromised)).toBeUndefined();
  const form=page.locator('[data-team-form=review]'); await form.getByLabel('Decisão',{exact:true}).selectOption('approve'); await form.getByLabel('Comentário',{exact:true}).fill('Conferi o conteúdo da versão 2.'); await form.getByRole('button',{name:'Registrar revisão'}).click(); await expect.poll(()=>decision).toEqual({action:'review',revision:2,decision:'approve',comment:'Conferi o conteúdo da versão 2.'});
  await page.setViewportSize({width:390,height:844}); expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390); await page.screenshot({path:'test-results/team-review-mobile.png'});
});
test('acesso por documento mostra só os autorizados e propõe apenas o corpo do documento (transporte simulado)',async({page})=>{
  const row=project('editor','documents');let sent;let change;
  await page.route('**/api/projects/'+PROJECT+'/documents/EMP-A',route=>route.fulfill({json:{projectVersion:3,document:{id:'EMP-A',title:'Plano da equipe',sections:[{title:'Conteúdo',body:'Texto original'}]}}}));
  await page.route('**/api/projects/'+PROJECT+'/changes',route=>route.fulfill({json:[]}));
  await page.route('**/api/projects/'+PROJECT+'/changes/'+CHANGE,route=>route.fulfill({json:change}));
  await page.route('**/api/projects/'+PROJECT+'/draft',async route=>{sent=route.request().postDataJSON();change={id:CHANGE,authorId:EDITOR,authorName:'Colaboradora',documentId:'EMP-A',title:'',description:'',baseVersion:3,revision:1,status:'draft',before:custom,after:{...custom,body:sent.payload.body},reviews:[]};await route.fulfill({json:change})});
  await setup(page,row,EDITOR); await expect(page.locator('#documents-module')).toBeVisible(); await expect(page.locator('.eng-nav [data-module=requirements]')).toBeHidden(); await expect(page.locator('#documents-rows tr')).toHaveCount(2);
  await page.locator('#documents-rows tr[data-id="EMP-A"]').click(); await expect(page.locator('#side-panel')).toContainText('Texto original'); await page.getByRole('button',{name:'Propor edição',exact:true}).click(); await page.locator('[data-team-form=document] textarea').fill('Texto proposto para revisão');
  await page.getByRole('button',{name:'Fechar painel',exact:true}).click(); await page.locator('#documents-rows tr[data-id="EMP-A"]').click(); await page.getByRole('button',{name:'Propor edição',exact:true}).click(); await expect(page.locator('[data-team-form=document] textarea')).toHaveValue('Texto proposto para revisão');
  await page.getByRole('button',{name:'Salvar conteúdo',exact:true}).click();
  await expect.poll(()=>sent?.payload).toEqual({body:'Texto proposto para revisão'}); expect(sent.documentId).toBe('EMP-A'); await expect(page.locator('.change-after')).toContainText('Texto proposto para revisão');
});
