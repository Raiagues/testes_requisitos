const PDFDocument = require('pdfkit');
const path = require('node:path');
const {AppError} = require('./errors.cjs');
const {scheduleDiagram} = require('./document-content.cjs');

const INK = '#29302b';
const MUTED = '#717569';
const ACCENT = '#80503b';
const LINE = '#d9d9cd';
const SOFT = '#f1f1eb';
const LEFT = 48;
const TOP = 66;
const PAD = 8;
const LEADING = 13;

// O texto é medido com a mesma fonte e largura usadas no desenho. Células muito
// longas continuam na página seguinte, com cabeçalho repetido, sem truncamento.
function wrapCell(pdf,value,width) {
  const lines = [];
  for (const paragraph of String(value ?? '').split('\n')) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && pdf.widthOfString(line + ' ' + word) <= width) { line += ' ' + word; continue; }
      if (line) { lines.push(line); }
      while (pdf.widthOfString(word) > width) {
        const chars = Array.from(word); let low = 1; let high = chars.length;
        while (low < high) { const mid = Math.ceil((low + high) / 2); if (pdf.widthOfString(chars.slice(0,mid).join('')) <= width) { low = mid; } else { high = mid - 1; } }
        lines.push(chars.slice(0,low).join('')); word = chars.slice(low).join('');
      }
      line = word;
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}
function drawTable(pdf,section) {
  if (!section.rows.length) { pdf.font('Norte').fontSize(10).fillColor(MUTED).text('Nenhum registro. Conteúdo pendente.'); return; }
  const count = Math.max(...section.rows.map(row => row.length));
  const weights = section.widths || (count === 2 ? [0.32,0.68] : count === 3 ? [0.19,0.3,0.51] : [0.15,0.35,0.2,0.3]);
  const width = pdf.page.width - LEFT * 2;
  const widths = weights.map(weight => width * weight);
  const headers = section.headers || (count === 2 ? ['Campo','Registro'] : count === 3 ? ['Identificador','Descrição','Registro'] : ['Identificador','Descrição','Configuração','Registro']);
  const bottom = pdf.page.height - pdf.page.margins.bottom;
  pdf.font('Norte-Bold').fontSize(8.5);
  const headerLines = headers.map((value,i) => wrapCell(pdf,value,widths[i] - PAD * 2));
  const headerHeight = Math.max(...headerLines.map(lines => lines.length)) * LEADING + PAD * 2;
  function cells(lines,height,header,rowIndex) {
    const y = pdf.y; let x = LEFT;
    pdf.save().rect(LEFT,y,width,height).fill(header ? SOFT : rowIndex % 2 ? '#fafaf7' : '#ffffff').restore();
    lines.forEach((column,i) => {
      pdf.font(header ? 'Norte-Bold' : 'Norte').fontSize(header ? 8.5 : 9).fillColor(header ? MUTED : INK);
      column.forEach((line,j) => pdf.text(line,x + PAD,y + PAD + j * LEADING,{lineBreak:false}));
      if (i) { pdf.save().strokeColor(LINE).lineWidth(0.4).moveTo(x,y).lineTo(x,y + height).stroke().restore(); }
      x += widths[i];
    });
    pdf.save().lineWidth(0.5).strokeColor(LINE).rect(LEFT,y,width,height).stroke().restore();
    pdf.x = LEFT; pdf.y = y + height;
  }
  function header(newPage = false) { if (newPage) { pdf.addPage(); } cells(headerLines,headerHeight,true,0); }
  if (pdf.y + headerHeight + LEADING + PAD * 2 > bottom) { pdf.addPage(); }
  header();
  section.rows.forEach((row,rowIndex) => {
    pdf.font('Norte').fontSize(9);
    const columns = row.map((value,i) => wrapCell(pdf,value,widths[i] - PAD * 2));
    let remaining = Math.max(...columns.map(lines => lines.length)); let offset = 0;
    const rowHeight = remaining * LEADING + PAD * 2;
    if (pdf.y + rowHeight > bottom && rowHeight <= bottom - TOP - headerHeight) { header(true); }
    while (remaining > 0) {
      let capacity = Math.floor((bottom - pdf.y - PAD * 2) / LEADING);
      if (capacity < 1) { header(true); capacity = Math.floor((bottom - pdf.y - PAD * 2) / LEADING); }
      const take = Math.min(remaining,capacity);
      cells(columns.map(lines => lines.slice(offset,offset + take)),take * LEADING + PAD * 2,false,rowIndex);
      remaining -= take; offset += take;
      if (remaining) { header(true); }
    }
  });
  pdf.y += 12;
}

