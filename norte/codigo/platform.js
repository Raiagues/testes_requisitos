// Sessões ficam em cookies HttpOnly. Somente preferências visuais usam localStorage.
const platform = {csrf:'',user:null,configured:false,offer:null,entitlements:null,current:null,lastSaved:'',saving:false,conflict:false,projects:[],draftGeneration:null};
const platformDemo = {requirements:structuredClone(requirements),verifications:structuredClone(verifications),engineering:structuredClone(engineering),settings:structuredClone(settings)};
REVIEW_PROFILES.CUSTOM = [];
LIFE_DURATIONS.CUSTOM = [8,12,16,22,22,52,8];
LIFE_PHASES.CUSTOM = LIFE_PHASES.NASA.map(phase => ({...phase}));
const platformErrors = {auth_email_unavailable:'O envio de e-mails está indisponível. Tente novamente mais tarde.',storage_limit:'O limite de armazenamento foi atingido. A exportação dos dados originais continua disponível.',quote_expired_or_changed:'A cotação mudou ou expirou. Confira novamente a configuração antes de enviar.',commercial_setup_required:'O responsável pelo serviço e o contato de privacidade precisam ser configurados.',setup_required:'O serviço de contas ainda precisa ser configurado.',invalid_input:'Confira os campos informados. O rascunho foi preservado.',version_conflict:'Outra aba alterou este projeto. Seu rascunho foi preservado; compare antes de recarregar.',project_limit:'O plano atual atingiu o limite de projetos ativos. Arquive um projeto ou consulte os planos.',content_limit:'O limite foi atingido. Você pode corrigir e reduzir os registros existentes.',advanced_required:'Este recurso faz parte do teste avançado ou do Profissional. Os dados originais continuam disponíveis.',generation_limit:'A cota de novas gerações avançadas foi atingida. Arquivos já gerados continuam disponíveis.',trial_already_used:'O teste desta conta já foi ativado.',choose_editable_project:'Escolha este projeto para edição no Essencial em Meus projetos.',offer_pending:'A oferta aguarda validação operacional. Nenhum pedido ou pagamento foi registrado.',invalid_credentials_or_confirmation:'Confira seu e-mail, senha e a confirmação da conta.',not_authenticated:'Entre na sua conta para continuar.',session_expired:'Sua sessão expirou. Entre novamente; o rascunho permanece nesta aba.',technical_ai_disabled:'A análise técnica por IA está desativada. As checagens locais continuam disponíveis.',technical_ai_not_authorized:'O processamento externo não está autorizado para este projeto.',analysis_requires_manual_review:'Esta entrada requer avaliação manual. O texto original foi preservado.',source_not_authorized:'O acesso ao original ainda não foi autorizado.',source_original_pending:'O original ainda não foi disponibilizado.',admin_mfa_recent_required:'Confirme o segundo fator para acessar a administração.',use_product_first:'Gere um documento ou vincule uma verificação antes da avaliação.',upload_inspection_unavailable:'Uploads indisponíveis até a configuração da inspeção de arquivos.'};
async function api(url,method = 'GET',body) {
  const headers = {};
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = platform.csrf; }
  const response = await fetch(url,{method,headers,credentials:'same-origin',body:body === undefined ? undefined : JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const result = await response.json();
  if (!response.ok) { const error = new Error(platformErrors[result.error] || 'A operação não pôde ser concluída. Seus dados foram preservados.'); error.code = result.error; throw error; }
  return result;
}
function platformError(error) { message(error.message,true); const node = el('platform-error'); if (node) { node.textContent = error.message; } }
async function refreshAccount() {
  const result = await api('/api/bootstrap');
  Object.assign(platform,{csrf:result.csrfToken,user:result.user,configured:result.configured,authEmailReady:result.authEmailReady,offer:result.offer,entitlements:result.entitlements,admin:result.admin});
  el('account-button').textContent = result.user ? 'Minha conta' : 'Entrar';
  el('service-contact').textContent = 'Responsável pelo serviço: ' + (result.serviceOwner || 'configuração pendente') + '. Contato de privacidade: ' + (result.privacyContact || 'configuração pendente') + '.';
  return result;
}
function accountView(content) { closePanel(true); state.view = 'account'; document.body.classList.remove('workspace-mode'); document.documentElement.classList.remove('workspace-mode'); el('home').hidden = true; el('workspace').hidden = true; el('account-page').className = 'account-page'; el('account-page').hidden = false; el('account-page').innerHTML = content + '<p id="platform-error" class="platform-error" role="alert"></p>'; el('account-page').querySelector('h1')?.focus(); }
const platformOldShowView = showView;
showView = function(view) { el('account-page').hidden = true; platformOldShowView(view); };
function authPage(mode = 'login') {
  if (platform.user && mode === 'login') { projectsPage().catch(platformError); return; }
  const recovery = mode === 'recover'; const signup = mode === 'signup';
  const title = recovery ? 'Recuperar acesso' : signup ? 'Criar conta' : 'Entrar na Norte';
  const password = `<label class="auth-password"><span>Senha</span><span class="auth-password-field"><input name="password" type="password" minlength="12" maxlength="128" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'Crie sua senha' : 'Sua senha'}" required><button type="button" data-platform="password-visibility" aria-pressed="false" aria-label="Mostrar senha">Mostrar</button></span></label>${signup ? '<p class="auth-hint">Pelo menos 12 caracteres.</p>' : '<button type="button" class="text-button auth-recover" data-platform="recover">Esqueci minha senha</button>'}`;
  const fields = `<label>E-mail<input name="email" type="email" autocomplete="email" placeholder="voce@empresa.com" required maxlength="200"></label>${recovery ? '' : password}`;
  const emailPending = (recovery || signup) && !platform.authEmailReady;
  const form = emailPending ? '<p>O envio de e-mails está sendo preparado. Novos cadastros e recuperação de senha estarão disponíveis em breve. Contas já confirmadas podem entrar.</p>' : `<form class="platform-form" data-platform-form="${mode}">${fields}<button class="button primary">${title}</button></form>`;
  const subtitle = recovery ? 'Enviaremos um link para você definir uma nova senha.' : signup ? 'Um espaço para organizar e acompanhar seu projeto.' : 'Continue de onde seu projeto parou.';
  const tabs = recovery ? '<button class="text-button auth-back" data-platform="login">' + icon('back') + 'Voltar para entrar</button>' : `<div class="auth-tabs" role="group" aria-label="Acesso à conta"><button data-platform="login" aria-pressed="${!signup}">Entrar</button><button data-platform="signup" aria-pressed="${signup}">Criar conta</button></div>`;
  accountView(`<div class="auth-layout"><section class="auth-card"><div class="auth-mark">${icon('compass')}</div><h1 tabindex="-1">${title}</h1><p class="auth-subtitle">${subtitle}</p>${tabs}${platform.configured ? form : '<p class="platform-note">O serviço de contas está aguardando configuração. Você pode explorar o Aurora.</p>'}</section><button class="text-button auth-explore" data-action="workspace">Explorar a plataforma${icon('arrow')}</button></div>`);
  el('account-page').classList.add('account-page--auth');
}
async function projectsPage() {
  await platform.ready;
  if (!platform.user) { authPage(); return; }
  if (platform.current && !await flushProject()) { return; }
  await refreshAccount(); platform.projects = await api('/api/projects');
  const e = platform.entitlements;
  const summary = `<div class="platform-card"><strong>${e.tier === 'trial' ? 'Teste avançado' : e.tier === 'professional' ? 'Profissional' : 'Essencial'}</strong><p class="platform-note">${e.limits.projects} projetos ativos · ${e.limits.requirements} requisitos e ${e.limits.verifications} verificações por projeto.${e.trialEndsAt ? ' Teste até ' + new Date(e.trialEndsAt).toLocaleDateString('pt-BR') + '.' : ''} Gerações avançadas: ${e.generationsUsed}/${e.limits.generations}.</p><div class="platform-actions">${!e.trialStartedAt ? '<button class="button secondary" data-platform="trial">Ativar 14 dias de teste avançado</button>' : ''}<button class="text-button" data-platform="mfa">Segundo fator</button><button class="text-button" data-platform="admin">Administração</button><button class="text-button" data-platform="logout">Sair</button></div></div>`;
  const cards = platform.projects.map(p => `<article class="project-card"><h2>${safe(p.name)}</h2><p>${safe(p.profile)} · ${safe(p.phase)} · ${p.archived ? 'Arquivado' : 'Ativo'} · ${new Date(p.updated_at).toLocaleString('pt-BR')}</p><div class="platform-actions"><button class="button primary" data-platform="open" data-id="${p.id}">Abrir</button>${p.role && p.role !== 'owner' ? `<span class="project-role">${safe({viewer:'Leitor',editor:'Editor',reviewer:'Revisor'}[p.role] || 'Compartilhado')}</span>` : `<button class="text-button" data-platform="rename" data-id="${p.id}">Renomear</button><button class="text-button" data-platform="duplicate" data-id="${p.id}">Duplicar</button>${!p.archived ? `<button class="text-button" data-platform="choose" data-id="${p.id}">Manter editável no gratuito</button><button class="text-button" data-platform="archive" data-id="${p.id}">Arquivar</button>` : ''}<button class="text-button" data-platform="delete" data-id="${p.id}">Excluir…</button>`}</div></article>`).join('');
  accountView(`<h1 tabindex="-1">Meus projetos</h1>${summary}<div class="platform-actions"><button class="button primary" data-platform="new">Novo projeto</button><button class="text-button" data-platform="demo">Explorar Aurora</button></div><div class="project-list">${cards || '<p>Crie seu primeiro projeto.</p>'}</div>`);
}
function newProjectPage() {
  accountView(`<h1 tabindex="-1">Novo projeto</h1><form class="platform-card platform-form" data-platform-form="new"><label>Nome<input name="name" maxlength="160" required></label><label>Tipo<select name="type"><option value="satellite">Satélite</option><option value="payload">Carga útil</option><option value="ground">Segmento solo</option><option value="software">Software</option><option value="other">Outro</option></select></label><label>Perfil técnico<select name="profile"><option>NASA</option><option>ECSS</option><option value="CUSTOM">Configuração própria</option></select></label><label>Data inicial<input type="date" name="start" required value="${new Date().toISOString().slice(0,10)}"></label><label>Conteúdo inicial<select name="template"><option value="empty">Projeto vazio</option><option value="aurora">Cópia identificada do Aurora</option></select></label><p class="platform-note">As referências e revisões precisam de adoção pela equipe. Não envie dados sujeitos a restrições de exportação ou acesso nesta oferta.</p><div class="platform-actions"><button class="button primary">Criar projeto</button><button type="button" class="text-button" data-platform="projects">Voltar</button></div></form>`);
}
function projectPayload() {
  const keys = ['profile','start','prepDays','closeDays','schedules','version','changes','customDocs','applicability'];
  const engineeringData = Object.fromEntries(keys.filter(key => engineering[key] !== undefined).map(key => [key,engineering[key]]));
  return {requirements,verifications,engineering:engineeringData,settings,lifecycle:{durations:lifecycle.durations}};
}
function applyProject(row) {
  platform.current = row; platform.conflict = false;
  requirements = row.payload.requirements.map(req => ({...createRequirement(req.id,''),...structuredClone(req)}));
  verifications = structuredClone(row.payload.verifications);
  engineering = {...structuredClone(platformDemo.engineering),...structuredClone(row.payload.engineering),profile:row.payload.engineering.profile || row.profile,start:row.payload.engineering.start || row.start_date,docReviews:[],docKinds:[],docQuery:'',module:'requirements'};
  settings = {...platformDemo.settings,...row.payload.settings}; lifecycle.durations = structuredClone(row.payload.lifecycle?.durations || {}); lifecycle.selectedId = ''; lifecycle.selectedProfile = '';
  Object.assign(project,{name:row.name,code:row.name === 'Missão Aurora' ? 'AUR' : 'PRJ',phase:row.phase});
  nextNumber = Math.max(1,...requirements.map(req => Number(req.id.match(/\d+$/)?.[0]) + 1 || 1)); verificationCounter = Math.max(1,...verifications.map(v => Number(v.id.match(/\d+$/)?.[0]) + 1 || 1));
  clearFilters(); updateSubsystems(); showModule('requirements'); runAnalysis(false);
  el('workspace').querySelector('.eng-project strong').textContent = row.name;
  platform.lastSaved = JSON.stringify(projectPayload()); setSaveState('Salvo');
}
function setSaveState(text,failed = false) { el('save-state').textContent = text; el('save-state').classList.toggle('save-failed',failed); }
async function flushProject() {
  if (!platform.current) { return true; }
  if (platform.saving) { await platform.saving; return flushProject(); }
  const snapshot = JSON.stringify(projectPayload());
  if (snapshot === platform.lastSaved) { return true; }
  if (platform.conflict) { showSaveConflict(); return false; }
  setSaveState('Salvando…');
  const task = (async () => {
    try {
      const row = await api('/api/projects/' + platform.current.id,'PUT',{version:platform.current.version,payload:JSON.parse(snapshot)});
      platform.current = row; platform.lastSaved = snapshot; platform.retryAt = 0;
      if (JSON.stringify(projectPayload()) === snapshot) { requirements = row.payload.requirements; verifications = row.payload.verifications; platform.lastSaved = JSON.stringify(projectPayload()); }
      setSaveState('Salvo'); return true;
    } catch (error) { platform.conflict = error.code === 'version_conflict'; platform.retryAt = Date.now() + 15000; setSaveState('Falha ao salvar · rascunho nesta aba',true); platformError(error); return false; }
  })();
  platform.saving = task; try { return await task; } finally { platform.saving = false; }
}
function platformDialog(title,body) {
  el('platform-dialog')?.remove(); const dialog = document.createElement('dialog'); dialog.id = 'platform-dialog'; dialog.className = 'platform-dialog';
  dialog.setAttribute('aria-labelledby','dialog-title'); dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${safe(title)}</h2><button type="button" class="icon-button" data-platform="close-dialog" aria-label="Fechar">${icon('close')}</button></div><div class="platform-dialog-body">${body}<p id="dialog-error" class="platform-error" role="alert"></p></div>`; document.body.append(dialog); dialog.showModal(); dialog.querySelector('.platform-dialog-body input,.platform-dialog-body button,.platform-dialog-body a')?.focus(); return dialog;
}
function showSaveConflict() { platformDialog('Preservar alterações', '<p>Seu rascunho não foi salvo. Baixe uma cópia antes de recarregar a versão do servidor.</p><div class="platform-actions"><button class="button secondary" data-platform="draft-export">Baixar meu rascunho</button><button class="button primary" data-platform="reload">Recarregar versão salva</button></div>'); }
function projectManagement(action,id,returnToWorkspace = false) {
  const p = platform.current?.id === id ? platform.current : platform.projects.find(item => item.id === id); if (!p) { return; }
  const input = ['rename','delete','duplicate'].includes(action) ? `<label>${action === 'delete' ? 'Digite o nome exato para confirmar a exclusão' : 'Nome'}<input name="name" required maxlength="160" value="${action === 'delete' ? '' : safe(p.name + (action === 'duplicate' ? ' · cópia' : ''))}"></label>` : '<p>O projeto ficará disponível para leitura e exportação.</p>';
  platformDialog({rename:'Nome do projeto',delete:'Excluir projeto',duplicate:'Duplicar projeto',archive:'Arquivar projeto'}[action],`<form class="platform-form" data-platform-form="manage" data-id="${id}" data-action="${action}" data-version="${p.version}" data-workspace="${returnToWorkspace}">${input}<button class="button primary">${action === 'delete' ? 'Confirmar exclusão' : 'Salvar alteração'}</button></form>`);
}
function renameCurrentProject() {
  if (platform.current) { projectManagement('rename',platform.current.id,true); return; }
  platformDialog('Nome do projeto',`<form class="platform-form" data-platform-form="demo-name"><label>Nome<input name="name" value="${safe(project.name)}" required maxlength="160"></label><p class="platform-note">A alteração neste exemplo fica nesta aba. Entre na sua conta para salvar um projeto.</p><button class="button primary">Salvar nome</button></form>`);
}
function refreshProjectName() { el('workspace').querySelector('.eng-project strong').textContent = project.name; if (engineering.module === 'schedule') { renderSchedule(); } message(project.name + ' · ' + engineering.profile); }
async function generateSaved(format,documents,review) {
  if (!platform.current) { const examples = [['REQ','Requisitos'],['RTM','Rastreabilidade'],['CRN','Cronograma']]; platformDialog('Documentos do Aurora','<p class="dialog-intro">Conheça as entregas com os dados do exemplo.</p><div class="sample-downloads">' + examples.map(([id,title]) => `<a href="/assets/examples/${id}.pdf" download><span class="sample-icon">${icon('file')}</span><span><strong>${title}</strong><small>${id} · PDF</small></span>${icon('download')}</a>`).join('') + '</div><div class="dialog-callout"><div><strong>Pronto para o seu projeto?</strong><p>Crie uma conta para gerar seus documentos.</p></div><button class="button primary" data-platform="signup">Criar conta' + icon('arrow') + '</button></div>'); return; }
  if (!await flushProject()) { showSaveConflict(); return; }
  const signature = JSON.stringify([platform.current.id,platform.current.version,format,documents,review]);
  if (platform.draftGeneration?.signature !== signature) { platform.draftGeneration = {signature,key:crypto.randomUUID()}; }
  const input = {version:platform.current.version,key:platform.draftGeneration.key,format,documents,...(review ? {review} : {})};
  const job = await api('/api/projects/' + platform.current.id + '/generate','POST',input);
  platformDialog('Geração de documento',`<p id="job-progress">A geração usa a versão salva ${platform.current.version}.</p><div id="job-result"></div>`);
  for (let count = 0; count < 35; count += 1) { const result = await api('/api/jobs/' + job.id); if (result.status === 'ready') { if (el('job-result')) { el('job-progress').textContent = 'Documento gerado e armazenado.'; el('job-result').innerHTML = `<a class="button primary" href="/api/jobs/${result.id}/download" download>Baixar ${safe(result.filename)}</a><button class="text-button" data-platform="feedback">Avaliar uso</button>`; } return; } if (['failed','cancelled'].includes(result.status)) { platform.draftGeneration = null; throw new Error('A geração falhou. A cota reservada foi devolvida. Tente novamente com uma nova geração.'); } await new Promise(resolve => setTimeout(resolve,1500)); }
  if (el('job-progress')) { el('job-progress').textContent = 'A tarefa continua registrada. Consulte Arquivos gerados em Documentos.'; }
}
async function savedFiles() { const jobs = await api('/api/projects/' + platform.current.id + '/jobs'); platformDialog('Arquivos gerados',jobs.map(job => `<p>${safe(job.filename || job.input.documents.join(', '))} · ${safe(job.status)} · v${job.project_version}${job.status === 'ready' ? ` <a href="/api/jobs/${job.id}/download" download>Baixar novamente</a>` : ''}</p>`).join('') || '<p>Nenhum arquivo gerado ainda.</p>'); }
async function showVersions() { if (!platform.current) { authPage(); return; } const versions = await api('/api/projects/' + platform.current.id + '/versions'); const current = requirements; const content = versions.map(version => { const changed = version.payload.requirements.filter(old => current.find(req => req.id === old.id)?.text !== old.text); const linked = verifications.filter(v => v.requirementIds.some(id => changed.some(req => req.id === id))); return `<article class="platform-card"><strong>Versão ${version.version}</strong><p>${changed.length} requisitos diferentes · vínculos encontrados: ${safe(linked.map(v => v.id).join(', ') || 'nenhum')}</p><p class="platform-note">Efeitos técnicos precisam de avaliação. Dependências não demonstram impacto físico.</p><details><summary>Comparar textos</summary>${changed.map(old => `<p><strong>${safe(old.id)}</strong></p><p>Anterior: ${safe(old.text)}</p><p>Atual: ${safe(current.find(req => req.id === old.id)?.text || 'Removido')}</p>`).join('')}</details></article>`; }).join(''); platformDialog('Versões e vínculos afetados',content || '<p>Não há versões anteriores.</p>'); }
function feedbackForm() { const field = (name,label,options) => `<label>${label}<select name="${name}">${options.map(option => `<option>${safe(option)}</option>`).join('')}</select></label>`; platformDialog('Avaliar uso',`<p>O benefício independe de a avaliação ser positiva ou negativa.</p><form class="platform-form" data-platform-form="feedback">${field('usefulness','Utilidade',['Útil','Pouco útil','Não ajudou'])}${field('difficulty','Dificuldade',['Nenhuma','Navegação','Fontes','Documentos'])}${field('delivery','Entrega mais importante',['Requisitos','Matriz','Cronograma'])}${field('next','Próximo recurso desejado',['Documentos','Análise técnica','Colaboração'])}${field('missing','O que falta para contratar',['Nada','Preço','Funções','Confiança operacional'])}<label>Comentário opcional<textarea name="comment" maxlength="1000"></textarea></label><button class="button primary">Enviar avaliação</button></form>`); }
async function sourceDecisions() {
  if (!platform.current) { authPage(); return; }
  const [sources,adoptions] = await Promise.all([api('/api/sources'),api('/api/projects/' + platform.current.id + '/sources')]);
  const cards = sources.map(source => { const adoption = adoptions.find(item => item.source_id === source.id); return `<form class="platform-card platform-form" data-platform-form="source-decision" data-id="${safe(source.id)}"><h3>${safe(source.code)} · ${safe(source.edition)}</h3><p>${safe(source.title)}</p><p class="platform-note">Adotar esta versão exige conferir o escopo. Outras edições não substituem esta decisão automaticamente. Itens potencialmente afetados: documentos do perfil e requisitos cuja referência cite ${safe(source.code)}.</p><label>Decisão<select name="decision">${[['pending','Aplicação a confirmar'],['confirmed','Exigida pela referência adotada'],['not_applicable','Não aplicável']].map(([value,label]) => `<option value="${value}" ${adoption?.decision === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Justificativa e adaptações<textarea name="rationale" required maxlength="4000">${safe(adoption?.rationale || '')}</textarea></label><label>Responsável<input name="responsible" required maxlength="200" value="${safe(adoption?.responsible || '')}"></label><div class="platform-actions"><button class="button secondary">Registrar decisão</button><button type="button" class="text-button" data-platform="reader" data-source="${safe(source.id)}">Consultar fonte</button></div></form>`; }).join('');
  platformDialog('Referências adotadas',cards);
}
async function technicalCatalogue() {
  const data = await api('/api/admin/catalogue');
  const sources = data.sources.map(source => `<form class="platform-card platform-form" data-platform-form="admin-source" data-id="${safe(source.id)}"><h3>${safe(source.code)} · ${safe(source.edition)}</h3><p>Original conferido: ${source.checked ? 'sim' : 'pendente'}</p><label>Condição de acesso<select name="license">${['pending','metadata','licensed','public_authorized'].map(value => `<option ${source.license_status === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Evidência e escopo da autorização<textarea name="note" required minlength="20" maxlength="3000">${safe(source.license_note || '')}</textarea></label><label><input type="checkbox" name="ai" ${source.ai_allowed ? 'checked' : ''}>Processamento externo autorizado para conteúdo público</label><button class="button secondary">Registrar autorização</button></form>`).join('');
  const storage = `<h2>Armazenamento</h2><p>Verifique o saldo do serviço antes de aumentar estes limites.</p><form class="platform-form" data-platform-form="admin-storage"><label>Limite por conta em bytes<input name="accountBytes" type="number" min="20971520" value="${data.storage.account_bytes}"></label><label>Limite global em bytes<input name="globalBytes" type="number" min="20971520" value="${data.storage.global_bytes}"></label><button class="button secondary">Salvar limites</button></form>`;
  const alerts = data.alerts.map(item => `<p>${safe(item.created_at)} · ${safe(item.event)} · ${safe(item.result || '')}</p>`).join('');
  platformDialog('Catálogo e alertas operacionais',storage + '<h2>Alertas recentes</h2>' + (alerts || '<p>Nenhum alerta registrado.</p>') + '<h2>Fontes</h2>' + sources);
}
async function mfaPage() { const factors = await api('/api/auth/mfa'); const available = factors.totp || []; platformDialog('Segundo fator',`<p>Use um aplicativo autenticador. A administração exige um código recente.</p>${available.map(f => `<form class="platform-form" data-platform-form="mfa" data-id="${f.id}"><label>Código de seis dígitos<input name="code" inputmode="numeric" pattern="[0-9]{6}" required autocomplete="one-time-code"></label><button class="button primary">Confirmar identidade</button></form>`).join('')}<button class="button secondary" data-platform="mfa-enroll">Cadastrar autenticador</button>`); }
async function adminPage() {
  const data = await api('/api/admin'); platform.adminData = data;
  const orders = data.orders.map(order => `<form class="platform-card platform-form" data-platform-form="admin-order" data-id="${order.id}"><strong>${safe(order.name)} · ${safe(order.email)}</strong><p>${safe(order.id)}</p><select name="status">${['requested','contacted','proposal_sent','confirmed','cancelled'].map(status => `<option ${status === order.status ? 'selected' : ''}>${status}</option>`).join('')}</select><label><input type="checkbox" name="activate">Ativar Profissional após confirmação comercial real</label><button class="button secondary">Registrar andamento</button></form>`).join('');
  const commercial = `<h2>Pedidos</h2>${orders || '<p>Nenhum pedido.</p>'}<h2>Preços e limites</h2><form class="platform-form" data-platform-form="admin-config"><label>Oferta em centavos<textarea name="offer" rows="10">${safe(JSON.stringify(data.config.offer,null,2))}</textarea></label><label>Limites<textarea name="limits" rows="8">${safe(JSON.stringify(data.config.limits,null,2))}</textarea></label><label><input type="checkbox" name="approved" ${data.config.operationally_approved ? 'checked' : ''}>Oferta validada operacionalmente</label><button class="button primary">Criar nova versão</button></form><h2>Avaliações</h2>${data.feedback.map(f => `<pre>${safe(JSON.stringify(f.answers,null,2))}</pre>`).join('')}`;
  const technical = `<form class="platform-form" data-platform-form="admin-controls"><label><input name="ai" type="checkbox" ${data.controls.ai_enabled ? 'checked' : ''}>Permitir IA quando as demais autorizações estiverem atendidas</label><label><input name="generation" type="checkbox" ${data.controls.generation_enabled ? 'checked' : ''}>Permitir geração documental</label><button class="button primary">Salvar controles</button></form><p class="platform-note">Importações e uploads continuam bloqueados até haver inspeção operacional.</p><button class="button secondary" data-platform="admin-catalogue">Catálogo, armazenamento e alertas</button>`;
  accountView(`<h1 tabindex="-1">Administração</h1><p>Perfil ${safe(data.role)} · configurações e ações auditadas</p><div class="platform-actions"><button class="text-button" data-platform="projects">Meus projetos</button></div>${data.role === 'commercial' ? commercial : technical}`);
}
window.addEventListener('submit',event => {
  const form = event.target.closest('[data-platform-form]'); if (!form) { return; } event.preventDefault(); event.stopImmediatePropagation();
  const data = Object.fromEntries(new FormData(form)); const kind = form.dataset.platformForm; const button = form.querySelector('button[type=submit],button:not([type])'); if (button) { button.disabled = true; }
  (async () => {
    if (['login','signup','recover'].includes(kind)) { const result = await api('/api/auth/' + kind,'POST',data); if (kind === 'login') { await refreshAccount(); await projectsPage(); } else { el('platform-error').textContent = result.message; } }
    if (kind === 'new') { applyProject(await api('/api/projects','POST',data)); await refreshAccount(); }
    if (kind === 'manage') {
      const inWorkspace = form.dataset.workspace === 'true' && form.dataset.action === 'rename' && platform.current?.id === form.dataset.id;
      if (inWorkspace && !await flushProject()) { return; }
      const version = inWorkspace ? platform.current.version : Number(form.dataset.version);
      await api('/api/projects/' + form.dataset.id + '/manage','POST',{action:form.dataset.action,version,...(data.name ? {name:data.name.trim()} : {})});
      el('platform-dialog').close();
      if (inWorkspace) { platform.current = await api('/api/projects/' + form.dataset.id); project.name = platform.current.name; refreshProjectName(); setSaveState('Salvo'); }
      else { if (platform.current?.id === form.dataset.id) { platform.current = null; } await projectsPage(); }
    }
    if (kind === 'demo-name') { const name = String(data.name || '').trim(); if (!name) { throw new Error('Informe o nome do projeto.'); } project.name = name; el('platform-dialog').close(); refreshProjectName(); }
    if (kind === 'feedback') { await api('/api/feedback','POST',data); el('platform-dialog').close(); message('Avaliação registrada. Obrigado por informar sua experiência.'); }
    if (kind === 'mfa') { await api('/api/auth/mfa/verify','POST',{factorId:form.dataset.id,code:data.code}); el('platform-dialog').close(); await refreshAccount(); message('Segundo fator confirmado.'); }
    if (kind === 'password') { await api('/api/auth/password','POST',data); await refreshAccount(); authPage(); }
    if (kind === 'source-decision') { if (!await flushProject()) { return; } const row = await api('/api/projects/' + platform.current.id + '/sources','POST',{sourceId:form.dataset.id,decision:data.decision,rationale:data.rationale,responsible:data.responsible,version:platform.current.version}); platform.current = row; engineering.applicability = structuredClone(row.payload.engineering.applicability); platform.lastSaved = JSON.stringify(projectPayload()); await sourceDecisions(); }
    if (kind === 'admin-source') { await api('/api/admin/sources/' + form.dataset.id,'POST',{license:data.license,note:data.note,ai:data.ai === 'on'}); message('Autorização registrada. O original exige conferência separada.'); }
    if (kind === 'admin-storage') { await api('/api/admin/storage','POST',{accountBytes:Number(data.accountBytes),globalBytes:Number(data.globalBytes)}); message('Limites registrados.'); }
    if (kind === 'admin-config') { await api('/api/admin/config','POST',{offer:JSON.parse(data.offer),limits:JSON.parse(data.limits),approved:data.approved === 'on'}); await adminPage(); }
    if (kind === 'admin-order') { await api('/api/admin/orders/' + form.dataset.id,'POST',{status:data.status,activate:data.activate === 'on'}); message('Andamento registrado.'); }
    if (kind === 'admin-controls') { await api('/api/admin/controls','POST',{ai:data.ai === 'on',generation:data.generation === 'on',imports:false}); message('Controles atualizados.'); }
  })().catch(error => { platformError(error); if (el('dialog-error')) { el('dialog-error').textContent = error.message; } }).finally(() => { if (button) { button.disabled = false; } });
},true);
window.addEventListener('click',event => {
  const button = event.target.closest('[data-platform]');
  if (button) {
    event.preventDefault(); event.stopImmediatePropagation(); const action = button.dataset.platform; const id = button.dataset.id;
    (async () => {
      await platform.ready;
      if (action === 'account' || action === 'projects') { await projectsPage(); }
      if (['login','signup','recover'].includes(action)) { el('platform-dialog')?.close(); authPage(action); }
      if (action === 'rename-current' && await flushProject()) { renameCurrentProject(); }
      if (action === 'password-visibility') { const input = button.closest('form').querySelector('[name=password]'); const visible = input.type === 'password'; input.type = visible ? 'text' : 'password'; button.textContent = visible ? 'Ocultar' : 'Mostrar'; button.setAttribute('aria-pressed',String(visible)); button.setAttribute('aria-label',visible ? 'Ocultar senha' : 'Mostrar senha'); }
      if (action === 'new') { newProjectPage(); }
      if (action === 'open') { if (await flushProject()) { applyProject(await api('/api/projects/' + id)); } }
      if (['rename','duplicate','archive','delete'].includes(action)) { projectManagement(action,id); }
      if (action === 'choose') { await api('/api/projects/' + id + '/choose','POST',{}); await projectsPage(); }
      if (action === 'trial') { await api('/api/trial','POST',{}); await projectsPage(); }
      if (action === 'logout') { if (!await flushProject()) { return; } await api('/api/auth/logout','POST',{}); platform.current = null; await refreshAccount(); loadDemo(); authPage(); }
      if (action === 'demo') { if (await flushProject()) { loadDemo(); } }
      if (action === 'close-dialog') { el('platform-dialog').close(); }
      if (action === 'draft-export') { downloadBlob(new Blob([JSON.stringify(projectPayload(),null,2)],{type:'application/json'}),'norte-rascunho-nao-salvo.json'); }
      if (action === 'reload') { el('platform-dialog')?.close(); applyProject(await api('/api/projects/' + platform.current.id)); }
      if (action === 'files') { await savedFiles(); }
      if (action === 'versions') { await showVersions(); }
      if (action === 'feedback') { feedbackForm(); }
      if (action === 'mfa') { await mfaPage(); }
      if (action === 'mfa-enroll') { const data = await api('/api/auth/mfa/enroll','POST',{}); platformDialog('Cadastrar autenticador',`<p>Cadastre esta chave no seu aplicativo autenticador. Ela é mostrada somente nesta operação.</p><pre>${safe(data.secret)}</pre><form class="platform-form" data-platform-form="mfa" data-id="${data.id}"><label>Código<input name="code" pattern="[0-9]{6}" required autocomplete="one-time-code"></label><button class="button primary">Confirmar</button></form>`); }
      if (action === 'admin') { await adminPage(); }
      if (action === 'admin-catalogue') { await technicalCatalogue(); }
      if (action === 'technical-analysis') { if (!platform.current) { authPage(); return; } if (!await flushProject()) { return; } const result = await api('/api/projects/' + platform.current.id + '/analyse','POST',{version:platform.current.version}); const content = result.result.suggestions.map(item => `<article class="platform-card"><strong>${safe(item.requirementId)} · sugestão de IA</strong><p>${safe(item.reason)}</p><p>${safe(item.proposal)}</p><p class="platform-note">${safe(item.sourceId)} · ${safe(item.clause)}. Requer conferência técnica.</p></article>`).join(''); platformDialog(result.stale ? 'Análise da versão anterior' : 'Sugestões para revisão',content || '<p>Nenhuma sugestão retornada. Isso não constitui aprovação.</p>'); }
      if (action === 'sources') { await sourceDecisions(); }
      if (action === 'reader') { await openOriginalReader(button.dataset.source,button.dataset.citation || ''); }
    })().catch(platformError); return;
  }
  const engine = event.target.closest('[data-engine]');
  const action = engine?.dataset.engine;
  const exports = {'document-pdf':'pdf','document-docx':'docx','download-trace':'csv','download-calendar':'ics','download-project':'json','download-package':'zip','download-review':'zip'};
  if (Object.hasOwn(exports,action || '')) { event.preventDefault(); event.stopImmediatePropagation(); if (action === 'download-project' && platform.current) { flushProject().then(ok => { if (ok) { const link = document.createElement('a'); link.href = '/api/projects/' + platform.current.id + '/export'; link.download = 'norte-projeto.json'; link.click(); } }); return; } const docs = action === 'download-review' ? reviewDocs(engine.dataset.id).map(doc => doc.id) : action === 'download-package' ? currentDocuments().map(doc => doc.id) : [engine.dataset.id || (action === 'download-calendar' ? 'CRN' : 'RTM')]; generateSaved(exports[action],docs,action === 'download-review' ? engine.dataset.id : undefined).catch(platformError); }
},true);
function loadDemo() { platform.current = null; platform.lastSaved = ''; requirements = structuredClone(platformDemo.requirements); verifications = structuredClone(platformDemo.verifications); engineering = structuredClone(platformDemo.engineering); settings = structuredClone(platformDemo.settings); Object.assign(project,{name:'Missão Aurora',code:'AUR',phase:'Concepção'}); lifecycle.durations = {}; lifecycle.selectedId = ''; showModule('requirements'); runAnalysis(false); el('workspace').querySelector('.eng-project strong').textContent = project.name; setSaveState(''); }
const platformDocuments = renderDocuments;
renderDocuments = function() { platformDocuments(); const head = el('documents-module').querySelector('.workspace-actions'); if (head && platform.current) { head.insertAdjacentHTML('beforeend','<button class="button secondary" data-platform="files">Arquivos gerados</button><button class="text-button" data-platform="versions">Versões e vínculos</button><button class="text-button" data-platform="sources">Referências adotadas</button>'); } };
const platformSettings = openSettings;
openSettings = function() { platformSettings(); const popup = el('analysis-popover'); if (popup && !popup.hidden) { popup.insertAdjacentHTML('beforeend','<p class="platform-note">As checagens acima são determinísticas. A análise técnica por IA exige provedor e projeto autorizados.</p><button class="text-button" data-platform="technical-analysis">Solicitar sugestões de IA</button>'); } };
const platformSource = openSource;
openSource = function(key,back) {
  const source = SOURCES[key]; if (!source) { return; } platformSource(key,back);
  const sourceId = source.edition?.includes('6105') ? 'nasa-handbook-2016' : source.edition?.includes('10-06') ? 'ecss-10-06-2009' : source.edition?.includes('10-02') ? 'ecss-10-02-2018' : source.edition?.includes('7123') ? 'npr-7123-1d' : source.edition?.includes('ECSS-E-ST-10C') ? 'ecss-10-2017' : source.edition?.includes('ECSS-M-ST-10-01') ? 'ecss-m-10-01-2008' : '';
  const body = `<div class="panel-body source-summary"><span class="source-organization">${safe(source.org)}</span><h3>${safe(source.title)}</h3><p class="source-edition">${safe(source.edition)}</p><p class="source-section">${safe(source.section)}</p><div class="source-context"><span>Síntese da Norte</span><p>${safe(source.explanation || 'Consulte a seção indicada na publicação.')}</p></div></div>`;
  const external = source.url?.startsWith('https://') ? `<a class="button secondary" href="${safe(source.url)}" target="_blank" rel="noopener noreferrer">Consultar fonte${icon('arrow')}</a>` : '';
  const footer = `<div class="panel-footer">${sourceId ? `<button class="button primary" data-platform="reader" data-source="${sourceId}" data-citation="${safe(key)}">${icon('file')}Consultar publicação${icon('arrow')}</button>` : external}</div>`;
  setPanel('source',panelHeading('Referência','', 'source-back') + body + footer);
};
async function startPlatform() {
  platform.ready = refreshAccount().catch(() => { message('Não foi possível conectar às contas. O Aurora continua disponível.',true); });
  await platform.ready;
  const query = new URLSearchParams(location.search);
  if (location.pathname === '/auth/confirm' && query.has('token_hash')) { const input = {token_hash:query.get('token_hash'),type:query.get('type') || 'signup'}; history.replaceState({},'','/'); try { const result = await api('/api/auth/confirm','POST',input); await refreshAccount(); if (result.recovery) { accountView('<h1>Definir nova senha</h1><form class="platform-form" data-platform-form="password"><label>Nova senha<input type="password" name="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><button class="button primary">Salvar senha</button></form>'); } else { await projectsPage(); } } catch (error) { authPage(); platformError(error); } }
  setInterval(() => { if (platform.current && !platform.conflict && (!platform.retryAt || Date.now() > platform.retryAt)) { flushProject().catch(platformError); } },1800);
}
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded',startPlatform); } else { startPlatform(); }
