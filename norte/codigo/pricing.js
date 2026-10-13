// Preços da oferta. Altere aqui e compile novamente.
const OFFER = {
  version: 'norte-2026-10-12',
  discount: 0.15,
  services: {analysis: {name: 'Análise de requisitos', price: 480, delivery: 'Apontamentos, fontes e relatório PDF'}, impact: {name: 'Análise de impacto de mudanças', price: 690, delivery: 'Comparação de versões e mapa de itens afetados'}, documents: {name: 'Preparação de documentação', price: 890, delivery: 'Rascunho estruturado de até 3 documentos'}},
  volumes: {small: {name: '1 a 3 documentos', multiplier: 1, hours: 2, scope: 'Até 30 páginas e 60 requisitos no total'}, medium: {name: '4 a 10 documentos', multiplier: 2.5, hours: 5, scope: 'Até 100 páginas e 200 requisitos no total'}, large: {name: '11 a 25 documentos', multiplier: 5, hours: 10, scope: 'Até 250 páginas e 500 requisitos no total'}},
  reviewers: {self: {name: 'Minha equipe faz a revisão', rate: 0}, junior: {name: 'Engenheiro júnior (1 a 3 anos)', rate: 140}, mid: {name: 'Engenheiro pleno (4 a 7 anos)', rate: 240}, senior: {name: 'Engenheiro sênior (8 anos ou mais)', rate: 380}},
  areas: ['Engenharia de sistemas', 'Telecomunicações', 'Software embarcado', 'Verificação e ensaios', 'Segurança de sistemas', 'Ainda preciso de orientação'],
  hosting: {cloud: {name: 'Ambiente compartilhado', setup: 0, monthly: 0}, private: {name: 'Ambiente dedicado', setup: 900, monthly: 250}, internal: {name: 'Infraestrutura da minha empresa', setup: 0, monthly: 0, quote: true}},
  addons: {trace: {name: 'Matriz de rastreabilidade', price: 180, description: 'Vínculos entre requisitos, fontes e evidências'}, handover: {name: 'Devolutiva com o revisor', price: 240, description: 'Uma reunião de até 1 hora'}, editable: {name: 'Pacote editável', price: 220, description: 'Arquivos de trabalho além do relatório PDF'}}
};
function normalizePlan(input = {}) {
  const mode = input.mode === 'test' ? 'test' : 'project';
  const service = Object.hasOwn(OFFER.services, input.service) ? input.service : 'analysis';
  const volume = Object.hasOwn(OFFER.volumes, input.volume) ? input.volume : 'small';
  const reviewer = Object.hasOwn(OFFER.reviewers, input.reviewer) ? input.reviewer : 'self';
  const hosting = Object.hasOwn(OFFER.hosting, input.hosting) ? input.hosting : 'cloud';
  const area = OFFER.areas.includes(input.area) ? input.area : OFFER.areas[0];
  const addons = [...new Set(Array.isArray(input.addons) ? input.addons : [])].filter(key => Object.hasOwn(OFFER.addons, key));
  const standards = [...new Set(Array.isArray(input.standards) ? input.standards : [])].filter(value => typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value)).slice(0, 40);
  return {mode, service, volume, reviewer, hosting, area, addons: addons.filter(key => !(key === 'handover' && reviewer === 'self') && !(key === 'editable' && service === 'documents')), standards, firstOrder: input.firstOrder !== false};
}
function calculatePrice(selection) {
  const plan = normalizePlan(selection);
  if (plan.mode === 'test') { return {service: 0, review: 0, addons: 0, setup: 0, monthly: 0, discount: 0, subtotal: 0, total: 0, hours: 0, rate: 0, quote: false}; }
  const service = Math.round(OFFER.services[plan.service].price * OFFER.volumes[plan.volume].multiplier);
  const hours = OFFER.volumes[plan.volume].hours;
  const rate = OFFER.reviewers[plan.reviewer].rate;
  const review = hours * rate;
  const addons = plan.addons.reduce((sum, key) => sum + OFFER.addons[key].price, 0);
  const setup = OFFER.hosting[plan.hosting].setup;
  const monthly = OFFER.hosting[plan.hosting].monthly;
  const discount = plan.firstOrder ? Math.round((review + addons) * OFFER.discount) : 0;
  const subtotal = service + review + addons + setup;
  return {service, review, addons, setup, monthly, discount, subtotal, total: subtotal - discount, hours, rate, quote: plan.hosting === 'internal'};
}
if (typeof module !== 'undefined') { module.exports = {OFFER, calculatePrice, normalizePlan}; }