async function renderPDF(project,document) {
  const fonts = path.join(__dirname,'..','assets','fonts');
  const pdf = new PDFDocument({size:'A4',margins:{top:TOP,bottom:58,left:LEFT,right:LEFT},bufferPages:true,info:{Title:document.title,Author:'Norte',Subject:'Rascunho gerado dos dados salvos'}});
  pdf.registerFont('Norte',path.join(fonts,'DejaVuSans.ttf'));
  pdf.registerFont('Norte-Bold',path.join(fonts,'DejaVuSans-Bold.ttf'));
  let pageCount = 1;
  pdf.on('pageAdded',() => { if (++pageCount > 300) { throw new AppError('document_page_limit'); } });
  const chunks = [];
  const complete = new Promise((resolve,reject) => { pdf.on('data',chunk => chunks.push(chunk)); pdf.on('end',() => resolve(Buffer.concat(chunks))); pdf.on('error',reject); });
  pdf.font('Norte').fontSize(9).fillColor(ACCENT).text(document.id + '  /  ' + project.profile);
  pdf.moveDown(0.8).font('Norte-Bold').fontSize(23).fillColor(INK).text(document.title,{lineGap:3});
  pdf.moveDown(0.5).font('Norte').fontSize(10).fillColor(MUTED).text(project.name + ' · Rascunho · v' + project.version);
  const rule = pdf.y + 16;
  pdf.strokeColor(LINE).lineWidth(0.7).moveTo(LEFT,rule).lineTo(pdf.page.width - LEFT,rule).stroke(); pdf.y = rule + 22;
  if (document.id === 'CRN') { scheduleDiagram(pdf,project); }
  document.sections.forEach((section,index) => {
    pdf.x = LEFT;
    pdf.font('Norte-Bold').fontSize(11.5);
    const heading = `${index + 1}. ${section.title}`;
    const headingHeight = pdf.heightOfString(heading,{width:pdf.page.width - LEFT * 2});
    if (pdf.y + headingHeight + (section.rows ? 80 : 44) > pdf.page.height - 58) { pdf.addPage(); }
    pdf.fillColor(ACCENT).text(heading,{lineGap:2}); pdf.y += 10;
    if (section.body) { pdf.font('Norte').fontSize(10).fillColor(INK).text(section.body,{lineGap:4,paragraphGap:6}); pdf.y += 12; }
    if (section.rows) { drawTable(pdf,section); }
    pdf.y += 8;
  });
  const pages = pdf.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    pdf.switchToPage(i);
    const width = pdf.page.width - LEFT * 2;
    pdf.font('Norte-Bold').fontSize(11).fillColor(ACCENT).text('norte.',LEFT,28,{lineBreak:false});
    pdf.font('Norte').fontSize(8).fillColor(MUTED);
    const header = document.id + ' · DOCUMENTO DE TRABALHO';
    pdf.text(header,LEFT + width - pdf.widthOfString(header),31,{lineBreak:false});
    pdf.strokeColor(LINE).lineWidth(0.5).moveTo(LEFT,pdf.page.height - 44).lineTo(LEFT + width,pdf.page.height - 44).stroke();
    pdf.font('Norte').fontSize(8).fillColor(MUTED).text('Rascunho · versão ' + project.version,LEFT,pdf.page.height - 32,{lineBreak:false});
    const number = `${i + 1} / ${pages.count}`;
    pdf.text(number,LEFT + width - pdf.widthOfString(number),pdf.page.height - 32,{lineBreak:false});
  }
  pdf.end(); return complete;
}
module.exports = {renderPDF,wrapCell};
