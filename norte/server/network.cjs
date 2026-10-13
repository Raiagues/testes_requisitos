const dns = require('node:dns/promises');
const https = require('node:https');
const ipaddr = require('ipaddr.js');
const {AppError} = require('./errors.cjs');
const APPROVED_URLS = Object.freeze({nasaHandbook:'https://www.nasa.gov/wp-content/uploads/2018/09/nasa_systems_engineering_handbook_0.pdf'});
function publicAddress(value) {
  try { const address = ipaddr.process(value); return address.range() === 'unicast'; } catch { return false; }
}
function allowedUrl(input, allowlist = Object.values(APPROVED_URLS)) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash || !allowlist.includes(url.href)) { throw new AppError('source_url_denied',403); }
  return url;
}
async function downloadOfficial(input,{resolve = dns.lookup,request = https.request,allowlist = Object.values(APPROVED_URLS),maxBytes = 50 * 1024 * 1024} = {}) {
  let current = input;
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    const url = allowedUrl(current,allowlist);
    const addresses = await resolve(url.hostname,{all:true,verbatim:true});
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) { throw new AppError('source_address_denied',403); }
    const pinned = addresses[0];
    const result = await new Promise((resolveResult,reject) => {
      const options = {hostname:url.hostname,path:url.pathname + url.search,port:443,servername:url.hostname,method:'GET',agent:false,lookup:(_host,options,callback) => callback(null,options.all ? [pinned] : pinned.address,pinned.family),headers:{Accept:'application/pdf'},timeout:10000};
      const req = request(options,res => {
        if ([301,302,303,307,308].includes(res.statusCode)) { try { const redirect = new URL(res.headers.location,url).href; res.destroy(); resolveResult({redirect}); } catch { res.destroy(); reject(new AppError('source_url_denied')); } return; }
        if (res.statusCode !== 200 || !/^application\/pdf(?:;|$)/i.test(res.headers['content-type'] || '') || Number(res.headers['content-length'] || 0) > maxBytes) { res.destroy(); reject(new AppError('source_not_pdf')); return; }
        const chunks = []; let length = 0;
        res.on('data',chunk => { length += chunk.length; if (length > maxBytes) { req.destroy(); reject(new AppError('source_too_large',413)); } else { chunks.push(chunk); } });
        res.on('end',() => resolveResult({bytes:Buffer.concat(chunks)}));
        res.on('error',reject);
      });
      req.on('error',reject);
      req.on('timeout',() => req.destroy(new Error('timeout')));
      const timer = setTimeout(() => req.destroy(new Error('timeout')),10000);
      req.on('close',() => clearTimeout(timer));
      req.end();
    });
    if (result.redirect) { current = result.redirect; continue; }
    if (result.bytes.subarray(0,5).toString() !== '%PDF-') { throw new AppError('source_not_pdf'); }
    return result.bytes;
  }
  throw new AppError('source_redirect_limit');
}
function validateRects(rects,pageIndex) {
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 1999 || !Array.isArray(rects) || rects.length > 100) { throw new AppError('invalid_citation'); }
  for (const rect of rects) { if (!Array.isArray(rect) || rect.length !== 4 || rect.some(value => !Number.isFinite(value) || value < 0 || value > 1) || rect[2] <= rect[0] || rect[3] <= rect[1]) { throw new AppError('invalid_citation'); } }
  return rects;
}
module.exports = {APPROVED_URLS,publicAddress,allowedUrl,downloadOfficial,validateRects};
