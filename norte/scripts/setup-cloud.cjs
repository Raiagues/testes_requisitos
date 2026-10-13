const fs = require('node:fs');
const path = require('node:path');
const {readConfig,configured} = require('../server/config.cjs');
const {verifyGmail} = require('./check-smtp.cjs');
const TARGET = Object.freeze({project:'pdkceggaucuanisybbak',service:'srv-db72glavcj2c73e9sieg',name:'testes-requisitos',repo:'https://github.com/Raiagues/testes_requisitos'});
function validateService(service) {
  if (service.id !== TARGET.service || service.name !== TARGET.name || service.repo?.replace(/\.git$/,'') !== TARGET.repo || service.branch !== 'main' || service.rootDir !== 'norte' || service.type !== 'web_service' || service.serviceDetails?.env !== 'docker' || service.serviceDetails?.plan !== 'free') { throw new Error('Serviço divergente: nenhuma alteração autorizada fora de testes-requisitos no plano Free.'); }
  const url = new URL(service.serviceDetails.url);
  if (url.protocol !== 'https:' || url.origin !== service.serviceDetails.url || !url.hostname.endsWith('.onrender.com')) { throw new Error('Endereço público do serviço inválido.'); }
  return url.origin;
}
function authSettings(siteUrl,templates = true) {
  const result = {site_url:siteUrl,uri_allow_list:siteUrl + '/auth/confirm',disable_signup:false,external_email_enabled:true,mailer_autoconfirm:false,mailer_allow_unverified_email_sign_ins:false,password_min_length:12};
  if (templates) { Object.assign(result,{mailer_subjects_confirmation:'Confirme sua conta na Norte',mailer_subjects_recovery:'Recupere seu acesso à Norte',mailer_templates_confirmation_content:'<h2>Confirme sua conta na Norte</h2><p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup">Confirmar conta</a></p><p>Se você não solicitou este cadastro, ignore este e-mail.</p>',mailer_templates_recovery_content:'<h2>Recupere seu acesso à Norte</h2><p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Definir nova senha</a></p><p>Se você não solicitou esta alteração, ignore este e-mail.</p>'}); }
  return result;
}
function gmailSettings(env) {
  if (!env.AUTH_SMTP_PASSWORD) { return {}; }
  const password = env.AUTH_SMTP_PASSWORD.replace(/\s/g,'');
  if (!/^[a-z]{16}$/i.test(password) || !/^[^\s@]+@gmail\.com$/.test(env.PRIVACY_CONTACT || '')) { throw new Error('Use uma senha de app do Gmail de 16 letras e o endereço Gmail da Norte.'); }
  return {smtp_host:'smtp.gmail.com',smtp_port:'587',smtp_user:env.PRIVACY_CONTACT,smtp_pass:password,smtp_admin_email:env.PRIVACY_CONTACT,smtp_sender_name:env.SERVICE_OWNER};
}
function publicHelpSettings(config) {
  if (!config.helpApproved) { return {}; }
  if (!config.geminiKey || config.geminiModel !== 'gemini-3.1-flash-lite') { throw new Error('Ajuda Gemini exige a chave privada e o modelo com faixa gratuita autorizado nesta implantação.'); }
  return {GEMINI_API_KEY:config.geminiKey,GEMINI_MODEL:config.geminiModel,GEMINI_HELP_APPROVED:'true',AI_DAILY_CALL_LIMIT:'20',AI_MAX_CONCURRENCY:'1'};
}
function savePrivate(values) {
  const filename = path.join(__dirname,'..','.env'); let contents = fs.readFileSync(filename,'utf8');
  for (const [key,value] of Object.entries(values)) { const line = key + '=' + JSON.stringify(value); const pattern = new RegExp('^' + key + '=.*$','m'); contents = pattern.test(contents) ? contents.replace(pattern,() => line) : contents.trimEnd() + '\n' + line + '\n'; }
  fs.writeFileSync(filename,contents,{mode:0o600}); fs.chmodSync(filename,0o600);
}
async function main(mode = process.argv[2] || 'plan', env = process.env) {
  if (!['plan','apply','rotate-key','revoke-previous-key','deploy'].includes(mode)) { throw new Error('Modo inválido.'); }
  if (!env.RENDER_API_KEY || !env.SUPABASE_ACCESS_TOKEN) { throw new Error('Preencha RENDER_API_KEY e SUPABASE_ACCESS_TOKEN somente no .env local.'); }
  if (env.SUPABASE_URL !== `https://${TARGET.project}.supabase.co`) { throw new Error('Projeto Supabase divergente.'); }
  async function api(provider,endpoint,method = 'GET',body) {
    const base = provider === 'render' ? 'https://api.render.com/v1' : 'https://api.supabase.com/v1'; const token = provider === 'render' ? env.RENDER_API_KEY : env.SUPABASE_ACCESS_TOKEN;
    const response = await fetch(base + endpoint,{method,headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)} : {}),redirect:'error',signal:AbortSignal.timeout(20000)});
    if (!response.ok) { throw new Error(`${provider}: operação ${method} recusada (HTTP ${response.status}). Valores secretos omitidos.`); }
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  const service = await api('render','/services/' + TARGET.service); const siteUrl = validateService(service);
  const project = await api('supabase','/projects/' + TARGET.project);
  if (project.id !== TARGET.project) { throw new Error('Projeto Supabase divergente.'); }
  const config = readConfig({...env,NODE_ENV:'production',SITE_URL:siteUrl});
  if (!configured(config) || !config.serviceOwner || !config.privacyContact) { throw new Error('Configuração local incompleta.'); }
  const values = {NODE_ENV:'production',SITE_URL:siteUrl,SESSION_ENCRYPTION_KEY:config.sessionKey,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_SECRET_KEY:config.secretKey,SERVICE_OWNER:config.serviceOwner,PRIVACY_CONTACT:config.privacyContact,REQUIREMENTS_AI_PROVIDER:'none',GEMINI_HELP_APPROVED:'false',REQUIREMENTS_AI_APPROVED:'false',...publicHelpSettings(config)};
  values.PROTOTYPE_ADMIN_ENABLED=String(config.prototypeAdmin);
  console.log(JSON.stringify({mode,service:service.name,siteUrl,project:project.id,plan:'free',variableNames:Object.keys(values)}));
  if (mode === 'plan') { return; }
  if (mode === 'rotate-key') {
    if (env.SUPABASE_ROTATED_KEY_ID) { console.log('Chave substituta já registrada; use apply e conclua a publicação antes de revogar a anterior.'); return; }
    const keys = await api('supabase',`/projects/${TARGET.project}/api-keys?reveal=true`);
    const previous = keys.find(key => key.type === 'secret' && key.api_key === config.secretKey);
    if (!previous) { throw new Error('A chave anterior não foi identificada com segurança; nenhuma revogação executada.'); }
    const next = await api('supabase',`/projects/${TARGET.project}/api-keys?reveal=true`,'POST',{type:'secret',name:'testes_requisitos_web_' + Date.now(),description:'Servidor exclusivo do protótipo testes_requisitos',secret_jwt_template:{role:'service_role'}});
    if (!next.api_key?.startsWith('sb_secret_') || !next.id) { throw new Error('O provedor não retornou a chave substituta esperada.'); }
    savePrivate({SUPABASE_SECRET_KEY:next.api_key,SUPABASE_ROTATED_KEY_ID:next.id,PREVIOUS_SUPABASE_SECRET_KEY_ID:previous.id});
    console.log('Chave substituta criada e salva somente no .env privado. A anterior permanece ativa até a publicação ser conferida.'); return;
  }
  if (mode === 'apply') {
    const current = await api('supabase',`/projects/${TARGET.project}/config/auth`);
    const smtp = gmailSettings(env); const emailReady = Boolean(smtp.smtp_host || current.smtp_host);
    if (smtp.smtp_host) { await verifyGmail(smtp); console.log('SMTP: autenticação TLS confirmada sem enviar mensagem.'); }
    const desired = {...authSettings(siteUrl,false),...smtp}; desired.password_min_length = Math.max(current.password_min_length || 12,12);
    await api('supabase',`/projects/${TARGET.project}/config/auth`,'PATCH',desired);
    if (emailReady) { await api('supabase',`/projects/${TARGET.project}/config/auth`,'PATCH',{...authSettings(siteUrl),password_min_length:desired.password_min_length}); }
    values.AUTH_EMAIL_READY = String(emailReady);
    for (const [key,value] of Object.entries(values)) { await api('render',`/services/${TARGET.service}/env-vars/${key}`,'PUT',{value}); }
    if (config.helpApproved) {
      const {createGateway} = require('../server/supabase.cjs'); const {check} = require('../server/errors.cjs'); const gateway = createGateway(config);
      check(await gateway.service.from('norte_controls').update({ai_enabled:true}).eq('id',true));
      await gateway.audit(null,null,'public_help_configured','enabled',require('node:crypto').randomUUID());
    }
    savePrivate({SITE_URL:siteUrl,AUTH_EMAIL_READY:String(emailReady)});
    console.log(JSON.stringify({configured:true,confirmationRequired:true,customSmtp:emailReady,emailDeliveryTested:false,managementTokensSentToRender:false})); return;
  }
  if (mode === 'deploy') {
    if (!/^[a-f0-9]{40}$/.test(env.DEPLOY_COMMIT || '')) { throw new Error('Defina DEPLOY_COMMIT com o SHA completo já validado e enviado ao GitHub.'); }
    const deploy = await api('render',`/services/${TARGET.service}/deploys`,'POST',{commitId:env.DEPLOY_COMMIT,clearCache:'do_not_clear'});
    savePrivate({RENDER_DEPLOY_ID:deploy.id,RENDER_DEPLOY_COMMIT:env.DEPLOY_COMMIT});
    console.log(JSON.stringify({deployId:deploy.id,status:deploy.status,commit:env.DEPLOY_COMMIT})); return;
  }
  if (!env.PREVIOUS_SUPABASE_SECRET_KEY_ID || !env.SUPABASE_ROTATED_KEY_ID || env.PREVIOUS_SUPABASE_SECRET_KEY_ID === env.SUPABASE_ROTATED_KEY_ID) { throw new Error('Nenhuma substituição válida de chave foi registrada.'); }
  const remote = await api('render',`/services/${TARGET.service}/env-vars/SUPABASE_SECRET_KEY`);
  if ((remote.value || remote.envVar?.value) !== config.secretKey) { throw new Error('Render ainda não usa a chave substituta.'); }
  if (!env.RENDER_DEPLOY_ID || !env.RENDER_DEPLOY_COMMIT) { throw new Error('Registre a publicação por setup:cloud deploy antes de revogar a chave anterior.'); }
  const deployed = await api('render',`/services/${TARGET.service}/deploys/${encodeURIComponent(env.RENDER_DEPLOY_ID)}`);
  if (deployed.status !== 'live' || deployed.commit?.id !== env.RENDER_DEPLOY_COMMIT) { throw new Error('A publicação registrada ainda não está ativa.'); }
  const ready = await fetch(siteUrl + '/api/ready',{redirect:'error',signal:AbortSignal.timeout(30000)});
  if (!ready.ok || !(await ready.json()).ready) { throw new Error('Aplicação ainda não confirmou prontidão.'); }
  await api('supabase',`/projects/${TARGET.project}/api-keys/${encodeURIComponent(env.PREVIOUS_SUPABASE_SECRET_KEY_ID)}?was_compromised=true&reason=configuration_rotation`,'DELETE');
  savePrivate({PREVIOUS_SUPABASE_SECRET_KEY_ID:''}); console.log('Chave anterior revogada após conferir a aplicação e a chave substituta no Render.');
}
if (require.main === module) { main().catch(error => { console.error(error.message); process.exitCode = 1; }); }
module.exports = {TARGET,validateService,authSettings,gmailSettings,publicHelpSettings};
