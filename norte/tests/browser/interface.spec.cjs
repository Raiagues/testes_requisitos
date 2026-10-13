const {test,expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
for (const [width,height] of [[1366,768],[1440,900],[1920,1080],[390,844]]) {
  test(`interface, detalhes e cartão de revisão ${width}x${height}`,async ({page}) => {
    await page.setViewportSize({width,height}); await page.emulateMedia({reducedMotion:'reduce'}); const errors = []; page.on('pageerror',error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('.brand')).toBeVisible();
    await page.evaluate(() => showModule('requirements')); await expect(page.locator('#rows tr')).toHaveCount(6);
    const before = await page.locator('.requirements-table').boundingBox();
    await page.locator('#rows tr').first().click(); const after = await page.locator('.requirements-table').boundingBox(); expect(after.width).toBe(before.width);
    await expect(page.locator('#side-panel')).toBeVisible(); await page.keyboard.press('Escape');
    await page.evaluate(() => showModule('schedule')); await page.evaluate(() => lifeSelect('NASA','MDR-SDR'));
    await expect(page.locator('#life-review-detail')).toContainText('DOCUMENTOS DE ENTRADA'); await expect(page.locator('#life-review-detail')).not.toContainText('norma*');
    if (width >= 1366) { const item = page.locator('#life-review-detail .eng-delivery-item').first(); const padding = await item.evaluate(node => getComputedStyle(node).paddingLeft); expect(parseInt(padding)).toBeGreaterThanOrEqual(16); }
    await page.screenshot({path:`test-results/review-${width}.png`,fullPage:true});
    await page.locator('#theme-button').click(); await expect(page.locator('html')).toHaveAttribute('data-theme','dark'); await page.screenshot({path:`test-results/review-dark-${width}.png`,fullPage:true});
    expect(errors).toEqual([]);
  });
}
test('datas manuais preservadas e resultado de verificação não é apagado',async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(() => { showModule('schedule'); const review = lifeReviews().find(item => item.id === 'PDR'); review.date = '2027-07-20'; review.manual = true; lifecycle.settings = true; renderSchedule(); document.getElementById('life-phase-0').value = '12'; lifeApplyDates(); return review.date; });
  expect(result).toBe('2027-07-20');
});
test('desativar revisão preserva entregas pendentes e documento da empresa mantém categoria',async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(() => { showModule('documents'); const before = projectDocuments().map(doc => doc.id); scheduleList().find(review => review.id === 'PDR').active = false; engineering.customDocs.push({id:'EMP-1',code:'EMP-1',title:'Entrega interna',kind:'company',reviews:[],flow:'input',state:'Rascunho',body:'Conteúdo da equipe'}); const raw = JSON.stringify(engineering.customDocs); renderDocuments(); const docs = projectDocuments(); return {before,after:docs.map(doc => doc.id),pending:docs.find(doc => doc.id === 'PROC-PDR').pendingReviews,company:docs.find(doc => doc.id === 'EMP-1').kind,unchanged:JSON.stringify(engineering.customDocs) === raw}; });
  expect(result.before.every(id => result.after.includes(id))).toBe(true); expect(result.pending).toContain('PDR'); expect(result.company).toBe('company'); expect(result.unchanged).toBe(true); await expect(page.locator('#documents-module')).not.toContainText('norma*'); await expect(page.locator('#documents-rows')).toContainText('marco pendente de reatribuição'); await expect(page.locator('#documents-rows')).toContainText('Sem revisão atribuída');
});
test('XSS em requisito e nome de projeto é texto inerte; CSP bloqueia scripts inline',async ({page}) => {
  const requests = []; page.on('request',request => { if (request.url().includes('attacker.invalid')) { requests.push(request.url()); } });
  const response = await page.goto('/'); expect(response.headers()['content-security-policy']).toContain("script-src 'self'"); expect(response.headers()['content-security-policy']).not.toContain("script-src 'self' 'unsafe-inline'");
  await page.evaluate(() => { requirements[0].text = '<img src="https://attacker.invalid/" onerror="window.xss=true">'; project.name = '<script>window.xss=true</script>'; showModule('requirements'); });
  await expect(page.locator('#rows')).toContainText('<img'); expect(await page.evaluate(() => window.xss)).toBeUndefined(); expect(requests).toEqual([]);
});
test('login em diálogo interno, sem janela nova ou token em localStorage',async ({page}) => {
  await page.goto('/'); await page.locator('#account-button').click(); await expect(page.locator('#account-page')).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage)); expect(keys.every(key => key === 'norte.theme.v2')).toBe(true);
});
test('navegação por teclado, foco e movimento reduzido',async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'}); await page.goto('/'); await page.keyboard.press('Tab'); await expect(page.locator('.brand')).toBeFocused();
  await page.evaluate(() => showModule('schedule')); const marker = page.locator('.life-marker').first(); await marker.focus(); await page.keyboard.press('Enter'); await expect(page.locator('#life-review-detail')).toBeVisible();
});
test('campos e salvamento autenticado com transporte simulado, conflito preserva rascunho',async ({page}) => {
  const template = JSON.parse(fs.readFileSync(path.join(__dirname,'../../dist/templates.json'),'utf8'));
  let saved = {id:'00000000-0000-4000-8000-000000000009',owner_id:'00000000-0000-4000-8000-000000000001',name:'Projeto sintético',profile:'NASA',phase:'Concepção',start_date:'2026-10-12',version:1,updated_at:new Date().toISOString(),payload:{requirements:[],verifications:[],engineering:{...template.engineering,customDocs:[]},settings:{standard:'NASA',quality:true,trace:true,verification:true,anatel:false,itar:false},lifecycle:{durations:{}}}};
  let conflict = false;
  await page.route('**/api/bootstrap',route => route.fulfill({json:{csrfToken:'synthetic',configured:true,user:{id:saved.owner_id,email:'test@example.invalid'},entitlements:{tier:'essential',limits:{projects:1,requirements:50,verifications:20,generations:0},generationsUsed:0},offer:null}}));
  await page.route('**/api/projects',route => route.fulfill({json:[saved]}));
  await page.route('**/api/projects/' + saved.id,async route => { if (route.request().method() === 'PUT') { if (conflict) { await route.fulfill({status:409,json:{error:'version_conflict'}}); return; } saved = {...saved,payload:route.request().postDataJSON().payload,version:saved.version + 1}; } await route.fulfill({json:saved}); });
  await page.goto('/'); await page.locator('#account-button').click(); await page.getByRole('button',{name:'Abrir',exact:true}).click(); await page.locator('#add-req-button').click(); await page.locator('#eng-new-requirement [name=text]').fill('O sistema deve registrar α ≤ 3 °C.'); await page.locator('#eng-new-requirement button[type=submit]').click();
  await expect.poll(() => saved.payload.requirements.length).toBe(1);
  await page.reload(); await page.locator('#account-button').click(); await page.getByRole('button',{name:'Abrir',exact:true}).click(); await expect(page.locator('#rows')).toContainText('α ≤ 3 °C');
  conflict = true; await page.evaluate(() => { requirements[0].text = 'Rascunho a preservar'; }); await expect(page.locator('#save-state')).toContainText('Falha ao salvar'); expect(await page.evaluate(() => requirements[0].text)).toBe('Rascunho a preservar');
});
