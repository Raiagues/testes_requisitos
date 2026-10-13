const PDFDocument = require('pdfkit');
const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,Header,Footer,PageNumber} = require('docx');
const {zipSync,strToU8} = require('fflate');
const path = require('node:path');
const {AppError} = require('./errors.cjs');
const {enrich,scheduleDiagram} = require('./document-content.cjs');
function csvCell(value) { const string = String(value ?? ''); const safe = /^(?:[\t\0]|[\s]*[=+@-])/.test(string) ? "'" + string : string; return '"' + safe.replaceAll('"','""') + '"'; }
function csv(project) {
  const rows = [['ID','Requisito','Versão','Subsistema','Referência','Verificações'],...project.payload.requirements.map(req => [req.id,req.text,req.version,req.subsystem,req.reference,project.payload.verifications.filter(v => v.requirementIds.includes(req.id)).map(v => v.id).join('; ')])];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
function icsText(value) { return String(value).replaceAll('\\','\\\\').replaceAll(';','\\;').replaceAll(',','\\,').replace(/\r\n|\r|\n/g,'\\n'); }
function foldLine(line) { let result = ''; let size = 0; for (const char of line) { const bytes = Buffer.byteLength(char); if (size + bytes > 73) { result += '\r\n '; size = 1; } result += char; size += bytes; } return result; }
function reviews(project) { return (project.payload.engineering.schedules?.[project.profile] || []).filter(review => review.active); }
function ics(project) {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Norte//Revisões//PT-BR','CALSCALE:GREGORIAN'];
  for (const review of reviews(project)) { const day = review.date.replaceAll('-',''); if (!/^\d{8}$/.test(day)) { continue; } lines.push('BEGIN:VEVENT',`UID:${project.id}-${project.profile}-${review.id}@norte`,`DTSTAMP:${project.updated_at.replace(/[-:]/g,'').slice(0,15)}Z`,`DTSTART;VALUE=DATE:${day}`,`SUMMARY:${icsText(project.profile + ' ' + review.id + ' · ' + review.title)}`,`DESCRIPTION:${icsText('Data definida pela equipe; não é um prazo da norma. Preparação: ' + review.prepDays + ' dias.')}`,'END:VEVENT'); }
  lines.push('END:VCALENDAR'); return lines.map(foldLine).join('\r\n') + '\r\n';
}
function model(project,id,templates) {
  if (id === 'QUOTE' && project.publicQuote) { const q = project.publicQuote; const money = cents => (cents / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); return {id,title:'Configuração de contratação',sections:[{title:'Valores confirmados pelo servidor',rows:[['Primeira mensalidade',money(q.firstMonthlyCents)],['Mensalidades seguintes',money(q.renewalCents)],['Base digital elegível',money(q.eligibleCents)],['Desconto do serviço',money(q.discountCents)],['Revisão humana e devolutiva',money(q.humanCents)],['Implantação',money(q.setupCents)],['Total avulso',money(q.oneTimeCents)],['Hospedagem mensal separada',money(q.infrastructureMonthlyCents)],['Validade da configuração',q.validUntil]]},{title:'Condições',body:'Intenção de contratação, sem pagamento processado. Descontos não recorrem. Revisão humana e infraestrutura dependem de confirmação de disponibilidade e escopo.'}]}; }
  const def = templates.definitions.find(item => item.id === id) || project.payload.engineering.customDocs?.find(item => item.id === id);
  const reviewDoc = /^(PROC|ATA)-/.test(id);
  if (!def && !reviewDoc) { throw new AppError('unknown_document'); }
  const reviewId = reviewDoc ? id.replace(/^(PROC|ATA)-/,'') : null;
  if (reviewDoc && !(project.payload.engineering.schedules?.[project.profile] || []).some(review => review.id === reviewId)) { throw new AppError('unknown_document'); }
  const nasa = project.profile === 'NASA';
  const reviewSource = project.profile === 'CUSTOM' ? {} : {source:nasa ? 'nasaReviews' : 'ecssReviews',clause:id.startsWith('PROC-') ? (nasa ? '5.2.1.1; formato separado escolhido pela equipe' : '5.3.2.a; Anexo A') : (nasa ? '5.2.3.1' : '5.3.4.d, 5.5.6.b(6), 5.6.c; Anexos B, C e D')};
  const mapping = def?.[project.profile.toLowerCase()] || def?.all || def || reviewSource;
  const title = mapping.title || def?.title || (id.startsWith('ATA-') ? 'Registro e ações da revisão ' : 'Preparação da revisão ') + id.split('-').slice(1).join('-');
  const source = templates.sources[mapping.source];
  const reference = source ? `${source.edition} · ${source.title} · ${mapping.clause || source.section}. Aplicabilidade e correspondência do modelo: a confirmar pela equipe.\nEndereço oficial: ${source.url}` : 'Decisão interna da equipe. Este documento não constitui obrigação de uma norma.';
  const sections = [{title:'Controle de revisão',body:`Projeto: ${project.name}\nVersão salva: ${project.version} · Modelo Norte 1\nSituação: Rascunho\nResponsável e aprovação: pendentes\nPerfil: ${project.profile}`},{title:'Origem e aplicação',body:reference}];
  if (['REQ','RTM','ANA','VCD'].includes(id)) {
    sections.push({title:'Dados do projeto',rows:project.payload.requirements.map(req => [req.id,req.text,`Versão ${req.version} · ${req.subsystem || 'Subsistema pendente'}`,`Critério: ${req.acceptance || 'Pendente'}\nOrigem: ${req.reference || 'Pendente'}\nVerificações: ${project.payload.verifications.filter(v => v.requirementIds.includes(req.id)).map(v => v.id).join(', ') || 'Nenhuma'}`])});
  } else if (id === 'CRN') {
    sections.push({title:'Revisões planejadas — datas da equipe',rows:reviews(project).map(review => [project.profile + ' ' + review.id,review.title,review.date,`Preparação: ${review.prepDays} dias\nFechamento: ${review.closeDays} dias`])});
  } else {
    sections.push({title:'Conteúdo solicitado pela referência',body:`${mapping.maturity || 'Confirmar o conteúdo e a maturidade esperados.'}\nMapeamento orientativo da Norte, condicionado à adoção e à conferência da referência. Não representa um pacote integral aprovado.`});
    sections.push({title:'Dados do projeto',body:def?.body || 'Conteúdo específico ainda não registrado. Definir responsável, dados de entrada e critérios.'});
    if (['VVP','RES'].includes(id)) { sections.push({title:'Verificações registradas',rows:project.payload.verifications.map(v => [v.id,v.title,`${v.status} · ${v.result}`,`Evidência: ${v.evidence || 'Pendente'}\nCritério: ${v.criteria || 'Pendente'}`])}); }
    if (reviewDoc) { sections.push({title:'Decisão, ações e fechamento',body:'Preencher após a realização. Não há aprovação, assinatura ou execução presumida.'}); }
  }
  enrich(project,id,sections);
  const adopted = (project.sourceVersions || []).map(s => `${s.code} · ${s.title} · ${s.edition}\nDecisão: ${s.decision} · Responsável: ${s.responsible}\nJustificativa: ${s.rationale}\nSHA-256: ${s.sha256 || 'original pendente'}\nFicha: /api/sources/${s.id}/citations\nOficial: ${s.url}`).join('\n\n');
  sections.push({title:'Complementos da equipe',body:'Registrar adaptações, justificativa, responsável e decisão de aplicabilidade. Entregas sem marco continuam pendentes.'},{title:'Referências e versões adotadas',body:reference + '\n\n' + (adopted || 'Nenhuma adoção registrada. Referências do modelo são orientativas e precisam de conferência. Esta é uma produção da Norte, não uma publicação oficial.')});
  return {id,title,sections};
}
async function pdf(project,document) {
  const fonts = path.join(__dirname,'..','assets','fonts');
  const pdf = new PDFDocument({size:'A4',margins:{top:58,bottom:58,left:48,right:48},bufferPages:true,info:{Title:document.title,Author:'Norte',Subject:'Rascunho gerado dos dados salvos'}});
  pdf.registerFont('Norte',path.join(fonts,'DejaVuSans.ttf'));
  pdf.registerFont('Norte-Bold',path.join(fonts,'DejaVuSans-Bold.ttf'));
  const chunks = [];
  const complete = new Promise((resolve,reject) => { pdf.on('data',chunk => chunks.push(chunk)); pdf.on('end',() => resolve(Buffer.concat(chunks))); pdf.on('error',reject); });
  pdf.font('Norte-Bold').fontSize(19).fillColor('#684d3b').text(document.title);
  pdf.moveDown().font('Norte').fontSize(10).fillColor('#3b3935').text(`Norte · ${project.name} · Rascunho · v${project.version}`);
  if (document.id === 'CRN') { pdf.moveDown(); scheduleDiagram(pdf,project); }
  for (const section of document.sections) {
    if (pdf.y > 705) { pdf.addPage(); }
    pdf.moveDown().font('Norte-Bold').fontSize(13).text(section.title);
    pdf.moveDown(0.4).font('Norte').fontSize(11);
    if (section.body) { pdf.text(section.body,{lineGap:4}); }
    if (section.rows) {
      if (!section.rows.length) { pdf.text('Nenhum registro. Conteúdo pendente.'); }
      for (const row of section.rows) {
        if (pdf.y > 660) { pdf.addPage(); pdf.font('Norte-Bold').fontSize(11).text(section.title + ' · continuação'); pdf.moveDown(); }
        pdf.font('Norte-Bold').fontSize(11).text(row[0]);
        pdf.font('Norte').text(row.slice(1).join('\n'),{lineGap:4});
        pdf.moveDown();
      }
    }
  }
  const pages = pdf.bufferedPageRange();
  if (pages.count > 300) { throw new AppError('document_page_limit'); }
  for (let i = 0; i < pages.count; i += 1) { pdf.switchToPage(i); pdf.font('Norte').fontSize(8).fillColor('#6f665e').text(`NORTE / ${document.id} · Rascunho`,48,28,{lineBreak:false}); pdf.text(`v${project.version} · ${i + 1} / ${pages.count}`,48,pdf.page.height - 35,{lineBreak:false}); }
  pdf.end(); return complete;
}
async function word(project,document) {
  const paragraph = (text,bold = false) => new Paragraph({spacing:{after:160},children:[new TextRun({text,bold,font:'DejaVu Sans',size:22})]});
  const children = [paragraph(document.title,true),paragraph(`${project.name} · Rascunho · versão ${project.version}`)];
  for (const section of document.sections) { children.push(paragraph(section.title,true)); if (section.body) { for (const line of section.body.split('\n')) { children.push(paragraph(line)); } } if (section.rows?.length) { const header = new TableRow({tableHeader:true,children:['Identificador','Dados registrados'].map(text => new TableCell({children:[paragraph(text,true)]}))}); const rows = section.rows.map(row => new TableRow({cantSplit:false,children:[new TableCell({children:[paragraph(row[0],true)]}),new TableCell({children:row.slice(1).flatMap(text => text.split('\n').map(line => paragraph(line)))})]})); children.push(new Table({rows:[header,...rows],width:{size:100,type:'pct'}})); } }
  const doc = new Document({creator:'Norte',title:document.title,sections:[{headers:{default:new Header({children:[paragraph('NORTE / Rascunho')]})},footers:{default:new Footer({children:[new Paragraph({children:[new TextRun({children:['Página ',PageNumber.CURRENT]})]})]})},children}]});
  return Packer.toBuffer(doc);
}
async function generate(project,input,templates) {
  const filename = `norte-${project.id}-v${project.version}`;
  if (input.format === 'json') { return {bytes:Buffer.from(JSON.stringify({schemaVersion:1,project},null,2)),filename:filename + '.json',mime:'application/json'}; }
  if (input.format === 'csv') { return {bytes:Buffer.from(csv(project)),filename:filename + '.csv',mime:'text/csv'}; }
  if (input.format === 'ics') { return {bytes:Buffer.from(ics(project)),filename:filename + '.ics',mime:'text/calendar'}; }
  if (input.format === 'zip') { const files = {}; for (const id of input.documents) { const definition = model(project,id,templates); files[id + '.pdf'] = new Uint8Array(await pdf(project,definition)); files[id + '.docx'] = new Uint8Array(await word(project,definition)); } files['dados.csv'] = strToU8(csv(project)); files['cronograma.ics'] = strToU8(ics(project)); files['projeto.json'] = strToU8(JSON.stringify(project)); files['manifesto.json'] = strToU8(JSON.stringify({projectId:project.id,projectVersion:project.version,templateVersion:1,requirements:project.payload.requirements.map(r => ({id:r.id,version:r.version})),sources:project.sourceVersions || [],documents:input.documents,status:'Rascunho'})); return {bytes:Buffer.from(zipSync(files)),filename:filename + '.zip',mime:'application/zip'}; }
  const document = model(project,input.documents[0],templates);
  const bytes = input.format === 'docx' ? await word(project,document) : await pdf(project,document);
  return {bytes,filename:filename + '-' + document.id + '.' + input.format,mime:input.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
}
module.exports = {csvCell,csv,icsText,foldLine,ics,model,pdf,word,generate};
