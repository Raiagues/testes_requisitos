const {test,expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
async function publicAccount(page) {
  await page.route('**/api/bootstrap',route => route.fulfill({json:{csrfToken:'synthetic',configured:true,authEmailReady:true,user:null,offer:null}}));
  await page.goto('/'); await expect.poll(() => page.evaluate(() => platform.configured)).toBe(true);
}
test('clicar em entrar antes do bootstrap aguarda a conta sem mostrar configuração ausente',async ({page}) => {
  let release; const ready = new Promise(resolve => { release = resolve; });
  await page.route('**/api/bootstrap',async route => { await ready; await route.fulfill({json:{csrfToken:'synthetic',configured:true,authEmailReady:true,user:{id:'00000000-0000-4000-8000-000000000001'},entitlements:{tier:'essential',limits:{projects:1,requirements:50,verifications:20,generations:0},generationsUsed:0}}}); });
  await page.route('**/api/projects',route => route.fulfill({json:[]}));
  try { await page.goto('/'); await page.locator('#account-button').click(); await expect(page.locator('#account-page')).toBeHidden(); release(); await expect(page.getByRole('heading',{name:'Meus projetos',exact:true})).toBeVisible(); await expect(page.locator('#account-page')).not.toContainText('aguardando configuração'); } finally { release(); }
});
test('preços abertos antes do bootstrap carregam sem exigir nova seleção',async ({page}) => {
  let release; const ready = new Promise(resolve => { release = resolve; });
  await page.route('**/api/bootstrap',async route => { await ready; await route.fulfill({json:{csrfToken:'synthetic',configured:true,authEmailReady:true,user:null}}); });
  await page.route('**/api/events',route => route.fulfill({json:{ok:true}}));
  const quote = {version:1,eligibleCents:89000,humanCents:0,discountCents:0,setupCents:0,oneTimeCents:89000,feedbackApplied:false};
  await page.route('**/api/quote',route => route.fulfill({json:{quote,available:false}}));
  try { await page.goto('/'); await page.evaluate(()=>goConfigure()); await page.getByText('Para meu projeto',{exact:true}).click(); await expect(page.locator('#price-summary')).toContainText('Conferindo a configuração'); release(); await expect(page.locator('.quote-total')).toContainText('890,00'); await expect(page.locator('#continue-order')).toBeDisabled(); } finally { release(); }
});
test('navegação à esquerda e nome editável no exemplo, sem gravar dados no navegador',async ({page}) => {
  await page.setViewportSize({width:1440,height:900}); await page.goto('/'); await page.getByRole('button',{name:'Explorar a plataforma',exact:true}).click();
  const nav = await page.locator('.eng-navigation').boundingBox(); const main = await page.locator('#req-module').boundingBox(); expect(nav.x + nav.width).toBeLessThan(main.x);
  await page.getByRole('button',{name:'Editar nome do projeto'}).click(); await page.locator('[data-platform-form="demo-name"] input').fill('Missão Horizonte'); await page.getByRole('button',{name:'Salvar nome',exact:true}).click();
  await expect(page.locator('.eng-project strong')).toHaveText('Missão Horizonte'); await page.screenshot({path:'test-results/design-workspace.png',fullPage:true});
  await page.locator('.eng-nav [data-module="schedule"]').click(); await expect(page.locator('.life-title')).toContainText('Missão Horizonte');
  expect(await page.evaluate(() => Object.keys(localStorage).every(key => key === 'norte.theme.v2'))).toBe(true);
});
test('revisão abre na lateral; categorias, busca e retorno à referência preservam o contexto',async ({page}) => {
  await page.setViewportSize({width:1440,height:900}); await page.goto('/'); await page.evaluate(() => showModule('schedule'));
  await page.locator('.life-marker[data-id="TRR"][data-profile="NASA"]').click();
  await expect(page.locator('#side-panel #life-review-detail')).toBeVisible(); await expect(page.locator('#schedule-scroll #life-review-detail')).toHaveCount(0);
  const detail = page.locator('#life-review-detail'); await detail.locator('[data-kind="norm"]').click();
  await expect(detail.locator('[data-life-kind]:visible')).toHaveCount(2); await expect(detail.locator('[data-life-kind="norm"].document-highlight')).toHaveCount(2);
  await page.getByRole('searchbox',{name:'Buscar documentos nesta revisão'}).fill('Registro'); await expect(detail.locator('[data-life-kind]:visible')).toHaveCount(1);
  await page.getByRole('button',{name:'Critérios da revisão',exact:true}).click(); await expect(page.locator('.source-context')).toHaveCount(1); await expect(page.locator('.source-paper,.source-quote')).toHaveCount(0); await page.screenshot({path:'test-results/design-reference.png'});
  await page.getByRole('button',{name:'Voltar',exact:true}).click(); await expect(detail.locator('[data-life-kind]:visible')).toHaveCount(1); await expect(page.locator('#life-document-search')).toHaveValue('Registro');
  await page.setViewportSize({width:1024,height:768}); await expect(page.locator('#life-document-search')).toHaveValue('Registro'); await expect(detail.locator('[data-life-kind]:visible')).toHaveCount(1); await page.setViewportSize({width:1440,height:900});
  await page.locator('#life-document-search').fill(''); await detail.locator('[data-kind=""]').click(); await expect(detail.locator('[data-life-kind]:visible')).toHaveCount(4);
  expect((await detail.locator('.eng-delivery-item').first().boundingBox()).height).toBeLessThan(90);
  await page.getByRole('button',{name:'Fechar detalhes da revisão'}).click(); await expect(page.locator('#side-panel')).toBeHidden(); await expect(page.locator('.life-marker[data-id="TRR"][data-profile="NASA"]')).toBeFocused();
});
test('painel redimensiona o espaço sem perder edição, foco ou o marco selecionado',async ({page}) => {
  await page.setViewportSize({width:1440,height:900}); await page.goto('/'); await page.evaluate(() => showModule('requirements'));
  const initial = await page.locator('#main-content').boundingBox();
  await page.locator('#rows tr').first().click(); await page.getByRole('button',{name:'Editar requisito',exact:true}).click(); const input = page.locator('[data-edit=text]'); await input.fill('O sistema deve preservar esta edição durante o redimensionamento.');
  await page.setViewportSize({width:1024,height:768}); await expect(input).toHaveValue('O sistema deve preservar esta edição durante o redimensionamento.');
  await page.setViewportSize({width:1440,height:900}); await page.getByRole('button',{name:'Salvar e analisar',exact:true}).click(); await page.keyboard.press('Escape');
  await expect(page.locator('#rows tr').first()).toContainText('preservar esta edição'); await expect(page.locator('#rows tr').first()).toBeFocused();
  await expect.poll(async () => Math.round((await page.locator('#main-content').boundingBox()).width)).toBe(Math.round(initial.width));
  await page.locator('.eng-nav [data-module=schedule]').click(); await page.locator('.life-marker[data-id=PLAR][data-profile=NASA]').click();
  await expect.poll(() => page.locator('#shell').evaluate(node => node.getAnimations().some(animation => animation.playState === 'running'))).toBe(false);
  await expect.poll(() => page.evaluate(() => { const plot = document.querySelector('.life-plot').getBoundingClientRect(); const marker = document.querySelector('.life-marker.selected').getBoundingClientRect(); return marker.left >= plot.left && marker.right <= plot.right; })).toBe(true);
  const bounds = await page.evaluate(() => ({main:document.querySelector('#main-content').getBoundingClientRect().toJSON(),panel:document.querySelector('#side-panel').getBoundingClientRect().toJSON()})); expect(bounds.main.right).toBeLessThanOrEqual(bounds.panel.x + 1); expect(bounds.main.width).toBeLessThan(initial.width);
  await page.locator('.eng-nav [data-module=documents]').click(); await expect(page.locator('#side-panel')).toBeHidden(); await expect(page.locator('#documents-module')).toBeVisible();
});
test('documentos combinam filtros de revisão, categoria, entrada e busca e permitem limpar',async ({page}) => {
  await page.goto('/'); await page.evaluate(() => showModule('documents')); const total = await page.locator('#documents-rows tr').count();
  await page.getByRole('combobox',{name:'Filtrar por revisão'}).selectOption('TRR'); await expect(page.locator('#documents-rows tr')).toHaveCount(4);
  await page.locator('#document-kind-filters [data-kind="norm"]').click(); await expect(page.locator('#documents-rows tr')).toHaveCount(2);
  await page.getByRole('combobox',{name:'Filtrar entrada ou saída'}).selectOption('output'); await expect(page.locator('#documents-rows tr')).toHaveCount(1); await expect(page.locator('#documents-rows')).toContainText('Registro e ações');
  await page.getByRole('searchbox',{name:'Buscar documento',exact:true}).fill('ausente'); await expect(page.locator('#documents-empty')).toBeVisible();
  await page.getByRole('button',{name:'Limpar',exact:true}).click(); await expect(page.locator('#documents-rows tr')).toHaveCount(total); await expect(page.locator('#documents-search')).toBeFocused();
  await page.setViewportSize({width:1440,height:900}); await page.screenshot({path:'test-results/design-documents.png'});
});
test('acesso compacto, ajuda pública e exemplos funcionam sem sobreposição de diálogos',async ({page}) => {
  await page.setViewportSize({width:1440,height:900}); await publicAccount(page);
  const sent = []; await page.route('**/api/help',route => { sent.push(route.request().postDataJSON()); return route.fulfill({json:{text:'Escolha uma área na navegação do seu projeto.',mode:'local'}}); });
  await page.locator('#account-button').click(); await expect(page.locator('[data-platform-form="login"]')).toBeVisible(); await page.getByRole('button',{name:'Mostrar senha',exact:true}).click(); await expect(page.locator('[name=password]')).toHaveAttribute('type','text'); await page.getByRole('button',{name:'Ocultar senha',exact:true}).click();
  await page.screenshot({path:'test-results/design-login.png',fullPage:true});
  await page.locator('#chat-launcher').click(); await expect(page.locator('.chat-welcome')).toBeVisible(); await page.screenshot({path:'test-results/design-help.png',fullPage:true});
  await page.locator('#chat-question').fill('Texto privado sintético de um projeto'); await page.getByRole('button',{name:'Enviar pergunta'}).click(); await expect(page.locator('.n-chat-message').last()).toHaveText('Escolha uma área na navegação do seu projeto.'); expect(sent).toEqual([{topic:'privacy'}]);
  await page.getByRole('button',{name:'Fechar ajuda'}).click(); await expect(page.locator('#chat-launcher')).toBeFocused();
  await page.getByRole('button',{name:'Explorar a plataforma',exact:true}).click(); await page.evaluate(() => generateSaved('pdf',['REQ'])); await expect(page.locator('.sample-downloads a')).toHaveCount(3); await page.screenshot({path:'test-results/design-downloads.png'});
  await page.locator('#platform-dialog [data-platform="signup"]').click(); await expect(page.locator('#platform-dialog')).not.toBeVisible(); await expect(page.locator('[data-platform-form="signup"]')).toBeVisible();
  await page.setViewportSize({width:390,height:844}); await page.screenshot({path:'test-results/design-signup-mobile.png',fullPage:true}); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
test('renomear projeto autenticado salva pela API com versão e mantém o módulo atual (transporte simulado)',async ({page}) => {
  const template = JSON.parse(fs.readFileSync(path.join(__dirname,'../../dist/templates.json'),'utf8'));
  let saved = {id:'00000000-0000-4000-8000-000000000019',owner_id:'00000000-0000-4000-8000-000000000001',name:'Projeto sintético',profile:'NASA',phase:'Concepção',start_date:'2026-10-13',version:1,payload:{requirements:[],verifications:[],engineering:{...template.engineering,customDocs:[]},settings:{standard:'NASA'},lifecycle:{durations:{}}}};
  await page.route('**/api/bootstrap',route => route.fulfill({json:{csrfToken:'synthetic',configured:true,authEmailReady:true,user:{id:saved.owner_id},entitlements:{tier:'essential',limits:{projects:1,requirements:50,verifications:20,generations:0},generationsUsed:0}}}));
  await page.route('**/api/projects/' + saved.id,async route => { if (route.request().method() === 'PUT') { saved = {...saved,payload:route.request().postDataJSON().payload,version:saved.version + 1}; } await route.fulfill({json:saved}); });
  let renamed = false; await page.route('**/api/projects/' + saved.id + '/manage',async route => { const input = route.request().postDataJSON(); expect(input).toEqual({action:'rename',version:saved.version,name:'Missão confirmada'}); saved = {...saved,name:input.name,version:saved.version + 1}; renamed = true; await route.fulfill({json:saved}); });
  await page.goto('/'); await page.evaluate(row => applyProject(row),saved); await page.locator('.eng-nav [data-module="documents"]').click(); await page.getByRole('button',{name:'Editar nome do projeto'}).click(); await page.locator('[data-platform-form="manage"] input').fill('Missão confirmada'); await page.getByRole('button',{name:'Salvar alteração',exact:true}).click();
  await expect.poll(() => renamed).toBe(true); await expect(page.locator('.eng-project strong')).toHaveText('Missão confirmada'); await expect(page.locator('#documents-module')).toBeVisible();
  await page.reload(); await page.evaluate(async id => applyProject(await api('/api/projects/' + id)),saved.id); await expect(page.locator('.eng-project strong')).toHaveText('Missão confirmada');
});
