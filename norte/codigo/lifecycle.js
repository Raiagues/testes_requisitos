// As fases organizam o desenho. As datas pertencem ao projeto.
const LIFE_DURATIONS = {NASA: [8, 12, 16, 22, 22, 52, 8], ECSS: [8, 12, 16, 22, 18, 56, 8]};
const LIFE_PHASES = {
  NASA: [{code: 'Pré-A', name: 'Estudos de conceito'}, {code: 'A', name: 'Conceito e tecnologia'}, {code: 'B', name: 'Projeto preliminar'}, {code: 'C', name: 'Projeto e fabricação'}, {code: 'D', name: 'Integração e testes'}, {code: 'E', name: 'Operação'}, {code: 'F', name: 'Encerramento'}],
  ECSS: [{code: '0', name: 'Análise da missão'}, {code: 'A', name: 'Viabilidade'}, {code: 'B', name: 'Definição preliminar'}, {code: 'C', name: 'Definição detalhada'}, {code: 'D', name: 'Qualificação e produção'}, {code: 'E', name: 'Utilização'}, {code: 'F', name: 'Descarte'}]
};
const LIFE_LANES = ['Missão e conceito', 'Requisitos', 'Definição do projeto', 'Verificação', 'Integração e produção', 'Operação', 'Encerramento'];
const LIFE_BANDS = [[0, 2], [.5, 3], [2.35, 4], [3.55, 5.3], [3.6, 5], [5, 6], [6, 7]];
let lifecycle = {compare: false, selectedProfile: '', selectedId: '', glossary: false, durations: {}, settings: false};
SOURCES.nasaLifecycle = {org: 'NASA', title: 'NASA Program/Project Life Cycle', edition: 'Systems Engineering Handbook · NASA/SP-2016-6105 Rev. 2', section: '3.3 a 3.9 · Fases e revisões do projeto', url: 'https://www.nasa.gov/reference/3-0-nasa-program-project-life-cycle/', quote: '', mark: '', explanation: 'O perfil distingue Pré-A e fases A a F. As revisões foram organizadas por atividade para visualização. Datas e duração são escolhas do projeto; revisões não são dispensadas apenas por desmarcar um campo.', format: 'html', kind: 'Referência técnica', scope: 'Recorte para projetos espaciais. O programa e o contrato definem as revisões aplicáveis.', transcription: true, checkedAt: '2026-10-12'};
SOURCES.ecssLifecycle.section = '4.4 · Figura 4-3, p. 19; fases e revisões, pp. 22–27';
SOURCES.ecssLifecycle.explanation = 'A referência apresenta um ciclo típico de sete fases. A posição visual e a duração neste projeto são configuráveis. Na ECSS, MCR significa encerramento da missão; na NASA significa conceito da missão.';
function lifeDurations(profile = engineering.profile) { return lifecycle.durations[profile] || LIFE_DURATIONS[profile]; }
function lifeReviews(profile = engineering.profile) {
  if (!engineering.schedules[profile]) { engineering.schedules[profile] = REVIEW_PROFILES[profile].map(review => ({...review, date: addDays(engineering.start, Math.round(review.week * 7)), prepDays: engineering.prepDays, closeDays: engineering.closeDays, changed: false, reason: ''})); }
  return engineering.schedules[profile];
}
function lifeRanges(profile = engineering.profile) {
  let cursor = engineering.start;
  return LIFE_PHASES[profile].map((phase, index) => { const end = addDays(cursor, lifeDurations(profile)[index] * 7); const range = {...phase, start: cursor, end, index}; cursor = end; return range; });
}
function lifeDifference(a, b) { return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000); }
function lifePhaseOf(review, profile = engineering.profile) {
  const ranges = lifeRanges(profile);
  const match = ranges.find(phase => review.date > phase.start && review.date <= phase.end);
  return match || (review.date <= ranges[0].start ? ranges[0] : ranges[6]);
}
function lifePosition(review, profile) {
  const phase = lifePhaseOf(review, profile);
  const ratio = lifeDifference(review.date, phase.start) / lifeDifference(phase.end, phase.start);
  return Math.max(.025, Math.min(6.985, phase.index + Math.max(0, Math.min(1, ratio))));
}
function lifeShortDate(value) { return new Date(value + 'T12:00:00').toLocaleDateString('pt-BR', {month: 'short', year: '2-digit'}).replace('.', '').replace(' de ', ' '); }
function lifeKey(profile, label = profile) {
  const shape = profile === 'ECSS' ? '<path d="M7 1 13 7 7 13 1 7Z" fill="currentColor"/>' : '<path d="M1 3H13L7 13Z" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  const color = profile === 'ECSS' ? 'var(--life-ecss,var(--accent))' : 'var(--life-nasa,var(--muted))';
  return `<span class="life-symbol-key" style="color:${color}"><svg viewBox="0 0 14 15" aria-hidden="true">${shape}</svg>${safe(label)}</span>`;
}
function lifeGraphModel(compare = lifecycle.compare, fixed = false) {
  const visibleWidth = el('schedule-module')?.clientWidth || 1184;
  const width = fixed ? 1180 : Math.max(1100, visibleWidth - 4);
  const left = 202, right = width - 24, top = 80;
  const rowHeight = fixed ? 52 : compare ? 58 : Math.max(38, Math.min(52, Math.floor((innerHeight - 457) / 7)));
  const column = (right - left) / 7;
  const profiles = compare ? ['ECSS', 'NASA'] : [engineering.profile];
  const markers = [];
  for (const profile of profiles) {
    for (let lane = 0; lane < 7; lane += 1) {
      let previousX = -100, previousBottom = false;
      const records = lifeReviews(profile).filter(review => review.active && review.lane === lane).sort((a, b) => a.date.localeCompare(b.date));
      for (const review of records) {
        const x = left + lifePosition(review, profile) * column;
        const lower = x - previousX < 68 && !previousBottom;
        const base = top + rowHeight * lane + (compare ? (profile === 'ECSS' ? 21 : 49) : 29);
        const y = compare ? base : base;
        const labelY = y - (compare ? 10 : 13);
        const align = x > right - 26 ? 'end' : 'middle';
        const labelX = x > right - 26 ? x - 13 : x;
        markers.push({profile, review, x, y, labelX, labelY, align, lower});
        previousX = x; previousBottom = lower;
      }
    }
  }
  // É o texto que se afasta. A posição do marco permanece exata.
  for (const profile of profiles) {
    for (let lane = 0; lane < 7; lane += 1) {
      const items = markers.filter(marker => marker.profile === profile && marker.review.lane === lane);
      let group = [];
      const place = () => {
        if (!group.length) { return; }
        const widths = group.map(marker => labelReview(marker.review.id).length * 7 + 8);
        const total = widths.reduce((sum, w) => sum + w, 0) + (group.length - 1) * 8;
        const average = group.reduce((sum, marker) => sum + marker.x, 0) / group.length;
        let cursor = Math.min(right - total - 5, Math.max(left + 8, average - total / 2));
        group.forEach((marker, index) => { marker.labelX = cursor + widths[index] / 2; marker.align = 'middle'; cursor += widths[index] + 8; });
        group = [];
      };
      for (const marker of items) { if (group.length && marker.x - group[group.length - 1].x > 80) { place(); } group.push(marker); }
      place();
    }
  }
  return {width, left, right, top, rowHeight, column, height: top + rowHeight * 7, markers, profiles};
}
function lifeSymbol(marker) {
  const {x, y, profile} = marker;
  return profile === 'ECSS' ? `<path class="life-symbol" d="M${x} ${y-5.5}L${x+5.5} ${y}L${x} ${y+5.5}L${x-5.5} ${y}Z"/>` : `<path class="life-symbol" d="M${x-6} ${y-4}H${x+6}L${x} ${y+6}Z"/>`;
}
function lifeSVG(compare = lifecycle.compare, downloadable = false) {
  const m = lifeGraphModel(compare, downloadable);
  const ranges = lifeRanges();
  let svg = `<svg class="life-chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.width} ${m.height}" role="group" aria-label="Cronograma de ${safe(project.name)} por fase, atividade e revisão">`;
  if (downloadable) { svg += '<style>.life-phase{fill:#f0efe8}.life-separator,.life-stem{stroke:#dedcd3;stroke-width:1}.life-grid{stroke:#dedcd3;stroke-dasharray:3 4}.life-text{fill:#292c29}.life-muted{fill:#74746b}.life-band{fill:#ede3d8;opacity:.7}.life-symbol{stroke-width:1.6}.life-nasa .life-symbol{fill:#fffefa;stroke:#526d77}.life-nasa .life-marker-label{fill:#526d77}.life-ecss .life-symbol{fill:#946346;stroke:#946346}.life-ecss .life-marker-label{fill:#946346}.life-hit{fill:none;stroke:none}.life-marker-label{font-size:12px;font-weight:600}.life-guide{stroke:#987c62;stroke-dasharray:4 4;opacity:.4}.life-guide-label{fill:#74746b;font-size:10.5px}text{font-family:Arial,sans-serif}</style><rect width="100%" height="100%" fill="#fffefa"/>'; }
  svg += `<rect class="life-phase" x="0" y="0" width="${m.width}" height="${m.top}"/><text class="life-muted" x="21" y="29" font-size="10.5" letter-spacing="1.1">ATIVIDADES</text><text class="life-text" x="21" y="53" font-size="13.5" font-weight="550">Ciclo de vida da missão</text>`;
  ranges.forEach((phase, index) => {
    const center = m.left + (index + .5) * m.column;
    const code = index === 0 && compare ? 'Pré-A / 0' : (index === 0 && engineering.profile === 'NASA' ? 'Pré-A' : 'Fase ' + phase.code);
    svg += `<text class="life-text" text-anchor="middle" x="${center}" y="25" font-size="13.5" font-weight="600">${safe(code)}</text><text class="life-muted" text-anchor="middle" x="${center}" y="45" font-size="10.7">${safe(phase.name)}</text><text class="life-muted" text-anchor="middle" x="${center}" y="64" font-size="10.5">${safe(lifeShortDate(phase.start))} · ${safe(lifeShortDate(phase.end))}</text>`;
  });
  for (let i = 0; i <= 7; i += 1) { const x = m.left + i * m.column; svg += `<line class="${i === 0 ? 'life-separator' : 'life-grid'}" x1="${x}" y1="${i === 0 ? 0 : m.top}" x2="${x}" y2="${m.height}"/>`; }
  for (let i = 0; i <= 7; i += 1) { const y = m.top + i * m.rowHeight; svg += `<line class="life-separator" x1="0" y1="${y}" x2="${m.width}" y2="${y}"/>`; }
  LIFE_LANES.forEach((name, lane) => {
    const y = m.top + lane * m.rowHeight;
    svg += `<text class="life-muted" x="20" y="${y + m.rowHeight / 2 + 4}" font-size="10">${String(lane + 1).padStart(2, '0')}</text><text class="life-text" x="44" y="${y + m.rowHeight / 2 + 4}" font-size="12.6" font-weight="500">${safe(name)}</text>`;
    const [start, end] = LIFE_BANDS[lane];
    const offset = engineering.profile === 'NASA' && lane === 0 ? -1 : 0;
    const x = m.left + start * m.column + 1;
    const w = ((end + offset) - start) * m.column - 2;
    svg += `<rect class="life-band" x="${x}" y="${y + m.rowHeight / 2 - 2}" width="${w}" height="10" rx="3"/>`;
  });
  const launch = engineering.profile === 'NASA' ? 5 : 5.245;
  const launchX = m.left + launch * m.column;
  svg += `<line class="life-guide" x1="${launchX}" y1="${m.top+6}" x2="${launchX}" y2="${m.height}"/><text class="life-guide-label" x="${launchX+6}" y="${m.top+18}">Lançamento</text>`;
  for (const marker of m.markers) {
    const {review, profile, x, y, labelX, labelY, align} = marker;
    const selected = lifecycle.selectedId === review.id && (lifecycle.selectedProfile || engineering.profile) === profile;
    const reference = profile !== engineering.profile;
    const label = labelReview(review.id);
    const title = `${profile} · ${label} · ${review.title} · ${engDate(review.date)}`;
    const width = Math.max(37, label.length * 7 + 12);
    const hitX = labelX - width / 2;
    const hitY = Math.min(y - 14, labelY - 14);
    const hitH = Math.max(y + 11, labelY + 5) - hitY;
    svg += `<g class="life-marker life-${profile.toLowerCase()}${selected ? ' selected' : ''}${reference ? ' reference' : ''}" role="button" tabindex="0" data-engine="life-select" data-id="${safe(review.id)}" data-profile="${profile}" aria-label="${safe(title)}" aria-pressed="${selected}"><title>${safe(title)}</title><rect class="life-hit" x="${hitX}" y="${hitY}" width="${width}" height="${hitH}" rx="5"/>${Math.abs(labelX-x)>3 ? `<line class="life-stem" x1="${x}" y1="${y-7}" x2="${labelX}" y2="${labelY+3}"/>` : ''}${lifeSymbol(marker)}<text class="life-marker-label" x="${labelX}" y="${labelY}" text-anchor="${align}">${safe(label)}</text></g>`;
  }
  return svg + '</svg>';
}
function lifeSettings() {
  if (!lifecycle.settings) { return ''; }
  const draft = lifecycle.draft?.profile === engineering.profile ? lifecycle.draft : {start: engineering.start, prep: engineering.prepDays, close: engineering.closeDays, durations: lifeDurations()};
  const fields = LIFE_PHASES[engineering.profile].map((phase, index) => `<label class="life-field">${phase.code === 'Pré-A' ? 'Pré-A' : 'Fase ' + phase.code}<input type="number" id="life-phase-${index}" value="${draft.durations[index]}" min="1" max="520" aria-label="Duração da fase ${safe(phase.code)} em semanas"><small>semanas</small></label>`).join('');
  const choices = lifeReviews().map(review => `<label class="life-choice"><input type="checkbox" data-life="review" value="${safe(review.id)}" ${review.active ? 'checked' : ''}><span><strong>${safe(labelReview(review.id))}</strong><small>${safe(review.title)}</small></span></label>`).join('');
  return `<section class="life-settings" id="life-settings"><div class="life-settings-title"><h2>Ajustar cronograma</h2><button class="icon-button" data-engine="life-settings" aria-label="Fechar configuração">${icon('close')}</button></div><div class="life-settings-dates"><label class="life-field">Início do projeto<input type="date" id="schedule-start" value="${safe(draft.start)}"></label><label class="life-field">Preparação padrão<input type="number" id="schedule-prep" value="${draft.prep}" min="1" max="90"><span>dias antes da revisão</span></label><label class="life-field">Fechamento padrão<input type="number" id="schedule-close" value="${draft.close}" min="1" max="90"><span>dias após a revisão</span></label><button class="button primary" data-engine="life-apply">Aplicar datas${icon('check')}</button></div><div class="life-duration-grid">${fields}</div><div class="life-selection-head"><strong>Revisões incluídas no plano ${engineering.profile}</strong><button class="text-button" data-engine="life-reset">Restaurar seleção inicial</button></div><div class="life-review-grid">${choices}</div><p class="life-note">Alterar a seleção não aprova dispensas. Confirme o plano com o responsável técnico. Aplicar datas redistribui os marcos automáticos e preserva datas ajustadas manualmente.</p></section>`;
}
function lifeGlossary() {
  if (!lifecycle.glossary) { return ''; }
  const profiles = lifecycle.compare ? ['ECSS', 'NASA'] : [engineering.profile];
  return `<div class="life-glossary">${profiles.flatMap(profile => lifeReviews(profile).filter(review => review.active).map(review => `<button data-engine="life-select" data-id="${safe(review.id)}" data-profile="${profile}"><strong>${safe(labelReview(review.id))}</strong><span>${safe(review.title)}${lifecycle.compare ? ' · ' + profile : ''}</span></button>`)).join('')}</div>`;
}
function lifeDeliveries(docs) {
  if (!docs.length) { return '<p class="life-note">Nenhum documento associado a esta revisão.</p>'; }
  return docs.map(doc => `<div class="eng-delivery-item" data-life-kind="${safe(doc.kind)}" data-document-search="${safe(norm(doc.title + ' ' + doc.code))}"><button data-engine="document-detail" data-id="${safe(doc.id)}"><strong>${safe(doc.title)}</strong><small>${safe(doc.code)}</small></button><div class="delivery-category">${docBadge(doc.kind)}</div><button class="icon-button" data-engine="document-pdf" data-id="${safe(doc.id)}" aria-label="Baixar ${safe(doc.title)} em PDF">${icon('download')}</button></div>`).join('');
}
function lifeReviewDetail() {
  if (!lifecycle.selectedId) { return ''; }
  const profile = lifecycle.selectedProfile || engineering.profile;
  const review = lifeReviews(profile).find(item => item.id === lifecycle.selectedId && item.active);
  if (!review) { return ''; }
  const isReference = profile !== engineering.profile;
  const phase = lifePhaseOf(review, profile);
  const source = profile === 'NASA' ? 'nasaCriteria' : 'ecssLifecycle';
  const head = `<div class="life-detail-head"><div class="life-detail-heading"><span class="life-detail-code">${safe(labelReview(review.id))}</span><div><h2 id="panel-title" tabindex="-1">${safe(review.title)}</h2><p>${profile} · ${phase.code === 'Pré-A' ? 'Pré-A' : 'Fase ' + phase.code}</p></div></div><button class="icon-button" data-engine="life-close" aria-label="Fechar detalhes da revisão">${icon('close')}</button></div>`;
  if (isReference) { return `<section class="life-detail" id="life-review-detail">${head}<div class="life-detail-content"><div class="life-reference"><p>${safe(review.focus)} Este marco pertence ao perfil ${profile}, exibido somente para comparação. Os documentos do projeto continuam no perfil ${engineering.profile}.</p><button class="button secondary" data-engine="life-use-profile" data-profile="${profile}" data-id="${safe(review.id)}">Usar ${profile} no projeto${icon('arrow')}</button></div><button class="text-button" data-action="source" data-source="${source}">${icon('file')}Consultar a referência</button></div></section>`; }
  const input = reviewDocs(review.id, 'input'), output = reviewDocs(review.id, 'output');
  const docs = [...input, ...output];
  const counts = [['norm','A confirmar'],['reference','Referência adotada'],['company','Da empresa'],['optional','Opcionais']].map(([kind,label]) => { const count = docs.filter(doc => doc.kind === kind).length; return count ? `<button type="button" data-engine="life-filter" data-kind="${kind}" aria-pressed="${lifecycle.docKind === kind}"><span>${count}</span>${label}</button>` : ''; }).join('');
  const prepDate = addDays(review.date, -review.prepDays), closeDate = addDays(review.date, review.closeDays);
  const phaseNote = phase.index !== review.phase ? '<p class="life-reference">A data escolhida está fora da fase usada como referência para esta revisão. Confirme esta adaptação com a equipe.</p>' : '';
  const periods = `<div class="life-periods"><div class="life-period"><label>Preparar <input type="number" data-life="prep" data-id="${safe(review.id)}" value="${review.prepDays}" min="1" max="90" aria-label="Dias de preparação"> dias antes</label><strong>A partir de ${engDate(prepDate)}</strong></div><div class="life-period primary"><label for="life-review-date">Realizar a revisão</label><input type="date" id="life-review-date" data-life="date" data-id="${safe(review.id)}" value="${safe(review.date)}"></div><div class="life-period"><label>Fechar ações em <input type="number" data-life="close" data-id="${safe(review.id)}" value="${review.closeDays}" min="1" max="90" aria-label="Dias para fechar as ações"> dias</label><strong>Até ${engDate(closeDate)}</strong></div></div>`;
  const footer = `<div class="life-detail-footer"><button class="text-button" data-action="source" data-source="${source}">${icon('file')}Critérios da revisão</button><button class="button primary" data-engine="download-review" data-id="${safe(review.id)}">${icon('download')}Baixar pacote</button></div>`;
  const filters = `<div class="life-document-heading"><h3>Documentos <span>${docs.length}</span></h3><button class="text-button" data-engine="documents-for-review" data-id="${safe(review.id)}">Ver na lista${icon('arrow')}</button></div><div class="document-chips life-document-chips" aria-label="Filtrar documentos da revisão"><button data-engine="life-filter" data-kind="" aria-pressed="${!lifecycle.docKind}">Todos</button>${counts}</div><label class="life-document-search">${icon('search')}<input type="search" id="life-document-search" placeholder="Buscar nesta revisão" aria-label="Buscar documentos nesta revisão" value="${safe(lifecycle.docQuery || '')}"></label><p id="life-filter-count" class="life-filter-count" role="status"></p>`;
  return `<section class="life-detail" id="life-review-detail">${head}<div class="life-detail-content">${phaseNote}${periods}${filters}<div class="eng-delivery-columns"><section class="eng-delivery-group"><h4>DOCUMENTOS DE ENTRADA</h4>${lifeDeliveries(input)}</section><section class="eng-delivery-group"><h4>REGISTROS DE SAÍDA</h4>${lifeDeliveries(output)}</section></div><p id="life-documents-empty" class="life-note" hidden>Nenhum documento encontrado. Altere a busca ou a categoria.</p></div>${footer}</section>`;
}
function filterLifeDocuments() {
  const detail = el('life-review-detail'); if (!detail) { return; }
  const rows = [...detail.querySelectorAll('[data-life-kind]')]; let shown = 0;
  for (const row of rows) { row.hidden = Boolean(lifecycle.docKind && row.dataset.lifeKind !== lifecycle.docKind || lifecycle.docQuery && !row.dataset.documentSearch.includes(norm(lifecycle.docQuery))); row.classList.toggle('document-highlight',!row.hidden && Boolean(lifecycle.docKind)); if (!row.hidden) { shown += 1; } }
  detail.querySelectorAll('[data-engine="life-filter"]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.kind === (lifecycle.docKind || ''))));
  detail.querySelectorAll('.eng-delivery-group').forEach(group => { group.hidden = ![...group.querySelectorAll('[data-life-kind]')].some(row => !row.hidden); });
  if (el('life-filter-count')) { el('life-filter-count').textContent = `${shown} de ${rows.length} documentos`; el('life-documents-empty').hidden = shown > 0; }
}
function renderLifeReview(focus = true) {
  const content = lifeReviewDetail(); if (!content) { if (state.panel === 'lifecycle-review') { closePanel(true); } return; }
  const scroll = el('side-panel').querySelector('.life-detail-content')?.scrollTop || 0;
  setPanel('lifecycle-review',content,focus); filterLifeDocuments();
  if (!focus) { el('side-panel').querySelector('.life-detail-content').scrollTop = scroll; }
}
function renderSchedule() {
  const reviews = lifeReviews().filter(review => review.active);
  const header = `<div class="workspace-head"><div><h1>Cronograma</h1><p class="eng-subtitle">Fases, atividades e revisões da missão.</p></div><div class="workspace-actions"><button class="button secondary" data-engine="life-settings" aria-expanded="${lifecycle.settings}">${icon('sliders')}Ajustar cronograma</button><button class="button primary" data-engine="schedule-document">${icon('file')}Documento do cronograma</button></div></div>`;
  const toolbar = `<div class="life-toolbar"><div class="life-title"><strong>${safe(project.name)}</strong><span>${reviews.length} revisões</span></div><div class="life-tools">${profileControl()}<label class="life-toggle"><input type="checkbox" data-life="compare" ${lifecycle.compare ? 'checked' : ''}>Comparar ${engineering.profile === 'NASA' ? 'ECSS' : 'NASA'}</label></div></div>`;
  const legend = `<div class="life-legend"><div class="life-legend-items">${lifecycle.compare ? lifeKey('ECSS') + lifeKey('NASA') : lifeKey(engineering.profile)}<span>Faixas · atividades planejadas</span></div><button class="text-button" data-engine="life-glossary" aria-expanded="${lifecycle.glossary}">${lifecycle.glossary ? 'Ocultar siglas' : 'Significado das siglas'}${icon('chevron')}</button></div>`;
  const board = `<section class="life-board">${toolbar}<div class="life-plot">${lifeSVG()}</div>${legend}${lifeGlossary()}</section>`;
  el('schedule-module').innerHTML = header + `<div class="life-scroll" id="schedule-scroll">${lifeSettings()}${board}</div>`;
  if (state.panel === 'lifecycle-review') { renderLifeReview(false); }
}
function preserveScheduleRender() {
  const node = el('schedule-scroll');
  const top = node?.scrollTop || 0;
  const focused = document.activeElement?.dataset.life;
  renderSchedule();
  el('schedule-scroll').scrollTop = top;
  if (focused) { el('side-panel').querySelector(`[data-life="${focused}"]`)?.focus({preventScroll:true}); }
}
function lifeSelect(profile, id) {
  lifecycle.selectedProfile = profile;
  lifecycle.selectedId = id;
  lifecycle.docKind = ''; lifecycle.docQuery = '';
  lifecycle.settings = false;
  engineering.expandedReview = profile === engineering.profile ? id : '';
  preserveScheduleRender();
  renderLifeReview();
}
function lifeApplyDates() {
  const start = el('schedule-start').value;
  const prep = Number(el('schedule-prep').value), close = Number(el('schedule-close').value);
  const durations = LIFE_PHASES[engineering.profile].map((_, index) => Number(el('life-phase-' + index).value));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || prep < 1 || prep > 90 || close < 1 || close > 90 || !Number.isInteger(prep) || !Number.isInteger(close) || durations.some(value => !Number.isInteger(value) || value < 1 || value > 520)) { message('Informe uma data, períodos de 1 a 90 dias e fases de 1 a 520 semanas.', true); return; }
  const shift = lifeDifference(start, engineering.start);
  for (const [profile, reviews] of Object.entries(engineering.schedules)) { if (profile !== engineering.profile) { reviews.forEach(review => { if (review.changed || review.manual) { return; } review.date = addDays(review.date, shift); }); } }
  engineering.start = start; engineering.prepDays = prep; engineering.closeDays = close;
  lifecycle.durations[engineering.profile] = durations;
  const ranges = lifeRanges();
  lifeReviews().forEach(review => { if (review.changed || review.manual) { return; } const phase = ranges[review.phase]; review.date = addDays(phase.start, Math.round(lifeDifference(phase.end, phase.start) * review.position)); review.prepDays = prep; review.closeDays = close; review.week = lifeDifference(review.date, start) / 7; });
  changeEngineering('Cronograma redistribuído por fase · ' + engineering.profile);
  lifecycle.settings = false; lifecycle.draft = null;
  renderSchedule();
  message('Datas atualizadas no diagrama, nos documentos e no calendário.');
}
function handleLifecycleAction(button) {
  const action = button.dataset.engine;
  if (action === 'life-settings') { lifecycle.settings = !lifecycle.settings; preserveScheduleRender(); if (lifecycle.settings) { el('schedule-scroll').scrollTo({top: 0, behavior: 'smooth'}); } }
  else if (action === 'life-select') { lifeSelect(button.dataset.profile || engineering.profile, button.dataset.id); }
  else if (action === 'life-close') { closePanel(true); }
  else if (action === 'life-filter') { lifecycle.docKind = button.dataset.kind || ''; filterLifeDocuments(); }
  else if (action === 'life-glossary') { lifecycle.glossary = !lifecycle.glossary; preserveScheduleRender(); }
  else if (action === 'life-apply') { lifeApplyDates(); }
  else if (action === 'life-reset') { lifeReviews().forEach(review => { review.active = REVIEW_PROFILES[engineering.profile].find(item => item.id === review.id).active; review.changed = false; }); changeEngineering('Seleção inicial de revisões restaurada'); preserveScheduleRender(); }
  else if (action === 'life-use-profile') { lifecycle.selectedProfile = button.dataset.profile; lifecycle.selectedId = button.dataset.id; setEngineeringProfile(button.dataset.profile); lifeSelect(button.dataset.profile, button.dataset.id); }
  else if (action === 'life-svg') { downloadBlob(new Blob([lifeSVG(false, true)], {type: 'image/svg+xml;charset=utf-8'}), 'AUR-CRN-diagrama-' + engineering.profile + '.svg'); }
}
function handleLifecycleChange(event) {
  const input = event.target;
  if (input.dataset.life === 'compare') { lifecycle.compare = input.checked; if (!lifecycle.compare && lifecycle.selectedProfile !== engineering.profile) { lifecycle.selectedId = ''; } preserveScheduleRender(); return; }
  const id = input.dataset.id || input.value;
  const review = lifeReviews().find(item => item.id === id);
  if (!review) { return; }
  if (input.dataset.life === 'review') {
    lifecycle.draft = {profile: engineering.profile, start: el('schedule-start').value, prep: el('schedule-prep').value, close: el('schedule-close').value, durations: LIFE_PHASES[engineering.profile].map((_, i) => el('life-phase-' + i).value)};
    review.active = input.checked;
    review.changed = review.active !== REVIEW_PROFILES[engineering.profile].find(item => item.id === review.id).active;
    review.reason = review.changed ? 'Seleção da equipe; confirmar aplicabilidade.' : '';
    if (!review.active && lifecycle.selectedId === review.id) { lifecycle.selectedId = ''; }
    changeEngineering('Revisões selecionadas · ' + engineering.profile);
    preserveScheduleRender(); return;
  }
  if (input.dataset.life === 'date') {
    const ranges = lifeRanges();
    if (!input.value || input.value < engineering.start || input.value > ranges[6].end) { message('Use uma data dentro do ciclo. Para ampliá-lo, ajuste a duração das fases.', true); input.value = review.date; return; }
    review.date = input.value; review.manual = true;
  } else {
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 1 || value > 90) { message('Escolha um período inteiro de 1 a 90 dias.', true); preserveScheduleRender(); return; }
    if (input.dataset.life === 'prep') { review.prepDays = value; }
    if (input.dataset.life === 'close') { review.closeDays = value; }
  }
  changeEngineering('Período ajustado · ' + labelReview(review.id));
  preserveScheduleRender();
}
// Teclado também seleciona os marcos do desenho.
document.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.life-marker')) { event.preventDefault(); lifeSelect(event.target.dataset.profile, event.target.dataset.id); } });
document.addEventListener('input',event => { if (event.target.id === 'life-document-search') { lifecycle.docQuery = event.target.value; filterLifeDocuments(); } });
// A exportação usa o mesmo posicionamento do diagrama.
function lifePDFPolygon(pdf, points, color, outline = false) {
  const path = points.map((point, index) => `${point[0].toFixed(2)} ${(pdf.height - point[1]).toFixed(2)} ${index ? 'l' : 'm'}`).join(' ');
  pdf.page.ops += `${color} ${outline ? 'RG 1 w' : 'rg'} ${path} h ${outline ? 'S' : 'f'}\n`;
}
function lifePDFHeader(pdf, title, subtitle) {
  pdf.page = {ops: '', links: []}; pdf.pages.push(pdf.page);
  pdfText(pdf, 'NORTE', 37, 32, 13, true, '0.46 0.33 0.24');
  pdfText(pdf, 'MISSÃO AURORA / ENGENHARIA DE SISTEMAS', 103, 32, 8, false, '0.46 0.46 0.42');
  pdfText(pdf, 'AUR-CRN-001 · ' + engineering.profile, 632, 32, 8, false, '0.46 0.46 0.42');
  pdfLine(pdf, 37, 45, 805, 45);
  pdfText(pdf, title, 37, 76, 23, true);
  pdfText(pdf, subtitle, 37, 96, 9.5, false, '0.46 0.46 0.42');
}
function buildLifecyclePDF() {
  const pdf = pdfNew(); pdf.width = 841.89; pdf.height = 595.28; pdf.right = 804.89;
  const reviews = lifeReviews().filter(review => review.active);
  const end = lifeRanges()[6].end;
  lifePDFHeader(pdf, 'Cronograma do ciclo de vida', engineering.profile + ' · ' + reviews.length + ' revisões selecionadas · ' + engDate(engineering.start) + ' a ' + engDate(end));
  const m = lifeGraphModel(false, true), scale = 768 / m.width, x0 = 37, y0 = 120;
  const px = x => x0 + x * scale, py = y => y0 + y * scale;
  const text = (value, x, y, size, bold = false, color = '0.17 0.18 0.16', align = 'start') => { pdf.measure.font = `${bold ? 'bold ' : ''}${size * scale}px Arial`; let offset = 0; if (align === 'middle') { offset = pdf.measure.measureText(value).width / 2; } if (align === 'end') { offset = pdf.measure.measureText(value).width; } pdfText(pdf, value, px(x) - offset, py(y), size * scale, bold, color); };
  pdfRect(pdf, px(0), py(0), m.width * scale, m.top * scale, '0.95 0.94 0.91');
  text('ATIVIDADES', 20, 29, 10.5, false, '0.46 0.46 0.42');
  text('Ciclo de vida da missão', 20, 53, 13, true);
  lifeRanges().forEach((phase, index) => { const center = m.left + (index + .5) * m.column; const code = phase.code === 'Pré-A' ? 'Pré-A' : 'Fase ' + phase.code; text(code, center, 25, 13.5, true, '0.17 0.18 0.16', 'middle'); text(phase.name, center, 45, 10.7, false, '0.46 0.46 0.42', 'middle'); text(lifeShortDate(phase.start) + ' · ' + lifeShortDate(phase.end), center, 64, 10.5, false, '0.46 0.46 0.42', 'middle'); });
  for (let i = 0; i <= 7; i += 1) { const x = px(m.left + i * m.column); pdfLine(pdf, x, py(i === 0 ? 0 : m.top), x, py(m.height), '0.86 0.85 0.81', .5); }
  for (let i = 0; i <= 7; i += 1) { const y = py(m.top + i * m.rowHeight); pdfLine(pdf, px(0), y, px(m.width), y, '0.86 0.85 0.81', .5); }
  LIFE_LANES.forEach((lane, i) => { const y = m.top + i * m.rowHeight; text(String(i + 1).padStart(2, '0'), 20, y + 30, 10, false, '0.46 0.46 0.42'); text(lane, 44, y + 30, 12.6); const [start, finish] = LIFE_BANDS[i]; const finishOffset = engineering.profile === 'NASA' && i === 0 ? -1 : 0; pdfRect(pdf, px(m.left + start * m.column + 1), py(y + m.rowHeight / 2 - 2), ((finish + finishOffset - start) * m.column - 2) * scale, 10 * scale, '0.93 0.89 0.84'); });
  for (const marker of m.markers) {
    const {x, y, profile, labelX, labelY, align} = marker;
    const color = profile === 'ECSS' ? '0.58 0.39 0.27' : '0.32 0.43 0.47';
    const points = profile === 'ECSS' ? [[x, y-5.5], [x+5.5, y], [x,y+5.5], [x-5.5,y]] : [[x-6,y-4], [x+6,y-4], [x,y+6]];
    if (Math.abs(labelX-x) > 3) { pdfLine(pdf, px(x), py(y-7), px(labelX), py(labelY+3), '0.74 0.71 0.67', .45); }
    lifePDFPolygon(pdf, points.map(point => [px(point[0]), py(point[1])]), color, profile === 'NASA');
    text(labelReview(marker.review.id), labelX, labelY, 12, true, color, align);
  }
  const launchX = px(m.left + (engineering.profile === 'NASA' ? 5 : 5.245) * m.column);
  pdfLine(pdf, launchX, py(m.top+6), launchX, py(m.height), '0.76 0.69 0.61', .4);
  text('Lançamento', (launchX-x0)/scale+6, m.top+18, 10.5, false, '0.46 0.46 0.42');
  pdfText(pdf, engineering.profile === 'ECSS' ? 'Losango · revisão ECSS' : 'Triângulo · revisão NASA', 37, 429, 9, true, '0.46 0.33 0.24');
  pdfText(pdf, 'Faixas · atividades planejadas', 227, 429, 9, false, '0.46 0.46 0.42');
  pdfText(pdf, 'Fases em largura igual, sem escala de duração. As datas são parâmetros do projeto.', 37, 452, 9, false, '0.46 0.46 0.42');
  const source = engineering.profile === 'NASA' ? SOURCES.nasaLifecycle : SOURCES.ecssLifecycle;
  pdfText(pdf, source.edition, 37, 479, 9, true);
  pdfText(pdf, source.section, 37, 495, 9, false, '0.46 0.46 0.42');
  pdf.y = 513; pdfLink(pdf, 'Consultar referência oficial', source.url, 37, 9);
  const rowsPerPage = 14;
  for (let start = 0; start < reviews.length; start += rowsPerPage) {
    lifePDFHeader(pdf, 'Revisões e períodos de trabalho', 'Datas previstas · ' + engineering.profile + ' · As condições de entrada e a aprovação precisam ser confirmadas.');
    const top = 132;
    const columns = [37, 110, 325, 417, 518, 617, 711];
    const labels = ['REVISÃO', 'OBJETIVO', 'FASE', 'PREPARAR DESDE', 'REVISÃO', 'FECHAR ATÉ', 'DOCUMENTOS'];
    pdfRect(pdf, 37, 118, 768, 28, '0.95 0.94 0.91');
    labels.forEach((label, i) => pdfText(pdf, label, columns[i] + 7, top + 5, 7.3, true, '0.46 0.46 0.42'));
    let y = 146;
    for (const review of reviews.slice(start, start + rowsPerPage)) {
      const phase = lifePhaseOf(review), inputs = reviewDocs(review.id, 'input').length, outputs = reviewDocs(review.id, 'output').length;
      const fields = [labelReview(review.id), review.title, phase.code === 'Pré-A' ? 'Pré-A' : 'Fase ' + phase.code, engDate(addDays(review.date, -review.prepDays)), engDate(review.date), engDate(addDays(review.date, review.closeDays)), inputs + ' ent. / ' + outputs + ' saídas'];
      fields.forEach((field, i) => pdfText(pdf, field, columns[i] + 7, y + 17, i === 1 ? 8.8 : 8.4, i === 0, i === 0 ? '0.46 0.33 0.24' : '0.17 0.18 0.16'));
      y += 26; pdfLine(pdf, 37, y, 805, y, '0.86 0.85 0.81', .5);
    }
    pdfText(pdf, 'Os pacotes de cada marco estão em Documentos e nos detalhes da revisão. Sua composição depende da aplicabilidade e do contrato.', 37, Math.max(y + 23, 532), 8, false, '0.46 0.46 0.42');
  }
  return pdfFinish(pdf, 'AUR-CRN-001 · Planejamento do projeto · Revisões ainda não realizadas');
}
const lifePreviousPDF = buildEngineeringPDF;
buildEngineeringPDF = function(spec) { return spec.content === 'schedule' ? buildLifecyclePDF() : lifePreviousPDF(spec); };
const lifePreviousOpenDocument = openDocument;
openDocument = function(id) {
  lifePreviousOpenDocument(id);
  if (id !== 'CRN') { return; }
  const paper = document.querySelector('#side-panel .eng-document-paper');
  if (!paper) { return; }
  paper.insertAdjacentHTML('afterbegin', `<div class="life-doc-graphic">${lifeSVG(false, true)}</div><button class="text-button" data-engine="life-svg">${icon('download')}Baixar diagrama vetorial</button>`);
};
// O endereço com #cronograma abre esta área diretamente.
if (location.hash === '#cronograma' || document.body.dataset.startModule === 'schedule') { showModule('schedule'); }

let lifeResizeFrame = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(lifeResizeFrame); lifeResizeFrame = requestAnimationFrame(() => { if (engineering.module === 'schedule') { preserveScheduleRender(); } }); });
