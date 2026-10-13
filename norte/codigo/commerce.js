let commercialQuote = null;
let commercialToken = '';
let commercialTimer;
let commercialKey = '';
let commercialRevision = 0;
OFFER.services.none = {name:'Sem serviço avulso',price:0,delivery:'Somente software selecionado'};
const originalNormalizePlan = normalizePlan;
normalizePlan = function(input = {}) { return {...originalNormalizePlan(input),subscription:input.subscription === true}; };
function commercialSelection() { const p = normalizePlan(quotePlan); return {subscription:p.subscription,service:p.service,volume:p.volume,reviewer:p.reviewer,area:p.area,hosting:p.hosting,addons:p.addons,standards:p.standards}; }
function cents(value) { return (value / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
const commercialFields = renderPlanFields;
renderPlanFields = function() {
  commercialFields();
  if (quotePlan.mode !== 'test') { el('plan-fields').querySelector('.n-first-order')?.remove(); const label = el('plan-fields').querySelector('.n-discount-label'); if (label) { label.textContent = 'Campanha na parcela elegível'; } el('plan-fields').insertAdjacentHTML('afterbegin',`<label class="n-check"><input type="checkbox" data-choice="subscription" ${quotePlan.subscription ? 'checked' : ''}><span>Software Profissional<small>Assinatura separada dos serviços e da revisão humana. Disponibilidade após validação operacional.</small></span></label>`); }
};
renderPrice = function() {
  const revision = ++commercialRevision;
  clearTimeout(commercialTimer); commercialQuote = null; commercialToken = ''; el('continue-order').disabled = true;
  if (quotePlan.mode === 'test') { el('price-summary').innerHTML = '<h3>Aurora · exploração gratuita</h3><p class="platform-note">Sem conta para navegar. Crie uma conta para salvar seu projeto no Essencial. O teste avançado de 14 dias é ativado separadamente.</p>'; el('continue-order').textContent = 'Abrir Aurora'; el('continue-order').disabled = false; return; }
  el('price-summary').innerHTML = '<p>Conferindo a configuração…</p>'; el('continue-order').textContent = 'Continuar com esta configuração'; el('continue-caption').textContent = 'A próxima etapa confirma contato e valores. Nenhum pagamento é processado.';
  commercialTimer = setTimeout(async () => {
    try {
      await platform.ready; if (revision !== commercialRevision) { return; }
      if (!platform.configured) { throw new Error('A oferta aguarda configuração e validação operacional.'); }
      const selection = commercialSelection(); const selected = JSON.stringify(selection); const result = await api('/api/quote','POST',selection); if (revision !== commercialRevision || selected !== JSON.stringify(commercialSelection())) { return; }
      if (result.available) { commercialQuote = result.quote; commercialToken = result.quoteToken; } const q = result.quote;
      const lines = [priceLine('Serviços e adicionais',cents(q.eligibleCents)),q.humanCents ? priceLine('Revisão humana',cents(q.humanCents),'Escopo e disponibilidade a confirmar') : '',q.discountCents ? priceLine('Desconto aplicado','− ' + cents(q.discountCents),'Somente nos serviços elegíveis') : '',q.setupCents ? priceLine('Implantação',cents(q.setupCents),q.infrastructurePending ? 'Sujeita a avaliação' : '') : ''].join('');
      const monthly = [q.renewalCents ? priceLine('Software · primeira mensalidade',cents(q.firstMonthlyCents),`${q.discountPercent}% de desconto na primeira mensalidade`) + priceLine('A partir do segundo mês',cents(q.renewalCents)) : '',q.infrastructureMonthlyCents ? priceLine('Hospedagem mensal',cents(q.infrastructureMonthlyCents),'Separada da assinatura') : ''].join('');
      const availability = result.available ? 'Válida até ' + new Date(q.validUntil).toLocaleDateString('pt-BR') + '. Sem cobrança automática.' : 'Prévia de valores. A contratação está em preparação.';
      el('price-summary').innerHTML = `<h3>Sua configuração</h3><div class="n-price-lines">${lines}</div><div class="quote-total"><span>Total avulso</span><strong>${cents(q.oneTimeCents)}</strong></div>${monthly ? `<div class="n-price-lines">${monthly}</div>` : ''}<div class="quote-availability">${icon('info')}<p>${availability}</p></div>${q.feedbackApplied ? '<p class="platform-note">Benefício da avaliação de uso aplicado.</p>' : ''}`;
      el('continue-order').disabled = !result.available; el('continue-order').textContent = result.available ? 'Continuar com esta configuração' : 'Contratação em preparação';
    } catch (error) { if (revision === commercialRevision) { el('price-summary').textContent = error.message; el('continue-order').disabled = true; } }
  },250);
};
postEvent = async function(event) { const mapping = {continue:'continue',selection_changed:'selection_changed',defer:'defer',abandon:'abandon'}; if (!platform.configured || !mapping[event.type]) { return false; } try { await api('/api/events','POST',{type:mapping[event.type]}); return true; } catch { return false; } };
const originalGoConfigure = goConfigure;
goConfigure = function() { originalGoConfigure(); if (platform.configured) { api('/api/events','POST',{type:'configuration_opened'}).catch(() => {}); } renderPrice(); };
const localHelp = {navigation:'Use Requisitos, Verificação, Documentos e Cronograma. Entre em Meus projetos para salvar seus dados.',plans:'Essencial oferece um projeto, 50 requisitos e 20 verificações. O teste avançado dura 14 dias após ativação explícita. Consulte a configuração para os valores vigentes.',documents:'Os documentos são rascunhos gerados dos dados salvos. Resultados, assinaturas e aprovações precisam ser registrados pela equipe.',contracting:'A contratação depende da confirmação da equipe. Nenhum pagamento é processado e revisão humana é contratada separadamente.',privacy:'Não envie dados pessoais ou técnicos no chat. A ajuda usa somente informações públicas aprovadas.'};
chatAnswer = function(question) { return localHelp[helpTopic(question)]; };
function helpTopic(question) { const q = norm(question); if (/dado|privad|restrit|itar|ear|seguran/.test(q)) { return 'privacy'; } if (/preco|plano|valor|gratis|teste|desconto/.test(q)) { return 'plans'; } if (/document|pdf|word|matriz/.test(q)) { return 'documents'; } if (/contrat|revisor|profission|pagamento|prazo/.test(q)) { return 'contracting'; } return 'navigation'; }
addChat = async function(question) { if (!question.trim()) { return; } const topic = helpTopic(question); const body = el('chat-body'); body.querySelector('.chat-welcome')?.remove(); const user = document.createElement('p'); user.className = 'n-chat-message user'; user.textContent = question.slice(0,500); body.append(user); const answer = document.createElement('p'); answer.className = 'n-chat-message'; answer.textContent = localHelp[topic]; body.append(answer); body.scrollTop = body.scrollHeight; if (platform.configured) { try { const response = await api('/api/help','POST',{topic}); answer.textContent = response.text; body.scrollTop = body.scrollHeight; } catch { /* A FAQ permanece disponível. */ } } };
window.addEventListener('submit',event => {
  if (event.target.id !== 'contact-form') { return; } event.preventDefault(); event.stopImmediatePropagation(); if (!event.target.reportValidity()) { return; }
  (async () => {
    if (!commercialQuote) { throw new Error('Aguarde a validação da cotação.'); } const selection = commercialSelection(); commercialKey ||= crypto.randomUUID();
    const body = {key:commercialKey,name:el('contact-name').value.trim(),email:el('contact-email').value.trim(),consent:el('contact-consent').checked,selection,version:commercialQuote.version,quoteToken:commercialToken};
    const result = await api('/api/requests','POST',body); requestSent = true; el('contact-panel').hidden = true; el('order-success').hidden = false; el('order-success').innerHTML = `<h3>Pedido registrado</h3><p>${safe(result.id)}</p><p>A equipe fará contato para concluir. Nenhum pagamento ou ativação de plano ocorreu.</p>`;
  })().catch(error => { el('submission-message').textContent = error.message; });
},true);
window.addEventListener('change',event => { if (event.target.matches('[data-choice], [data-addon]')) { commercialKey = ''; } },true);
window.addEventListener('click',event => { if (event.target.closest('[data-norte="quote-pdf"]')) { event.preventDefault(); event.stopImmediatePropagation(); if (commercialQuote) { downloadCanonicalQuote().catch(platformError); } } },true);
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded',() => renderPlanFields()); } else { renderPlanFields(); }

async function downloadCanonicalQuote() { const response = await fetch('/api/quote/pdf',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':platform.csrf},body:JSON.stringify(commercialSelection()),credentials:'same-origin'}); if (!response.ok) { throw new Error('Não foi possível gerar o resumo desta configuração.'); } downloadBlob(await response.blob(),'norte-configuracao.pdf'); }
