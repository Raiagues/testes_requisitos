const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'../..');
const findings = [];
const rules = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,/\b(?:AIza|AQ\.)[A-Za-z0-9_-]{30,}\b/g,/\b(?:ghp_|github_pat_|sb_secret_|sbp_|rnd_)[A-Za-z0-9_-]{20,}\b/g,/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/g,/(?:postgres(?:ql)?):\/\/[^\s:]+:[^\s@]{8,}@/g];
function inspect(name,text) { for (const rule of rules) { rule.lastIndex = 0; if (rule.test(text)) { findings.push(name); break; } } }
function walk(directory) { for (const entry of fs.readdirSync(directory,{withFileTypes:true})) { if (['.git','node_modules','.agents','.codex','.aws','test-results','playwright-report','backups','dados-privados'].includes(entry.name) || entry.name.startsWith('.env') && !entry.name.endsWith('.example')) { continue; } const filename = path.join(directory,entry.name); if (entry.isDirectory()) { walk(filename); } else if (entry.isFile() && /\.(?:c?js|mjs|json|html|css|sql|md|txt|yaml|yml|map|py|example)$|Dockerfile$/.test(filename)) { inspect(path.relative(root,filename),fs.readFileSync(filename,'utf8')); } } }
walk(root);
let history = 'indisponível';
try { const commits = execFileSync('git',['rev-list','--all'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n').filter(Boolean); for (const commit of commits) { const diff = execFileSync('git',['show','--format=','--no-ext-diff',commit],{cwd:root,encoding:'utf8',maxBuffer:32 * 1024 * 1024}); inspect('histórico:' + commit.slice(0,12),diff); } history = commits.length + ' commits'; } catch { /* Uma pasta ainda não inicializada não possui histórico. */ }
if (findings.length) { console.error('Possíveis segredos nos locais abaixo; valores omitidos:\n' + [...new Set(findings)].join('\n')); process.exitCode = 1; } else { console.log('Nenhum padrão de segredo detectado nos arquivos textuais, build e histórico acessível (' + history + '). A verificação não prova ausência universal.'); }
