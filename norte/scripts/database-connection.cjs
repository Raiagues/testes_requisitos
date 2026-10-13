const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');
function databaseOptions(connection, env = process.env) {
  if (!connection) { throw Object.assign(new Error('Configure MIGRATION_DATABASE_URL no arquivo .env local.'),{code:'DATABASE_URL_MISSING'}); }
  let url;
  try { url = new URL(connection); } catch { throw Object.assign(new Error('A conexão PostgreSQL não é uma URL válida.'),{code:'DATABASE_URL_INVALID'}); }
  if (!['postgres:','postgresql:'].includes(url.protocol)) { throw Object.assign(new Error('A conexão deve começar com postgresql://.'),{code:'DATABASE_URL_INVALID'}); }
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  const unencrypted = env.MIGRATION_SSL === 'disable-local-only';
  if (unencrypted && !local) { throw Object.assign(new Error('TLS é obrigatório fora do banco local.'),{code:'DATABASE_TLS_REQUIRED'}); }
  const mode = url.searchParams.get('sslmode');
  if (mode && !['require','verify-full'].includes(mode) && !(local && unencrypted && mode === 'disable')) { throw Object.assign(new Error('O modo SSL informado não verifica o servidor. Use verify-full.'),{code:'DATABASE_TLS_REQUIRED'}); }
  const supabase = /^db\.[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
  const ssl = {rejectUnauthorized:true};
  if (supabase) { ssl.ca = [...tls.rootCertificates,fs.readFileSync(path.join(__dirname,'certificates','supabase-root-2021.crt'),'utf8')]; }
  return {host:url.hostname.replace(/^\[|\]$/g,''),port:Number(url.port || 5432),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:decodeURIComponent(url.pathname.slice(1)) || 'postgres',ssl:unencrypted ? false : ssl,connectionTimeoutMillis:15000,application_name:'norte-maintenance'};
}
function databaseError(error) {
  const code = /^[A-Z0-9_]{2,64}$/.test(error?.code || '') ? error.code : 'DATABASE_ERROR';
  const messages = {DATABASE_URL_MISSING:'Preencha MIGRATION_DATABASE_URL no arquivo .env local.',DATABASE_URL_INVALID:'Confira o formato da conexão PostgreSQL no arquivo .env.',DATABASE_TLS_REQUIRED:'A conexão exige TLS com certificado e hostname verificados.',SELF_SIGNED_CERT_IN_CHAIN:'O certificado do banco não foi reconhecido. Atualize o certificado de CA; não desative TLS.',UNABLE_TO_VERIFY_LEAF_SIGNATURE:'Não foi possível verificar a cadeia de certificados do banco.',CERT_HAS_EXPIRED:'O certificado do banco expirou.',ERR_TLS_CERT_ALTNAME_INVALID:'O certificado não corresponde ao endereço do banco.',ENOTFOUND:'O endereço do banco não foi encontrado.',ECONNREFUSED:'O banco recusou a conexão.',ETIMEDOUT:'O banco não respondeu dentro do prazo.',ENETUNREACH:'A rede não alcança esse endereço. No Supabase, use Session pooler para conexão IPv4.','28P01':'A senha do banco foi recusada. Use a senha do banco, não a chave de API.','42501':'A identidade de migração não possui a permissão necessária.','42P01':'Uma tabela esperada não está disponível no banco.'};
  return `Migração não concluída [${code}]. ${messages[code] || 'Confira a conexão e a versão das migrações. Nenhum segredo foi registrado.'}`;
}
module.exports = {databaseOptions,databaseError};
