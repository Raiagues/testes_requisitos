const {selection: selectionSchema} = require('./schemas.cjs');
const crypto = require('node:crypto');
const {AppError} = require('./errors.cjs');
function quote(input, config, eligibility = {}, now = new Date()) {
  const plan = selectionSchema.parse(input);
  const price = config.offer;
  const pct = eligibility.first !== false ? (eligibility.feedback === true ? price.feedbackDiscount : price.firstDiscount) : 0;
  const subscription = plan.subscription ? price.monthly : 0;
  const service = plan.service === 'none' ? 0 : Math.round(price.services[plan.service] * price.volumes[plan.volume] / 100);
  const hours = plan.service === 'none' ? 0 : price.hours[plan.volume];
  const human = price.reviewers[plan.reviewer] * hours;
  const included = plan.subscription ? ['trace','editable'] : plan.service === 'documents' ? ['editable'] : [];
  const addons = [...new Set(plan.addons)].filter(key => !included.includes(key) && !(key === 'handover' && plan.reviewer === 'self'));
  const digital = addons.filter(key => key !== 'handover').reduce((sum,key) => sum + price.addons[key],0);
  const humanAddon = addons.includes('handover') ? price.addons.handover : 0;
  const eligible = service + digital;
  const discount = Math.round(eligible * pct / 100);
  const firstMonthly = subscription - Math.round(subscription * pct / 100);
  const setup = plan.hosting === 'private' ? price.dedicatedSetup : 0;
  const infrastructureMonthly = plan.hosting === 'private' ? price.dedicatedMonthly : 0;
  return {version:config.version,currency:'BRL',discountPercent:pct,eligibleCents:eligible,discountCents:discount,serviceCents:service,humanCents:human + humanAddon,digitalCents:digital,setupCents:setup,oneTimeCents:eligible + human + humanAddon + setup - discount,firstMonthlyCents:firstMonthly,renewalCents:subscription,infrastructureMonthlyCents:infrastructureMonthly,infrastructurePending:plan.hosting !== 'cloud',validUntil:new Date(now.getTime() + price.validDays * 86400000).toISOString(),feedbackApplied:eligibility.first !== false && eligibility.feedback === true,paymentsProcessed:false};
}
function signQuote(price,selection,actor,key) { const body = Buffer.from(JSON.stringify({price,selection,actor})).toString('base64url'); const signature = crypto.createHmac('sha256',key).update(body).digest('base64url'); return body + '.' + signature; }
function verifyQuote(token,selection,actor,key,config,eligibility) {
  try {
    const [body,signature,...extra] = token.split('.'); const expected = crypto.createHmac('sha256',key).update(body).digest(); const received = Buffer.from(signature || '','base64url');
    if (extra.length || received.length !== expected.length || !crypto.timingSafeEqual(received,expected)) { throw new Error('signature'); }
    const signed = JSON.parse(Buffer.from(body,'base64url').toString());
    if (signed.actor !== actor || JSON.stringify(signed.selection) !== JSON.stringify(selection) || signed.price.version !== config.version || Date.parse(signed.price.validUntil) <= Date.now()) { throw new Error('scope'); }
    const at = new Date(Date.parse(signed.price.validUntil) - config.offer.validDays * 86400000); const current = quote(selection,config,eligibility,at);
    if (JSON.stringify(current) !== JSON.stringify(signed.price)) { throw new Error('price_changed'); }
    return current;
  } catch { throw new AppError('quote_expired_or_changed',409); }
}
module.exports = {quote,signQuote,verifyQuote};
