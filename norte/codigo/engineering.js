// Navegação, documentos e vínculos usam o mesmo estado de projeto.
let verificationDraft = null;
let verificationCounter = 5;
let sourceReturn = null;
let docReturn = null;
let panelScroll = 0;
const requirementEditorKeys = ['text', 'subsystem', 'type', 'method', 'acceptance', 'origin', 'reference', 'sourceVersion', 'parent', 'owner', 'rationale', 'architecture', 'level', 'criticality', 'condition', 'limit'];
function engDate(value) { if (!value) { return 'A definir'; } return new Date(value + 'T12:00:00').toLocaleDateString('pt-BR'); }
function addDays(value, days) { const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + Number(days)); return date.toISOString().slice(0, 10); }
function labelReview(id) { return id === 'MDR-SDR' ? 'MDR/SDR' : id; }
function activeReviews() { return scheduleList().filter(review => review.active); }
function scheduleList() {
  if (!engineering.schedules[engineering.profile]) { engineering.schedules[engineering.profile] = REVIEW_PROFILES[engineering.profile].map(review => ({...review, date: addDays(engineering.start, Math.round(review.week * 7)), prepDays: engineering.prepDays, closeDays: engineering.closeDays, reason: '', changed: false})); }
  return engineering.schedules[engineering.profile];
}
function linksForRequirement(id) { return verifications.filter(item => item.requirementIds.includes(id)); }
function verificationById(id) { return verifications.find(item => item.id === id); }
function docKindLabel(kind) { return {reference:'Exigido pela referência adotada', norm: 'Aplicação a confirmar', company: 'Exigido pela empresa', optional: 'Opcional'}[kind] || 'Opcional'; }
function docBadge(kind) { return `<span class="eng-doc-badge ${safe(kind)}">${safe(docKindLabel(kind))}</span>${kind === 'norm' ? '<span class="applicability-help" tabindex="0" role="note" aria-label="Depende da adoção da referência, contrato e adaptação registrada. Exigência de conteúdo não implica arquivo separado.">ⓘ</span>' : ''}`; }
function changeEngineering(action) { engineering.version += 1; engineering.changes.push({at: now(), action: action}); }
function projectDocuments() {
  const docs = [];
  const profile = engineering.profile.toLowerCase();
  for (const def of DOCUMENT_DEFINITIONS) {
    const map = def[profile] || def.all;
    if (!map) { continue; }
    docs.push({...def, ...map, id: def.id, code: `${project.code}-${map.code || def.id}-001`, title: map.title || def.title, kind: map.kind || def.kind, flow: 'input', state: 'Rascunho'});
  }
  for (const review of scheduleList()) {
    const source = engineering.profile === 'NASA' ? 'nasaReviews' : 'ecssReviews';
    const isNASA = engineering.profile === 'NASA';
    const prefix = labelReview(review.id);
    docs.push({id: 'PROC-' + review.id, code: project.code + '-PROC-' + review.id, title: 'Preparação da ' + prefix, kind: isNASA ? 'company' : 'norm', content: 'review-plan', source: source, clause: isNASA ? '5.2.1.1; formato separado adotado pela equipe' : '5.3.2.a; Anexo A · Review procedure', reviews: [review.id], flow: 'input', maturity: 'Critérios, agenda e pacote acordados antes da revisão', state: 'Rascunho'});
    docs.push({id: 'ATA-' + review.id, code: project.code + '-ATA-' + review.id, title: 'Registro e ações da ' + prefix, kind: 'norm', content: 'review-record', source: source, clause: isNASA ? '5.2.3.1 · Conclusão da revisão' : '5.3.4.d, 5.5.6.b(6) e 5.6.c; Anexos B, C e D', reviews: [review.id], flow: 'output', maturity: 'Preencher após a revisão; aprovação pela autoridade competente', state: 'A preencher'});
  }
  return docs.concat(engineering.customDocs).map(item => { const doc = {...item}; doc.pendingReviews = doc.reviews.filter(id => !scheduleList().some(review => review.id === id && review.active)); if (doc.pendingReviews.length) { doc.state += ' · marco pendente de reatribuição'; } const edition = SOURCES[doc.source]?.edition || ''; const id = edition.includes('6105') ? 'nasa-handbook-2016' : edition.includes('7123') ? 'npr-7123-1d' : edition.includes('10-06') ? 'ecss-10-06-2009' : edition.includes('10-02') ? 'ecss-10-02-2018' : edition.includes('M-ST-10-01') ? 'ecss-m-10-01-2008' : 'ecss-10-2017'; if (doc.kind === 'norm' && engineering.applicability?.[id]?.decision === 'confirmed') { doc.kind = 'reference'; } return doc; });
}
function currentDocuments(ignoreKind = false) {
  return projectDocuments().filter(doc => (!engineering.docReview || doc.reviews.includes(engineering.docReview)) && (ignoreKind || !engineering.docKind || doc.kind === engineering.docKind) && (!engineering.docFlow || doc.flow === engineering.docFlow) && (!engineering.docQuery || norm(doc.title + ' ' + doc.code + ' ' + doc.clause).includes(norm(engineering.docQuery))));
}
function currentDocument(id) { return projectDocuments().find(item => item.id === id); }
function requirementLinks(items) { return items.map(id => `<button data-engine="linked-requirement" data-id="${safe(id)}">${safe(id)}</button>`).join(''); }
function moduleButton(module, label, name = 'arrow') { return `<button class="text-button" data-engine="module" data-module="${module}">${safe(label)}${icon(name)}</button>`; }
function showModule(module) {
  if (state.panel === 'edit') { saveDraft(false); }
  closePanel(true);
  hidePopovers();
  engineering.module = module;
  showView('workspace');
  for (const name of ['requirements', 'verification', 'documents', 'schedule']) { el((name === 'requirements' ? 'req' : name) + '-module').hidden = name !== module; }
  document.querySelectorAll('.eng-nav button').forEach(button => { if (button.dataset.module === module) { button.setAttribute('aria-current', 'page'); } else { button.removeAttribute('aria-current'); } });
  if (module === 'requirements') { renderTable(); }
  if (module === 'verification') { renderVerifications(); }
  if (module === 'documents') { renderDocuments(); }
  if (module === 'schedule') { renderSchedule(); }
  message(`${project.name} · ${engineering.profile}`);
}
function showView(view) { hidePopovers(); originalShowView(view); }
function fitTable() { /* A lista tem rolagem própria, sem calcular páginas. */ }
function renderTable() {
  const rows = filteredRows();
  const area = el('table-area');
  const scroll = area.scrollTop;
  el('rows').innerHTML = rows.map(req => {
    const count = typeof verifications === 'undefined' ? 0 : linksForRequirement(req.id).length;
    const selected = req.id === state.selectedId && ['detail', 'source', 'edit', 'review'].includes(state.panel);
    const method = req.method === 'Não definido' ? 'A definir' : req.method;
    const associated = count ? `<button class="eng-count-link" data-engine="requirement-verifications" data-id="${safe(req.id)}">${count} ${count === 1 ? 'atividade' : 'atividades'}</button>` : '';
    return `<tr class="requirement-row ${selected ? 'selected' : ''}" data-action="detail" data-id="${safe(req.id)}" tabindex="0" aria-label="Revisar ${safe(req.id)}"><td class="row-id mono">${safe(req.id)}</td><td class="row-text">${safe(req.text)}</td><td class="eng-muted">${safe(req.subsystem)}</td><td><div class="eng-method-stack"><span class="method-tag">${safe(method)}</span>${associated}</div></td><td class="eng-muted">${safe(req.origin)}</td><td><div class="row-action"><span class="badge ${safe(req.status)}">${safe(statusText(req))}</span>${icon('chevron')}</div></td></tr>`;
  }).join('');
  el('empty-state').hidden = rows.length > 0;
  const withFindings = requirements.filter(req => req.findings.length).length;
  el('table-summary').textContent = `${requirements.length} requisitos · ${withFindings} com apontamentos`;
  el('page-count').textContent = rows.length === requirements.length ? `${rows.length} requisitos` : `${rows.length} de ${requirements.length} requisitos`;
  el('settings-summary').textContent = [settings.standard, settings.anatel ? 'Anatel' : '', settings.itar ? 'ITAR' : ''].filter(Boolean).join(' · ');
  area.scrollTop = scroll;
}
function setPanel(kind, content, focus = true) {
  const panel = el('side-panel');
  const wasOpen = !panel.hidden;
  if (!wasOpen) { lastFocus = document.activeElement; }
  state.panel = kind;
  panel.dataset.kind = kind;
  panel.hidden = false;
  panel.innerHTML = content;
  panel.setAttribute('aria-labelledby', 'panel-title');
  el('shell').classList.add('panel-docked');
  renderTable();
  if (focus) {
    el('panel-title')?.focus({preventScroll: true});
    if (matchMedia('(max-width:800px)').matches) { requestAnimationFrame(() => { if (!panel.hidden) { const shell = el('shell'); shell.scrollTo({top:shell.scrollTop + panel.getBoundingClientRect().top - shell.getBoundingClientRect().top,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth'}); } }); }
  }
}
function closePanel(force = false) {
  if (state.panel === 'edit' && draft && draftChanged() && !force) {
    const body = '<div class="panel-body"><p class="eng-body-text">Há alterações neste requisito. Salve ou descarte antes de fechar.</p></div>';
    const footer = '<div class="panel-footer"><button class="button secondary" data-action="discard-close">Descartar</button><button class="button primary" data-action="save-close">Salvar e fechar</button></div>';
    setPanel('unsaved', panelHeading('Salvar alterações?', state.selectedId) + body + footer);
    return;
  }
  const wasReview = state.panel === 'lifecycle-review';
  const reviewFocus = wasReview ? {id:lifecycle.selectedId,profile:lifecycle.selectedProfile || engineering.profile} : null;
  state.panel = '';
  el('side-panel').hidden = true;
  el('side-panel').innerHTML = '';
  el('shell').classList.remove('panel-docked');
  renderTable();
  if (wasReview) { lifecycle.selectedId = ''; lifecycle.selectedProfile = ''; if (engineering.module === 'schedule') { renderSchedule(); } }
  if (reviewFocus) { lastFocus = [...document.querySelectorAll('.life-marker')].find(node => node.dataset.id === reviewFocus.id && node.dataset.profile === reviewFocus.profile); }
  else if (lastFocus?.dataset.action === 'detail') { lastFocus = [...document.querySelectorAll('.requirement-row')].find(node => node.dataset.id === lastFocus.dataset.id); }
  if (lastFocus && document.contains(lastFocus)) { lastFocus.focus({preventScroll: true}); }
}
function openDetail(id) {
  if (!getRequirement(id)) { return; }
  if (state.panel === 'edit') { saveDraft(false); }
  state.selectedId = id;
  draft = null;
  if (state.view !== 'workspace') { showModule('requirements'); }
  renderDetail();
}
function renderDetail() {
  const req = getRequirement(state.selectedId);
  if (!req) { closePanel(true); return; }
  const linked = linksForRequirement(req.id);
  let body = `<div class="requirement-quote">${markedText(req.text, req.findings.find(item => item.match)?.match)}</div><div class="requirement-meta"><span class="badge ${safe(req.status)}">${safe(statusText(req))}</span><span class="quiet">${safe(req.method)}</span></div>`;
  body += `<div class="eng-small-heading">Verificações associadas</div><div class="eng-links" id="requirement-verification-links">${linked.map(item => `<button class="eng-linked" data-engine="verification-detail" data-id="${safe(item.id)}">${icon('check')}${safe(item.id)} · ${safe(item.method)}</button>`).join('')}<button class="eng-linked" data-engine="link-verifications" data-id="${safe(req.id)}">${icon('plus')}Associar</button></div>`;
  if (linked.length === 0) { body += '<p class="helper">Nenhuma atividade vinculada a este requisito.</p>'; }
  body += `<div class="eng-small-heading">Apontamentos ${req.findings.length ? '· ' + req.findings.length : ''}</div><div class="eng-finding-list">`;
  for (const item of req.findings) {
    const source = SOURCES[item.source];
    body += `<article class="finding-card ${item.category === 'Regulatório' ? 'regulatory' : ''}"><span class="category">${safe(item.category)}</span><h3>${safe(item.title)}</h3><p>${safe(item.message)}</p><button class="source-card" data-action="source" data-source="${safe(item.source)}">${icon('file')}<span><strong>${safe(source.org)} · Motivo do apontamento</strong><small>${safe(source.section)}</small></span>${icon('chevron')}</button></article>`;
  }
  if (!req.findings.length) { body += `<article class="finding-card"><h3>${req.status === 'pending' ? 'Ainda não analisado' : 'Nenhum alerta nas checagens'}</h3><p>${req.status === 'pending' ? 'Use Analisar para conferir a versão atual.' : 'Este resultado não representa a execução dos testes ou a aprovação do produto.'}</p></article>`; }
  body += `</div><div class="eng-section-separator"><div class="eng-content-label">Critério de aceitação</div><p class="eng-body-text">${safe(req.acceptance || 'Ainda não definido.')}</p><div class="eng-content-label">Origem</div><p class="eng-body-text">${safe(req.reference || 'Referência a definir')}${req.sourceVersion ? ' · v' + safe(req.sourceVersion) : ''}</p><div class="review-line">${icon('pencil')}<span>${safe(req.review)}${req.reviewAt ? ' · ' + dateLabel(req.reviewAt) : ''}</span></div></div>`;
  const footer = `<div class="panel-footer"><button class="button secondary" data-action="review">Registrar revisão</button><button class="button primary" data-action="edit">${icon('pencil')}Editar requisito</button></div>`;
  setPanel('detail', panelHeading(req.id, `${req.subsystem} · versão ${req.version}`) + `<div class="panel-body">${body}</div>` + footer);
}
function openSource(key, back = 'detail') {
  if (state.panel !== 'source') { sourceReturn = {panel: state.panel, id: engineering.docId, verification: verificationDraft?.id, selected: state.selectedId, scroll: el('side-panel').querySelector('.panel-body')?.scrollTop || 0}; }
  originalSource(key, back);
  if (sourceReturn?.panel === 'document') { el('panel-title').textContent = 'Referência do documento'; el('side-panel').querySelector('.panel-subtitle').textContent = 'Origem e aplicabilidade da entrega'; }
  if (sourceReturn?.panel === 'verification') { el('panel-title').textContent = 'Referência de verificação'; el('side-panel').querySelector('.panel-subtitle').textContent = 'Planejamento, controle e evidência'; }
  const source = SOURCES[key];
  if (source && !source.quote) { const paper = el('side-panel').querySelector('.source-paper'); if (paper) { paper.innerHTML = `<div class="document-number">${safe(source.org)} / REFERÊNCIA CONSULTADA</div><p class="eng-body-text">${safe(source.explanation)}</p><div class="document-foot">Síntese da Norte. Consulte a seção indicada na publicação.</div>`; } }
  const paper = el('side-panel').querySelector('.source-paper');
  if (paper && source?.explanation && ENGINEERING_SOURCES[key]) { paper.insertAdjacentHTML('afterend', `<p class="eng-note">${safe(source.explanation)}</p>`); }
}
function returnFromSource() {
  if (sourceReturn?.panel === 'document') { openDocument(sourceReturn.id); }
  else if (sourceReturn?.panel === 'verification') { openVerification(sourceReturn.verification); }
  else if (sourceReturn?.panel === 'detail') { state.selectedId = sourceReturn.selected; renderDetail(); }
  else if (sourceReturn?.panel === 'lifecycle-review') { renderLifeReview(); }
  else { closePanel(true); }
  const body = el('side-panel').querySelector('.panel-body');
  if (body) { body.scrollTop = sourceReturn?.scroll || 0; }
}
function hidePopovers(except = '') {
  document.querySelectorAll('.eng-popover').forEach(panel => { if (panel.id !== except) { panel.hidden = true; } });
  if (except !== 'analysis-popover') { el('analysis-config-button')?.setAttribute('aria-expanded', 'false'); }
  if (except !== 'requirement-popover') { el('add-req-button')?.setAttribute('aria-expanded', 'false'); }
}
function popupHead(title) { return `<header><h2>${safe(title)}</h2><button class="icon-button" data-engine="hide-popovers" aria-label="Fechar opções">${icon('close')}</button></header>`; }
function openSettings() {
  const panel = el('analysis-popover');
  const open = panel.hidden;
  hidePopovers();
  if (!open) { return; }
  const choice = (key, title, desc) => `<label class="eng-choice"><input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}><span><strong>${title}</strong><small>${desc}</small></span></label>`;
  let body = popupHead('O que analisar');
  body += `<label class="field"><span>Referência para a redação</span><select id="setting-standard">${optionList(['NASA', 'ECSS'], settings.standard)}</select></label><p id="standard-edition" class="helper" hidden>${settings.standard === 'NASA' ? 'Systems Engineering Handbook · Apêndices C e D' : 'ECSS-E-ST-10-06C · Requisitos técnicos'}</p>`;
  body += choice('quality', 'Clareza da redação', 'Expressões vagas, obrigações e duplicidades.');
  body += choice('trace', 'Origem e rastreabilidade', 'Documento, versão e requisito superior.');
  body += choice('verification', 'Como será verificado', 'Método e critério de aceitação preenchidos.');
  body += choice('anatel', 'Anatel', 'Triagem do uso do Serviço de Radioamador.');
  body += choice('itar', 'ITAR', 'Triagem do acesso a dados técnicos.');
  body += '<p id="settings-error" class="eng-inline-error" role="status"></p><div class="eng-popover-footer"><button class="text-button" data-engine="hide-popovers">Cancelar</button><button class="button primary" data-action="apply-settings">Aplicar e analisar</button></div>';
  panel.innerHTML = body;
  panel.hidden = false;
  el('analysis-config-button').setAttribute('aria-expanded', 'true');
}
function applySettings() {
  const next = {...settings, standard: el('setting-standard').value};
  el('analysis-popover').querySelectorAll('[data-setting]').forEach(input => { next[input.dataset.setting] = input.checked; });
  if (![next.quality, next.trace, next.verification, next.anatel, next.itar].some(Boolean)) { el('settings-error').textContent = 'Selecione pelo menos uma checagem.'; return; }
  settings = next;
  hidePopovers();
  runAnalysis();
  changeEngineering('Critérios de análise atualizados');
}
function openFilters() {
  const panel = el('filters-popover');
  const open = panel.hidden;
  hidePopovers();
  if (!open) { return; }
  const methods = '<option value="">Todos os métodos</option>' + optionList(methodOptions, state.filters.method);
  const origins = '<option value="">Todas as origens</option>' + optionList(originOptions, state.filters.origin);
  panel.innerHTML = popupHead('Mais filtros') + `<label class="field"><span>Método</span><select id="eng-filter-method">${methods}</select></label><label class="field"><span>Origem</span><select id="eng-filter-origin">${origins}</select></label><div class="eng-popover-footer"><button class="text-button" data-action="clear-filters">Limpar</button><button class="button primary" data-engine="apply-filters">Aplicar</button></div>`;
  panel.hidden = false;
}
function addReqForm() {
  const panel = el('requirement-popover');
  const open = panel.hidden;
  hidePopovers();
  if (!open) { return; }
  let body = popupHead('Adicionar requisito');
  body += `<form id="eng-new-requirement"><label class="field"><span>Identificador único (opcional; gerado se vazio)</span><input name="identifier" maxlength="60" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,59}"></label><label class="field"><span>Requisito</span><textarea name="text" rows="3" maxlength="1200" placeholder="O sistema deve…"></textarea></label><div class="field-grid"><label class="field"><span>Subsistema</span><select name="subsystem">${optionList(subsystemOptions.filter(value => value !== 'Não definido'), 'Sistema')}</select></label><label class="field"><span>Tipo</span><select name="type">${optionList(typeOptions, 'Funcional')}</select></label></div><div class="field-grid"><label class="field"><span>Método de verificação</span><select name="method">${optionList(methodOptions, 'Não definido')}</select></label><label class="field"><span>Origem</span><select name="origin">${optionList(originOptions, 'Projeto')}</select></label></div><details class="eng-details"><summary>Critério e rastreabilidade</summary><label class="field"><span>Critério de aceitação</span><textarea name="acceptance" rows="2" maxlength="600" placeholder="Qual resultado comprova o atendimento?"></textarea></label><label class="field"><span>Documento e seção de origem</span><input name="reference" maxlength="250" placeholder="Identificador do documento e seção"></label><div class="field-grid"><label class="field"><span>Versão da origem</span><input name="sourceVersion" maxlength="50"></label><label class="field"><span>Requisito superior</span><input name="parent" maxlength="100"></label></div><label class="field"><span>Responsável</span><select name="owner">${optionList(ownerOptions, 'Engenharia de sistemas')}</select></label></details><p class="eng-inline-error" id="new-requirement-error" role="status"></p><div class="eng-popover-footer"><button type="button" class="text-button" data-engine="hide-popovers">Cancelar</button><button class="button primary" type="submit">Adicionar requisito</button></div></form>`;
  panel.innerHTML = body;
  panel.hidden = false;
  el('add-req-button').setAttribute('aria-expanded', 'true');
  panel.querySelector('textarea').focus({preventScroll: true});
}
function saveNewRequirement(event) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const text = String(data.get('text') || '').trim();

  if (requirements.length >= (platform.current ? platform.entitlements.limits.requirements : 200)) { el('new-requirement-error').textContent = 'Limite de novos requisitos atingido. Você pode corrigir ou reduzir os existentes.'; return; }
  const id = String(data.get('identifier') || `${project.code}-${String(nextNumber).padStart(3, '0')}`).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(id) || getRequirement(id)) { el('new-requirement-error').textContent = 'Use um identificador único, com letras, números, hífen ou sublinhado.'; return; }
  nextNumber += 1;
  const req = createRequirement(id, text);
  for (const [key, value] of data.entries()) { if (key in req) { req[key] = String(value).trim(); } }
  if (req.owner === 'Não definido') { req.owner = 'Engenharia de sistemas'; }
  requirements.push(req);
  hidePopovers();
  clearFilters();
  updateSubsystems();
  renderTable();
  el('table-area').scrollTop = el('table-area').scrollHeight;
  changeEngineering('Adicionado ' + id);
  message(`${id} adicionado. Use Analisar para conferir a redação.`);
}
function openEditor() {
  const req = getRequirement(state.selectedId);
  if (!req) { return; }
  if (!draft || draft.id !== req.id) { draft = structuredClone(req); }
  let body = `<label class="field"><span>Declaração do requisito</span><textarea data-edit="text" maxlength="1200" rows="4">${safe(draft.text)}</textarea></label><div class="field-grid">${selectField('subsystem', 'Subsistema', subsystemOptions, draft.subsystem)}${selectField('type', 'Tipo', typeOptions, draft.type)}</div><div class="field-grid">${selectField('method', 'Método de verificação', methodOptions, draft.method)}${selectField('origin', 'Origem', originOptions, draft.origin)}</div><label class="field"><span>Critério de aceitação</span><textarea data-edit="acceptance" maxlength="600" rows="3">${safe(draft.acceptance)}</textarea></label>`;
  body += `<details class="eng-details"><summary>Origem e responsável</summary>${inputField('reference', 'Documento e seção de origem', draft.reference)}<div class="field-grid">${inputField('sourceVersion', 'Versão da origem', draft.sourceVersion)}${inputField('parent', 'Requisito superior', draft.parent)}</div>${selectField('owner', 'Responsável', ownerOptions, draft.owner)}<label class="field"><span>Justificativa</span><textarea data-edit="rationale" rows="3" maxlength="600">${safe(draft.rationale)}</textarea></label>${inputField('architecture', 'Elemento da arquitetura', draft.architecture)}${inputField('condition', 'Condição aplicável', draft.condition)}${inputField('limit', 'Limite e unidade, quando aplicáveis', draft.limit)}</details>`;
  const footer = '<div class="panel-footer"><button class="button secondary" data-action="detail-back">Voltar</button><button class="button primary" data-action="save-analyse">Salvar e analisar</button></div>';
  setPanel('edit', panelHeading('Editar ' + req.id, 'Campos do requisito') + `<div class="panel-body eng-form">${body}</div>` + footer);
}
function saveDraft(analyse = false) {
  const changed = draft && draftChanged();
  const id = draft?.id;
  const beforeVersion = id ? getRequirement(id)?.version : 0;
  originalSaveDraft(analyse);
  if (changed && getRequirement(id)?.version !== beforeVersion) {
    for (const item of linksForRequirement(id)) { if (item.status === 'Concluída') { item.stale = true; item.note = 'Requisito alterado. Reavaliar a evidência da versão anterior.'; } }
    changeEngineering('Atualizado ' + id);
  }
}

// Cada vínculo existe uma vez e aparece nos dois lados.
function verificationStatus(item) {
  const cls = item.status === 'Bloqueada' ? 'blocked' : item.status === 'Concluída' ? 'done' : item.status === 'Em preparação' ? 'running' : '';
  return `<span class="eng-ver-status ${cls}">${safe(item.status)}</span>`;
}
function renderVerifications() {
  const module = el('verification-module');
  module.innerHTML = `<div class="workspace-head"><div><h1>Verificação</h1><p class="eng-subtitle">Atividades e evidências ligadas aos requisitos.</p></div><div class="workspace-actions"><button class="button primary" data-engine="verification-new">${icon('plus')}Adicionar verificação</button></div></div><div class="filterbar"><label class="search-field">${icon('search')}<input id="verification-search" type="search" placeholder="Buscar atividade ou requisito" value="${safe(engineering.verQuery || '')}" aria-label="Buscar verificação"></label><select id="verification-method" aria-label="Filtrar método"><option value="">Todos os métodos</option>${optionList(methodOptions.filter(method => method !== 'Não definido'), engineering.verMethod || '')}</select><select id="verification-status" aria-label="Filtrar situação"><option value="">Todas as situações</option>${optionList(['Planejada', 'Em preparação', 'Bloqueada', 'Concluída'], engineering.verStatus || '')}</select></div><div class="eng-summary-line"><span id="verification-summary"></span><span>Um requisito pode ter mais de uma verificação</span></div><div class="eng-scroll eng-table-wrap"><table class="eng-table"><colgroup><col style="width:95px"><col><col style="width:115px"><col style="width:180px"><col style="width:110px"><col style="width:155px"></colgroup><thead><tr><th>ID</th><th>Atividade</th><th>Método</th><th>Requisitos</th><th>Revisão</th><th>Situação</th></tr></thead><tbody id="verification-rows"></tbody></table><div id="verification-empty" class="eng-blank" hidden>Nenhuma atividade encontrada.</div></div><div class="eng-table-end"><span>Selecione uma atividade para ver critérios e evidências</span>${moduleButton('documents', 'Documentos de verificação')}</div>`;
  renderVerificationRows();
}
function renderVerificationRows() {
  const rows = verifications.filter(item => (!engineering.verQuery || norm(item.title + ' ' + item.id + ' ' + item.requirementIds.join(' ')).includes(norm(engineering.verQuery))) && (!engineering.verMethod || item.method === engineering.verMethod) && (!engineering.verStatus || item.status === engineering.verStatus));
  el('verification-rows').innerHTML = rows.map(item => `<tr data-engine="verification-detail" data-id="${safe(item.id)}" tabindex="0" aria-label="Abrir ${safe(item.id)}"><td class="mono">${safe(item.id)}</td><td><span class="eng-cell-title">${safe(item.title)}</span><span class="eng-cell-subtitle">${safe(item.subsystem)} · ${safe(item.owner)}</span></td><td><span class="method-tag">${safe(item.method)}</span></td><td><div class="eng-mini-links">${requirementLinks(item.requirementIds)}</div></td><td><span class="eng-doc-review">${safe(labelReview(item.review))}</span></td><td>${verificationStatus(item)}</td></tr>`).join('');
  el('verification-empty').hidden = rows.length > 0;
  const linked = requirements.filter(req => linksForRequirement(req.id).length > 0).length;
  el('verification-summary').textContent = `${rows.length} atividades · ${linked} de ${requirements.length} requisitos com vínculo`;
}
function openVerification(id) {
  const item = verificationById(id);
  if (!item) { return; }
  verificationDraft = structuredClone(item);
  let body = `<h3 class="eng-panel-title">${safe(item.title)}</h3>${verificationStatus(item)}<dl class="eng-detail-grid"><div><dt>Método</dt><dd>${safe(item.method)}</dd></div><div><dt>Revisão</dt><dd>${safe(labelReview(item.review))}</dd></div><div><dt>Subsistema</dt><dd>${safe(item.subsystem)}</dd></div><div><dt>Responsável</dt><dd>${safe(item.owner)}</dd></div></dl><div class="eng-small-heading">Requisitos associados</div><div class="eng-mini-links eng-large-links">${requirementLinks(item.requirementIds)}</div>`;
  for (const [key, title] of [['criteria', 'Critério de aceitação'], ['procedure', 'Procedimento previsto'], ['conditions', 'Condições e configuração'], ['result', 'Resultado'], ['evidence', 'Evidência'], ['note', 'Observações']]) { if (item[key] || key === 'evidence') { body += `<div class="eng-content-label">${title}</div><p class="eng-body-text">${safe(item[key] || 'Ainda não registrada.')}</p>`; } }
  if (engineering.profile === 'ECSS' && item.method === 'Demonstração') { body += '<p class="eng-note">Na ECSS-E-ST-10-02C, a demonstração está incluída no método Teste. Confirme a classificação no plano do projeto.</p>'; }
  const source = engineering.profile === 'NASA' ? 'nasaVerification' : 'ecssVerification';
  body += `<button class="eng-source-button" data-action="source" data-source="${source}">${icon('file')}Critérios do plano de verificação${icon('chevron')}</button>`;
  const footer = `<div class="panel-footer"><button class="button secondary" data-engine="verification-edit" data-id="${safe(item.id)}">Associar requisitos</button><button class="button primary" data-engine="verification-edit" data-id="${safe(item.id)}">${icon('pencil')}Editar atividade</button></div>`;
  setPanel('verification', panelHeading(item.id, 'Verificação do sistema') + `<div class="panel-body">${body}</div>` + footer);
}
function formSelect(name, title, options, selected) { return `<label class="field"><span>${safe(title)}</span><select name="${safe(name)}">${optionList(options, selected)}</select></label>`; }
function formText(name, title, value, rows = 2, required = false) { return `<label class="field"><span>${safe(title)}</span><textarea name="${safe(name)}" rows="${rows}" maxlength="1800" ${required ? 'required' : ''}>${safe(value || '')}</textarea></label>`; }
function verificationForm(id = '', linkedId = '') {
  const item = verificationById(id);
  const req = getRequirement(linkedId);
  verificationDraft = item ? structuredClone(item) : {id: '', title: '', method: req?.method !== 'Não definido' && req?.method ? req.method : 'Teste', subsystem: req?.subsystem || 'Sistema', requirementIds: linkedId ? [linkedId] : [], owner: 'Engenharia de sistemas', review: 'TRR', level: 'Sistema', stage: 'Desenvolvimento', status: 'Planejada', result: 'Não executada', criteria: req?.acceptance || '', procedure: '', conditions: '', evidence: '', note: ''};
  const d = verificationDraft;
  const reviews = Array.from(new Set([...activeReviews().map(review => review.id), d.review]));
  let fields = `<label class="field"><span>Atividade</span><input name="title" required maxlength="150" value="${safe(d.title)}" placeholder="Exemplo · verificar o registro dos pacotes"></label><div class="field-grid">${formSelect('method', 'Método', methodOptions.filter(method => method !== 'Não definido'), d.method)}${formSelect('subsystem', 'Subsistema', subsystemOptions.filter(sub => sub !== 'Não definido'), d.subsystem)}</div><div class="field-grid">${formSelect('review', 'Revisão associada', reviews, d.review)}${formSelect('status', 'Situação', ['Planejada', 'Em preparação', 'Bloqueada', 'Concluída'], d.status)}</div><div class="eng-small-heading">Requisitos associados</div><div class="eng-checklist">${requirements.map(r => `<label class="eng-choice"><input type="checkbox" name="requirementIds" value="${safe(r.id)}" ${d.requirementIds.includes(r.id) ? 'checked' : ''}><span><strong>${safe(r.id)} · ${safe(r.subsystem)}</strong><small>${safe(r.text)}</small></span></label>`).join('')}</div>`;
  fields += formText('criteria', 'Critério de aceitação', d.criteria, 3);
  fields += formText('procedure', 'Procedimento previsto', d.procedure, 3);
  fields += `<details class="eng-details" ${item?.status === 'Concluída' ? 'open' : ''}><summary>Execução, resultado e evidência</summary>${formSelect('result', 'Resultado', ['Não executada', 'Aprovado no critério', 'Reprovado no critério', 'Inconclusivo'], d.result)}${formText('evidence', 'Referência da evidência', d.evidence, 2)}<p class="helper">Informe documento, versão e seção. O vínculo não substitui a execução da atividade.</p>${formText('conditions', 'Condições e configuração', d.conditions, 3)}${formText('note', 'Observações', d.note, 2)}${formSelect('owner', 'Responsável', ownerOptions, d.owner)}</details><p id="verification-form-error" class="eng-inline-error" role="status"></p>`;
  const footer = `<div class="panel-footer"><button type="button" class="button secondary" data-engine="verification-cancel">Cancelar</button><button class="button primary" type="submit" form="verification-form">Salvar verificação</button></div>`;
  setPanel('verification-edit', panelHeading(item ? 'Editar ' + id : 'Adicionar verificação', 'Atividade, critério e requisitos associados') + `<div class="panel-body eng-form"><form id="verification-form">${fields}</form></div>` + footer);
}
function saveVerification(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  const ids = data.getAll('requirementIds').filter(id => getRequirement(id));
  if (!ids.length) { el('verification-form-error').textContent = 'Associe pelo menos um requisito.'; return; }
  if (data.get('status') === 'Concluída' && (!String(data.get('evidence') || '').trim() || data.get('result') === 'Não executada' || !String(data.get('criteria') || '').trim())) { el('verification-form-error').textContent = 'Para concluir, registre critério, resultado e referência da evidência.'; return; }
  let item = verificationDraft.id ? verificationById(verificationDraft.id) : null;
  if (!item) { item = {...verificationDraft, id: 'VER-' + String(verificationCounter).padStart(3, '0')}; verificationCounter += 1; verifications.push(item); }
  for (const [key, value] of data.entries()) { if (key !== 'requirementIds') { item[key] = String(value).trim(); } }
  item.requirementIds = ids;
  item.updatedAt = now();
  if (item.status === 'Concluída') { item.requirementVersions = Object.fromEntries(ids.map(id => [id, getRequirement(id).version])); }
  changeEngineering('Atualizada a atividade ' + item.id);
  if (engineering.module === 'verification') { renderVerifications(); }
  renderTable();
  openVerification(item.id);
  message(`${item.id} salva. Vínculos atualizados nos requisitos e na verificação.`);
}
function linkVerifications(id) {
  const req = getRequirement(id);
  if (!req) { return; }
  state.selectedId = id;
  const choices = verifications.map(item => `<label class="eng-choice"><input type="checkbox" name="verification" value="${safe(item.id)}" ${item.requirementIds.includes(id) ? 'checked' : ''}><span><strong>${safe(item.id)} · ${safe(item.method)}</strong><small>${safe(item.title)}</small></span></label>`).join('');
  const body = `<p class="eng-body-text">${safe(req.text)}</p><div class="eng-small-heading">Atividades disponíveis</div><form id="link-verifications-form"><div class="eng-checklist">${choices}</div><p class="helper">Selecionar associa a atividade. Desmarcar remove apenas este vínculo.</p></form><button class="text-button" data-engine="verification-new" data-requirement="${safe(id)}">${icon('plus')}Criar uma atividade para este requisito</button>`;
  const footer = '<div class="panel-footer"><button class="button secondary" data-action="detail-back">Voltar</button><button class="button primary" form="link-verifications-form" type="submit">Salvar vínculos</button></div>';
  setPanel('verification-links', panelHeading('Associar verificações', id) + `<div class="panel-body">${body}</div>` + footer);
}
function saveLinks(event) {
  event.preventDefault();
  const ids = new FormData(event.target).getAll('verification');
  for (const item of verifications) { item.requirementIds = item.requirementIds.filter(id => id !== state.selectedId); if (ids.includes(item.id)) { item.requirementIds.push(state.selectedId); } }
  changeEngineering('Vínculos atualizados em ' + state.selectedId);
  if (engineering.module === 'verification') { renderVerifications(); }
  renderDetail();
  message('Associações atualizadas nos dois sentidos.');
}

// Documentos e cronograma compartilham o mesmo perfil e as mesmas revisões.
function profileControl() { return `<label class="eng-profile-label">Referência<select data-engine-profile aria-label="Referência dos documentos e revisões">${optionList(['NASA', 'ECSS', 'CUSTOM'], engineering.profile)}</select></label>`; }
function renderDocuments() {
  const reviews = scheduleList();
  const filterOptions = reviews.map(review => `<option value="${safe(review.id)}" ${engineering.docReview === review.id ? 'selected' : ''}>${safe(labelReview(review.id))}${review.active ? '' : ' · fora do plano'}</option>`).join('');
  const header = `<div class="workspace-head"><div><h1>Documentos</h1><p class="eng-subtitle">Entregas do projeto, organizadas por revisão.</p></div><div class="workspace-actions">${profileControl()}<div class="eng-anchor"><button class="button secondary" data-engine="company-document-form">${icon('plus')}Documento da equipe</button><div id="company-document-popover" class="eng-popover eng-popover-wide" hidden></div></div><div class="eng-anchor"><button class="button primary" data-engine="downloads">${icon('download')}Baixar documentos</button><div id="documents-downloads" class="eng-popover eng-download-menu" hidden></div></div></div></div>`;
  const flows = [['','Entradas e saídas'],['input','Documentos de entrada'],['output','Registros de saída']].map(([value,label]) => `<option value="${value}" ${engineering.docFlow === value ? 'selected' : ''}>${label}</option>`).join('');
  const filters = `<div class="filterbar"><label class="search-field">${icon('search')}<input id="documents-search" type="search" placeholder="Buscar por nome ou código" value="${safe(engineering.docQuery)}" aria-label="Buscar documento"></label><select id="documents-review" aria-label="Filtrar por revisão"><option value="">Todas as revisões</option>${filterOptions}</select><select id="documents-flow" aria-label="Filtrar entrada ou saída">${flows}</select><button class="text-button" data-engine="clear-document-filters">Limpar</button></div><div class="document-chips" id="document-kind-filters" aria-label="Filtrar por categoria"></div><div class="eng-summary-line"><span id="documents-summary" role="status"></span></div>`;
  const table = '<div class="eng-scroll eng-table-wrap"><table class="eng-table"><colgroup><col><col style="width:230px"><col style="width:183px"><col style="width:130px"></colgroup><thead><tr><th>Documento</th><th>Revisões</th><th>Obrigatoriedade</th><th>Arquivo</th></tr></thead><tbody id="documents-rows"></tbody></table><div class="eng-blank" id="documents-empty" hidden>Nenhum documento neste filtro.</div></div>';
  const note = '<details class="document-category-note"><summary>Sobre as categorias</summary><p>A aplicação depende da referência adotada, do contrato e das adaptações aprovadas. Os arquivos são rascunhos do projeto. A categoria descreve o conteúdo exigido, não obriga um arquivo separado.</p></details>';
  el('documents-module').innerHTML = header + filters + table + note;
  renderDocumentRows();
}
function renderDocumentRows() {
  const docs = currentDocuments();
  const available = currentDocuments(true);
  const activeKind = document.activeElement?.dataset.engine === 'document-kind' ? document.activeElement.dataset.kind : null;
  el('document-kind-filters').innerHTML = [['','Todos'],['norm','A confirmar'],['reference','Referência adotada'],['company','Da empresa'],['optional','Opcionais']].map(([kind,label]) => `<button data-engine="document-kind" data-kind="${kind}" aria-pressed="${(engineering.docKind || '') === kind}">${label}<span>${kind ? available.filter(doc => doc.kind === kind).length : available.length}</span></button>`).join('');
  el('documents-rows').innerHTML = docs.map(doc => `<tr data-engine="document-detail" data-id="${safe(doc.id)}" tabindex="0" aria-label="Abrir ${safe(doc.title)}"><td><div class="eng-document-cell"><span class="eng-doc-icon">${icon('file')}</span><span><span class="eng-cell-title">${safe(doc.title)}</span><span class="eng-cell-subtitle"><span class="mono">${safe(doc.code)}</span> · ${safe(doc.state)}${doc.flow === 'output' ? ' · após a revisão' : ''}</span></span></div></td><td>${doc.reviews.length ? doc.reviews.map(id => `<span class="eng-doc-review" title="${scheduleList().find(r => r.id === id)?.active ? 'Revisão no plano' : 'Revisão fora do plano atual'}">${safe(labelReview(id))}</span>`).join('') : '<span class="eng-muted">Sem revisão atribuída</span>'}</td><td>${docBadge(doc.kind)}</td><td><div class="eng-doc-actions"><button class="eng-download-mini" data-engine="document-pdf" data-id="${safe(doc.id)}" aria-label="Baixar PDF de ${safe(doc.title)}">${icon('download')}PDF</button><button class="icon-button" data-engine="document-detail" data-id="${safe(doc.id)}" aria-label="Ver documento">${icon('chevron')}</button></div></td></tr>`).join('');
  el('documents-empty').hidden = docs.length > 0;
  el('documents-summary').textContent = `${docs.length} de ${projectDocuments().length} documentos · ${engineering.profile}`;
  if (activeKind !== null) { [...el('document-kind-filters').querySelectorAll('button')].find(button => button.dataset.kind === activeKind)?.focus({preventScroll:true}); }
}
function blocksHTML(blocks) {
  return blocks.map(block => {
    if (block.type === 'heading') { return `<h4>${safe(block.text)}</h4>`; }
    if (block.type === 'paragraph') { return `<p>${safe(block.text)}</p>`; }
    if (block.type === 'table') { return `<table><thead><tr>${block.headers.map(cell => `<th>${safe(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${safe(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }
    return '';
  }).join('');
}
function openDocument(id) {
  const doc = currentDocument(id);
  if (!doc) { message('O documento não pertence ao perfil atual.', true); return; }
  engineering.docId = id;
  let info = (doc.pendingReviews?.length ? '<p class="platform-note">Revisão fora do plano: ' + safe(doc.pendingReviews.join(', ')) + '. A entrega foi preservada; reatribua o marco ou registre a adaptação.</p>' : '') + `<div class="eng-document-info">${docBadge(doc.kind)}<span class="eng-muted">${safe(doc.state)} · v0.${engineering.version}</span></div><p class="helper">${safe(doc.maturity || 'Maturidade definida pela equipe.')}</p>`;
  if (doc.source && SOURCES[doc.source]) { info += `<button class="eng-source-button" data-action="source" data-source="${safe(doc.source)}">${icon('file')}Por que este documento está aqui${icon('chevron')}</button><p class="helper">${safe(doc.clause)}</p>`; }
  else { info += `<p class="helper">${safe(doc.clause || 'Entrega escolhida pela equipe.')}</p>`; }
  const blocks = documentBlocks(doc);
  const paper = `<article class="eng-document-paper"><div class="eng-paper-brand"><span>NORTE / ${safe(project.name)}</span><span>${safe(doc.code)}</span></div><h3>${safe(doc.title)}</h3><p class="eng-preview-note">${engineering.profile} · Rascunho de trabalho · v0.${engineering.version}</p>${blocksHTML(blocks)}</article>`;
  const footer = `<div class="panel-footer"><button class="button secondary" data-engine="document-docx" data-id="${safe(id)}">${icon('file')}Word editável</button><button class="button primary" data-engine="document-pdf" data-id="${safe(id)}">${icon('download')}Baixar PDF</button></div>`;
  setPanel('document', panelHeading(doc.title, doc.code) + `<div class="panel-body">${info}${paper}</div>` + footer);
}
function companyDocumentForm() {
  const panel = el('company-document-popover');
  const open = panel.hidden;
  hidePopovers();
  if (!open) { return; }
  panel.innerHTML = popupHead('Documento da equipe') + `<form id="company-document-form"><label class="field"><span>Nome do documento</span><input name="title" required maxlength="120" placeholder="Exemplo · checklist interno de integração"></label><label class="field"><span>Obrigatoriedade</span><select name="kind"><option value="company">Obrigatório para a empresa</option><option value="optional">Opcional</option></select></label><div class="eng-small-heading">Entregar em quais revisões</div><div class="eng-review-options">${activeReviews().map(review => `<label class="eng-choice"><input name="reviews" type="checkbox" value="${safe(review.id)}"><span>${safe(labelReview(review.id))}</span></label>`).join('')}</div>${formText('body', 'Conteúdo ou instrução da equipe', '', 3)}<p class="helper">A escolha da equipe não altera a obrigatoriedade da norma.</p><div class="eng-popover-footer"><button class="text-button" type="button" data-engine="hide-popovers">Cancelar</button><button class="button primary" type="submit">Adicionar documento</button></div></form>`;
  panel.hidden = false;
}
function saveCompanyDocument(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  const n = String(engineering.customDocs.length + 1).padStart(3, '0');
  const doc = {id: 'EMP-' + n, code: 'AUR-EMP-' + n, title: String(data.get('title')).trim(), kind: data.get('kind') === 'company' ? 'company' : 'optional', content: 'custom', body: String(data.get('body') || '').trim(), reviews: data.getAll('reviews'), source: '', clause: 'Decisão da equipe Aurora', maturity: 'Conforme critérios internos da equipe', state: 'Rascunho', flow: 'input'};
  engineering.customDocs.push(doc);
  changeEngineering('Documento da equipe adicionado · ' + doc.code);
  hidePopovers();
  engineering.docQuery = ''; engineering.docKind = ''; engineering.docReview = '';
  renderDocuments();
  openDocument(doc.id);
  message('Documento adicionado ao catálogo e às revisões selecionadas.');
}
function downloadsMenu() {
  const panel = el('documents-downloads');
  const open = panel.hidden;
  hidePopovers();
  if (!open) { return; }
  panel.innerHTML = popupHead('Baixar seleção') + '<button data-engine="download-package">' + icon('download') + 'Pacote em PDF e Word · ZIP</button><button data-engine="download-trace">' + icon('file') + 'Matriz de vínculos · CSV</button><button data-engine="download-calendar">' + icon('clock') + 'Cronograma · calendário</button><button data-engine="download-project">' + icon('file') + 'Projeto completo · JSON</button><p class="helper">O pacote respeita os filtros desta lista.</p>';
  panel.hidden = false;
}
function setEngineeringProfile(value) {
  if (!['NASA', 'ECSS', 'CUSTOM'].includes(value)) { return; }
  engineering.profile = value;
  if (typeof lifecycle !== 'undefined') { lifecycle.selectedId = ''; lifecycle.selectedProfile = value; }
  engineering.docReview = ''; engineering.expandedReview = '';
  scheduleList();
  changeEngineering('Referência das entregas alterada para ' + value);
  closePanel(true);
  if (engineering.module === 'documents') { renderDocuments(); }
  if (engineering.module === 'schedule') { renderSchedule(); }
  message('Referência atualizada. Os requisitos não foram alterados.');
}
function renderSchedule() {
  const list = activeReviews();
  const header = `<div class="workspace-head"><div><h1>Cronograma</h1><p class="eng-subtitle">Revisões, preparação e documentos de cada entrega.</p></div><div class="workspace-actions">${profileControl()}<button class="button secondary" data-engine="toggle-reviews">${icon('sliders')}Definir revisões</button><button class="button primary" data-engine="schedule-document">${icon('file')}Ver documento</button></div></div>`;
  const controls = `<div class="eng-schedule-toolbar"><div class="eng-date-controls"><label>Início<input type="date" id="schedule-start" value="${safe(engineering.start)}" aria-label="Início do projeto"></label><label>Preparação<input type="number" min="1" max="90" id="schedule-prep" value="${engineering.prepDays}" aria-label="Dias de preparação">dias</label><label>Fechamento<input type="number" min="1" max="90" id="schedule-close" value="${engineering.closeDays}" aria-label="Dias para fechamento">dias</label></div><button class="text-button" data-engine="generate-schedule">Gerar datas${icon('arrow')}</button></div>`;
  const picker = engineering.reviewPicker ? `<section class="eng-review-picker"><div class="eng-inline-title"><h2>Revisões do projeto</h2><button class="text-button" data-engine="toggle-reviews">Concluir</button></div><div class="eng-review-options">${scheduleList().map(review => `<label class="eng-choice"><input data-review-toggle="${safe(review.id)}" type="checkbox" ${review.active ? 'checked' : ''}><span><strong>${safe(labelReview(review.id))}</strong><small>${safe(review.title)}</small></span></label>`).join('')}</div><p class="eng-delivery-note">Ativar ou retirar um marco muda o plano, mas não aprova uma dispensa de exigência. Valide a adaptação com a autoridade do projeto.</p></section>` : '';
  const changed = scheduleList().some(review => review.changed);
  const warning = changed ? '<div class="eng-adaptation">Seleção adaptada pela equipe. A aplicabilidade das revisões e eventuais dispensas ainda precisa de aprovação.</div>' : '';
  const summary = `<div class="eng-summary-line"><span>${list.length} revisões · ${engineering.profile}</span><span>Datas do planejamento · ajustar conforme a maturidade</span></div>`;
  const rows = list.map(review => renderReviewRow(review)).join('') || '<div class="eng-blank">Selecione pelo menos uma revisão para montar o cronograma.</div>';
  el('schedule-module').innerHTML = header + controls + picker + warning + summary + `<div class="eng-schedule-scroll" id="schedule-scroll">${rows}</div><p class="eng-doc-foot">Datas e antecedências são escolhas do projeto, não prazos impostos pela norma. A entrada e a conclusão de cada revisão dependem de critérios acordados.</p>`;
}
function reviewDocs(id, flow = '') { return projectDocuments().filter(doc => doc.reviews.includes(id) && (!flow || doc.flow === flow)); }
function renderReviewRow(review) {
  const opened = engineering.expandedReview === review.id;
  const input = reviewDocs(review.id, 'input');
  const output = reviewDocs(review.id, 'output');
  const prep = addDays(review.date, -review.prepDays);
  const close = addDays(review.date, review.closeDays);
  const items = docs => docs.map(doc => `<div class="eng-delivery-item"><button data-engine="document-detail" data-id="${safe(doc.id)}"><strong>${safe(doc.title)}</strong><small>${safe(doc.maturity)}</small></button>${docBadge(doc.kind)}</div>`).join('') || '<div class="eng-delivery-item"><small>Sem documento selecionado.</small></div>';
  const button = `<button class="eng-review-summary" data-engine="expand-review" data-id="${safe(review.id)}" aria-expanded="${opened}"><span class="eng-review-code">${safe(labelReview(review.id))}</span><span><h3>${safe(review.title)}</h3><p>${safe(review.focus)}</p></span><span class="eng-review-period"><strong>${engDate(review.date)}</strong><span>${engDate(prep)} a ${engDate(close)}</span><span class="eng-timebar"></span></span><span class="eng-review-period"><strong>${input.length} entradas · ${output.length} ${output.length === 1 ? 'saída' : 'saídas'}</strong><span>Ver documentos da revisão</span></span>${icon('chevron')}</button>`;
  const source = engineering.profile === 'NASA' ? 'nasaReviews' : 'ecssReviews';
  const body = `<div class="eng-review-body"><div class="eng-review-settings"><label>Data da revisão<input type="date" data-review-date="${safe(review.id)}" value="${safe(review.date)}"></label><span class="eng-muted">Preparação desde ${engDate(prep)} · ações até ${engDate(close)}</span><button class="text-button" data-engine="download-review" data-id="${safe(review.id)}">${icon('download')}Baixar pacote</button></div><div class="eng-delivery-columns"><section class="eng-delivery-group"><h4>ANTES · DOCUMENTOS DE ENTRADA</h4>${items(input)}</section><section class="eng-delivery-group"><h4>DEPOIS · REGISTROS DA REVISÃO</h4>${items(output)}<div class="eng-delivery-item"><small>Concluir a revisão exige decisões e tratamento das pendências. Um arquivo gerado não significa aprovação.</small></div></section></div><div class="eng-internal-links"><button data-action="source" data-source="${source}">${icon('file')}Origem dos critérios</button><button data-engine="documents-for-review" data-id="${safe(review.id)}">Ver na lista de documentos${icon('arrow')}</button></div></div>`;
  return `<article class="eng-review-row" data-review-row="${safe(review.id)}">${button}${opened ? body : ''}</article>`;
}
function preserveScheduleRender() { const scroll = el('schedule-scroll')?.scrollTop || 0; renderSchedule(); el('schedule-scroll').scrollTop = scroll; }
function generateSchedule() {
  const date = el('schedule-start').value;
  const prep = Number(el('schedule-prep').value);
  const close = Number(el('schedule-close').value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || prep < 1 || prep > 90 || close < 1 || close > 90) { message('Informe uma data válida e períodos entre 1 e 90 dias.', true); return; }
  engineering.start = date; engineering.prepDays = prep; engineering.closeDays = close;
  scheduleList().forEach(review => { review.date = addDays(date, review.week * 7); review.prepDays = prep; review.closeDays = close; });
  changeEngineering('Datas recalculadas a partir de ' + engDate(date));
  preserveScheduleRender();
  message('Datas geradas. Abra uma revisão para ajustar sua data individualmente.');
}

function handleEngineeringClick(event) {
  const button = event.target.closest('[data-engine]');
  if (!button || button.disabled) {
    const old = event.target.closest('[data-action]');
    if (old?.dataset.action === 'source-back') { event.preventDefault(); event.stopImmediatePropagation(); returnFromSource(); return; }
    if (old?.dataset.action === 'workspace') { event.preventDefault(); event.stopImmediatePropagation(); showModule('requirements'); return; }
    if (!event.target.closest('.eng-anchor') && !event.target.closest('.eng-popover')) { hidePopovers(); }
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  const action = button.dataset.engine;
  const id = button.dataset.id;
  if (action.startsWith('life-')) { handleLifecycleAction(button); return; }
  if (action === 'module') { showModule(button.dataset.module); }
  else if (action === 'hide-popovers') { hidePopovers(); }
  else if (action === 'add-requirement') { addReqForm(); }
  else if (action === 'apply-filters') { state.filters.method = el('eng-filter-method').value; state.filters.origin = el('eng-filter-origin').value; hidePopovers(); renderTable(); }
  else if (action === 'linked-requirement') { openDetail(id); }
  else if (action === 'requirement-verifications') { openDetail(id); }
  else if (action === 'link-verifications') { linkVerifications(id); }
  else if (action === 'verification-detail') { openVerification(id); }
  else if (action === 'verification-new') { hidePopovers(); verificationForm('', button.dataset.requirement || ''); }
  else if (action === 'verification-edit') { verificationForm(id); }
  else if (action === 'verification-cancel') { if (verificationDraft?.id) { openVerification(verificationDraft.id); } else { closePanel(true); } }
  else if (action === 'document-detail') { openDocument(id); }
  else if (action === 'document-kind') { engineering.docKind = button.dataset.kind || ''; renderDocumentRows(); }
  else if (action === 'clear-document-filters') { engineering.docKind = ''; engineering.docQuery = ''; engineering.docReview = ''; engineering.docFlow = ''; renderDocuments(); el('documents-search').focus(); }
  else if (action === 'document-pdf') { const doc = currentDocument(id); if (doc) { downloadBlob(buildEngineeringPDF(doc), doc.code + '.pdf'); message('PDF gerado com a versão atual do projeto.'); } }
  else if (action === 'document-docx') { const doc = currentDocument(id); if (doc) { downloadBlob(buildEngineeringDocx(doc), doc.code + '.docx'); message('Word editável gerado com a versão atual do projeto.'); } }
  else if (action === 'company-document-form') { companyDocumentForm(); }
  else if (action === 'downloads') { downloadsMenu(); }
  else if (action === 'download-package') { downloadPackage(); }
  else if (action === 'download-review') { downloadPackage(id); }
  else if (action === 'download-trace') { hidePopovers(); downloadBlob(new Blob([traceCSV()], {type: 'text/csv;charset=utf-8'}), 'aurora-matriz-rastreabilidade.csv'); }
  else if (action === 'download-project') { hidePopovers(); downloadBlob(new Blob([projectJSON()], {type: 'application/json'}), 'aurora-projeto.json'); }
  else if (action === 'download-calendar') { hidePopovers(); downloadBlob(new Blob([calendarFile()], {type: 'text/calendar;charset=utf-8'}), 'aurora-cronograma.ics'); }
  else if (action === 'toggle-reviews') { engineering.reviewPicker = !engineering.reviewPicker; preserveScheduleRender(); }
  else if (action === 'expand-review') { engineering.expandedReview = engineering.expandedReview === id ? '' : id; preserveScheduleRender(); }
  else if (action === 'generate-schedule') { generateSchedule(); }
  else if (action === 'schedule-document') { openDocument('CRN'); }
  else if (action === 'documents-for-review') { engineering.docReview = id; engineering.docKind = ''; engineering.docQuery = ''; engineering.docFlow = ''; showModule('documents'); }
}
function handleEngineeringChange(event) {
  const input = event.target;
  if (input.dataset.life) { handleLifecycleChange(event); return; }
  if (input.matches('[data-engine-profile]')) { setEngineeringProfile(input.value); }
  else if (input.id === 'verification-method') { engineering.verMethod = input.value; renderVerificationRows(); }
  else if (input.id === 'verification-status') { engineering.verStatus = input.value; renderVerificationRows(); }
  else if (input.id === 'documents-review') { engineering.docReview = input.value; renderDocumentRows(); }
  else if (input.id === 'documents-kind') { engineering.docKind = input.value; renderDocumentRows(); }
  else if (input.id === 'documents-flow') { engineering.docFlow = input.value; renderDocumentRows(); }
  else if (input.matches('[data-review-toggle]')) {
    const review = scheduleList().find(item => item.id === input.dataset.reviewToggle);
    review.active = input.checked;
    const initial = REVIEW_PROFILES[engineering.profile].find(item => item.id === review.id);
    review.changed = initial.active !== review.active;
    review.reason = review.changed ? 'Seleção alterada pela equipe; avaliar aplicabilidade e aprovação.' : '';
    if (!review.active && engineering.expandedReview === review.id) { engineering.expandedReview = ''; }
    changeEngineering('Seleção de revisões atualizada · ' + labelReview(review.id));
    preserveScheduleRender();
  } else if (input.matches('[data-review-date]')) {
    const review = scheduleList().find(item => item.id === input.dataset.reviewDate);
    if (!input.value) { message('Informe uma data para a revisão.', true); input.value = review.date; return; }
    review.date = input.value;
    changeEngineering('Data alterada · ' + labelReview(review.id));
    preserveScheduleRender();
  }
}
function initialiseEngineering() {
  if (tableObserver) { tableObserver.disconnect(); }
  window.removeEventListener('resize', originalFitTable);
  if (!methodOptions.includes('Revisão de projeto')) { methodOptions.push('Revisão de projeto'); }
  document.addEventListener('click', handleEngineeringClick, true);
  document.addEventListener('change', handleEngineeringChange);
  document.addEventListener('input', event => { if (event.target.id === 'verification-search') { engineering.verQuery = event.target.value; renderVerificationRows(); } if (event.target.id === 'documents-search') { engineering.docQuery = event.target.value; renderDocumentRows(); } });
  document.addEventListener('submit', event => { if (event.target.id === 'eng-new-requirement') { saveNewRequirement(event); } else if (event.target.id === 'verification-form') { saveVerification(event); } else if (event.target.id === 'link-verifications-form') { saveLinks(event); } else if (event.target.id === 'company-document-form') { saveCompanyDocument(event); } });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.querySelector('.eng-popover:not([hidden])')) { event.preventDefault(); event.stopImmediatePropagation(); hidePopovers(); }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr[data-engine]')) { event.preventDefault(); event.target.click(); }
  }, true);
  scheduleList();
  renderTable();
}
initialiseEngineering();
