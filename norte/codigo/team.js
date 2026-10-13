// Presença é efêmera. Rascunhos, concessões e decisões ficam no banco com CAS.
const collaboration = {tab:crypto.randomUUID(),people:[],working:null,team:null,change:null,polling:false,projectId:null,documentEdits:new Map()};
const roleNames = {owner:'Proprietário',viewer:'Leitor',editor:'Editor',reviewer:'Revisor'};
const changeNames = {draft:'Rascunho',open:'Em revisão',changes_requested:'Ajustes solicitados',merged:'Incorporada',closed:'Encerrada'};
Object.assign(platformErrors,{single_user_plan:'A colaboração está disponível no teste avançado e no Profissional do proprietário.',review_required:'Esta alteração precisa de aprovação de outra pessoa antes de entrar no projeto.',review_not_authorized:'Seu cargo não permite esta decisão, ou um dos acessos foi removido.',invitation_unavailable:'Este convite expirou, já foi respondido ou pertence a outro e-mail.',invalid_grant:'Confira o cargo, os documentos e a validade do acesso.',team_limit:'O limite de participantes ou convites deste projeto foi atingido.',change_limit:'O limite de propostas deste projeto foi atingido.',document_removed:'O documento foi removido da versão oficial. Seu rascunho foi preservado.'});
function projectAccess() { return platform.current?.access || {role:'owner',scope:'project',documents:{},advanced:false}; }
function projectEditable() { return !platform.current || (projectAccess().scope === 'project' && ['owner','editor'].includes(projectAccess().role) && !platform.current.archived && (projectAccess().role === 'owner' || projectAccess().advanced)); }
function usesWorkingCopy() { return platform.current && (projectAccess().role === 'editor' || platform.current.review_required || collaboration.working); }
function teamPath(suffix = '') { return '/api/projects/' + platform.current.id + suffix; }
function documentEditKey(id) { return (platform.current?.id || 'demo') + '/' + id; }
function forgetDocumentEdits(projectId) { for (const key of collaboration.documentEdits.keys()) { if (key.startsWith(projectId + '/')) { collaboration.documentEdits.delete(key); } } }
function teamPanel(title,body,footer = '') { setPanel('team',panelHeading(title,'') + `<div class="panel-body team-panel">${body}<p id="team-error" class="platform-error" role="alert"></p></div>${footer ? `<div class="panel-footer">${footer}</div>` : ''}`); }
function teamError(error) { platformError(error); if (el('team-error')) { el('team-error').textContent = error.message; } }
function updateCollaboration() {
  let nav = el('project-collaboration');
  if (!nav) { nav = document.createElement('div'); nav.id = 'project-collaboration'; nav.className = 'project-collaboration'; el('workspace').querySelector('.eng-navigation').insertBefore(nav,el('workspace').querySelector('.project-navigation-footer')); }
  nav.hidden = !platform.current;
  const access = projectAccess();
  if (platform.current) { nav.innerHTML = `<button class="text-button" data-team="team">${icon('grid')}Equipe e acesso</button><button class="text-button" data-team="changes">${icon('check')}Alterações${collaboration.working ? '<span class="team-dot" aria-label="Com rascunho"></span>' : ''}</button><button class="presence-button" data-team="online" aria-label="Pessoas online no projeto"><span class="presence-avatars">${collaboration.people.slice(0,3).map(person => `<span title="${safe(person.name)}">${safe(person.name.slice(0,1).toUpperCase())}</span>`).join('')}</span><span>${collaboration.people.length ? collaboration.people.length + ' online' : 'Ver presença'}</span></button><span class="project-role">${safe(roleNames[access.role])}${access.scope === 'documents' ? ' · documentos selecionados' : ''}</span>`; }
  document.querySelectorAll('.eng-nav [data-module]').forEach(button => { button.hidden = Boolean(platform.current && access.scope === 'documents' && button.dataset.module !== 'documents'); });
  el('workspace').querySelector('.project-rename').hidden = Boolean(platform.current && access.role !== 'owner');
  el('workspace').classList.toggle('workspace-readonly',!projectEditable());
  el('workspace').classList.toggle('workspace-documents-only',Boolean(platform.current && access.scope === 'documents'));
  el('workspace').classList.toggle('workspace-shared',Boolean(platform.current && access.role !== 'owner'));
  document.querySelectorAll('#workspace [data-engine-profile],#workspace [data-review-date],#workspace [data-review-toggle],#workspace [data-review-prep],#workspace [data-review-close]').forEach(input => { input.disabled = !projectEditable(); });
  let banner = el('project-version-notice');
  if (!banner) { banner = document.createElement('div'); banner.id = 'project-version-notice'; banner.className = 'project-version-notice'; el('main-content').prepend(banner); }
  banner.hidden = !platform.current || (!usesWorkingCopy() && !collaboration.remoteVersion);
  if (!banner.hidden) { banner.innerHTML = `<span>${collaboration.remoteVersion ? 'Há uma versão mais recente no projeto.' : collaboration.working ? 'Seu rascunho · a versão oficial permanece publicada.' : 'Alterações passam por revisão antes de entrar no projeto.'}</span><button class="text-button" data-team="${collaboration.working ? 'my-change' : collaboration.remoteVersion ? 'reload' : 'changes'}">${collaboration.working ? 'Revisar proposta' : collaboration.remoteVersion ? 'Conferir versão' : 'Ver alterações'}${icon('arrow')}</button>`; }
}
const teamShowModule = showModule;
showModule = function(module) { teamShowModule(platform.current && projectAccess().scope === 'documents' ? 'documents' : module); updateCollaboration(); };
const teamSetPanel = setPanel;
setPanel = function(kind,content,focus = true) { teamSetPanel(kind,content,focus); el('side-panel').querySelectorAll('input[data-life],select[data-engine-profile]').forEach(input => { input.disabled = !projectEditable(); }); };
const teamProjectDocuments = projectDocuments;
projectDocuments = function() { const docs = teamProjectDocuments(); return platform.current && projectAccess().scope === 'documents' ? docs.filter(doc => Object.hasOwn(projectAccess().documents,doc.id)) : docs; };
const teamApplyProject = applyProject;
applyProject = function(row) {
  collaboration.people = []; collaboration.remoteVersion = null; collaboration.working = row.workingCopy || null; collaboration.projectId = row.id;
  teamApplyProject(collaboration.working ? {...row,payload:structuredClone(collaboration.working.after)} : row);
  if (collaboration.working) { setSaveState('Rascunho salvo'); }
  updateCollaboration(); if (row.access) { heartbeat().catch(teamError); }
};
const teamLoadDemo = loadDemo;
loadDemo = function() { leavePresence(); collaboration.documentEdits.clear(); collaboration.working = null; collaboration.people = []; collaboration.remoteVersion = null; teamLoadDemo(); updateCollaboration(); };
const teamAccountView = accountView;
accountView = function(content) { leavePresence(); teamAccountView(content); };
const teamFlushProject = flushProject;
flushProject = async function() {
  if (!platform.current || !projectEditable()) { return true; }
  if (!usesWorkingCopy()) { const access = platform.current.access; const result = await teamFlushProject(); if (platform.current && access) { platform.current.access = access; } return result; }
  if (platform.saving) { await platform.saving; return flushProject(); }
  const snapshot = JSON.stringify(projectPayload()); if (snapshot === platform.lastSaved) { return true; }
  if (platform.conflict) { return false; }
  const work = collaboration.working; const projectId = platform.current.id;
  setSaveState('Salvando rascunho…');
  const task = (async () => {
    try {
      const result = await api(teamPath('/draft'),'PUT',{changeId:work?.id || null,revision:work?.revision || 0,version:work?.baseVersion || platform.current.version,payload:JSON.parse(snapshot)});
      if (platform.current?.id !== projectId) { return false; }
      collaboration.working = result; platform.lastSaved = snapshot; platform.retryAt = 0; setSaveState('Rascunho salvo'); updateCollaboration(); return true;
    } catch(error) { platform.conflict = error.code === 'version_conflict'; platform.retryAt = Date.now() + 15000; setSaveState('Rascunho preservado nesta aba',true); if (platform.conflict) { collaboration.remoteVersion = true; updateCollaboration(); } teamError(error); return false; }
  })();
  platform.saving = task; try { return await task; } finally { platform.saving = false; }
};
async function heartbeat() {
  if (collaboration.polling || !platform.user || !platform.current?.access || state.view !== 'workspace' || document.hidden) { return; }
  collaboration.polling = true; const id = platform.current.id;
  const editing = state.panel === 'edit' ? state.selectedId || '' : state.panel === 'document' || state.panel === 'document-edit' ? engineering.docId || '' : '';
  try {
    const result = await api(teamPath('/presence'),'POST',{tabId:collaboration.tab,module:projectAccess().scope === 'documents' ? 'documents' : engineering.module,editing});
    if (platform.current?.id !== id) { return; }
    collaboration.people = result.people;
    if (result.projectVersion !== platform.current.version) { collaboration.remoteVersion = result.projectVersion; }
    if (result.teamVersion !== platform.current.team_version) { const context = await api(teamPath()); if (JSON.stringify(context.access) !== JSON.stringify(platform.current.access)) { forgetDocumentEdits(id); applyProject(context); message('Seu acesso ao projeto foi atualizado.'); } else { platform.current.team_version = context.team_version; platform.current.review_required = context.review_required; } }
    updateCollaboration();
  } catch(error) {
    if (error.code === 'not_found' && platform.current?.id === id) { forgetDocumentEdits(id); platform.current = null; collaboration.working = null; requirements = []; verifications = []; engineering.customDocs = []; accountView('<h1>Acesso encerrado</h1><p>Seu acesso a este projeto foi removido ou expirou.</p><button class="button secondary" data-platform="projects">Meus projetos</button>'); }
  } finally { collaboration.polling = false; }
}
function leavePresence() {
  if (!platform.current?.access || !platform.user) { return; }
  fetch(teamPath('/presence'),{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':platform.csrf},credentials:'same-origin',keepalive:true,body:JSON.stringify({tabId:collaboration.tab,module:projectAccess().scope === 'documents' ? 'documents' : engineering.module,leave:true})}).catch(() => {});
}
setInterval(() => heartbeat().catch(() => {}),20000);
document.addEventListener('visibilitychange',() => { if (document.hidden) { leavePresence(); } else { heartbeat().catch(() => {}); } });
window.addEventListener('pagehide',leavePresence);
window.addEventListener('beforeunload',event => { if (collaboration.documentEdits.size || platform.current && JSON.stringify(projectPayload()) !== platform.lastSaved) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('input',event => { if (event.target.matches('[data-team-form="document"] textarea[name="body"]')) { const key = documentEditKey(event.target.closest('form').dataset.id); const previous = collaboration.documentEdits.get(key); collaboration.documentEdits.set(key,{...(previous || {draft:collaboration.documentDraft,version:collaboration.documentVersion}),body:event.target.value}); setSaveState('Texto nesta aba · salve o conteúdo'); } });

async function showTeam() {
  if (!platform.current) { return; }
  collaboration.team = await api(teamPath('/team')); const data = collaboration.team; const owner = projectAccess().role === 'owner';
  const members = data.members.map(member => `<article class="team-person"><div><strong>${safe(member.email)}</strong><span>${safe(roleNames[member.role])} · ${member.scope === 'project' ? 'Projeto inteiro' : Object.keys(member.documents).length + ' documentos'}</span><small>Até ${new Date(member.expires).toLocaleDateString('pt-BR')}</small></div>${owner ? `<div class="team-row-actions"><button class="text-button" data-team="edit-member" data-id="${member.userId}">Permissões</button><button class="text-button" data-team="revoke" data-id="${member.userId}">Remover</button></div>` : ''}</article>`).join('');
  const invites = data.invitations.map(invite => `<article class="team-person"><div><strong>${safe(invite.email)}</strong><span>Convite pendente · ${safe(roleNames[invite.role])}</span></div><button class="text-button" data-team="cancel-invite" data-id="${invite.id}">Cancelar</button></article>`).join('');
  const intro = owner ? `<div class="team-intro"><p>Defina quem pode acompanhar, propor alterações e revisar este projeto.</p>${data.advanced ? '<button class="button primary" data-team="invite">'+icon('plus')+'Convidar pessoa</button>' : '<p class="platform-note">Disponível no teste avançado e no Profissional. Os convidados usam o acesso do projeto.</p><button class="button secondary" data-platform="projects">Ver meu plano</button>'}</div>` : '<p>Seu acesso foi concedido pelo proprietário. Alterações propostas passam por revisão.</p>';
  const protection = owner ? `<div class="team-protection"><h3>Revisão antes de publicar</h3><p>Inclui alterações feitas pelo proprietário. Uma segunda pessoa precisa aprovar a proposta.</p><label><input type="checkbox" data-team-protection ${data.reviewRequired ? 'checked' : ''} ${!data.advanced && !data.reviewRequired ? 'disabled' : ''}>Exigir revisão em todas as alterações</label></div>` : '';
  teamPanel('Equipe e acesso',intro + '<h3>Participantes</h3><article class="team-person"><div><strong>Proprietário do projeto</strong><span>Gerencia acessos e incorpora as alterações aprovadas</span></div></article>' + members + (invites ? '<h3>Convites</h3>' + invites : '') + protection);
}
function grantForm(userId) {
  const member = collaboration.team?.members.find(item => item.userId === userId); const docs = teamProjectDocuments();
  const options = Object.entries(roleNames).filter(([role]) => role !== 'owner').map(([role,label]) => `<option value="${role}" ${member?.role === role ? 'selected' : ''}>${label}</option>`).join('');
  const rows = docs.map(doc => `<label class="document-permission"><span>${safe(doc.title)}<small>${safe(doc.code)}</small></span><select name="doc:${safe(doc.id)}" aria-label="Permissão para ${safe(doc.title)}"><option value="">Sem acesso</option><option value="view" ${member?.documents[doc.id] === 'view' ? 'selected' : ''}>Visualizar</option>${engineering.customDocs.some(d => d.id === doc.id) ? `<option value="edit" ${member?.documents[doc.id] === 'edit' ? 'selected' : ''}>Propor edição</option>` : ''}</select></label>`).join('');
  teamPanel(member ? 'Permissões da pessoa' : 'Convidar pessoa',`<form class="platform-form" data-team-form="grant" data-id="${member?.userId || ''}">${member ? `<p>${safe(member.email)}</p>` : '<label>E-mail<input name="email" type="email" required maxlength="200" autocomplete="email"></label>'}<label>Cargo<select name="role" aria-label="Cargo" data-team-role>${options}</select></label><p class="platform-note">Leitores consultam. Editores propõem mudanças. Revisores aprovam propostas de outras pessoas.</p><label>Acesso<select name="scope" aria-label="Acesso" data-team-scope><option value="project">Projeto inteiro</option><option value="documents" ${member?.scope === 'documents' ? 'selected' : ''}>Documentos selecionados</option></select></label><div class="document-permissions" ${member?.scope !== 'documents' ? 'hidden' : ''}>${rows}</div><label>Válido até<input name="expires" type="date" required min="${new Date(Date.now()+86400000).toISOString().slice(0,10)}" max="${new Date(Date.now()+89*86400000).toISOString().slice(0,10)}" value="${member ? member.expires.slice(0,10) : new Date(Date.now()+30*86400000).toISOString().slice(0,10)}"></label><p class="platform-note">O convite aparece na conta desse e-mail. Você também pode compartilhar o link da plataforma.</p><div class="platform-actions"><button class="button primary">${member ? 'Salvar permissões' : 'Criar convite'}</button><button type="button" class="text-button" data-team="team">Cancelar</button></div></form>`);
}
async function showOnline() { await heartbeat(); teamPanel('Pessoas no projeto',`<p class="platform-note">Atualizado a cada 20 segundos. Uma aba fechada deixa de aparecer em até um minuto.</p>${collaboration.people.map(person => `<article class="team-person"><div><strong>${safe(person.name)}${person.userId === platform.user.id ? ' · você' : ''}</strong><span>${safe(roleNames[person.role] || 'Leitor')} · ${safe({requirements:'Requisitos',verification:'Verificação',documents:'Documentos',schedule:'Cronograma',team:'Equipe',changes:'Alterações'}[person.module] || '')}${person.editing ? ' · editando '+safe(person.editing) : ''}</span></div><span class="online-dot" aria-label="Online"></span></article>`).join('')}`); }
const teamProjectsPage = projectsPage;
projectsPage = async function() {
  await teamProjectsPage(); if (!platform.user || !el('account-page').querySelector('.project-list')) { return; }
  // A resposta não informa se outros e-mails possuem conta.
  try { const invitations = await api('/api/invitations'); if (!invitations.length) { return; } const container = document.createElement('section'); container.className = 'project-invitations'; container.innerHTML = '<h2>Convites para você</h2>' + invitations.map(invite => `<article class="team-person"><div><strong>${safe(invite.projectName)}</strong><span>${safe(roleNames[invite.role])} · ${invite.scope === 'project' ? 'Projeto inteiro' : 'Documentos selecionados'}</span></div><button class="button primary" data-team="accept-invite" data-id="${invite.id}">Aceitar</button><button class="text-button" data-team="decline-invite" data-id="${invite.id}">Recusar</button></article>`).join(''); el('account-page').querySelector('.project-list').before(container); } catch(error) { teamError(error); }
};

function diffFields(before,after,path = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) { return []; }
  if (before && after && !Array.isArray(before) && !Array.isArray(after) && typeof before === 'object' && typeof after === 'object') { return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key => diffFields(before[key],after[key],path ? path + ' / ' + key : key)); }
  if (Array.isArray(before) && Array.isArray(after) && [...before,...after].every(item => item && typeof item.id === 'string')) { return [...new Set([...before.map(item => item.id),...after.map(item => item.id)])].flatMap(id => diffFields(before.find(item => item.id === id),after.find(item => item.id === id),path + ' / ' + id)); }
  return [{path,before,after}];
}
function diffText(value) { return value === undefined || value === null ? 'Não registrado' : typeof value === 'string' ? value : JSON.stringify(value,null,2); }
async function showChanges() {
  if (!platform.current) { return; }
  const list = await api(teamPath('/changes'));
  teamPanel('Alterações do projeto',`<p class="platform-note">Propostas são revisadas antes da incorporação. A aprovação vale somente para a versão conferida.</p>${list.map(change => `<button class="change-list-item" data-team="change" data-id="${change.id}"><span><strong>${safe(change.title || 'Rascunho de '+change.authorName)}</strong><small>${safe(change.authorName)} · base v${change.baseVersion}${change.documentId ? ' · '+safe(change.documentId) : ''}</small></span><span class="change-status ${change.status}">${changeNames[change.status]}</span>${icon('chevron')}</button>`).join('') || '<div class="team-empty">Ainda não há propostas. As edições dos colaboradores serão salvas como rascunhos.</div>'}`);
}
async function showChange(id) {
  const change = await api(teamPath('/changes/' + id)); collaboration.change = change;
  if (collaboration.working?.id === id && JSON.stringify(projectPayload()) !== platform.lastSaved && change.revision !== collaboration.working.revision) { showSaveConflict(); return; }
  const mine = change.authorId === platform.user.id; const open = !['merged','closed'].includes(change.status);
  const changes = diffFields(change.before,change.after);
  const diff = changes.map(item => `<details class="change-diff" open><summary>${safe(item.path.replace('requirements','Requisitos').replace('verifications','Verificações').replace('engineering','Documentos e cronograma'))}</summary><div class="change-before"><span>Anterior</span><pre>${safe(diffText(item.before))}</pre></div><div class="change-after"><span>Proposto</span><pre>${safe(diffText(item.after))}</pre></div></details>`).join('');
  const submit = mine && open ? `<form class="platform-form change-submit" data-team-form="submit"><label>Título da proposta<input name="title" required minlength="3" maxlength="160" value="${safe(change.title)}" placeholder="O que você alterou?"></label><label>Motivo<textarea name="description" maxlength="4000" rows="2">${safe(change.description)}</textarea></label><button class="button primary">Enviar para revisão</button></form>` : '';
  const review = open && ['open','changes_requested'].includes(change.status) ? `<form class="platform-form change-review" data-team-form="review"><label>Comentário<textarea name="comment" rows="3" maxlength="4000" placeholder="Registre sua avaliação"></textarea></label><label>Decisão<select name="decision" aria-label="Decisão"><option value="comment">Comentar</option>${!mine && ['owner','reviewer'].includes(projectAccess().role) ? '<option value="approve">Aprovar esta versão</option><option value="request_changes">Solicitar ajustes</option>' : ''}</select></label><button class="button secondary">Registrar revisão</button></form>` : '';
  const history = change.reviews.map(r => `<article class="change-review-entry"><strong>${safe(r.reviewerName)}</strong><span>${{approve:'Aprovou',request_changes:'Solicitou ajustes',comment:'Comentou'}[r.decision]} · proposta v${r.revision}${r.revision !== change.revision ? ' · versão anterior' : ''}</span><p>${safe(r.comment)}</p></article>`).join('');
  const owner = projectAccess().role === 'owner';
  const actions = open ? `${mine ? '<button class="text-button" data-team="rebase">Comparar com a versão atual</button><button class="text-button" data-team="continue-draft">Continuar editando</button>' : ''}${owner && ['open','changes_requested'].includes(change.status) ? '<button class="button primary" data-team="merge">Incorporar após aprovação</button>' : ''}${mine || owner ? '<button class="text-button" data-team="close-change">Encerrar proposta</button>' : ''}` : '';
  teamPanel(change.title || 'Seu rascunho',`<div class="change-meta"><span class="change-status ${change.status}">${changeNames[change.status]}</span><span>Proposta v${change.revision} · base v${change.baseVersion}</span></div>${change.mergedVersion ? '<p>Incorporada à versão '+change.mergedVersion+' do projeto.</p>' : ''}${submit}<h3>Comparação</h3>${diff || '<p>Nenhuma alteração de conteúdo.</p>'}<h3>Revisões e comentários</h3>${history || '<p class="platform-note">Nenhuma revisão registrada.</p>'}${review}`,actions);
}
async function changeAction(action,data = {}) {
  const c = collaboration.change; if (!c) { return; }
  const result = await api(teamPath('/changes/' + c.id),'POST',{action,revision:c.revision,...data});
  if (collaboration.working?.id === c.id && ['closed','merged'].includes(result.status)) { collaboration.working = null; platform.conflict = false; applyProject(await api(teamPath())); }
  if (action === 'merge') { const row = await api(teamPath()); if (!collaboration.working && JSON.stringify(projectPayload()) === platform.lastSaved) { applyProject(row); } else { collaboration.remoteVersion = row.version; } }
  await showChange(c.id); updateCollaboration();
}
async function rebaseChange(resolutions = []) {
  const c = collaboration.change; const latest = await api(teamPath());
  const unsaved = collaboration.working?.id === c.id && JSON.stringify(projectPayload()) !== platform.lastSaved;
  if (unsaved && collaboration.working.revision !== c.revision) { showSaveConflict(); return; }
  const pendingDocument = collaboration.documentEdits.get(documentEditKey(c.documentId));
  if (pendingDocument && (pendingDocument.draft?.revision || 0) !== c.revision) { showSaveConflict(); return; }
  if (!resolutions.length) { collaboration.rebasePending = pendingDocument ? {body:pendingDocument.body} : unsaved ? structuredClone(projectPayload()) : undefined; }
  const result = await api(teamPath('/changes/' + c.id + '/rebase'),'POST',{revision:c.revision,version:resolutions.length ? collaboration.conflictVersion : latest.version,resolutions,...(collaboration.rebasePending === undefined ? {} : {pending:collaboration.rebasePending})});
  if (result.merged) {
    platform.conflict = false; collaboration.working = result.change.documentId ? collaboration.working : result.change;
    if (!result.change.documentId) { applyProject({...latest,workingCopy:result.change}); } else { collaboration.documentEdits.delete(documentEditKey(result.change.documentId)); }
    await showChange(result.change.id); message('Comparação concluída. Confira e envie a nova versão para revisão.'); return;
  }
  collaboration.conflictVersion = result.version; collaboration.conflicts = result.conflicts;
  teamPanel('Resolver diferenças',`<p>As duas versões mudaram o mesmo campo. Escolha qual conteúdo deve seguir na proposta.</p><form class="platform-form" data-team-form="resolve">${result.conflicts.map((conflict,i) => `<fieldset class="conflict-field"><legend>${safe(conflict.path)}</legend><label><input type="radio" name="conflict-${i}" value="mine" required>Minha proposta<pre>${safe(diffText(conflict.mine))}</pre></label><label><input type="radio" name="conflict-${i}" value="current" required>Versão atual do projeto<pre>${safe(diffText(conflict.current))}</pre></label></fieldset>`).join('')}<button class="button primary">Salvar escolhas no rascunho</button></form>`);
}
const teamOpenDocument = openDocument;
openDocument = function(id) {
  if (!platform.current || projectAccess().scope === 'project') { teamOpenDocument(id); const doc = engineering.customDocs.find(d => d.id === id); if (doc && projectEditable()) { el('side-panel').querySelector('.panel-footer').insertAdjacentHTML('afterbegin',`<button class="button secondary" data-team="edit-document" data-id="${safe(id)}">${icon('pencil')}Editar</button>`); } return; }
  engineering.docId = id;
  (async () => { const result = await api(teamPath('/documents/' + encodeURIComponent(id))); if (engineering.docId !== id) { return; } const doc = result.document; const blocks = doc.sections.flatMap(section => [{type:'heading',text:section.title},...(section.body ? [{type:'paragraph',text:section.body}] : []),...(section.rows ? [{type:'table',headers:section.headers || ['Campo','Registro'],rows:section.rows}] : [])]); setPanel('document',panelHeading(doc.title,id) + `<div class="panel-body"><article class="eng-document-paper"><h3>${safe(doc.title)}</h3><p class="eng-preview-note">Versão oficial ${result.projectVersion}</p>${blocksHTML(blocks)}</article></div><div class="panel-footer">${projectAccess().role === 'editor' && projectAccess().documents[id] === 'edit' ? `<button class="button secondary" data-team="edit-document" data-id="${safe(id)}">Propor edição</button>` : ''}<button class="button primary" data-engine="document-pdf" data-id="${safe(id)}">Baixar PDF</button></div>`); })().catch(teamError);
};
async function editDocument(id) {
  const doc = engineering.customDocs.find(d => d.id === id); if (!doc) { return; }
  let existing = null; if (platform.current) { const list = await api(teamPath('/changes')); const item = list.find(c => c.documentId === id && c.authorId === platform.user.id && !['closed','merged'].includes(c.status)); if (item) { existing = await api(teamPath('/changes/' + item.id)); } }
  const pending = collaboration.documentEdits.get(documentEditKey(id));
  collaboration.documentDraft = pending ? pending.draft : existing; collaboration.documentVersion = pending?.version || platform.current?.version; engineering.docId = id;
  setPanel('document-edit',panelHeading(doc.title,doc.code) + `<div class="panel-body"><form class="platform-form" data-team-form="document" data-id="${safe(id)}"><label>Conteúdo<textarea name="body" rows="18" maxlength="20000">${safe(pending?.body ?? existing?.after.body ?? doc.body ?? '')}</textarea></label><p class="platform-note">${usesWorkingCopy() || projectAccess().scope === 'documents' ? 'A edição será salva como proposta para revisão.' : 'A alteração será salva no projeto.'} Até salvar, o texto fica preservado nesta aba.</p><button class="button primary">Salvar conteúdo</button></form><p id="team-error" class="platform-error" role="alert"></p></div>`);
}
const teamGenerateSaved = generateSaved;
generateSaved = async function(format,documents,review) {
  if (platform.current && projectAccess().role === 'owner' && usesWorkingCopy()) { collaboration.generateOfficial = {format,documents,review}; platformDialog('Gerar a versão oficial',`<p>O arquivo usará a versão oficial ${platform.current.version}. Seu rascunho entra nos documentos depois da revisão e incorporação.</p><button class="button primary" data-team="generate-official">Gerar versão oficial</button>`); return; }
  if (!platform.current || projectAccess().role === 'owner') { return teamGenerateSaved(format,documents,review); }
  const jobs = await api(teamPath('/jobs')); const job = jobs.find(j => j.status === 'ready' && j.input.format === format && documents.length === 1 && j.input.documents.length === 1 && j.input.documents[0] === documents[0]);
  if (!job) { teamPanel('Arquivo ainda não gerado','<p>Você pode consultar a prévia do documento. O proprietário precisa gerar o arquivo para disponibilizar o download.</p>'); return; }
  const link = document.createElement('a'); link.href = '/api/jobs/' + job.id + '/download'; link.download = job.filename; link.click();
};

window.addEventListener('click',event => {
  if (event.target.closest('[data-platform="draft-export"]') && collaboration.documentEdits.size) { event.preventDefault(); event.stopImmediatePropagation(); const pendingDocuments = Object.fromEntries([...collaboration.documentEdits].filter(([key]) => key.startsWith((platform.current?.id || 'demo') + '/')).map(([key,value]) => [key.split('/')[1],value.body])); downloadBlob(new Blob([JSON.stringify({project:projectPayload(),pendingDocuments},null,2)],{type:'application/json'}),'norte-rascunho-nao-salvo.json'); return; }
  const button = event.target.closest('[data-team]');
  if (button) { event.preventDefault(); event.stopImmediatePropagation(); const action = button.dataset.team; const id = button.dataset.id;
    (async () => {
      if (action === 'team') { await showTeam(); }
      else if (action === 'invite') { grantForm(); }
      else if (action === 'edit-member') { grantForm(id); }
      else if (action === 'online') { await showOnline(); }
      else if (action === 'revoke' || action === 'cancel-invite') { collaboration.team = await api(teamPath('/team'),'POST',{action:action === 'revoke' ? 'revoke' : 'cancel',version:collaboration.team.version,...(action === 'revoke' ? {userId:id} : {invitationId:id})}); await showTeam(); }
      else if (action === 'accept-invite' || action === 'decline-invite') { const result = await api('/api/invitations/' + id,'POST',{accept:action === 'accept-invite'}); if (result.accepted) { applyProject(await api('/api/projects/' + result.projectId)); } else { await projectsPage(); } }
      else if (action === 'changes') { await showChanges(); }
      else if (action === 'change') { await showChange(id); }
      else if (action === 'my-change') { await flushProject(); if (collaboration.working) { await showChange(collaboration.working.id); } }
      else if (action === 'merge') { await changeAction('merge'); }
      else if (action === 'close-change') { await changeAction('close'); }
      else if (action === 'rebase') { await rebaseChange(); }
      else if (action === 'reload') { if (JSON.stringify(projectPayload()) !== platform.lastSaved) { showSaveConflict(); return; } applyProject(await api(teamPath())); }
      else if (action === 'continue-draft') { if (collaboration.change.documentId) { await editDocument(collaboration.change.documentId); } else if (JSON.stringify(projectPayload()) !== platform.lastSaved) { closePanel(true); } else { applyProject(await api(teamPath())); closePanel(true); } }
      else if (action === 'edit-document') { await editDocument(id); }
      else if (action === 'generate-official') { const input = collaboration.generateOfficial; el('platform-dialog')?.remove(); await teamGenerateSaved(input.format,input.documents,input.review); }
    })().catch(teamError); return;
  }
  if (platform.current && !projectEditable()) { const action = event.target.closest('[data-action],[data-engine]'); const mutate = ['edit','save-draft','save-analyse','delete','review','add-requirement','verification-new','verification-edit','link-verifications','company-document-form','generate-schedule']; if (action && mutate.includes(action.dataset.action || action.dataset.engine)) { event.preventDefault(); event.stopImmediatePropagation(); message('Seu acesso permite consultar este conteúdo.',true); } }
},true);
window.addEventListener('change',event => {
  if (event.target.matches('[data-team-scope]')) { event.target.closest('form').querySelector('.document-permissions').hidden = event.target.value !== 'documents'; }
  if (event.target.matches('[data-team-role],[data-team-scope]')) { const form = event.target.closest('form'); const editor = form.elements.role.value === 'editor'; form.querySelectorAll('.document-permissions option[value="edit"]').forEach(option => { option.disabled = !editor; if (!editor && option.selected) { option.parentElement.value = 'view'; } }); }
  if (event.target.matches('[data-team-protection]')) { const required = event.target.checked; api(teamPath('/team'),'POST',{action:'protection',version:collaboration.team.version,required}).then(data => { collaboration.team = data; platform.current.review_required = data.reviewRequired; platform.current.team_version = data.version; updateCollaboration(); }).catch(error => { event.target.checked = !required; teamError(error); }); }
});
window.addEventListener('submit',event => {
  const form = event.target.closest('[data-team-form]'); if (!form) { return; } event.preventDefault(); event.stopImmediatePropagation(); const data = Object.fromEntries(new FormData(form)); const button = form.querySelector('button'); if (button) { button.disabled = true; }
  (async () => {
    if (form.dataset.teamForm === 'grant') { const documents = data.scope === 'documents' ? Object.fromEntries(Object.entries(data).filter(([key,value]) => key.startsWith('doc:') && value).map(([key,value]) => [key.slice(4),value])) : {}; const input = {action:form.dataset.id ? 'update' : 'invite',version:collaboration.team.version,role:data.role,scope:data.scope,documents,expires:new Date(data.expires + 'T23:59:00Z').toISOString(),...(form.dataset.id ? {userId:form.dataset.id} : {email:data.email})}; collaboration.team = await api(teamPath('/team'),'POST',input); await showTeam(); message('Acesso registrado. O convite pode ser aceito na conta indicada.'); }
    else if (form.dataset.teamForm === 'submit') { if (collaboration.working?.id === collaboration.change.id && !await flushProject()) { return; } if (collaboration.working?.id === collaboration.change.id) { collaboration.change = collaboration.working; } await changeAction('submit',data); }
    else if (form.dataset.teamForm === 'review') { await changeAction('review',data); }
    else if (form.dataset.teamForm === 'resolve') { await rebaseChange(collaboration.conflicts.map((conflict,i) => ({path:conflict.path,choice:data['conflict-' + i]}))); }
    else if (form.dataset.teamForm === 'document') {
      if (projectAccess().scope === 'documents' || collaboration.documentDraft) { const d = collaboration.documentDraft; const change = await api(teamPath('/draft'),'PUT',{changeId:d?.id || null,revision:d?.revision || 0,version:d?.baseVersion || collaboration.documentVersion,documentId:form.dataset.id,payload:{body:data.body}}); collaboration.documentEdits.delete(documentEditKey(form.dataset.id)); await showChange(change.id); }
      else { engineering.customDocs.find(doc => doc.id === form.dataset.id).body = data.body; if (await flushProject()) { collaboration.documentEdits.delete(documentEditKey(form.dataset.id)); openDocument(form.dataset.id); } }
    }
  })().catch(teamError).finally(() => { if (button?.isConnected) { button.disabled = false; } });
},true);
