// A sessão pública é isolada; platform.js persiste projetos autenticados.
const project = {name: 'Missão Aurora', phase: 'Concepção', code: 'AUR'};
const subsystemOptions = ['Não definido', 'Sistema', 'Telemetria', 'Software', 'Interfaces', 'Segmento solo', 'Documentação', 'Estruturas', 'Energia', 'Operações'];
const typeOptions = ['Funcional', 'Desempenho', 'Interface', 'Segurança', 'Restrição', 'Operacional', 'Verificação'];
const methodOptions = ['Não definido', 'Teste', 'Análise', 'Inspeção', 'Demonstração'];
const originOptions = ['Projeto', 'Cliente', 'ECSS', 'NASA', 'Anatel', 'ITAR'];
const ownerOptions = ['Não definido', 'Engenharia de sistemas', 'Engenharia de software', 'Engenharia de telecomunicações', 'Equipe de interfaces', 'Responsável regulatório', 'Gestão da configuração'];
let settings = {standard: 'NASA', quality: true, trace: true, verification: true, anatel: true, itar: true};
let requirements = structuredClone(INITIAL_REQUIREMENTS);
let state = {view: 'home', panel: '', selectedId: '', finding: 0, page: 1, pageSize: 6, editPage: 0, orderStep: 0, sourceKey: '', sourceBack: 'detail', filters: {method: '', origin: ''}, exportScope: 'all'};
let draft = null;
let nextNumber = 7;
let tableObserver = null;
let lastFocus = null;

