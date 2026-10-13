let pdfReader = null;
async function openOriginalReader(sourceId,citationId = '') {
  if (pdfReader?.loading) { await pdfReader.loading.destroy(); pdfReader = null; }
  const sources = await api('/api/sources'); const source = sources.find(item => item.id === sourceId);
  if (!source) { throw new Error('Ficha da referência ainda não cadastrada.'); }
  const allCitations = await api('/api/sources/' + sourceId + '/citations'); const citations = allCitations.filter(item => item.verified && (!citationId || item.id === citationId));
  const detail = `<p>${safe(source.code)} · ${safe(source.edition)}</p><p class="platform-note">${safe(source.license_note)}</p>`;
  if (!source.checked || !source.storage_path || !['licensed','public_authorized'].includes(source.license_status)) { platformDialog('Referência · original pendente',detail + `<p>Original ou autorização pendente. A ficha não indica análise integral implementada.</p><button class="button secondary" data-pdf="copy-url" data-url="${safe(source.official_url)}">Copiar endereço oficial</button>`); return; }
  platformDialog('Trecho no original',detail + '<div class="pdf-controls"><button class="button secondary" data-pdf="previous" aria-label="Página anterior">←</button><span id="pdf-page-label"></span><button class="button secondary" data-pdf="next" aria-label="Próxima página">→</button><button class="button secondary" data-pdf="zoom-out" aria-label="Reduzir zoom">−</button><button class="button secondary" data-pdf="zoom-in" aria-label="Ampliar zoom">+</button><button class="button secondary" data-pdf="rotate">Girar</button><button class="text-button" data-pdf="citation">Voltar ao trecho</button><button class="text-button" data-pdf="full">Ver documento completo</button><label>Pesquisar<input id="pdf-search" maxlength="100"></label><button class="text-button" data-pdf="search">Buscar</button></div><div id="pdf-reader" class="source-reader"><div id="pdf-sheet" class="source-sheet"><canvas id="pdf-canvas"></canvas></div></div><p id="pdf-reference" class="platform-note"></p>');
  const pdfjs = await import('/assets/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.mjs';
  const loading = pdfjs.getDocument({url:'/api/sources/' + sourceId + '/file',withCredentials:true,isEvalSupported:false,enableXfa:false,useSystemFonts:false,disableFontFace:false,stopAtErrors:true,maxImageSize:16000000,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,disableAutoFetch:true,disableStream:true});
  const pdf = await loading.promise; if (pdf.numPages > 2000) { await loading.destroy(); throw new Error('O documento excede o limite de páginas do leitor.'); }
  pdfReader = {pdf,loading,page:(citations[0]?.page_index || 0) + 1,scale:1.15,rotation:0,citations,source,full:false,renderTask:null}; await renderOriginalPage();
  el('platform-dialog').addEventListener('close',() => { loading.destroy(); pdfReader = null; },{once:true});
}
function normalizedRectangle(rect,viewport,view) {
  if (!Array.isArray(rect) || rect.length !== 4 || rect.some(x => !Number.isFinite(x) || x < 0 || x > 1) || rect[2] <= rect[0] || rect[3] <= rect[1]) { throw new Error('Coordenadas não verificadas.'); }
  const width = view[2] - view[0]; const height = view[3] - view[1];
  const p1 = viewport.convertToViewportPoint(view[0] + rect[0] * width,view[3] - rect[1] * height);
  const p2 = viewport.convertToViewportPoint(view[0] + rect[2] * width,view[3] - rect[3] * height);
  return {left:Math.min(p1[0],p2[0]),top:Math.min(p1[1],p2[1]),width:Math.abs(p2[0] - p1[0]),height:Math.abs(p2[1] - p1[1])};
}
async function renderOriginalPage() {
  const state = pdfReader; if (!state) { return; } if (state.renderTask) { state.renderTask.cancel(); }
  const page = await state.pdf.getPage(state.page); const viewport = page.getViewport({scale:state.scale,rotation:state.rotation});
  if (![viewport.width,viewport.height].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0 || viewport.width * viewport.height > 16000000 || Math.max(viewport.width,viewport.height) > 16000) { throw new Error('A página excede o limite de renderização do leitor.'); }
  const canvas = el('pdf-canvas'); const sheet = el('pdf-sheet'); if (!canvas) { return; }
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); sheet.style.width = canvas.width + 'px';
  state.renderTask = page.render({canvasContext:canvas.getContext('2d'),viewport}); try { await state.renderTask.promise; } catch (error) { if (error.name === 'RenderingCancelledException') { return; } throw error; } sheet.querySelectorAll('.source-highlight').forEach(node => node.remove());
  const citation = state.citations.find(item => item.page_index === state.page - 1 && item.verified);
  if (citation) { for (const rect of citation.rects) { const box = normalizedRectangle(rect,viewport,page.view); const mark = document.createElement('span'); mark.className = 'source-highlight'; Object.assign(mark.style,Object.fromEntries(Object.entries(box).map(([key,value]) => [key,value + 'px']))); sheet.append(mark); } }
  el('pdf-page-label').textContent = `${state.page} / ${state.pdf.numPages}`;
  el('pdf-reference').textContent = citation ? `${state.source.code} · ${state.source.edition} · ${citation.clause} · página impressa ${citation.printed_page}; índice no arquivo ${citation.page_index}.` : 'Sem trecho conferido nesta página. Nenhum destaque aproximado foi desenhado.';
  el('platform-dialog').classList.toggle('pdf-expanded',state.full);
  const first = sheet.querySelector('.source-highlight');
  if (first && !state.full) { const reader = el('pdf-reader'); reader.style.maxHeight = '280px'; reader.scrollTop = Math.max(0,parseFloat(first.style.top) - 36); reader.scrollLeft = Math.max(0,parseFloat(first.style.left) - 24); } else { el('pdf-reader').style.maxHeight = '60vh'; }
}
window.addEventListener('click',event => {
  const button = event.target.closest('[data-pdf]'); if (!button) { return; } event.preventDefault(); event.stopImmediatePropagation();
  (async () => { const action = button.dataset.pdf; if (action === 'copy-url') { await navigator.clipboard.writeText(button.dataset.url); button.textContent = 'Endereço copiado'; return; } if (!pdfReader) { return; }
    if (action === 'previous') { pdfReader.page = Math.max(1,pdfReader.page - 1); }
    if (action === 'next') { pdfReader.page = Math.min(pdfReader.pdf.numPages,pdfReader.page + 1); }
    if (action === 'zoom-in') { pdfReader.scale = Math.min(2.5,pdfReader.scale + 0.25); }
    if (action === 'zoom-out') { pdfReader.scale = Math.max(0.5,pdfReader.scale - 0.25); }
    if (action === 'rotate') { pdfReader.rotation = (pdfReader.rotation + 90) % 360; }
    if (action === 'citation') { pdfReader.page = (pdfReader.citations[0]?.page_index || 0) + 1; pdfReader.full = false; }
    if (action === 'full') { pdfReader.full = true; }
    if (action === 'search') { const query = el('pdf-search').value.trim().toLocaleLowerCase(); if (!query) { return; } for (let index = 0; index < Math.min(pdfReader.pdf.numPages,300); index += 1) { const pageNumber = (pdfReader.page + index) % pdfReader.pdf.numPages + 1; const page = await pdfReader.pdf.getPage(pageNumber); const text = await page.getTextContent(); if (text.items.map(item => item.str || '').join(' ').toLocaleLowerCase().includes(query)) { pdfReader.page = pageNumber; pdfReader.full = true; break; } page.cleanup(); } }
    await renderOriginalPage();
  })().catch(platformError);
},true);
