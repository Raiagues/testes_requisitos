const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {validateRects} = require('../server/network.cjs');
function normalize(text) { return text.normalize('NFKC').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[\u00ad]/g,'').replace(/\s*-\s+/g,'').replace(/\s+/g,' ').trim(); }
async function locate(pdf,pageNumber,quote) {
  const page = await pdf.getPage(pageNumber); const content = await page.getTextContent(); const items = content.items.filter(item => item.str?.trim()); const needle = normalize(quote); const matches = [];
  for (let start = 0; start < items.length; start += 1) { let text = ''; for (let end = start; end < Math.min(start + 35,items.length); end += 1) { text += (text ? ' ' : '') + items[end].str; if (normalize(text) === needle) { matches.push({start,end,text}); } if (normalize(text).length > needle.length + 20) { break; } } }
  if (matches.length !== 1) { return {verified:false,reason:matches.length ? 'ambiguous_occurrence' : 'exact_text_not_located'}; }
  const match = matches[0]; const width = page.view[2] - page.view[0]; const height = page.view[3] - page.view[1];
  const rects = items.slice(match.start,match.end + 1).map(item => { const style = content.styles[item.fontName]; const x = item.transform[4] - page.view[0]; const y = item.transform[5]; const ascent = style?.ascent ?? 1; const descent = style?.descent ?? 0; return [x / width,(page.view[3] - y - item.height * ascent) / height,(x + item.width) / width,(page.view[3] - y - item.height * descent) / height]; });
  validateRects(rects,pageNumber - 1);
  return {verified:true,exact_text:quote,page_index:pageNumber - 1,context_before:items.slice(Math.max(0,match.start - 2),match.start).map(item => item.str).join(' '),context_after:items.slice(match.end + 1,match.end + 3).map(item => item.str).join(' '),rects};
}
async function main() {
  const filename = process.argv[2]; if (!filename) { throw new Error('Informe o arquivo original local autorizado. Nenhum arquivo é publicado por este comando.'); }
  const data = fs.readFileSync(filename); const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  const templates = JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/templates.json'),'utf8'));
  const {getDocument} = await import('pdfjs-dist/legacy/build/pdf.mjs'); const loading = getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:false}); const pdf = await loading.promise;
  try { const citations = []; for (const key of ['nasa-clarity','nasa-verification','nasa-form','nasa-trace','nasa-matrix','nasa-rationale']) { const source = templates.sources[key]; const result = await locate(pdf,source.pdfPage,source.quote); citations.push({id:key,source_id:'nasa-handbook-2016',printed_page:source.page,clause:source.section,...result}); }
    const report = {sourceId:'nasa-handbook-2016',sha256,bytes:data.length,pages:pdf.numPages,licenseStatus:'pending',method:'PDF.js: correspondência integral única no índice esperado; retângulos dos itens e métricas da fonte; exige conferência visual',citations};
    const directory = path.join(__dirname,'../test-results/sources'); fs.mkdirSync(directory,{recursive:true}); fs.writeFileSync(path.join(directory,'nasa-citations.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({sha256,pages:pdf.numPages,located:citations.filter(c => c.verified).length,pending:citations.filter(c => !c.verified).map(c => c.id)}));
  } finally { await loading.destroy(); }
}
if (require.main === module) { main().catch(error => { console.error(error.message); process.exitCode = 1; }); }
module.exports = {locate,normalize};