function el(id) { return document.getElementById(id); }
function safe(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function norm(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function icon(name) { return `<svg class="icon" aria-hidden="true"><use href="#i-${safe(name)}"/></svg>`; }
function money(value) { return value.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', maximumFractionDigits: 0}); }
function now() { return new Date().toISOString(); }
function dateLabel(value) { return new Date(value).toLocaleDateString('pt-BR'); }
function getRequirement(id) { return requirements.find(item => item.id === id); }
function selectedMethods(req) { return [req.method, ...(req.extraMethods || [])].filter(value => value && value !== 'Não definido'); }
function message(text, error = false) { el('status-message').textContent = text; el('status-message').style.color = error ? 'var(--red)' : ''; }
function optionList(values, selected) { return values.map(value => `<option value="${safe(value)}" ${value === selected ? 'selected' : ''}>${safe(value)}</option>`).join(''); }
function selectField(key, label, values, value) { return `<label class="field"><span>${safe(label)}</span><select data-edit="${key}">${optionList(values, value)}</select></label>`; }
function inputField(key, label, value, placeholder = '') { return `<label class="field"><span>${safe(label)}</span><input data-edit="${key}" maxlength="250" value="${safe(value)}" placeholder="${safe(placeholder)}"></label>`; }
function markedText(text, part) {
  const index = part ? norm(text).indexOf(norm(part)) : -1;
  if (index < 0) { return safe(text); }
  return safe(text.slice(0, index)) + '<mark>' + safe(text.slice(index, index + part.length)) + '</mark>' + safe(text.slice(index + part.length));
}
function statusText(req) {
  if (req.status === 'regulatory') { return 'Revisão regulatória'; }
  if (req.status === 'issues') { return `${req.findings.length} ${req.findings.length === 1 ? 'apontamento' : 'apontamentos'}`; }
  if (req.status === 'clear') { return 'Sem alertas'; }
  return 'A analisar';
}
function createRequirement(id, text) {
  return {id: id, text: text, subsystem: 'Não definido', type: 'Funcional', method: 'Não definido', extraMethods: [], origin: 'Projeto', reference: '', sourceVersion: '', parent: '', owner: 'Não definido', level: 'Sistema', rationale: '', acceptance: '', architecture: '', test: '', evidence: '', criticality: 'Normal', version: 1, status: 'pending', findings: [], analysedAt: '', review: 'Não revisado', reviewer: '', reviewAt: '', reviewNote: '', history: [], isExample: false};
}
function addFinding(list, category, title, message, source, match = '', ecss = '') { list.push({category: category, title: title, message: message, source: source, match: match, ecss: ecss}); }
function analyseOne(req) {
  const list = [];
  const text = norm(req.text);
  if (!text.trim()) {
    addFinding(list, 'Redação', 'Declaração não preenchida', 'Escreva o comportamento ou a restrição antes de analisar o requisito.', 'nasa-form');
    return list;
  }
  if (settings.quality) {
    if (!/\b(deve|devem|devera|deverao|shall)\b/.test(text)) { addFinding(list, 'Redação', 'Explicitar a obrigação', 'Identifique o elemento responsável e o que ele deve fazer. O perfil reconhece “deve”, “deverá” e “shall”.', 'nasa-form', '', '8.3.2'); }
    const ambiguous = text.match(/\b(rapidamente|rapido|rapida|adequado|adequada|adequadamente|eficiente|eficientemente|robusto|robusta|facil|facilmente|suficiente|suficientemente|minimizar|maximizar|otimizar|etc|apropriado|apropriada)\b|e\/ou/);
    if (ambiguous) {
      const source = settings.standard === 'ECSS' ? 'ecss-writing' : 'nasa-verification';
      addFinding(list, 'Redação', 'Substituir expressão imprecisa', `A expressão “${req.text.slice(ambiguous.index, ambiguous.index + ambiguous[0].length)}” pode admitir interpretações diferentes. Defina o limite, a condição ou o resultado observável sem inventar valores.`, source, ambiguous[0], '8.2.4 e 8.3.3');
    }
    if (/\b(tbd|tbr|a definir|a confirmar)\b|\[[^\]]*\]/.test(text)) { addFinding(list, 'Redação', 'Resolver informação pendente', 'Há um valor ou uma condição ainda em aberto. Registre a decisão e o responsável pela resolução antes de fechar a redação.', 'nasa-rationale', '', '8.2.8'); }
    const obligations = text.match(/\b(deve|devem|devera|deverao|shall)\b/g) || [];
    if (obligations.length > 1 || /\be\s+(armazenar|transmitir|registrar|gerar|validar|enviar)\b/.test(text)) { addFinding(list, 'Redação', 'Conferir se há mais de uma obrigação', 'Há sinais de ações distintas na mesma declaração. Avalie se cada ação precisa de um requisito e de uma verificação próprios.', 'nasa-clarity', '', '8.2.7'); }
    if (req.type === 'Desempenho' && !/\d/.test(text)) { addFinding(list, 'Verificação', 'Definir medida e limite de desempenho', 'O tipo selecionado é desempenho, mas não foi localizado um valor numérico. Confirme a unidade, o limite e a condição de operação com a equipe.', 'nasa-performance', '', '8.2.1 e 8.2.10'); }
    const duplicate = requirements.find(other => other.id !== req.id && norm(other.text).replace(/[\s.,]+/g, '') === text.replace(/[\s.,]+/g, ''));
    if (duplicate) { addFinding(list, 'Consistência', 'Declaração repetida na tabela', `O texto coincide com ${duplicate.id} após normalizar espaços e pontuação. Confirme se os dois registros são necessários.`, 'nasa-trace', '', '8.2.5'); }
    if (!req.rationale.trim()) { addFinding(list, 'Contexto', 'Registrar a justificativa', 'Explique por que o requisito é necessário e quais premissas o sustentam. Mantenha a justificativa fora da declaração.', 'nasa-rationale', '', '8.2.2'); }
    if (req.subsystem === 'Não definido' || req.owner === 'Não definido') { addFinding(list, 'Contexto', 'Definir alocação e responsável', 'Associe o requisito a um elemento do sistema e a um responsável pela revisão.', 'nasa-matrix', '', '8.2.2 e 8.2.6'); }
  }
  if (settings.trace) {
    if (!req.reference.trim()) { addFinding(list, 'Rastreabilidade', 'Identificar a referência de origem', 'Preencha o documento e o local que fundamentam o requisito. Selecionar apenas “NASA” ou “Projeto” não identifica uma origem.', 'nasa-trace', '', '7.2.4'); }
    if (req.reference.trim() && !req.sourceVersion.trim()) { addFinding(list, 'Rastreabilidade', 'Informar a versão do documento', 'A referência não tem uma versão registrada. Identifique a edição que foi usada para formular este requisito.', 'nasa-matrix', '', '7.2.4.d'); }
    if (!req.parent.trim()) { addFinding(list, 'Rastreabilidade', 'Vincular ao objetivo ou requisito superior', 'Informe o identificador da necessidade ou do requisito que originou esta declaração.', 'nasa-trace', '', '8.2.3'); }
    if (req.parent === req.id) { addFinding(list, 'Rastreabilidade', 'Corrigir vínculo com o próprio requisito', 'O requisito não pode ser o seu próprio requisito superior. Confira a relação registrada.', 'nasa-trace', '', '8.2.3'); }
    if (req.type === 'Interface' && !/[0-9]/.test(req.reference)) { addFinding(list, 'Rastreabilidade', 'Identificar o documento de interface', 'O texto cita um documento sem identificador preciso. Registre seu código, sua versão e a seção aplicável.', 'nasa-trace', '', '7.2.4'); }
  }
  if (settings.verification) {
    if (selectedMethods(req).length === 0) { addFinding(list, 'Verificação', 'Selecionar como o requisito será verificado', 'Defina um ou mais métodos. A escolha do método ainda precisa ser compatível com a declaração e com o nível do sistema.', 'nasa-methods', '', '8.2.9'); }
    if (!req.acceptance.trim()) { addFinding(list, 'Verificação', 'Preencher o critério de aceitação', 'Descreva o resultado que permitirá concluir se o requisito foi atendido. O critério não precisa ser numérico em todos os casos.', 'nasa-acceptance', '', '8.2.9'); }
  }
  if (settings.anatel && /radioamador/.test(text)) {
    const commercial = /comerci|lucrativ|remunerad|cliente|venda/.test(text);
    const deniesCommercial = /(?:sem|nao(?:\s+\w+){0,4})\s+(?:fins?\s+)?(?:comerci|lucrativ|objetivo\s+pecuni)/.test(text);
    const title = commercial && !deniesCommercial ? 'Revisar o enquadramento do serviço' : 'Confirmar condições do Serviço de Radioamador';
    const message = commercial && !deniesCommercial ? 'O texto combina Serviço de Radioamador e finalidade comercial. O art. 26 define esse serviço sem objetivo pecuniário ou comercial. Confirme o enquadramento com o responsável regulatório.' : 'A menção a radioamadorismo exige confirmar finalidade, autorização e condições aplicáveis. Esta checagem não determina a faixa que pode ser usada.';
    addFinding(list, 'Regulatório', title, message, 'anatel-radio', 'radioamador');
  }
  if (settings.itar && (/\bitar\b/.test(text) || req.origin === 'ITAR')) {
    addFinding(list, 'Regulatório', 'Confirmar enquadramento e acesso aos dados', 'O texto menciona ITAR. Confirme a classificação do dado, a localização das pessoas e as autorizações ou exceções antes de decidir sobre o acesso. A ferramenta não determina a aplicabilidade.', 'itar-export', 'ITAR');
  }
  return list;
}
function runAnalysis(showMessage = true) {
  for (const req of requirements) {
    req.findings = analyseOne(req);
    req.status = req.findings.some(item => item.category === 'Regulatório') ? 'regulatory' : req.findings.length ? 'issues' : 'clear';
    req.analysedAt = now();
  }
  renderTable();
  if (state.panel === 'detail') { renderDetail(); }
  if (showMessage) { message(`${requirements.length} requisitos analisados. Selecione uma linha para conferir os apontamentos.`); }
}
function filteredRows() {
  const search = norm(el('search').value);
  const sub = el('filter-subsystem').value;
  const status = el('filter-status').value;
  return requirements.filter(req => (!search || norm(`${req.id} ${req.text} ${req.reference}`).includes(search)) && (!sub || req.subsystem === sub) && (!status || req.status === status || status === 'issues' && req.status === 'regulatory') && (!state.filters.method || req.method === state.filters.method) && (!state.filters.origin || req.origin === state.filters.origin));
}
function updateSubsystems() {
  const current = el('filter-subsystem').value;
  const values = [...new Set(requirements.map(req => req.subsystem))].sort();
  el('filter-subsystem').innerHTML = '<option value="">Todos</option>' + optionList(values, current);
}
function renderTable() {
  const rows = filteredRows();
  const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(pages, Math.max(1, state.page));
  const start = (state.page - 1) * state.pageSize;
  const current = rows.slice(start, start + state.pageSize);
  let html = '';
  for (const req of current) {
    const selected = req.id === state.selectedId && state.panel;
    html += `<tr class="requirement-row ${selected ? 'selected' : ''}" data-action="detail" data-id="${safe(req.id)}" tabindex="0" aria-label="Abrir requisito ${safe(req.id)}"><td class="row-id mono">${safe(req.id)}</td><td class="row-text"><span>${safe(req.text)}</span></td><td class="aux">${safe(req.subsystem)}</td><td class="aux"><span class="method-tag">${safe(req.method === 'Não definido' ? 'A definir' : req.method)}</span></td><td class="aux">${safe(req.origin)}</td><td><div class="row-action"><span class="badge ${safe(req.status)}">${safe(statusText(req))}</span>${icon('chevron')}</div></td></tr>`;
  }
  el('rows').innerHTML = html;
  el('empty-state').hidden = rows.length !== 0;
  const withFindings = requirements.filter(req => req.findings.length > 0).length;
  el('table-summary').textContent = `${requirements.length} requisitos${withFindings ? ` · ${withFindings} com apontamentos` : ''}`;
  el('page-count').textContent = rows.length ? `${start + 1}–${start + current.length} de ${rows.length} requisitos` : '0 requisitos';
  el('page-label').textContent = `${state.page} / ${pages}`;
  el('prev-page').disabled = state.page <= 1;
  el('next-page').disabled = state.page >= pages;
  const base = [settings.standard, settings.anatel ? 'Anatel' : '', settings.itar ? 'ITAR' : ''].filter(Boolean);
  el('settings-summary').textContent = base.join(' · ');
}
function fitTable() {
  if (state.view !== 'workspace') { return; }
  const rowHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 76;
  const available = el('table-area').getBoundingClientRect().height - 36;
  const size = Math.max(1, Math.floor(available / rowHeight));
  if (size !== state.pageSize) { state.pageSize = size; renderTable(); }
}
function showView(view) {
  if (state.panel === 'edit') { saveDraft(false); }
  state.view = view;
  el('home').hidden = view !== 'home';
  if (view === 'home' && typeof renderHero === 'function') { renderHero(); }
  el('workspace').hidden = view !== 'workspace';
  document.body.classList.toggle('workspace-mode', view === 'workspace');
  document.documentElement.classList.toggle('workspace-mode', view === 'workspace');
  window.scrollTo({top: 0, behavior: 'instant'});
  requestAnimationFrame(fitTable);
}
function panelHeading(title, subtitle = '', back = '') {
  return `<div class="panel-heading"><div class="panel-heading-left">${back ? `<button class="icon-button" data-action="${safe(back)}" aria-label="Voltar">${icon('back')}</button>` : ''}<div><h2 tabindex="-1" id="panel-title">${safe(title)}</h2>${subtitle ? `<div class="panel-subtitle">${safe(subtitle)}</div>` : ''}</div></div><button class="icon-button" data-action="close-panel" aria-label="Fechar painel">${icon('close')}</button></div>`;
}
function setPanel(kind, content, focus = true) {
  if (!state.panel) { lastFocus = document.activeElement; }
  state.panel = kind;
  el('side-panel').hidden = false;
  el('side-panel').innerHTML = content;
  el('shell').classList.add('has-panel');
  el('side-panel').setAttribute('aria-labelledby', 'panel-title');
  renderTable();
  requestAnimationFrame(fitTable);
  if (focus) { el('panel-title')?.focus({preventScroll: true}); }
}
function closePanel(force = false) {
  if (state.panel === 'unsaved' && !force) { openEditor(state.editPage); return; }
  if (state.panel === 'edit' && draft && draftChanged() && !force) {
    const content = panelHeading('Salvar as alterações?', state.selectedId) + `<div class="panel-body"><div class="inline-save">Você editou este requisito. Salve a nova redação ou descarte as alterações.</div></div><div class="panel-footer"><button class="button secondary" data-action="discard-close">Descartar</button><button class="button primary" data-action="save-close">Salvar e fechar</button></div>`;
    setPanel('unsaved', content);
    return;
  }
  state.panel = '';
  el('side-panel').hidden = true;
  el('side-panel').innerHTML = '';
  el('shell').classList.remove('has-panel');
  renderTable();
  requestAnimationFrame(fitTable);
  if (lastFocus && document.contains(lastFocus)) { lastFocus.focus({preventScroll: true}); }
}
function openDetail(id) {
  if (state.panel === 'edit') { saveDraft(false); }
  state.selectedId = id;
  state.finding = 0;
  draft = null;
  showView('workspace');
  renderDetail();
}
function renderDetail() {
  const req = getRequirement(state.selectedId);
  if (!req) { closePanel(true); return; }
  state.finding = Math.max(0, Math.min(state.finding, req.findings.length - 1));
  const item = req.findings[state.finding];
  let body = `<div class="requirement-quote">${markedText(req.text, item?.match)}</div><div class="requirement-meta"><span class="badge ${req.status}">${safe(statusText(req))}</span><span class="quiet">${safe(req.method === 'Não definido' ? 'Verificação a definir' : req.method)}</span></div>`;
  if (item) {
    const source = SOURCES[item.source];
    body += `<div class="finding-topline"><span>Apontamentos</span><div class="finding-controls"><button class="icon-button" data-action="finding-prev" aria-label="Apontamento anterior" ${state.finding === 0 ? 'disabled' : ''}>${icon('back')}</button><span>${state.finding + 1} / ${req.findings.length}</span><button class="icon-button" data-action="finding-next" aria-label="Próximo apontamento" ${state.finding >= req.findings.length - 1 ? 'disabled' : ''}>${icon('arrow')}</button></div></div><div class="finding-card"><span class="category ${item.category === 'Regulatório' ? 'regulatory' : ''}">${safe(item.category)}</span><h3>${safe(item.title)}</h3><p>${safe(item.message)}</p><button class="source-card" data-action="source" data-source="${safe(item.source)}">${icon('file')}<span><strong>${safe(source.org)} · Ver trecho da fonte</strong><small>${safe(source.section)}</small></span>${icon('chevron')}</button></div>`;
  } else if (req.status === 'pending') {
    body += `<div class="finding-card"><h3>Pronto para analisar</h3><p>Confira a redação, a origem e os critérios desta versão.</p><button class="button primary" data-action="analyse-all">Analisar requisito${icon('arrow')}</button></div>`;
  } else {
    body += `<div class="finding-card"><span class="category" style="color:var(--green)">Verificações concluídas</span><h3>Nenhum alerta nas checagens</h3><p>A revisão da equipe continua necessária. O resultado não atesta conformidade ou verificação do produto.</p><button class="source-card" data-action="source" data-source="nasa-methods">${icon('file')}<span><strong>NASA · Critérios de verificação</strong><small>Apêndice C.4</small></span>${icon('chevron')}</button></div>`;
  }
  body += `<div class="review-line">${icon('pencil')}<span>${safe(req.review)}${req.reviewAt ? ` · ${dateLabel(req.reviewAt)}` : ''}</span></div>`;
  const footer = `<div class="panel-footer"><button class="button secondary" data-action="review">Registrar revisão</button><button class="button primary" data-action="edit">${icon('pencil')}Editar requisito</button></div>`;
  setPanel('detail', panelHeading(req.id, `${req.subsystem} · versão ${req.version}`) + `<div class="panel-body">${body}</div>` + footer, state.panel !== 'detail');
}
function openSource(key, back = 'detail') {
  state.sourceKey = key;
  state.sourceBack = back;
  const source = SOURCES[key];
  if (!source) { message('Referência não encontrada.', true); return; }
  const req = getRequirement(state.selectedId);
  const finding = req?.findings.find(item => item.source === key);
  const note = finding ? finding.message : source.explanation;
  const locator = source.format === 'pdf' ? `${source.section} · p. ${source.page}` : source.section;
  let body = `<div><h3 class="source-heading-small">${safe(source.org)} · ${safe(source.title)}</h3><div class="reference-meta">${safe(source.edition)}<br>${safe(locator)}</div></div><article class="source-paper"><div class="document-number">${safe(source.org)} / TRECHO DA PUBLICAÇÃO</div><blockquote>${markedText(source.quote, source.mark)}</blockquote><div class="document-foot">Transcrição do trecho. Destaque editorial da Norte.<br>Texto consultado em 12 de outubro de 2026.</div></article>`;
  if (key === 'itar-export') { body += `<p class="helper">A aplicabilidade e as exceções precisam ser avaliadas por um responsável habilitado.</p>`; }
  const footer = `<div class="panel-footer"><button class="text-button" data-action="copy-source">${icon('copy')}Copiar endereço</button><button class="button secondary" data-action="download-source">${icon('download')}Baixar trecho</button></div>`;
  setPanel('source', panelHeading('Fonte do apontamento', 'Trecho consultado para este apontamento', 'source-back') + `<div class="panel-body">${body}</div>` + footer);
}
function openEditor(page = 0) {
  const req = getRequirement(state.selectedId);
  if (!req) { return; }
  if (!draft || draft.id !== req.id) { draft = structuredClone(req); }
  state.editPage = page;
  let body = '';
  if (page === 0) {
    body = `<label class="field"><span>Declaração do requisito</span><textarea data-edit="text" maxlength="1200" rows="4">${safe(draft.text)}</textarea></label><div class="field-grid">${selectField('subsystem', 'Subsistema', subsystemOptions, draft.subsystem)}${selectField('type', 'Tipo de requisito', typeOptions, draft.type)}</div>${selectField('method', 'Como será verificado', methodOptions, draft.method)}<label class="field"><span>Critério de aceitação</span><textarea data-edit="acceptance" maxlength="600" rows="3" placeholder="Qual resultado permite concluir que o requisito foi atendido?">${safe(draft.acceptance)}</textarea></label>`;
  } else if (page === 1) {
    body = `<div class="field-grid">${selectField('origin', 'Origem', originOptions, draft.origin)}${inputField('sourceVersion', 'Versão da origem', draft.sourceVersion, 'Ex. 0.1')}</div>${inputField('reference', 'Documento e seção de origem', draft.reference, 'Ex. CONOPS-AUR-001 · OBJ-01')}${inputField('parent', 'Objetivo ou requisito superior', draft.parent, 'Ex. MISS-001')}${selectField('owner', 'Responsável pela revisão', ownerOptions, draft.owner)}<label class="field"><span>Justificativa</span><textarea data-edit="rationale" maxlength="600" rows="2" placeholder="Por que este requisito é necessário?">${safe(draft.rationale)}</textarea></label>`;
  } else {
    body = `${inputField('architecture', 'Elemento da arquitetura', draft.architecture)}${inputField('test', 'Procedimento de verificação', draft.test)}${inputField('evidence', 'Evidência ou registro do resultado', draft.evidence)}<div class="field-grid">${selectField('level', 'Nível', ['Sistema', 'Subsistema', 'Componente', 'Processo'], draft.level)}${selectField('criticality', 'Criticidade', ['Normal', 'Alta', 'Crítica'], draft.criticality)}</div><p class="helper">O procedimento planejado e a evidência obtida são registros diferentes.</p>`;
  }
  const nextLabel = page === 0 ? 'Origem e responsável' : page === 1 ? 'Planejamento da verificação' : 'Voltar à redação';
  const footer = `<div class="panel-footer"><button class="text-button" data-action="edit-next">${nextLabel}${icon('chevron')}</button><button class="button primary" data-action="save-analyse">Salvar e analisar</button></div>`;
  const titles = ['Editar requisito', 'Origem do requisito', 'Planejamento da verificação'];
  setPanel('edit', panelHeading(titles[page], `${req.id} · ${page + 1} de 3`, 'detail-back') + `<div class="panel-body fields">${body}</div>` + footer);
}
function draftChanged() { const req = getRequirement(draft?.id); return req && Object.keys(draft).some(key => !['findings', 'history'].includes(key) && JSON.stringify(draft[key]) !== JSON.stringify(req[key])); }
function saveDraft(analyse = true) {
  if (!draft) { return; }
  const req = getRequirement(draft.id);
  if (!req || !draftChanged()) { if (analyse) { runAnalysis(false); } return; }
  const previous = structuredClone(req);
  for (const key of ['text', 'subsystem', 'type', 'method', 'acceptance', 'origin', 'sourceVersion', 'reference', 'parent', 'owner', 'rationale', 'architecture', 'test', 'evidence', 'level', 'criticality']) { req[key] = typeof draft[key] === 'string' ? draft[key].trim() : draft[key]; }
  req.version += 1;
  req.review = 'Não revisado';
  req.reviewAt = '';
  req.reviewer = '';
  req.reviewNote = '';
  req.history.push({at: now(), version: req.version, action: 'Requisito editado', previousText: previous.text});
  for (const row of requirements) { row.status = 'pending'; row.findings = []; }
  draft = structuredClone(req);
  updateSubsystems();
  if (analyse) { runAnalysis(false); } else { renderTable(); }
  message(`${req.id} salvo. A revisão da versão anterior foi desassociada.`);
}
function openReview() {
  const req = getRequirement(state.selectedId);
  const decisions = ['Em revisão', 'Ajustes solicitados', 'Redação revisada'];
  const value = decisions.includes(req.review) ? req.review : 'Em revisão';
  const body = `<div class="requirement-quote">${safe(req.text)}</div><label class="field"><span>Decisão da equipe</span><select id="review-decision">${optionList(decisions, value)}</select></label><label class="field"><span>Responsável</span><select id="review-owner">${optionList(ownerOptions, req.reviewer || req.owner)}</select></label><label class="field"><span>Observação opcional</span><textarea id="review-note" maxlength="600" rows="3" placeholder="Registre o motivo da decisão.">${safe(req.reviewNote)}</textarea></label><label class="check-line"><input type="checkbox" id="review-check">Conferi a redação, a origem e o critério de aceitação.</label><p class="helper">Este registro não é uma assinatura autenticada nem uma comprovação de atendimento.</p><p class="inline-error" id="review-error" role="status"></p>`;
  const footer = `<div class="panel-footer"><button class="button primary" data-action="save-review">Registrar decisão${icon('check')}</button></div>`;
  setPanel('review', panelHeading('Revisão da equipe', `${req.id} · versão ${req.version}`, 'detail-back') + `<div class="panel-body">${body}</div>` + footer);
}
function saveReview() {
  const req = getRequirement(state.selectedId);
  const decision = el('review-decision').value;
  if (el('review-owner').value === 'Não definido') { el('review-error').textContent = 'Selecione o responsável pela decisão.'; return; }
  if (decision === 'Redação revisada' && (!el('review-check').checked || req.status === 'pending')) { el('review-error').textContent = 'Analise a versão atual e confirme a conferência antes de registrar a redação como revisada.'; return; }
  req.review = decision;
  req.reviewer = el('review-owner').value;
  req.reviewNote = el('review-note').value.trim();
  req.reviewAt = now();
  req.history.push({at: req.reviewAt, version: req.version, action: decision, reviewer: req.reviewer});
  renderDetail();
  message(`${req.id} · decisão registrada sem remover os apontamentos.`);
}
function openSettings() {
  if (state.panel === 'edit') { saveDraft(false); }
  const check = (key, label) => `<label class="check-line"><input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}>${label}</label>`;
  const body = `<div class="settings-group"><h3>Referência de redação</h3><label class="field"><select id="setting-standard" aria-label="Referência de redação"><option value="NASA" ${settings.standard === 'NASA' ? 'selected' : ''}>NASA · Systems Engineering Handbook</option><option value="ECSS" ${settings.standard === 'ECSS' ? 'selected' : ''}>ECSS · Technical requirements specification</option></select></label><p class="settings-reference" id="standard-edition">${settings.standard === 'NASA' ? 'SP-2016-6105 Rev. 2 · Apêndices C e D' : 'ECSS-E-ST-10-06C · 6 de março de 2009'}</p></div><div class="settings-group"><h3>O que verificar</h3>${check('quality', 'Clareza e estrutura da redação')}${check('trace', 'Origem, versão e vínculo superior')}${check('verification', 'Método e critério de aceitação')}</div><div class="settings-group"><h3>Triagem regulatória</h3>${check('anatel', 'Anatel · Serviço de Radioamador')}${check('itar', 'ITAR · Acesso a dados técnicos')}</div><p class="helper">Critérios selecionados. Não representam cobertura integral nem adoção contratual de uma norma.</p>`;
  const footer = `<div class="panel-footer"><button class="button primary" data-action="apply-settings">Aplicar e analisar${icon('check')}</button></div>`;
  setPanel('settings', panelHeading('Configurar análise', 'Critérios usados nos apontamentos') + `<div class="panel-body">${body}</div>` + footer);
}
function applySettings() {
  const nextSettings = {...settings, standard: el('setting-standard').value};
  for (const input of document.querySelectorAll('[data-setting]')) { nextSettings[input.dataset.setting] = input.checked; }
  if (!nextSettings.quality && !nextSettings.trace && !nextSettings.verification && !nextSettings.anatel && !nextSettings.itar) { message('Selecione pelo menos uma verificação.', true); return; }
  settings = nextSettings;
  closePanel(true);
  showView('workspace');
  runAnalysis();
}
function openFilters() {
  if (state.panel === 'edit') { saveDraft(false); }
  const methods = `<option value="">Todos os métodos</option>` + optionList(methodOptions, state.filters.method);
  const origins = `<option value="">Todas as origens</option>` + optionList(originOptions, state.filters.origin);
  const subs = `<option value="">Todos os subsistemas</option>` + optionList(subsystemOptions, el('filter-subsystem').value);
  const body = `<label class="field"><span>Subsistema</span><select id="extra-subsystem">${subs}</select></label><label class="field"><span>Método de verificação</span><select id="extra-method">${methods}</select></label><label class="field"><span>Origem do requisito</span><select id="extra-origin">${origins}</select></label><p class="helper">Os filtros alteram apenas a visualização da tabela.</p>`;
  const footer = `<div class="panel-footer"><button class="text-button" data-action="clear-filters">Limpar filtros</button><button class="button primary" data-action="apply-filters">Aplicar filtros</button></div>`;
  setPanel('filters', panelHeading('Filtrar requisitos') + `<div class="panel-body">${body}</div>` + footer);
}
function clearFilters() { el('search').value = ''; el('filter-subsystem').value = ''; el('filter-status').value = ''; state.filters = {method: '', origin: ''}; state.page = 1; renderTable(); }
function addRequirement(event) {
  event.preventDefault();
  const text = el('new-requirement').value.trim();
  if (!text) { message('Escreva um requisito antes de adicionar.', true); el('new-requirement').focus(); return; }
  if (requirements.length >= 100) { message('O limite desta sessão é de 100 requisitos.', true); return; }
  const id = `AUR-${String(nextNumber).padStart(3, '0')}`;
  nextNumber += 1;
  requirements.push(createRequirement(id, text));
  el('new-requirement').value = '';
  clearFilters();
  updateSubsystems();
  state.selectedId = id;
  state.page = Math.ceil(requirements.length / state.pageSize);
  draft = null;
  openEditor();
  message(`${id} adicionado. Complete os critérios ou salve para analisar.`);
}
function exportRows() { return state.exportScope === 'filtered' ? filteredRows() : requirements; }
function openExport() {
  if (state.panel === 'edit') { saveDraft(false); }
  const rows = exportRows();
  const previewRows = rows.slice(0, 3).map(req => `<div><span>${safe(req.id)}</span><span>${safe(req.subsystem)}</span><span>${safe(req.status === 'regulatory' ? 'Regulatório' : statusText(req))}</span></div>`).join('');
  const body = `<label class="field"><span>O que incluir</span><select id="export-scope"><option value="all" ${state.exportScope === 'all' ? 'selected' : ''}>Todos os requisitos do projeto</option><option value="filtered" ${state.exportScope === 'filtered' ? 'selected' : ''}>Apenas os requisitos filtrados</option></select></label><div class="export-preview"><div class="pdf-brand">NORTE / MISSÃO AURORA</div><h3>Revisão de requisitos</h3><p>Matriz do projeto, apontamentos e fontes.</p><div class="mini-table"><div class="mini-head"><span>ID</span><span>SUBSISTEMA</span><span>RESULTADO</span></div>${previewRows}</div><p style="margin-top:13px">${rows.length} requisitos no relatório</p></div><div class="in-panel-actions"><button class="button secondary small" data-action="download-csv">${icon('download')}Matriz CSV</button><button class="button secondary small" data-action="download-project">${icon('download')}Projeto JSON</button></div>`;
  const footer = `<div class="panel-footer"><button class="button primary" data-action="download-report" ${rows.length ? '' : 'disabled'}>${icon('download')}Baixar relatório PDF</button></div>`;
  setPanel('export', panelHeading('Relatório do projeto', 'Documentos para baixar') + `<div class="panel-body">${body}</div>` + footer, state.panel !== 'export');
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function exportCSV() {
  const rows = exportRows();
  const columns = ['ID', 'Requisito', 'Subsistema', 'Tipo', 'Método', 'Origem', 'Documento', 'Versão da origem', 'Vínculo superior', 'Responsável', 'Critério de aceitação', 'Arquitetura', 'Procedimento', 'Evidência', 'Análise', 'Revisão', 'Apontamentos'];
  const keys = ['id', 'text', 'subsystem', 'type', 'method', 'origin', 'reference', 'sourceVersion', 'parent', 'owner', 'acceptance', 'architecture', 'test', 'evidence'];
  function csvCell(value) { let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) { text = "'" + text; } return '"' + text.replaceAll('"', '""') + '"'; }
  const data = [columns.map(csvCell).join(';')];
  for (const req of rows) { const values = [...keys.map(key => req[key]), statusText(req), req.review, req.findings.map(item => item.title).join(' | ')]; data.push(values.map(csvCell).join(';')); }
  downloadBlob(new Blob(['\ufeff' + data.join('\r\n')], {type: 'text/csv;charset=utf-8'}), 'aurora-matriz-requisitos.csv');
  message('Matriz CSV baixada.');
}
function exportProject() {
  const data = {schema: 'norte.requirements.v2', project: project, savedAt: now(), settings: settings, requirements: exportRows()};
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}), 'aurora-projeto.json');
  message('Projeto salvo em JSON.');
}
async function copySource() {
  const source = SOURCES[state.sourceKey];
  const text = source.url + (source.format === 'pdf' ? `#page=${source.pdfPage}` : '');
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); }
    else { const input = document.createElement('textarea'); input.value = text; input.style.position = 'fixed'; input.style.left = '-10000px'; document.body.appendChild(input); input.select(); const ok = document.execCommand('copy'); input.remove(); if (!ok) { throw new Error('copy'); } }
    message('Endereço da publicação copiado. Nenhuma outra página foi aberta.');
  } catch (error) {
    const body = el('side-panel').querySelector('.panel-body');
    if (!el('source-address')) { body.insertAdjacentHTML('beforeend', `<div class="source-url" id="source-address">${safe(text)}</div>`); }
    message('O navegador bloqueou a cópia. O endereço está disponível no painel.', true);
  }
}
function openAbout() {
  if (state.view === 'home') { document.getElementById('technical-note').open = true; document.getElementById('technical-note').scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
  if (state.panel === 'edit') { saveDraft(false); }
  const body = `<h3 class="panel-title">O que está sendo analisado</h3><div class="about-copy"><p>A análise usa <strong>checagens de texto e preenchimento</strong>, com referências selecionadas de NASA, ECSS, Anatel e ITAR. Não há um modelo de IA interpretando o projeto nesta versão.</p><p>“Sem alertas” significa que os padrões previstos não foram encontrados. Não é uma aprovação técnica, jurídica ou de segurança.</p><p>Os requisitos do projeto Aurora são um cenário conceitual. As publicações citadas são reais e o destaque no trecho é editorial.</p><p>Os textos ficam na memória deste navegador. Não envie dados restritos. A contratação é confirmada pela equipe após a solicitação. O pagamento é combinado depois dessa confirmação.</p></div>`;
  const footer = `<div class="panel-footer"><button class="button secondary" data-action="close-panel">Voltar</button></div>`;
  setPanel('about', panelHeading('Sobre a análise', 'Escopo e funcionamento') + `<div class="panel-body">${body}</div>` + footer);
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  el('theme-button').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  el('theme-button').setAttribute('aria-label', `Ativar tema ${theme === 'dark' ? 'claro' : 'escuro'}`);
  el('theme-button').title = `Ativar tema ${theme === 'dark' ? 'claro' : 'escuro'}`;
  try { localStorage.setItem('norte.theme.v2', theme); } catch (error) { /* O tema funciona sem armazenamento. */ }
}
function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) { return; }
  const action = button.dataset.action;
  if (action === 'home') { if (state.panel === 'edit') { saveDraft(false); } closePanel(true); showView('home'); }
  else if (action === 'workspace') { if (state.panel === 'edit') { saveDraft(false); } closePanel(true); showView('workspace'); renderTable(); }
  else if (action === 'theme') { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }
  else if (action === 'detail' || action === 'preview') { openDetail(button.dataset.id); }
  else if (action === 'home-source') { state.selectedId = 'AUR-001'; openSource('nasa-acceptance', 'home'); }
  else if (action === 'source') { openSource(button.dataset.source); }
  else if (action === 'source-back') { if (state.sourceBack === 'home') { closePanel(true); } else { renderDetail(); } }
  else if (action === 'detail-back') { if (state.panel === 'edit') { saveDraft(false); } renderDetail(); }
  else if (action === 'copy-source') { copySource(); }
  else if (action === 'close-panel') { closePanel(); }
  else if (action === 'discard-close') { draft = null; closePanel(true); }
  else if (action === 'save-close') { saveDraft(false); closePanel(true); }
  else if (action === 'finding-prev') { state.finding -= 1; renderDetail(); }
  else if (action === 'finding-next') { state.finding += 1; renderDetail(); }
  else if (action === 'edit') { openEditor(); }
  else if (action === 'edit-next') { openEditor((state.editPage + 1) % 3); }
  else if (action === 'save-analyse') { if (!draft.text.trim()) { message('Escreva a declaração antes de salvar.', true); return; } saveDraft(true); renderDetail(); }
  else if (action === 'review') { openReview(); }
  else if (action === 'save-review') { saveReview(); }
  else if (action === 'settings') { openSettings(); }
  else if (action === 'apply-settings') { applySettings(); }
  else if (action === 'analyse-all') { if (state.panel === 'edit') { saveDraft(false); } runAnalysis(); }
  else if (action === 'page-prev') { state.page -= 1; renderTable(); }
  else if (action === 'page-next') { state.page += 1; renderTable(); }
  else if (action === 'filters') { openFilters(); }
  else if (action === 'clear-filters') { clearFilters(); if (state.panel === 'filters') { openFilters(); } }
  else if (action === 'apply-filters') { state.filters.method = el('extra-method').value; state.filters.origin = el('extra-origin').value; el('filter-subsystem').value = el('extra-subsystem').value; state.page = 1; closePanel(true); renderTable(); }
  else if (action === 'export') { openExport(); }
  else if (action === 'download-report') { downloadBlob(buildReportPDF(exportRows()), 'aurora-relatorio-requisitos.pdf'); message('Relatório PDF gerado com a versão atual dos requisitos.'); }
  else if (action === 'download-csv') { exportCSV(); }
  else if (action === 'download-project') { exportProject(); }
  else if (action === 'order') { goConfigure(); }
  else if (action === 'about') { openAbout(); }
}
function handleChange(event) {
  const input = event.target;
  if (input.matches('[data-edit]') && draft) { draft[input.dataset.edit] = input.value; }
  if (input.id === 'filter-subsystem' || input.id === 'filter-status') { state.page = 1; renderTable(); }
  if (input.id === 'export-scope') { state.exportScope = input.value; openExport(); }
  if (input.id === 'setting-standard') { el('standard-edition').textContent = input.value === 'NASA' ? 'SP-2016-6105 Rev. 2 · Apêndices C e D' : 'ECSS-E-ST-10-06C · 6 de março de 2009'; }
}
function initialise() {
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', event => { if (event.target.matches('[data-edit]') && draft) { draft[event.target.dataset.edit] = event.target.value; } });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.panel) { closePanel(); } if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('requirement-row')) { event.preventDefault(); openDetail(event.target.dataset.id); } });
  el('quick-add').addEventListener('submit', addRequirement);
  el('search').addEventListener('input', () => { state.page = 1; renderTable(); });
  updateSubsystems();
  runAnalysis(false);
  let theme = 'light';
  try { theme = localStorage.getItem('norte.theme.v2') === 'dark' ? 'dark' : 'light'; } catch (error) { /* A preferência é opcional. */ }
  setTheme(theme);
  tableObserver = new ResizeObserver(fitTable);
  tableObserver.observe(el('table-area'));
  window.addEventListener('resize', fitTable);
}
initialise();
