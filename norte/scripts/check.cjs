const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {ESLint} = require('eslint');
async function main() {
  const root = path.join(__dirname,'..');
  const folders = ['codigo','server','scripts','tests']; let checked = 0;
  for (const folder of folders) { for (const file of fs.readdirSync(path.join(root,folder),{recursive:true})) { if (/\.(?:c?js|mjs)$/.test(file)) { execFileSync(process.execPath,['--check',path.join(root,folder,file)],{stdio:'pipe'}); checked += 1; } } }
  const eslint = new ESLint({cwd:root}); const results = await eslint.lintFiles(['server','scripts','servidor.cjs']); const formatter = await eslint.loadFormatter('stylish'); const output = formatter.format(results); if (output) { console.log(output); }
  if (results.some(result => result.errorCount)) { process.exitCode = 1; return; }
  const html = fs.readFileSync(path.join(root,'dist','index.html'),'utf8'); if (/<script(?![^>]*\bsrc=)[^>]*>[^<]/.test(html) || /\son(?:click|load|error)=/i.test(html)) { throw new Error('HTML contém script executável inline.'); }
  console.log(`${checked} arquivos com sintaxe válida; ESLint e política de scripts do build aprovados.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
