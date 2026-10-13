// Navegação da página inicial e escolhas do pedido.
let heroSelection = '';
let heroSourceOpen = false;
let heroEditing = false;
let catalogueGroup = '';
let catalogueSelection = '';
let catalogueQuery = '';
let selectedExtras = {};
let quotePlan = normalizePlan({mode: 'project', standards: ['nasa-hb', 'ecss-req']});
let checkoutStarted = false;
let requestSent = false;
let receiverAvailable = false;
let feedbackSeen = false;
let planEdits = 0;
let quoteRevision = 0;
let requestToken = '';
let journey = [];
let tipCounter = 0;
const visitorSession = window.crypto?.randomUUID ? crypto.randomUUID() : 'session-' + Date.now().toString(36) + Math.random().toString(36).slice(2);

function tip(text) { tipCounter += 1; return `<span class="n-tip"><button type="button" aria-label="Mais informações" aria-describedby="n-tip-${tipCounter}">${icon('info')}</button><span role="tooltip" id="n-tip-${tipCounter}">${safe(text)}</span></span>`; }
function markHeroText(value) { return safe(value).replace(/(rapidamente|comerciais)/gi, '<mark>$1</mark>'); }
function findHeroIssue(req) {
  if (/radioamador/i.test(req.text) && /comerci/i.test(req.text) && !/(sem|não|nao)\s+(fins?\s+|objetivos?\s+)?comerci/i.test(req.text)) { return {title: 'A finalidade do serviço precisa de revisão', text: 'O Serviço de Radioamador não prevê uso comercial.', source: 'Anatel · RGST, art. 26', sourceTitle: 'Resolução 777/2025 · Anexo', quote: 'que não visem qualquer objetivo pecuniário ou comercial.', interpretation: 'O uso descrito no requisito precisa ser confrontado com a modalidade do serviço.', url: 'https://informacoes.anatel.gov.br/legislacao/resolucoes/2025/2022-resolucao-777', color: 'red'}; }
  const vague = /rapidamente|adequad[oa]|robust[oa]|facilmente|segur[oa]/i.test(req.text);
  return {title: vague ? 'Falta um limite verificável' : (req.findings.length ? 'Confira o critério de verificação' : 'Verificação definida'), text: vague ? 'Defina o tempo e a condição que serão verificados.' : 'Registre o método, o critério de aceitação e a evidência.', source: 'NASA · Apêndice C.4', sourceTitle: 'Systems Engineering Handbook · Rev. 2 · p. 200', quote: 'Are the requirements stated precisely to facilitate specification of system test success criteria and requirements?', interpretation: 'A referência orienta a escrever requisitos que permitam definir critérios objetivos de verificação.', url: 'https://www.nasa.gov/reference/appendix-c-how-to-write-a-good-requirement/', color: vague || req.findings.length ? '' : 'green'};
}
function heroFlag(req) {
  const finding = findHeroIssue(req);
  const source = heroSourceOpen ? `<div class="n-source-excerpt"><div class="n-source-edition">${safe(finding.sourceTitle)}</div><blockquote><strong>${safe(finding.quote)}</strong></blockquote><p>${safe(finding.interpretation)}</p><button class="n-text-link" data-norte="hero-copy-source" data-url="${safe(finding.url)}">Copiar endereço da publicação${icon('copy')}</button><div class="n-source-copy-status" role="status"></div></div>` : '';
  return `<div class="n-flag ${finding.color}">${icon(finding.color === 'green' ? 'check' : 'flag')}<div><strong>${safe(finding.title)}</strong><p>${safe(finding.text)}</p><button class="n-source-toggle" data-norte="hero-source" aria-expanded="${heroSourceOpen}">${safe(finding.source)}${icon('chevron')}</button>${source}</div></div>`;
}
function renderHero() {
  const target = el('hero-demo');
  if (!heroSelection) {
    const rows = requirements.slice(0, 3).map((req, index) => `<button class="preview-row" data-norte="hero-detail" data-id="${req.id}" aria-label="Ver ${req.id} dentro deste quadro"><span class="mono">${req.id}</span><span>${markHeroText(index === 0 ? req.text.replace('O sistema deve transmitir', 'Transmitir') : req.text)}</span><span class="status-dot ${['amber', 'red', 'green'][index]}" aria-label="${['Com apontamento', 'Revisão regulatória', 'Verificação definida'][index]}"></span></button>`).join('');
    target.innerHTML = `<div class="preview-head"><span class="small-label">MISSÃO AURORA</span><span class="quiet">Concepção</span></div><div class="preview-title"><h2>Requisitos do sistema</h2><span class="badge neutral">3 de 6 requisitos</span></div><div class="preview-columns"><span>ID</span><span>REQUISITO</span><span>REVISÃO</span></div>${rows}${heroFlag(requirements[0])}`;
    return;
  }
  const req = getRequirement(heroSelection);
  const body = heroEditing ? `<label class="sr-only" for="hero-text">Texto do requisito</label><textarea id="hero-text" maxlength="1200">${safe(req.text)}</textarea><div class="n-demo-edit-actions"><button class="text-button" data-norte="hero-cancel-edit">Cancelar</button><button class="button primary small" data-norte="hero-save">Salvar e analisar${icon('check')}</button></div>` : `<p class="n-demo-statement">${markHeroText(req.text)}</p><div class="n-demo-edit-actions"><span class="quiet">${safe(req.method)}</span><button class="text-button" data-norte="hero-edit">${icon('pencil')}Editar texto</button></div>`;
  target.innerHTML = `<div class="preview-head"><button class="n-demo-back" data-norte="hero-back">${icon('back')}Requisitos do sistema</button><span class="quiet">Missão Aurora</span></div><div class="n-demo-detail"><div class="n-demo-meta"><span class="mono">${req.id}</span><span class="badge neutral">${safe(req.subsystem)}</span></div>${body}</div>${heroFlag(req)}`;
  if (heroEditing) { el('hero-text').focus({preventScroll: true}); }
}
function catalogMatches(item) { return !catalogueQuery || norm([item.title, item.subtitle, item.group, ...item.tags].join(' ')).includes(norm(catalogueQuery)); }
function renderCatalogue() {
  const visible = CATALOGUE.items.filter(catalogMatches);
  const groups = CATALOGUE.groups.filter(group => visible.some(item => item.group === group.id));
  el('catalogue-groups').innerHTML = groups.map(group => {
    const count = visible.filter(item => item.group === group.id).length;
    return `<button class="n-group" data-norte="catalogue-group" data-id="${group.id}" aria-expanded="${catalogueGroup === group.id}" aria-controls="catalogue-content"><span class="n-group-icon">${icon(group.icon)}</span><span><strong>${safe(group.name)}</strong><small>${safe(group.tagline)}</small><small class="n-count">${count} ${count === 1 ? 'REFERÊNCIA' : 'REFERÊNCIAS'}</small></span>${icon('chevron')}</button>`;
  }).join('') || '<p class="n-empty-catalogue">Nenhuma referência encontrada. Tente o nome da norma ou outro assunto.</p>';
  el('catalogue-count').textContent = `${visible.length} referências${catalogueQuery ? ' encontradas' : ' no catálogo'}`;
  if (!groups.some(group => group.id === catalogueGroup)) { catalogueGroup = ''; }
  el('catalogue-content').hidden = !catalogueGroup;
  if (catalogueGroup) { renderCatalogueDetail(); }
}
function documentStatus(status) { return {required: 'Exigido quando aplicável ao escopo', confirm: 'Lista e conteúdo a confirmar', guide: 'Modelo orientativo do guia'}[status]; }
function renderCatalogueDetail() {
  const list = CATALOGUE.items.filter(item => item.group === catalogueGroup && catalogMatches(item));
  const item = list.find(entry => entry.id === catalogueSelection) || list[0];
  if (!item) { el('catalogue-content').hidden = true; return; }
  catalogueSelection = item.id;
  const group = CATALOGUE.groups.find(entry => entry.id === catalogueGroup);
  const chosen = quotePlan.standards.includes(item.id);
  const docs = item.docs.map((entry, index) => `<div class="n-document-row">${icon('file')}<div><strong>${safe(entry.title)}</strong><small>${safe(entry.basis)}</small><span class="n-document-status ${entry.status}">${documentStatus(entry.status)}</span></div><button class="icon-button" data-norte="document-preview" data-index="${index}" aria-label="Ver estrutura de ${safe(entry.title)}">${icon('chevron')}</button></div>`).join('') || '<p class="n-entry-scope">Esta referência não estabelece, nesta ficha, uma lista obrigatória de documentos.</p>';
  const extras = item.extras.map((name, index) => `<label class="n-document-row n-check"><input type="checkbox" data-extra="${index}" ${selectedExtras[item.id]?.includes(index) ? 'checked' : ''}><div><strong>${safe(name)}</strong><small>Incluir no checklist do projeto</small></div></label>`).join('');
  const options = list.map(entry => `<option value="${entry.id}" ${entry.id === item.id ? 'selected' : ''}>${safe(entry.title)} · ${safe(entry.subtitle)}</option>`).join('');
  el('catalogue-content').innerHTML = `<div class="n-catalogue-toolbar"><label>${safe(group.name)}<select id="catalogue-standard" aria-label="Referência de ${safe(group.name)}">${options}</select></label><button class="text-button" data-norte="catalogue-close">Recolher${icon('close')}</button></div><div class="n-catalogue-body"><div class="n-entry-head"><div><span class="n-ref-meta">${safe(item.kind)} · ${safe(item.edition)}</span><h3>${safe(item.subtitle)}</h3></div><label class="n-standard-use"><input type="checkbox" data-standard="${item.id}" ${chosen ? 'checked' : ''}>Considerar no meu projeto</label></div><p class="n-entry-scope">${safe(item.scope)}</p><div class="n-doc-columns"><div><h4>Documentos da referência</h4>${docs}</div><div><h4>Complementos opcionais da equipe</h4>${extras}</div></div><div class="n-doc-actions"><button class="button secondary" data-norte="catalogue-pdf">${icon('download')}Baixar checklist</button><button class="text-button" data-norte="catalogue-source">${icon('file')}Fonte e aplicação${icon('chevron')}</button></div><div class="n-reference-info" id="catalogue-source" hidden><strong>${safe(item.title)} · ${safe(item.edition)}</strong><p>${safe(item.note || item.scope)}</p><code>${safe(item.url)}</code><button class="text-button" data-norte="catalogue-copy">${icon('copy')}Copiar endereço oficial</button><p class="quiet" id="catalogue-copy-status" role="status"></p></div><div class="n-doc-preview" id="document-preview" hidden></div></div>`;
}
function previewDocument(index) {
  const item = CATALOGUE.items.find(entry => entry.id === catalogueSelection);
  const selected = item.docs[index];
  if (!selected) { return; }
  const target = el('document-preview');
  target.hidden = false;
  target.innerHTML = `<div class="n-entry-head"><span class="eyebrow">NORTE / ESTRUTURA DE TRABALHO</span><button class="icon-button" data-norte="document-close" aria-label="Fechar estrutura">${icon('close')}</button></div><h4>${safe(selected.title)}</h4><p>${safe(selected.basis)}. Estrutura inicial da Norte, a adaptar ao conteúdo exigido.</p><div class="n-mini-grid"><div><small>PROJETO</small>Missão Aurora</div><div><small>VERSÃO</small>0.1 · Em elaboração</div><div><small>RESPONSÁVEL</small>Engenharia de sistemas</div></div><div class="n-document-row"><span class="mono">01</span><div><strong>Escopo e referências</strong><small>Objetivo, edição das fontes e aplicação ao projeto.</small></div></div><div class="n-document-row"><span class="mono">02</span><div><strong>Conteúdo e evidências</strong><small>Itens do documento, vínculos, critérios e anexos.</small></div></div><div class="n-document-row"><span class="mono">03</span><div><strong>Revisão e aprovação</strong><small>Histórico, responsáveis, pendências e decisão.</small></div></div><div class="n-doc-actions"><button class="button secondary" data-norte="document-download" data-index="${index}">${icon('download')}Baixar estrutura editável</button></div>`;
}
function buildCataloguePDF(item) {
  const doc = pdfNew();
  pdfPage(doc, 'Checklist de documentos', `${item.title} · ${item.edition}`);
  pdfBlock(doc, item.subtitle, 15, true, '0.46 0.33 0.24', 12);
  pdfBlock(doc, item.scope, 10.5, false, '0.35 0.36 0.32', 16);
  pdfBlock(doc, 'Documentos da referência', 13, true, '0.17 0.18 0.16', 13);
  for (const entry of item.docs) {
    pdfNeed(doc, 95);
    pdfBlock(doc, entry.title, 11, true, '0.17 0.18 0.16', 4);
    pdfBlock(doc, entry.basis, 9.5, false, '0.35 0.36 0.32', 3);
    pdfBlock(doc, documentStatus(entry.status), 9, false, '0.46 0.33 0.24', 14);
  }
  if (!item.docs.length) { pdfBlock(doc, 'Nenhuma lista obrigatória foi atribuída a esta referência nesta ficha.', 10, false, '0.35 0.36 0.32', 14); }
  const extras = selectedExtras[item.id] || [];
  pdfNeed(doc, 80);
  pdfBlock(doc, 'Complementos da equipe', 13, true, '0.17 0.18 0.16', 13);
  if (extras.length) { for (const index of extras) { pdfBlock(doc, item.extras[index], 10.5, false, '0.35 0.36 0.32', 7); } }
  else { pdfBlock(doc, 'Nenhum complemento selecionado.', 10, false, '0.35 0.36 0.32', 12); }
  pdfNeed(doc, 100);
  pdfBlock(doc, item.note || 'Confirmar aplicação, conteúdo documental e edição no contrato do projeto.', 9.5, false, '0.46 0.46 0.41', 13);
  pdfLink(doc, 'Publicação oficial da referência', item.url);
  return pdfFinish(doc, 'Checklist da Norte. Conferir a aplicação e a versão contratual. Consulta das fontes em 12/10/2026.');
}
function downloadDocumentTemplate(index) {
  const item = CATALOGUE.items.find(entry => entry.id === catalogueSelection);
  const title = item.docs[index].title;
  const text = `# ${title}\n\nNorte · Missão Aurora\n\nVersão 0.1\nStatus em elaboração\nResponsável Engenharia de sistemas\n\n## Escopo\n\nDefinir o objetivo, os limites e os responsáveis por esta entrega.\n\n## Referências\n\n${item.title} · ${item.edition}\n${item.url}\n\nBase da ficha · ${item.docs[index].basis}\n\n## Conteúdo técnico\n\nDesenvolver os itens definidos no documento de origem, após confirmar sua aplicabilidade. Esta estrutura não substitui o conteúdo documental da norma.\n\n## Evidências e vínculos\n\nRegistrar documentos relacionados, requisitos, método de verificação e evidências disponíveis.\n\n## Revisões\n\n| Versão | Data | Responsável | Alteração | Decisão |\n| --- | --- | --- | --- | --- |\n| 0.1 | A definir | A definir | Em elaboração | Não aprovado |\n\n## Pendências\n\n| Item | Responsável | Prazo | Situação |\n| --- | --- | --- | --- |\n| A definir | A definir | A definir | Aberto |\n\nEstrutura inicial da Norte. Não é um formulário oficial da organização citada.\n`;
  downloadBlob(new Blob([text], {type: 'text/markdown;charset=utf-8'}), `norte-${item.id}-estrutura.md`);
}
function choiceOptions(values, selected) { return Object.entries(values).map(([key, value]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${safe(value.name)}</option>`).join(''); }
function planField(key, label, choices, explanation = '', helper = '') {
  return `<label class="n-field"><span>${safe(label)}${explanation ? tip(explanation) : ''}</span><select data-choice="${key}" aria-label="${safe(label)}">${choiceOptions(choices, quotePlan[key])}</select>${helper ? `<small>${safe(helper)}</small>` : ''}</label>`;
}
function selectedStandardOptions() {
  const common = ['nasa-hb', 'ecss-req', 'iso-29148', 'anatel-service', 'br-space', 'itar'];
  const ids = [...new Set([...common, ...quotePlan.standards])];
  return ids.map(id => {
    const item = CATALOGUE.items.find(entry => entry.id === id);
    if (!item) { return ''; }
    const names = {'nasa-hb': 'NASA', 'ecss-req': 'ECSS', 'iso-29148': 'ISO 29148', 'anatel-service': 'Anatel', 'br-space': 'Lei espacial brasileira', itar: 'ITAR'};
    return `<label class="n-check"><input type="checkbox" data-standard="${id}" ${quotePlan.standards.includes(id) ? 'checked' : ''}><span>${safe(names[id] || item.title)}</span></label>`;
  }).join('');
}
function renderPlanFields() {
  document.querySelectorAll('[data-norte="mode"]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === quotePlan.mode)));
  if (quotePlan.mode === 'test') {
    el('plan-fields').innerHTML = `<div class="n-free-preview"><span class="n-group-icon">${icon('compass')}</span><h3>Comece pelo projeto Aurora.</h3><p>Abra a tabela, altere os exemplos e veja como fica o registro de revisão antes de escolher um serviço.</p><div class="n-free-benefit">${icon('check')}Requisitos editáveis e fontes consultáveis</div><div class="n-free-benefit">${icon('check')}Checagens de redação e preenchimento</div><div class="n-free-benefit">${icon('check')}Relatório PDF para baixar</div></div>`;
    renderPrice();
    return;
  }
  const area = `<label class="n-field"><span>Área de atuação${tip('A área orienta o escopo e a escolha do revisor. A experiência específica e a disponibilidade são confirmadas antes da contratação.')}</span><select data-choice="area" aria-label="Área de atuação">${OFFER.areas.map(value => `<option ${quotePlan.area === value ? 'selected' : ''}>${safe(value)}</option>`).join('')}</select></label>`;
  const volume = planField('volume', 'Volume', OFFER.volumes, 'O limite considera o conjunto de documentos, incluindo as versões comparadas. Documentação cobre a mesma faixa de entregas.', OFFER.volumes[quotePlan.volume].scope);
  const service = planField('service', 'Serviço', OFFER.services, 'Análise revisa os requisitos. Impacto compara versões. Documentação prepara rascunhos com a estrutura combinada para o projeto.');
  const reviewer = planField('reviewer', 'Revisão', OFFER.reviewers, 'Sem revisor contratado, sua equipe revisa o resultado. Os anos indicam faixas de experiência usadas nesta oferta, não uma certificação profissional.');
  const hosting = planField('hosting', 'Hospedagem', OFFER.hosting, 'Compartilhado é o ambiente padrão. Dedicado separa o ambiente do cliente. Infraestrutura interna depende de avaliação técnica. Dados controlados exigem análise própria de acesso e jurisdição.');
  const addons = Object.entries(OFFER.addons).map(([key, value]) => {
    const disabled = (key === 'handover' && quotePlan.reviewer === 'self') || (key === 'editable' && quotePlan.service === 'documents');
    const included = key === 'editable' && quotePlan.service === 'documents';
    const description = included ? 'Incluído na preparação de documentação' : key === 'handover' && disabled ? 'Disponível quando você escolhe um revisor' : value.description;
    return `<label class="n-check"><input type="checkbox" data-addon="${key}" ${quotePlan.addons.includes(key) || included ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${safe(value.name)}<small>${safe(description)}</small></span><b>${included ? 'Incluído' : money(value.price)}</b></label>`;
  }).join('');
  el('plan-fields').innerHTML = `<div class="n-field-grid">${service}${volume}${reviewer}${area}<div class="n-field full">${hosting}</div></div><hr class="n-config-divider"><div class="n-form-title"><h3>Adicionais</h3><span class="n-discount-label">Campanha na parcela elegível</span></div><div class="n-addons">${addons}</div><label class="n-check n-first-order"><input type="checkbox" data-choice="firstOrder" ${quotePlan.firstOrder ? 'checked' : ''}><span>É minha primeira compra<small>O desconto vale para a revisão e os adicionais.</small></span></label><details class="n-standard-details"><summary>Referências do projeto · ${quotePlan.standards.length} selecionadas${icon('chevron')}</summary><div class="n-standard-options">${selectedStandardOptions()}</div><p class="n-price-caption" style="text-align:left">Outras referências podem ser incluídas pelo catálogo.</p></details>`;
  renderPrice();
}
function priceLine(label, value, small = '', discount = false) { return `<div class="n-price-line ${discount ? 'discount' : ''}"><span>${safe(label)}${small ? `<small>${safe(small)}</small>` : ''}</span><strong>${safe(value)}</strong></div>`; }
function renderPrice() {
  const price = calculatePrice(quotePlan);
  const free = quotePlan.mode === 'test';
  let content = '';
  if (free) {
    content = `<div class="n-price-topline"><span>SEU PRIMEIRO TESTE</span>${icon('compass')}</div><div class="n-total">Gratuito</div><p class="n-price-subtitle">Sem cartão e sem cadastro.</p><div class="n-price-lines">${priceLine('Projeto de exemplo', 'Incluído')}${priceLine('Quem revisa', 'Sua equipe')}${priceLine('Relatório PDF', 'Incluído')}</div><div class="n-delivery">${icon('info')}O teste não muda o preço de uma contratação futura.</div>`;
  } else {
    const serviceName = OFFER.services[quotePlan.service].name;
    const reviewer = OFFER.reviewers[quotePlan.reviewer];
    const delivered = quotePlan.service === 'documents' ? `Rascunhos estruturados · ${OFFER.volumes[quotePlan.volume].name.toLowerCase()}` : OFFER.services[quotePlan.service].delivery;
    let lines = priceLine(serviceName, money(price.service), OFFER.volumes[quotePlan.volume].name);
    lines += priceLine(quotePlan.reviewer === 'self' ? 'Revisão pela sua equipe' : reviewer.name.split(' (')[0], price.review ? money(price.review) : 'Sem adicional', price.review ? `${price.hours} h de revisão × ${money(price.rate)}/h` : 'Nenhum revisor externo contratado');
    if (price.addons) { lines += priceLine('Adicionais', money(price.addons), quotePlan.addons.map(key => OFFER.addons[key].name).join(' · ')); }
    lines += priceLine('Hospedagem', price.quote ? 'A definir' : price.setup ? money(price.setup) : 'Incluída', price.setup ? 'Implantação do ambiente dedicado' : OFFER.hosting[quotePlan.hosting].name);
    if (price.discount) { lines += priceLine('Campanha do serviço', '− ' + money(price.discount), 'Sobre a revisão e os adicionais', true); }
    const total = price.quote ? 'Sob consulta' : money(price.total);
    const subtitle = price.quote ? `Serviço e revisão a partir de ${money(price.total)}. Infraestrutura interna a dimensionar.` : price.monthly ? 'Serviço e implantação · pagamento único' : 'Pelo escopo selecionado · pagamento único';
    const recurring = price.monthly ? `<div class="n-price-recurring"><strong>${money(price.monthly)}/mês</strong> de hospedagem após a ativação. Esse valor não está incluído no pagamento único.</div>` : '';
    content = `<div class="n-price-topline"><span>SEU PROJETO</span>${icon('file')}</div><div class="n-total">${total}</div><p class="n-price-subtitle">${safe(subtitle)}</p><div class="n-price-lines">${lines}</div>${recurring}<div class="n-delivery">${icon('check')}<span>${safe(delivered)}</span></div>`;
  }
  el('price-summary').innerHTML = content;
  el('continue-order').innerHTML = (free ? 'Abrir teste' : 'Continuar') + icon('arrow');
  el('continue-caption').textContent = free ? 'O projeto abre na tabela de requisitos.' : 'Confirme o contato na próxima etapa.';
  el('price-actions').hidden = !el('contact-panel').hidden || requestSent;
}
function goConfigure() {
  if (state.panel === 'edit') { saveDraft(false); }
  closePanel(true);
  if (state.view !== 'home') { showView('home'); }
  el('configure').scrollIntoView({behavior: 'smooth', block: 'start'});
}
function invalidateRequest() {
  if (requestSent) { el('contact-panel').hidden = true; el('contact-consent').checked = false; }
  requestSent = false;
  requestToken = '';
  quoteRevision += 1;
  el('order-success').hidden = true;
  el('submission-message').textContent = '';
  el('submit-request').disabled = false;
}
function rememberEvent(type, extra = {}) {
  const event = {type, at: now(), session: visitorSession, selection: normalizePlan(quotePlan), pricingVersion: OFFER.version, ...extra};
  journey.push(event);
  if (journey.length > 80) { journey.shift(); }
  if (checkoutStarted && receiverAvailable) { postEvent(event); }
}
async function postEvent(event) {
  try { const response = await fetch('/api/events', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(event), keepalive: true}); return response.ok; } catch (error) { return false; }
}
async function checkReceiver() {
  if (!/^https?:$/.test(location.protocol)) { return; }
  try { const response = await fetch('/api/health', {signal: AbortSignal.timeout(3000)}); const result = await response.json(); receiverAvailable = response.ok && result.service === 'norte'; } catch (error) { receiverAvailable = false; }
}
function continueOrder() {
  if (quotePlan.mode === 'test') { closePanel(true); showView('workspace'); renderTable(); return; }
  checkoutStarted = true;
  feedbackSeen = false;
  el('feedback-box').hidden = true;
  el('price-actions').hidden = true;
  el('contact-panel').hidden = false;
  requestToken = requestToken || visitorSession + '-' + quoteRevision;
  rememberEvent('continue');
  el('contact-panel').scrollIntoView({behavior: 'smooth', block: 'center'});
  el('contact-name').focus({preventScroll: true});
}
function showFeedback() {
  if (requestSent || quotePlan.mode === 'test') { return; }
  const reasons = ['Preciso de aprovação', 'Preciso entender o preço', 'Preciso validar a segurança', 'Quero conhecer o revisor', 'Estou só explorando', 'Falta uma integração'];
  el('feedback-box').hidden = false;
  el('feedback-box').innerHTML = `<div class="n-feedback-head"><div><h3>Faltou alguma coisa?</h3><p>Escolha uma opção, se puder.</p></div><button class="icon-button" data-norte="feedback-close" aria-label="Dispensar pergunta">${icon('close')}</button></div><div class="n-reasons">${reasons.map((reason, index) => `<button data-norte="feedback" data-value="${index}">${safe(reason)}</button>`).join('')}</div>`;
  feedbackSeen = true;
}
function deferOrder() {
  rememberEvent('defer');
  el('contact-panel').hidden = true;
  el('price-actions').hidden = false;
  showFeedback();
}
async function submitFeedback(reason) {
  const event = {type: 'feedback', at: now(), session: visitorSession, selection: normalizePlan(quotePlan), reason};
  journey.push(event);
  el('feedback-box').innerHTML = '<p>Guardando sua resposta…</p>';
  const saved = receiverAvailable ? await postEvent(event) : false;
  el('feedback-box').innerHTML = `<p>${saved ? 'Resposta registrada.' : 'Resposta guardada nesta sessão.'} Você pode continuar quando decidir.</p>`;
}
async function submitRequest(event) {
  event.preventDefault();
  const form = el('contact-form');
  if (!form.reportValidity()) { return; }
  const button = el('submit-request');
  button.disabled = true;
  document.querySelector('.n-config-card').inert = true;
  el('catalogue').inert = true;
  button.textContent = 'Enviando…';
  el('submission-message').textContent = '';
  const payload = {requestToken: requestToken || visitorSession + '-' + quoteRevision, session: visitorSession, name: el('contact-name').value.trim(), email: el('contact-email').value.trim(), consent: el('contact-consent').checked, selection: normalizePlan(quotePlan), extraDocuments: selectedExtras, pricingVersion: OFFER.version};
  try {
    if (!/^https?:$/.test(location.protocol)) { throw new Error('offline'); }
    const response = await fetch('/api/requests', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000)});
    const result = await response.json();
    if (!response.ok || !result.id) { throw new Error('unavailable'); }
    requestSent = true;
    el('contact-panel').hidden = true;
    el('feedback-box').hidden = true;
    el('order-success').hidden = false;
    el('order-success').innerHTML = `<div class="n-success-icon">${icon('check')}</div><h3>Pedido registrado.</h3><p>A equipe pode falar com você em <strong>${safe(payload.email)}</strong> para confirmar o escopo, a disponibilidade e o pagamento.</p><p class="mono">${safe(result.id)}</p><button class="button secondary n-full" data-norte="quote-pdf">${icon('download')}Baixar resumo</button>`;
    rememberEvent('request_saved', {requestId: result.id});
  } catch (error) {
    el('submission-message').innerHTML = `<p>Não foi possível enviar o pedido. Suas escolhas continuam aqui.</p><button type="button" class="button secondary" data-norte="quote-pdf">${icon('download')}Baixar meu pedido</button><p>Nenhum pagamento foi efetuado. Você também pode tentar o envio novamente.</p>`;
    button.disabled = false;
  }
  document.querySelector('.n-config-card').inert = false;
  el('catalogue').inert = false;
  button.innerHTML = 'Solicitar contratação' + icon('arrow');
}
function buildQuotePDF() {
  const doc = pdfNew();
  const price = calculatePrice(quotePlan);
  pdfPage(doc, 'Pedido de serviço', requestSent ? 'Solicitação registrada · Aguardando confirmação' : 'Configuração do pedido · Não enviada');
  const lines = [['Serviço', OFFER.services[quotePlan.service].name], ['Volume', OFFER.volumes[quotePlan.volume].name], ['Limites do escopo', OFFER.volumes[quotePlan.volume].scope], ['Área', quotePlan.area], ['Revisão', OFFER.reviewers[quotePlan.reviewer].name], ['Hospedagem', OFFER.hosting[quotePlan.hosting].name], ['Adicionais', quotePlan.addons.map(key => OFFER.addons[key].name).join(' · ') || 'Nenhum'], ['Referências solicitadas', quotePlan.standards.map(id => CATALOGUE.items.find(item => item.id === id)?.title || id).join(' · ') || 'A confirmar']];
  for (const [label, value] of lines) { pdfNeed(doc, 62); pdfBlock(doc, label, 9, true, '0.46 0.33 0.24', 3); pdfBlock(doc, value, 10.5, false, '0.17 0.18 0.16', 12); }
  pdfNeed(doc, 210);
  pdfBlock(doc, 'Composição do preço', 16, true, '0.17 0.18 0.16', 15);
  const costs = [['Serviço', money(price.service)], [`Revisão${price.rate ? ` · ${price.hours} h × ${money(price.rate)}/h` : ''}`, money(price.review)], ['Adicionais', money(price.addons)], ['Implantação do ambiente', price.quote ? 'A dimensionar' : money(price.setup)], ['Desconto da primeira compra', money(price.discount)], ['Total do pagamento único', price.quote ? 'Sob consulta' : money(price.total)]];
  for (const [label, value] of costs) { pdfNeed(doc, 25); pdfText(doc, label, 42, doc.y, 10); pdfText(doc, value, 438, doc.y, 10, true); doc.y += 24; }
  if (price.monthly) { pdfBlock(doc, `Hospedagem recorrente de ${money(price.monthly)}/mês após a ativação. Não incluída no pagamento único.`, 10, false, '0.46 0.33 0.24', 14); }
  pdfBlock(doc, 'A equipe confirma o escopo, a disponibilidade de revisão e as condições de pagamento antes do início. O documento não confirma pagamento nem alocação de profissional.', 9.5, false, '0.46 0.46 0.41', 8);
  return pdfFinish(doc, 'Norte · Pedido de serviço · Nenhum pagamento é processado neste documento.');
}
async function copyInline(value, statusNode) {
  try { await navigator.clipboard.writeText(value); if (statusNode) { statusNode.textContent = 'Endereço copiado.'; } }
  catch (error) { if (statusNode) { statusNode.textContent = value; statusNode.style.wordBreak = 'break-all'; } }
}
function chatAnswer(question) {
  const q = norm(question);
  if (/inclu|receb|entreg|document/.test(q)) { return 'A análise entrega apontamentos, referências e relatório PDF. Impacto compara versões. Documentação prepara rascunhos estruturados. A faixa escolhida define o volume. O pacote editável já está incluído em documentação.'; }
  if (/revis|junior|pleno|senior|engenheir/.test(q)) { return 'Você pode revisar com sua equipe ou solicitar um engenheiro júnior, pleno ou sênior. O resumo mostra as horas e o valor. A área de experiência e a disponibilidade do profissional são confirmadas antes da contratação.'; }
  if (/dado|seguran|itar|nuvem|hosped|infra|priv/.test(q)) { return 'Há opções de ambiente compartilhado, dedicado e infraestrutura interna. A instalação interna precisa ser dimensionada. Nenhuma dessas escolhas garante, sozinha, atendimento à ITAR ou à política da sua empresa. Não envie arquivos restritos neste teste.'; }
  if (/preco|desconto|custo|valor|pagar|pagamento/.test(q)) { return 'O preço acompanha suas escolhas. A campanha vigente é conferida pelo servidor e não se aplica à revisão humana. A implantação e a mensalidade do ambiente dedicado aparecem separadas. O pagamento é combinado com a equipe depois da confirmação do pedido.'; }
  if (/gratis|gratuit|teste|testar/.test(q)) { return 'Em Testar primeiro, você pode editar os exemplos do projeto Aurora e baixar o relatório sem cadastro. As checagens são de texto e preenchimento. O teste não aumenta o preço de um serviço futuro.'; }
  if (/prazo|data|quando|tempo/.test(q)) { return 'O prazo é confirmado depois da avaliação do volume, das referências e da disponibilidade do revisor. A quantidade de horas mostrada no preço é esforço de revisão, não prazo de entrega.'; }
  if (/ia|inteligencia|automatic/.test(q)) { return 'A tabela disponível aqui usa regras de checagem de redação e de campos. Não há uma IA interpretando todo o projeto. As decisões técnicas e regulatórias continuam com os responsáveis pelo projeto.'; }
  return 'Essa dúvida precisa de confirmação da equipe. Você pode continuar o pedido e autorizar o contato por e-mail. Estas respostas rápidas cobrem escopo, revisão, dados, preço e prazo.';
}
function addChat(question) {
  if (!question.trim()) { return; }
  const body = el('chat-body');
  body.insertAdjacentHTML('beforeend', `<p class="n-chat-message user">${safe(question.slice(0, 500))}</p><p class="n-chat-message">${safe(chatAnswer(question))}</p>`);
  body.scrollTop = body.scrollHeight;
}
function toggleChat() {
  const chat = el('norte-chat');
  chat.hidden = !chat.hidden;
  el('chat-launcher').setAttribute('aria-expanded', String(!chat.hidden));
  if (!chat.hidden) { el('chat-question').focus({preventScroll: true}); }
  else { el('chat-launcher').focus({preventScroll: true}); }
}
function handleLandingClick(event) {
  const button = event.target.closest('[data-norte]');
  if (!button || button.disabled) { return; }
  const action = button.dataset.norte;
  if (action === 'hero-detail') { heroSelection = button.dataset.id; heroSourceOpen = false; renderHero(); }
  if (action === 'hero-back') { heroSelection = ''; heroEditing = false; heroSourceOpen = false; renderHero(); }
  if (action === 'hero-source') { heroSourceOpen = !heroSourceOpen; renderHero(); }
  if (action === 'hero-edit') { heroEditing = true; renderHero(); }
  if (action === 'hero-cancel-edit') { heroEditing = false; renderHero(); }
  if (action === 'hero-save') { const text = el('hero-text').value.trim(); if (!text) { el('hero-text').focus(); return; } const req = getRequirement(heroSelection); req.text = text; req.version += 1; req.status = 'pending'; req.review = 'Não revisado'; req.reviewAt = ''; req.findings = analyseOne(req); runAnalysis(false); heroEditing = false; heroSourceOpen = false; renderHero(); }
  if (action === 'hero-copy-source') { copyInline(button.dataset.url, button.parentElement.querySelector('.n-source-copy-status')); }
  if (action === 'catalogue-group') { catalogueGroup = catalogueGroup === button.dataset.id ? '' : button.dataset.id; renderCatalogue(); }
  if (action === 'catalogue-close') { catalogueGroup = ''; renderCatalogue(); }
  if (action === 'catalogue-source') { el('catalogue-source').hidden = !el('catalogue-source').hidden; }
  if (action === 'catalogue-copy') { const item = CATALOGUE.items.find(entry => entry.id === catalogueSelection); copyInline(item.url, el('catalogue-copy-status')); }
  if (action === 'catalogue-pdf') { const item = CATALOGUE.items.find(entry => entry.id === catalogueSelection); downloadBlob(buildCataloguePDF(item), `norte-checklist-${item.id}.pdf`); }
  if (action === 'document-preview') { previewDocument(Number(button.dataset.index)); }
  if (action === 'document-close') { el('document-preview').hidden = true; }
  if (action === 'document-download') { downloadDocumentTemplate(Number(button.dataset.index)); }
  if (action === 'mode') { invalidateRequest(); quotePlan.mode = button.dataset.value; if (checkoutStarted && quotePlan.mode === 'test') { rememberEvent('switch_to_test'); } checkoutStarted = false; el('contact-panel').hidden = true; el('feedback-box').hidden = true; renderPlanFields(); }
  if (action === 'continue') { continueOrder(); }
  if (action === 'defer') { deferOrder(); }
  if (action === 'feedback-close') { el('feedback-box').hidden = true; }
  if (action === 'feedback') { submitFeedback(button.textContent); }
  if (action === 'quote-pdf') { downloadBlob(buildQuotePDF(), 'norte-pedido.pdf'); }
  if (action === 'chat-toggle' || action === 'chat-close') { toggleChat(); }
  if (action === 'chat-question') { addChat(button.textContent); }
}
function handleLandingChange(event) {
  const input = event.target;
  if (input.id === 'catalogue-standard') { catalogueSelection = input.value; renderCatalogueDetail(); }
  if (input.matches('[data-standard]')) {
    const id = input.dataset.standard;
    quotePlan.standards = input.checked ? [...new Set([...quotePlan.standards, id])] : quotePlan.standards.filter(value => value !== id);
    invalidateRequest();
    const wasOpen = document.querySelector('.n-standard-details')?.open;
    renderPlanFields();
    if (wasOpen && document.querySelector('.n-standard-details')) { document.querySelector('.n-standard-details').open = true; }
    document.querySelectorAll(`[data-standard="${id}"]`).forEach(box => box.checked = quotePlan.standards.includes(id));
    rememberEvent('selection_changed');
  }
  if (input.matches('[data-extra]')) {
    const index = Number(input.dataset.extra);
    const values = selectedExtras[catalogueSelection] || [];
    selectedExtras[catalogueSelection] = input.checked ? [...new Set([...values, index])] : values.filter(value => value !== index);
    invalidateRequest();
  }
  if (input.matches('[data-choice], [data-addon]')) {
    planEdits += 1;
    invalidateRequest();
    if (input.dataset.choice) { quotePlan[input.dataset.choice] = input.type === 'checkbox' ? input.checked : input.value; }
    if (input.dataset.addon) { const key = input.dataset.addon; quotePlan.addons = input.checked ? [...new Set([...quotePlan.addons, key])] : quotePlan.addons.filter(value => value !== key); }
    quotePlan = normalizePlan(quotePlan);
    const field = input.dataset.choice;
    if (field === 'service' || field === 'reviewer' || field === 'volume') { renderPlanFields(); document.querySelector(`[data-choice="${field}"]`)?.focus({preventScroll: true}); } else { renderPrice(); }
    rememberEvent('selection_changed');
  }
}
function initialiseLanding() {
  renderHero();
  renderCatalogue();
  renderPlanFields();
  document.addEventListener('click', handleLandingClick);
  document.addEventListener('change', handleLandingChange);
  el('catalogue-search').addEventListener('input', event => { catalogueQuery = event.target.value; renderCatalogue(); });
  el('contact-form').addEventListener('submit', submitRequest);
  el('chat-form').addEventListener('submit', event => { event.preventDefault(); const question = el('chat-question').value.trim(); if (question) { addChat(question); el('chat-question').value = ''; } });
  document.addEventListener('mouseleave', event => { if (event.clientY <= 0 && (checkoutStarted || planEdits >= 2) && !requestSent && !feedbackSeen) { showFeedback(); } });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !el('norte-chat').hidden) { toggleChat(); } });
  checkReceiver();
}
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initialiseLanding); } else { initialiseLanding(); }
