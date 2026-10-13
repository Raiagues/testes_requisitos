const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const tls = require('node:tls');
const {readConfig,configured} = require('../server/config.cjs');
const {createGateway,encrypt,decrypt} = require('../server/supabase.cjs');
const {databaseOptions,databaseError} = require('../scripts/database-connection.cjs');
const {TARGET,validateService,authSettings,gmailSettings} = require('../scripts/setup-cloud.cjs');
test('Render fornece a origem; uma origem explícita prevalece sem aceitar HTTP, caminho ou credenciais',() => {
  const env = {NODE_ENV:'production',RENDER:'true',RENDER_EXTERNAL_URL:'https://fixture.onrender.com'};
  assert.equal(readConfig(env).siteUrl,env.RENDER_EXTERNAL_URL);
  assert.equal(readConfig({...env,SITE_URL:'https://custom.example'}).siteUrl,'https://custom.example');
  assert.equal(readConfig({...env,RENDER:'false'}).siteUrl,'');
  for (const value of ['http://fixture.onrender.com','https://fixture.onrender.com/path','https://actor:secret@fixture.onrender.com','https://fixture.onrender.com/']) { assert.throws(() => readConfig({...env,RENDER_EXTERNAL_URL:value})); }
});
test('chave gerada pelo Render mantém AES-256 e compatibilidade com sessões em hexadecimal',() => {
  const bytes = crypto.randomBytes(32); const hex = readConfig({SESSION_ENCRYPTION_KEY:bytes.toString('hex')}); const base64 = readConfig({SESSION_ENCRYPTION_KEY:bytes.toString('base64')});
  assert.equal(base64.sessionKey,hex.sessionKey);
  const payload = {access_token:'synthetic-access',refresh_token:'synthetic-refresh'};
  assert.deepEqual(decrypt(encrypt(payload,base64.sessionKey),hex.sessionKey),payload);
  for (const key of ['weak',bytes.subarray(0,31).toString('base64'),Buffer.alloc(33).toString('base64'),bytes.toString('base64').replace(/=$/,''),bytes.toString('base64') + '\n']) { assert.throws(() => readConfig({SESSION_ENCRYPTION_KEY:key})); }
  assert.equal(configured(readConfig({NODE_ENV:'production',RENDER:'true',RENDER_EXTERNAL_URL:'https://fixture.onrender.com'})),false);
});
test('PostgreSQL Supabase usa CA oficial com verificação de hostname e de cadeia',() => {
  const config = databaseOptions('postgresql://postgres.abcdefghijklmnopqrst:fake@aws-0-region.pooler.supabase.com:5432/postgres',{});
  assert.equal(config.ssl.rejectUnauthorized,true);
  assert.equal(config.ssl.checkServerIdentity,undefined);
  const certificate = new crypto.X509Certificate(config.ssl.ca.at(-1));
  assert.equal(certificate.fingerprint256.replaceAll(':',''),'807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA');
  assert.ok(Date.parse(certificate.validTo) > Date.now());
  assert.ok(tls.checkServerIdentity('attacker.example',{subject:{CN:'*.pooler.supabase.com'}}));
  assert.equal(databaseOptions('postgresql://user:fake@database.example/postgres',{}).ssl.ca,undefined);
});
test('parâmetros da URL não podem trocar destino ou desativar verificação TLS',() => {
  const config = databaseOptions('postgresql://user:p%40s@database.example/db?sslmode=require&ssl=false&host=attacker.example&uselibpqcompat=true',{});
  assert.equal(config.host,'database.example'); assert.equal(config.password,'p@s'); assert.equal(config.ssl.rejectUnauthorized,true);
  for (const mode of ['disable','no-verify','prefer','allow','verify-ca']) { assert.throws(() => databaseOptions('postgresql://user:fake@database.example/db?sslmode=' + mode,{})); }
  assert.throws(() => databaseOptions('postgresql://user:fake@database.example/db',{MIGRATION_SSL:'disable-local-only'}));
  assert.equal(databaseOptions('postgresql://user:fake@127.0.0.1/db',{MIGRATION_SSL:'disable-local-only'}).ssl,false);
});
test('diagnóstico da migração identifica o erro sem imprimir senha, conexão ou mensagem do provedor',() => {
  const result = databaseError({code:'28P01',message:'password secret-value postgres://user:fake@host/db',detail:'sb_secret_fixture'});
  assert.match(result,/28P01/); assert.match(result,/senha do banco/); assert.doesNotMatch(result,/secret-value|postgres:\/\/|sb_secret/);
  assert.doesNotMatch(databaseError({code:'bad\nsecret-value',message:'secret-value'}),/secret-value/);
});
test('automação de painéis recusa outro Norte, outro repositório e plano pago',() => {
  const service = {id:TARGET.service,name:TARGET.name,repo:TARGET.repo,branch:'main',rootDir:'norte',type:'web_service',serviceDetails:{env:'docker',plan:'free',url:'https://testes-requisitos.onrender.com'}};
  assert.equal(validateService(service),service.serviceDetails.url);
  for (const patch of [{name:'norte'},{id:'srv-other'},{repo:'https://github.com/example/other'},{branch:'other'},{rootDir:''},{serviceDetails:{...service.serviceDetails,plan:'starter'}},{serviceDetails:{...service.serviceDetails,url:'https://example.org'}}]) { assert.throws(() => validateService({...service,...patch})); }
  const auth = authSettings(service.serviceDetails.url);
  assert.equal(auth.mailer_autoconfirm,false); assert.equal(auth.mailer_allow_unverified_email_sign_ins,false); assert.equal(auth.password_min_length,12); assert.equal(auth.uri_allow_list,service.serviceDetails.url + '/auth/confirm');
  assert.match(auth.mailer_templates_confirmation_content,/TokenHash/); assert.doesNotMatch(auth.uri_allow_list,/\*/);
});
test('SMTP gratuito exige senha de app; configuração parcial mantém confirmação e aviso de e-mail indisponível',() => {
  assert.deepEqual(gmailSettings({}),{});
  assert.throws(() => gmailSettings({AUTH_SMTP_PASSWORD:'short',PRIVACY_CONTACT:'fixture@gmail.com'}));
  assert.throws(() => gmailSettings({AUTH_SMTP_PASSWORD:'abcd efgh ijkl mnop',PRIVACY_CONTACT:'fixture@example.invalid'}));
  const settings = gmailSettings({AUTH_SMTP_PASSWORD:'abcd efgh ijkl mnop',PRIVACY_CONTACT:'fixture@gmail.com',SERVICE_OWNER:'Fixture'});
  assert.equal(settings.smtp_host,'smtp.gmail.com'); assert.equal(settings.smtp_port,587); assert.equal(settings.smtp_pass.length,16);
  const partial = authSettings('https://fixture.onrender.com',false); assert.equal(partial.mailer_autoconfirm,false); assert.equal(partial.password_min_length,12); assert.equal(partial.mailer_templates_confirmation_content,undefined);
  assert.equal(readConfig({AUTH_EMAIL_READY:'true'}).authEmailReady,true); assert.equal(readConfig({}).authEmailReady,false);
});
test('projeto novo aceita cronograma vazio ou apenas o perfil selecionado, sem aceitar perfis arbitrários',() => {
  const {payload} = require('../server/schemas.cjs');
  const empty = {requirements:[],verifications:[],engineering:{profile:'NASA',schedules:{}},settings:{},lifecycle:{durations:{}}};
  assert.deepEqual(payload.parse(empty),empty);
  const selected = {...empty,engineering:{profile:'NASA',schedules:{NASA:[]}},lifecycle:{durations:{NASA:[8,12,16,22,22,52,8]}}};
  assert.deepEqual(payload.parse(selected),selected);
  assert.throws(() => payload.parse({...empty,engineering:{schedules:{ATTACKER:[]}}}));
  assert.throws(() => payload.parse({...empty,lifecycle:{durations:{NASA:[0]}}}));
});
test('sessão revogada retornada pelo PostgreSQL como registro de campos nulos exige novo login',async () => {
  const gateway = createGateway(readConfig({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture',SUPABASE_SECRET_KEY:'fixture'}));
  gateway.service.rpc = async () => ({data:{id:null,user_id:null,encrypted_tokens:null,expires_at:null},error:null});
  await assert.rejects(gateway.resolveSession('a'.repeat(43)),error => error.status === 401 && error.code === 'session_expired');
});
