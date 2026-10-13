const {test,expect}=require('@playwright/test');
const OWNER='00000000-0000-4000-8000-000000000001';
const OTHER='00000000-0000-4000-8000-000000000002';
const PROJECT='00000000-0000-4000-8000-000000000010';
const offer={monthly:24900,firstDiscount:40,feedbackDiscount:60,validDays:7,services:{analysis:48000,impact:69000,documents:89000},volumes:{small:100,medium:250,large:500},hours:{small:2,medium:5,large:10},reviewers:{self:0,junior:14000,mid:24000,senior:38000},addons:{trace:18000,handover:24000,editable:22000},dedicatedSetup:90000,dedicatedMonthly:25000};
const limits={essential:{projects:1,requirements:50,verifications:20,generations:0},trial:{projects:3,requirements:200,verifications:50,generations:10},professional:{projects:10,requirements:1000,verifications:300,generations:100},trialDays:14};
async function setup(page,{admin=true}={}) {
  const state={profile:{id:OWNER,name:'Norte',company:'Norte',jobTitle:'Engenharia de sistemas',discipline:'Engenharia',bio:'Organização dos projetos da equipe.',version:1,avatarVersion:0,hasAvatar:false},requests:[],messages:[],prices:null};
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname; const input=route.request().postDataJSON(); let result={ok:true};
    if(path==='/api/bootstrap') { result={csrfToken:'synthetic',configured:true,authEmailReady:true,user:{id:OWNER,email:'responsavel@example.invalid'},entitlements:{tier:'essential',limits:limits.essential,generationsUsed:0},offer:{version:1,offer,limits,operationally_approved:false},admin}; }
    if(path==='/api/account') { if(input) { expect(input.version).toBe(state.profile.version); state.profile={...state.profile,...input.profile,version:state.profile.version+1}; } result={profile:state.profile,adminRole:admin?'commercial':null,observer:admin,supportAvailable:true,roles:[]}; }
    if(path==='/api/projects'||path==='/api/invitations') { result=[]; }
    if(path==='/api/auth/mfa') { result={totp:[{status:'verified',id:OTHER}]}; }
    if(path==='/api/plans') { result={version:1,individual:7900,company:14900,editor:3900,reviewer:1900,approved:false}; }
    if(path==='/api/plans/quote') { result={version:1,kind:input.kind,monthlyCents:input.kind==='individual'?7900:14900+input.editors*3900+input.reviewers*1900,baseCents:input.kind==='individual'?7900:14900,editorCents:input.editors*3900,reviewerCents:input.reviewers*1900}; }
    if(path==='/api/plans/requests') { if(input) { state.requests.push({id:PROJECT,selection:input.selection,quote:{monthlyCents:input.expectedCents},status:'requested',created_at:new Date().toISOString(),version:1}); } result=route.request().method()==='POST'?state.requests.at(-1):state.requests; }
    if(path==='/api/admin') { result={role:'commercial',orders:[],feedback:[],config:{version:1,offer,limits,operationally_approved:false},controls:{},integrations:{}}; }
    if(path==='/api/admin/people') { result={total:1,online:1,projects:2,offset:0,users:[{id:OTHER,name:'Marina Souza',email:'marina@example.invalid',company:'Engenharia Aurora',jobTitle:'Analista de sistemas',avatarVersion:0,online:true,confirmed:true,lastLogin:'2026-10-13T13:00:00Z',lastSeen:'2026-10-13T13:04:00Z',createdAt:'2026-10-12T15:00:00Z',projectCount:2}]}; }
    if(path==='/api/admin/people/'+OTHER) { result={projects:[{id:PROJECT,name:'Aurora',profile:'NASA',version:3,requirements:12,verifications:4,people:3,updatedAt:'2026-10-13T13:00:00Z'}],events:[]}; }
    if(path==='/api/admin/inspect/'+PROJECT) { result={id:PROJECT,name:'Aurora',profile:'NASA',version:3,updatedAt:'2026-10-13T13:00:00Z',payload:{requirements:[{id:'REQ-1',text:'O sistema deve registrar a temperatura.'}],verifications:[],engineering:{customDocs:[],schedules:{}}}}; }
    if(path==='/api/admin/plans/catalog') { state.prices=input; result={version:2}; }
    if(path==='/api/admin/plans'||path==='/api/admin/inbox') { result=[]; }
    if(path==='/api/messages/read') { result=state.messages.filter(m=>m.id>input.after); }
    if(path==='/api/messages') { state.messages.push({id:state.messages.length+1,authorId:OWNER,name:'Norte',body:input.body,createdAt:new Date().toISOString()}); result={id:state.messages.length}; }
    await route.fulfill({json:result});
  });
  await page.goto('/'); await page.locator('#account-button').click(); await expect(page.getByRole('heading',{name:'Meu perfil',exact:true})).toBeVisible(); return state;
}
test('perfil e administração responsivos, campos legíveis e sem JSON (transporte simulado)',async({page})=>{
  await page.setViewportSize({width:1440,height:950}); const state=await setup(page);
  await page.getByLabel('Nome de exibição',{exact:true}).fill('Norte Engenharia'); await page.getByRole('button',{name:'Salvar perfil',exact:true}).click(); await expect(page.locator('#account-notice')).toHaveText('Perfil atualizado.'); expect(state.profile.name).toBe('Norte Engenharia');
  expect((await page.locator('.account-heading').boundingBox()).y).toBeGreaterThanOrEqual(76); await page.screenshot({path:'test-results/account-profile-desktop.png'});
  await page.locator('[data-account=nav][data-section=admin]').click(); await expect(page.getByRole('heading',{name:'Administração',exact:true})).toBeVisible(); await expect(page.locator('.admin-table')).toContainText('marina@example.invalid');
  await page.locator('.admin-person').click(); await expect(page.locator('#admin-detail')).toContainText('Aurora'); await page.locator('[data-account=inspect]').click(); await expect(page.locator('#admin-detail')).toContainText('O sistema deve registrar a temperatura.'); await expect(page.locator('#admin-detail input,#admin-detail textarea')).toHaveCount(0);
  await page.screenshot({path:'test-results/account-admin-desktop.png'});
  await page.locator('[data-account=admin-tab][data-tab=prices]').click(); await expect(page.locator('.admin-content textarea')).toHaveCount(0); await page.getByLabel('Individual',{exact:true}).fill('89.90'); await page.getByRole('button',{name:'Salvar valores dos planos'}).click(); await expect.poll(()=>state.prices?.prices.individual).toBe(8990); expect(state.prices.approved).toBe(false);
  await page.screenshot({path:'test-results/account-prices-desktop.png'});
  await page.setViewportSize({width:390,height:844}); await page.locator('[data-account=nav][data-section=profile]').click(); await expect(page.getByRole('button',{name:'Salvar perfil'})).toBeVisible(); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await page.screenshot({path:'test-results/account-profile-mobile.png'});
});
test('contratação individual e empresarial exige conferência e não promete pagamento (transporte simulado)',async({page})=>{
  const state=await setup(page,{admin:false}); await expect(page.locator('[data-account=nav][data-section=admin]')).toHaveCount(0); await page.getByRole('button',{name:'Plano e contratação',exact:true}).click(); await page.getByRole('button',{name:'Montar plano da empresa'}).click(); await expect(page.locator('.checkout-grand')).toContainText('246,00'); await page.getByLabel('Editores adicionais').fill('3'); await page.getByLabel('Revisores',{exact:true}).focus(); await expect(page.locator('.checkout-grand')).toContainText('285,00'); await page.locator('[data-account-form=checkout] [name=consent]').check(); await page.getByRole('button',{name:'Solicitar contratação',exact:true}).click(); await expect(page.locator('#account-notice')).toContainText('Nenhum pagamento'); expect(state.requests[0].quote.monthlyCents).toBe(28500); await expect(page.locator('.plan-order')).toContainText('Solicitado');
  await page.screenshot({path:'test-results/account-plans-desktop.png'});
});
test('chat exibe texto manipulado como texto e recebe novas mensagens sem perder o rascunho (transporte simulado)',async({page})=>{
  const state=await setup(page,{admin:false}); await page.locator('[data-account=nav][data-section=messages]').click(); await page.getByLabel('Mensagem',{exact:true}).fill('<img src=x onerror="window.hacked=true">'); await page.getByRole('button',{name:'Enviar',exact:false}).click(); await expect(page.locator('#conversation-log')).toContainText('<img src=x'); await expect(page.locator('#conversation-log img')).toHaveCount(0);
  await page.getByLabel('Mensagem',{exact:true}).fill('Rascunho que precisa continuar'); state.messages.push({id:2,authorId:OTHER,name:'Norte',body:'Resposta recebida',createdAt:new Date().toISOString()}); await page.evaluate(()=>pollConversation()); await expect(page.locator('#conversation-log')).toContainText('Resposta recebida'); await expect(page.getByLabel('Mensagem',{exact:true})).toHaveValue('Rascunho que precisa continuar'); expect(await page.evaluate(()=>window.hacked)).toBeUndefined(); await page.screenshot({path:'test-results/account-chat-desktop.png'});
});
test('MFA abre antes da administração e retoma o destino após confirmar (transporte simulado)',async({page})=>{
  await setup(page); let confirmed=false;
  await page.route('**/api/admin',route=>confirmed ? route.fulfill({json:{role:'commercial',orders:[],feedback:[],config:{version:1,offer,limits},controls:{},integrations:{}}}) : route.fulfill({status:403,json:{error:'admin_mfa_recent_required'}}));
  await page.route('**/api/auth/mfa/verify',route=>{confirmed=true;return route.fulfill({json:{ok:true}})});
  await page.locator('[data-account=nav][data-section=admin]').click(); await expect(page.locator('#platform-dialog')).toBeVisible(); await page.getByLabel('Código de seis dígitos').fill('123456'); await page.getByRole('button',{name:'Confirmar identidade',exact:true}).last().click(); await expect(page.getByRole('heading',{name:'Administração',exact:true})).toBeVisible();
});
