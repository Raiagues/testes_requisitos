const crypto = require('node:crypto');
function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const siteUrl = env.SITE_URL || (env.RENDER === 'true' ? env.RENDER_EXTERNAL_URL : '') || (production ? '' : 'http://127.0.0.1:8080');
  if (siteUrl && (new URL(siteUrl).origin !== siteUrl || (production && !siteUrl.startsWith('https://')))) { throw new Error('SITE_URL deve ser uma origem HTTPS exata em produção.'); }
  let sessionKey = env.SESSION_ENCRYPTION_KEY || (production ? '' : crypto.randomBytes(32).toString('hex'));
  if (sessionKey && !/^[a-f0-9]{64}$/i.test(sessionKey)) { const decoded = Buffer.from(sessionKey,'base64'); if (decoded.length !== 32 || decoded.toString('base64') !== sessionKey) { throw new Error('SESSION_ENCRYPTION_KEY deve conter 32 bytes em hexadecimal ou base64 canônico.'); } sessionKey = decoded.toString('hex'); }
  return Object.freeze({prototypeAdmin:env.PROTOTYPE_ADMIN_ENABLED === 'true', production, siteUrl, sessionKey, authEmailReady:env.AUTH_EMAIL_READY === 'true', port: Number(env.PORT || 8080), supabaseUrl: env.SUPABASE_URL || '', publishableKey: env.SUPABASE_PUBLISHABLE_KEY || '', secretKey: env.SUPABASE_SECRET_KEY || '', geminiKey: env.GEMINI_API_KEY || '', geminiModel: env.GEMINI_MODEL || '', helpApproved: env.GEMINI_HELP_APPROVED === 'true', requirementsProvider: env.REQUIREMENTS_AI_PROVIDER || 'none', requirementsKey: env.REQUIREMENTS_GEMINI_API_KEY || '', requirementsModel: env.REQUIREMENTS_GEMINI_MODEL || '', requirementsApproved: env.REQUIREMENTS_AI_APPROVED === 'true', aiMaxConcurrency: Number(env.AI_MAX_CONCURRENCY || 2), aiDailyCalls: Number(env.AI_DAILY_CALL_LIMIT || 100), resendKey: env.RESEND_API_KEY || '', emailFrom: env.EMAIL_FROM || '', leadsEmail: env.LEADS_EMAIL || '', privacyContact: env.PRIVACY_CONTACT || '', serviceOwner: env.SERVICE_OWNER || ''});
}
function configured(config) { return Boolean(config.siteUrl && config.sessionKey && config.supabaseUrl && config.publishableKey && config.secretKey); }
module.exports = {readConfig, configured};
