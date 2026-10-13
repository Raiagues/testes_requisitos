// PDF vetorial, com texto selecionável e links para as fontes.
function pdfPlain(value) {
  const replacements = {'≥': '>=', '≤': '<=', '≠': '!=', '→': '->', '←': '<-', 'Δ': 'delta ', 'μ': 'micro', 'µ': 'micro', 'Ω': 'ohm', 'ω': 'omega', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'θ': 'theta', 'λ': 'lambda', 'π': 'pi', 'σ': 'sigma', 'τ': 'tau', '₂': '2', '₃': '3', '₀': '0', '₁': '1', '✓': 'OK', '×': 'x', '\u202f': ' ', '\u00a0': ' '};
  return String(value ?? '').replace(/[≥≤≠→←ΔμµΩωαβγθλπστ₂₃₀₁✓×\u202f\u00a0]/g, char => replacements[char]);
}
function pdfEscape(value) {
  const special = {'€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159};
  let result = '';
  for (const char of pdfPlain(value)) {
    const code = special[char] || char.codePointAt(0);
    if (char === '(' || char === ')' || char === '\\') { result += '\\' + char; }
    else if (code >= 32 && code <= 126) { result += char; }
    else if (code > 126 && code <= 255) { result += '\\' + code.toString(8).padStart(3, '0'); }
    else if (char === '\n' || char === '\r' || char === '\t') { result += ' '; }
    else { result += '?'; }
  }
  return result;
}
function pdfNew() {
  return {pages: [], page: null, y: 0, width: 595.28, height: 841.89, left: 42, right: 553.28, section: '', subtitle: '', measure: document.createElement('canvas').getContext('2d')};
}
function pdfText(doc, text, x, y, size = 10, bold = false, color = '0.17 0.18 0.16') {
  const baseline = doc.height - y;
  doc.page.ops += `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm (${pdfEscape(text)}) Tj ET\n`;
}
function pdfLine(doc, x1, y1, x2, y2, color = '0.85 0.84 0.80', width = 0.6) { doc.page.ops += `${color} RG ${width} w ${x1} ${doc.height - y1} m ${x2} ${doc.height - y2} l S\n`; }
function pdfRect(doc, x, y, w, h, color = '0.96 0.95 0.92') { doc.page.ops += `${color} rg ${x} ${doc.height - y - h} ${w} ${h} re f\n`; }
function pdfWrap(doc, value, size = 10, width = 511, bold = false) {
  doc.measure.font = `${bold ? 'bold ' : ''}${size}px Arial`;
  const paragraphs = pdfPlain(value).split(/\n/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (doc.measure.measureText(test).width <= width) { line = test; continue; }
      if (line) { lines.push(line); line = ''; }
      if (doc.measure.measureText(word).width > width) {
        for (const char of word) {
          if (doc.measure.measureText(line + char).width > width) { lines.push(line); line = char; } else { line += char; }
        }
      } else { line = word; }
    }
    lines.push(line);
  }
  return lines;
}
function pdfPage(doc, title, subtitle = '') {
  doc.page = {ops: '', links: []};
  doc.pages.push(doc.page);
  doc.section = title;
  doc.subtitle = subtitle;
  pdfText(doc, 'NORTE', 42, 38, 13, true, '0.46 0.33 0.24');
  pdfText(doc, 'ENGENHARIA DE REQUISITOS', 112, 38, 8, false, '0.48 0.48 0.43');
  pdfText(doc, dateLabel(now()), 503, 38, 8, false, '0.48 0.48 0.43');
  pdfLine(doc, 42, 54, 553.28, 54);
  pdfText(doc, title, 42, 94, 24, true);
  doc.y = 115;
  if (subtitle) {
    for (const line of pdfWrap(doc, subtitle, 10, 511)) { pdfText(doc, line, 42, doc.y, 10, false, '0.46 0.46 0.41'); doc.y += 14; }
  }
  doc.y += 18;
}
function pdfNeed(doc, height) { if (doc.y + height > 768) { pdfPage(doc, doc.section, 'Continuação'); } }
function pdfBlock(doc, text, size = 10.5, bold = false, color = '0.17 0.18 0.16', gap = 7, width = 511, x = 42) {
  const lines = pdfWrap(doc, text, size, width, bold);
  const step = size * 1.45;
  for (const line of lines) {
    pdfNeed(doc, step + 2);
    pdfText(doc, line, x, doc.y, size, bold, color);
    doc.y += step;
  }
  doc.y += gap;
}
function pdfLink(doc, label, url, x = 42, size = 9) {
  pdfNeed(doc, 20);
  pdfText(doc, label, x, doc.y, size, false, '0.46 0.33 0.24');
  doc.measure.font = `${size}px Arial`;
  const width = Math.min(doc.measure.measureText(label).width, 505);
  pdfLine(doc, x, doc.y + 2, x + width, doc.y + 2, '0.68 0.56 0.45', 0.4);
  doc.page.links.push({rect: [x, doc.height - doc.y - 4, x + width, doc.height - doc.y + size + 2], url: url});
  doc.y += size * 1.5 + 7;
}
function pdfFinish(doc, footer = 'Registro de trabalho. Não substitui revisão técnica ou parecer jurídico.') {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const pageRefs = [];
  for (let index = 0; index < doc.pages.length; index += 1) {
    doc.page = doc.pages[index];
    pdfLine(doc, 42, doc.height - 48.89, doc.width - 42, doc.height - 48.89);
    pdfText(doc, footer, 42, doc.height - 31.89, 7.5, false, '0.48 0.48 0.43');
    pdfText(doc, `${index + 1} / ${doc.pages.length}`, doc.width - 64.28, doc.height - 31.89, 8, false, '0.48 0.48 0.43');
    const contentNumber = objects.length + 1;
    objects.push(`<< /Length ${doc.page.ops.length} >>\nstream\n${doc.page.ops}endstream`);
    const links = [];
    for (const link of doc.page.links) {
      const number = objects.length + 1;
      objects.push(`<< /Type /Annot /Subtype /Link /Rect [${link.rect.join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${pdfEscape(link.url)}) >> >>`);
      links.push(`${number} 0 R`);
    }
    const pageNumber = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${doc.width} ${doc.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNumber} 0 R ${links.length ? `/Annots [${links.join(' ')}]` : ''} >>`);
    pageRefs.push(`${pageNumber} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Count ${doc.pages.length} /Kids [${pageRefs.join(' ')}] >>`;
  let text = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) { offsets.push(text.length); text += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; }
  const start = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) { text += `${String(offset).padStart(10, '0')} 00000 n \n`; }
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Blob([text], {type: 'application/pdf'});
}
function pdfMatrixHead(doc) {
  pdfRect(doc, 42, doc.y - 13, 511.28, 28);
  pdfText(doc, 'ID', 52, doc.y + 4, 8, true, '0.46 0.46 0.41');
  pdfText(doc, 'REQUISITO', 112, doc.y + 4, 8, true, '0.46 0.46 0.41');
  pdfText(doc, 'RESULTADO', 450, doc.y + 4, 8, true, '0.46 0.46 0.41');
  doc.y += 15;
}
function buildReportPDF(rows) {
  const doc = pdfNew();
  pdfPage(doc, 'Revisão de requisitos', `Missão Aurora · Concepção · Perfil de redação ${settings.standard}`);
  const findingCount = rows.reduce((sum, req) => sum + req.findings.length, 0);
  const regulatoryCount = rows.filter(req => req.status === 'regulatory').length;
  const metrics = [[rows.length, 'REQUISITOS'], [findingCount, 'APONTAMENTOS'], [regulatoryCount, 'REVISÃO REGULATÓRIA']];
  const metricY = doc.y - 4;
  for (let i = 0; i < metrics.length; i += 1) {
    const x = 42 + i * 173;
    pdfRect(doc, x, metricY, 165, 62, '0.96 0.96 0.94');
    pdfText(doc, String(metrics[i][0]), x + 13, metricY + 30, 24, true, '0.46 0.33 0.24');
    pdfText(doc, metrics[i][1], x + 13, metricY + 47, 7.5, false, '0.46 0.46 0.41');
  }
  doc.y = metricY + 92;
  pdfMatrixHead(doc);
  for (const req of rows) {
    const lines = pdfWrap(doc, req.text || 'Declaração não preenchida', 10.2, 321);
    const height = Math.max(59, lines.length * 14 + 32);
    if (doc.y + height > 743) { pdfPage(doc, 'Matriz de requisitos', 'Missão Aurora · Continuação'); pdfMatrixHead(doc); }
    const top = doc.y;
    pdfText(doc, req.id, 52, top + 20, 8.5, true, '0.46 0.33 0.24');
    for (let i = 0; i < lines.length; i += 1) { pdfText(doc, lines[i], 112, top + 20 + i * 14, 10.2); }
    const meta = `${req.subsystem} · ${req.method} · v${req.version}`;
    pdfText(doc, meta, 112, top + 23 + lines.length * 14, 8, false, '0.46 0.46 0.41');
    const status = statusText(req);
    const color = req.status === 'regulatory' ? '0.60 0.28 0.22' : req.status === 'issues' ? '0.53 0.37 0.12' : req.status === 'clear' ? '0.27 0.43 0.36' : '0.46 0.46 0.41';
    const statusLines = pdfWrap(doc, status, 9, 93, true);
    for (let i = 0; i < statusLines.length; i += 1) { pdfText(doc, statusLines[i], 450, top + 20 + i * 13, 9, true, color); }
    pdfLine(doc, 42, top + height, 553.28, top + height);
    doc.y += height;
  }
  doc.y += 23;
  pdfBlock(doc, 'Sem alertas indica apenas que as checagens habilitadas não encontraram os padrões previstos. A decisão de revisão e a verificação do produto são etapas distintas.', 9, false, '0.46 0.46 0.41', 0);
  const hasDetails = rows.some(req => req.findings.length || req.status === 'pending' || req.reviewAt);
  if (hasDetails) {
    pdfPage(doc, 'Apontamentos para revisão', 'Ação sugerida, referência e decisão da equipe');
    for (const req of rows) {
      if (!req.findings.length && req.status !== 'pending' && !req.reviewAt) { continue; }
      const headingLines = pdfWrap(doc, req.text, 10.5, 511);
      let recordHeight = 68 + headingLines.length * 15;
      for (const finding of req.findings) { recordHeight += 51 + pdfWrap(doc, finding.message, 9.5, 493).length * 14; }
      if (req.reviewNote) { recordHeight += pdfWrap(doc, req.reviewNote, 9, 511).length * 14; }
      pdfNeed(doc, Math.min(recordHeight, 610));
      pdfBlock(doc, `${req.id} · ${req.subsystem}`, 14, true, '0.46 0.33 0.24', 8);
      pdfBlock(doc, req.text || 'Declaração não preenchida', 10.5, false, '0.17 0.18 0.16', 7);
      if (req.status === 'pending') { pdfBlock(doc, 'A analisar. Execute as checagens para obter apontamentos para esta versão.', 10, false, '0.46 0.46 0.41', 10); }
      for (let index = 0; index < req.findings.length; index += 1) {
        const item = req.findings[index];
        const source = SOURCES[item.source];
        const estimated = 40 + pdfWrap(doc, item.message, 9.5, 493).length * 14;
        pdfNeed(doc, Math.min(estimated, 260));
        pdfBlock(doc, `${index + 1}. ${item.title}`, 10.5, true, '0.17 0.18 0.16', 3, 493, 60);
        pdfBlock(doc, item.message, 9.5, false, '0.35 0.36 0.32', 3, 493, 60);
        const location = `${source.org} · ${source.section}${source.format === 'pdf' ? ` · p. ${source.page}` : ''}`;
        pdfLink(doc, location, source.url, 60, 8.2);
      }
      pdfNeed(doc, 49);
      pdfBlock(doc, `Revisão da equipe · ${req.review}${req.reviewer ? ` · ${req.reviewer}` : ''}`, 9, false, '0.46 0.46 0.41', 4);
      if (req.reviewNote) { pdfBlock(doc, req.reviewNote, 9, false, '0.35 0.36 0.32', 6); }
      pdfLine(doc, 42, doc.y, 553.28, doc.y);
      doc.y += 24;
    }
  }
  pdfPage(doc, 'Origem e critérios de aceitação', 'Dados da versão exportada · Revisão da redação não equivale a verificação');
  for (const req of rows) {
    const acceptance = req.acceptance || 'Critério de aceitação não preenchido';
    const origin = `${req.reference || 'Origem não informada'}${req.sourceVersion ? ` · v${req.sourceVersion}` : ''}`;
    const originLines = pdfWrap(doc, origin, 9, 433);
    const methodLines = pdfWrap(doc, `${req.method} · ${req.owner}`, 8.5, 433);
    const acceptanceLines = pdfWrap(doc, acceptance, 10, 433);
    const height = 42 + originLines.length * 12 + methodLines.length * 12 + acceptanceLines.length * 14;
    pdfNeed(doc, height);
    const top = doc.y;
    pdfText(doc, req.id, 42, top, 11, true, '0.46 0.33 0.24');
    for (const line of methodLines) { pdfText(doc, line, 120, doc.y, 8.5, false, '0.46 0.46 0.41'); doc.y += 12; }
    for (const line of originLines) { pdfText(doc, line, 120, doc.y, 9, false, '0.46 0.46 0.41'); doc.y += 12; }
    doc.y += 7;
    for (const line of acceptanceLines) { pdfText(doc, line, 120, doc.y, 10); doc.y += 14; }
    pdfText(doc, `Revisão · ${req.review}`, 120, doc.y + 5, 8.5, false, '0.46 0.46 0.41');
    doc.y = top + height - 10;
    pdfLine(doc, 42, doc.y, 553.28, doc.y);
    doc.y += 18;
  }
  const used = new Map();
  for (const req of rows) {
    for (const item of req.findings) {
      const source = SOURCES[item.source];
      if (!used.has(source.url)) { used.set(source.url, {source: source, sections: new Set()}); }
      used.get(source.url).sections.add(source.section);
    }
  }
  if (used.size) {
    pdfPage(doc, 'Referências utilizadas', 'Publicações de origem dos apontamentos · Consulta em 12 de outubro de 2026');
    let index = 1;
    for (const [url, entry] of used) {
      pdfNeed(doc, 135);
      pdfBlock(doc, `${String(index).padStart(2, '0')}  ${entry.source.org}`, 15, true, '0.46 0.33 0.24', 5);
      pdfBlock(doc, entry.source.title, 11, true, '0.17 0.18 0.16', 3);
      pdfBlock(doc, entry.source.edition, 9.5, false, '0.46 0.46 0.41', 3);
      pdfBlock(doc, [...entry.sections].join(' · '), 9, false, '0.46 0.46 0.41', 3);
      pdfLink(doc, 'Consultar a publicação de origem', url);
      pdfLine(doc, 42, doc.y + 1, 553.28, doc.y + 1);
      doc.y += 23;
      index += 1;
    }
    pdfNeed(doc, 85);
    pdfBlock(doc, 'Escopo deste registro', 10, true, '0.17 0.18 0.16', 4);
    pdfBlock(doc, 'Checagens de texto e de campos preenchidos, com fontes selecionadas. Não há interpretação por IA, cobertura integral das normas ou parecer de um especialista. O projeto Aurora é um cenário conceitual de demonstração.', 9, false, '0.46 0.46 0.41', 0);
  }
  return pdfFinish(doc);
}
function buildSourcePDF(source) {
  const doc = pdfNew();
  pdfPage(doc, 'Trecho de referência', `${source.org} · Transcrição identificada`);
  pdfBlock(doc, source.title, 17, true, '0.17 0.18 0.16', 7);
  pdfBlock(doc, source.edition, 10.5, false, '0.46 0.46 0.41', 4);
  pdfBlock(doc, source.section + (source.format === 'pdf' ? ` · p. ${source.page}` : ''), 10, false, '0.46 0.46 0.41', 15);
  const lines = pdfWrap(doc, source.quote, 13, 467);
  const top = doc.y;
  const height = lines.length * 21 + 34;
  pdfRect(doc, 42, top - 10, 511.28, height, '0.97 0.96 0.93');
  doc.y = top + 12;
  const mark = pdfPlain(source.mark);
  const quote = pdfPlain(source.quote).replace(/\s+/g, ' ');
  const markStart = quote.indexOf(mark);
  const markEnd = markStart + mark.length;
  let cursor = 0;
  for (const line of lines) {
    const lineStart = quote.indexOf(line, cursor);
    const lineEnd = lineStart + line.length;
    const overlapStart = Math.max(markStart, lineStart);
    const overlapEnd = Math.min(markEnd, lineEnd);
    if (markStart >= 0 && overlapEnd > overlapStart) {
      doc.measure.font = '13px Arial';
      const before = line.slice(0, overlapStart - lineStart);
      const selected = line.slice(overlapStart - lineStart, overlapEnd - lineStart);
      const left = doc.measure.measureText(before).width;
      const width = doc.measure.measureText(selected).width;
      pdfRect(doc, 64 + left, doc.y - 12, width, 16, '0.90 0.81 0.62');
    }
    pdfText(doc, line, 64, doc.y, 13);
    doc.y += 21;
    cursor = lineEnd;
  }
  doc.y += 28;
  pdfBlock(doc, 'Contexto da revisão', 11, true, '0.46 0.33 0.24', 6);
  pdfBlock(doc, source.explanation, 10.5, false, '0.17 0.18 0.16', 15);
  pdfLink(doc, 'Consultar a publicação de origem', source.url);
  pdfBlock(doc, 'O trecho foi transcrito da publicação indicada. O destaque é editorial e não integra o documento original. Consulta em 12 de outubro de 2026.', 9, false, '0.46 0.46 0.41', 10);
  pdfBlock(doc, source.scope, 9, false, '0.46 0.46 0.41', 0);
  return pdfFinish(doc, 'Trecho transcrito. Não é o PDF oficial nem uma reprodução integral da publicação.');
}
