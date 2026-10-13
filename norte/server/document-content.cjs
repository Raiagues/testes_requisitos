const PLAN_FIELDS = Object.freeze({
  NEC:['Partes interessadas e necessidades','Objetivos e medidas de sucesso','Restrições e premissas','Validação com as partes interessadas'],
  CON:['Finalidade e conceito de operação','Cenários e fronteiras do sistema','Alternativas e justificativas','Premissas e riscos a avaliar'],
  MOE:['Medidas de eficácia','Método e condições de avaliação','Metas acordadas com o cliente','Responsável e decisão'],
  SEMP:['Organização e responsabilidades','Gestão dos requisitos e interfaces','Configuração, mudanças e riscos','Estratégia de verificação e validação','Adaptações, revisões e critérios de avanço'],
  HSI:['Pessoas e tarefas do sistema','Interfaces humanas aplicáveis','Treinamento e restrições','Critérios de usabilidade e avaliação'],
  ARQ:['Arquitetura funcional e física','Alocação dos requisitos','Interfaces e suas versões','Alternativas e justificativa de seleção'],
  PRE:['Definição preliminar da solução','Interfaces e alocações','Orçamentos técnicos e margens','Lacunas para o detalhamento'],
  DET:['Definição detalhada e configuração','Dimensionamento e desenhos','Interfaces e especificações','Pendências para implementação'],
  INT:['Itens e sequência de integração','Pré-condições e configuração','Procedimentos e recursos','Segurança e critérios de aceitação','Evidências e tratamento de desvios'],
  TPM:['Medidas técnicas do produto','Metas, limites e margens','Frequência e responsabilidade','Tendências e ações'],
  DES:['Escopo do descomissionamento','Autorização e pré-condições','Responsáveis e recursos','Segurança e ambiente','Registros de conclusão'],
  DSP:['Escopo do descarte','Autorização e pré-condições','Responsáveis e recursos','Segurança e ambiente','Registros de conclusão']
});
function fields(row,names) { return names.map(([name,label]) => label + ': ' + (row[name] || 'Pendente')).join('\n'); }
function enrich(project,id,sections) {
  const {requirements,verifications,engineering} = project.payload;
  if (id === 'REQ') { for (const req of requirements) { sections.push({title:req.id + ' · atributos da versão ' + req.version,body:fields(req,[['type','Tipo'],['origin','Origem'],['sourceVersion','Edição da origem'],['parent','Requisito superior'],['rationale','Justificativa'],['owner','Responsável'],['method','Método'],['condition','Condição'],['limit','Limite'],['acceptance','Critério'],['review','Decisão da equipe']])}); } }
  if (['RTM','VCD'].includes(id)) { sections.push({title:'Rastreabilidade inversa e evidências',headers:['Verificação','Requisitos','Situação e resultado','Evidências'],rows:verifications.map(v => [v.id,v.requirementIds.join(', ') || 'Nenhuma associação',`${v.status || 'Planejada'} · ${v.result || 'Não executado'}`,`Versões verificadas: ${JSON.stringify(v.requirementVersions || {})}\nReavaliar vínculos: ${v.stale ? 'sim' : 'não sinalizado'}\nEvidência: ${v.evidence || 'Pendente'}`])}); }
  if (['VVP','RES'].includes(id)) { for (const v of verifications) { sections.push({title:v.id + ' · configuração e rastreabilidade',body:fields(v,[['method','Método'],['owner','Responsável'],['review','Revisão'],['criteria','Critério'],['procedure','Procedimento'],['conditions','Condições'],['note','Observações']])}); } }
  if (id === 'ANA') { sections.push({title:'Checagens determinísticas registradas',headers:['Requisito','Apontamento','Descrição','Fonte'],body:'As observações abaixo pertencem ao registro salvo. Ausência de apontamentos não comprova atendimento técnico.',rows:requirements.flatMap(req => (req.findings || []).map(f => [req.id,f.title,f.message,f.source]))}); }
  if (id === 'REG') { sections.push({title:'Decisões registradas pela equipe',headers:['Requisito','Decisão','Responsável','Justificativa'],rows:requirements.map(req => [req.id,req.review || 'Pendente',req.reviewer || 'Responsável pendente',req.reviewNote || 'Justificativa pendente'])},{title:'Histórico do planejamento',headers:['Data','Alteração'],rows:(engineering.changes || []).map(item => [item.at,item.action])}); }
  if (PLAN_FIELDS[id]) { sections.push({title:'Estrutura orientativa — preencher e conferir com a referência',rows:PLAN_FIELDS[id].map(field => [field,'Dados não registrados; definir conteúdo, responsável e critério de conclusão.'])}); }
  if (['ARQ','PRE','DET'].includes(id)) { sections.push({title:'Alocação registrada',headers:['Requisito','Subsistema','Arquitetura'],rows:requirements.map(req => [req.id,req.subsystem || 'Subsistema pendente',req.architecture || 'Arquitetura pendente'])}); }
  if (id === 'TPM') { sections.push({title:'Contagens do registro — não são desempenho do produto',body:`Requisitos: ${requirements.length}\nVerificações: ${verifications.length}\nCritérios ausentes: ${requirements.filter(r => !r.acceptance).length}`}); }
  if (/^(PROC|ATA)-/.test(id)) { const key = id.replace(/^(PROC|ATA)-/,''); const review = (engineering.schedules?.[project.profile] || []).find(r => r.id === key); sections.push({title:'Dados planejados da revisão',body:review ? `${project.profile} ${review.id} · ${review.title}\nData prevista: ${review.date}\nFoco: ${review.focus || 'A definir'}\nPreparação: ${review.prepDays} dias · fechamento: ${review.closeDays} dias` : 'Revisão ainda não configurada.'},{title:'Registros a completar pela equipe',rows:(id.startsWith('PROC-') ? ['Autoridade e participantes','Critérios de entrada e sucesso','Agenda e pacote documental','Tratamento de pontos em aberto'] : ['Data efetiva e participantes','Edições efetivamente revisadas','Pareceres e decisão da autoridade','Ações, responsáveis e prazos','Aprovação e fechamento']).map(field => [field,'Pendente; não presumido pela plataforma.'])}); }
}
function scheduleDiagram(pdf,project) {
  const list = (project.payload.engineering.schedules?.[project.profile] || []).filter(r => r.active);
  const labels = project.profile === 'NASA' ? ['Pré-A','A','B','C','D','E','F'] : ['0','A','B','C','D','E','F'];
  for (let offset = 0; offset < Math.max(1,list.length); offset += 20) {
    const rows = list.slice(offset,offset + 20); const height = 32 + Math.max(rows.length,1) * 18;
    if (pdf.y + height > 680) { pdf.addPage(); }
    pdf.font('Norte-Bold').fontSize(10).text('Diagrama por fases — sem escala temporal',48,pdf.y);
    const y = pdf.y + 8; const x0 = 112; const width = 426;
    for (let i = 0; i < 7; i += 1) { const x = x0 + width * i / 7; pdf.strokeColor('#b5aba1').rect(x,y,width / 7,height).stroke(); pdf.fillColor('#3b3935').font('Norte-Bold').fontSize(10).text(labels[i],x + 6,y + 6,{width:width / 7 - 10}); }
    rows.forEach((review,index) => { const phase = Math.min(6,Math.max(0,review.phase || 0)); const x = x0 + (phase + Math.min(0.9,Math.max(0.1,review.position || 0.5))) * width / 7; const py = y + 35 + index * 18; pdf.font('Norte').fontSize(9).fillColor('#3b3935').text(review.id,48,py - 5,{width:60,lineBreak:false}); pdf.strokeColor('#dfd8d1').moveTo(x0,py).lineTo(x0 + width,py).stroke(); pdf.fillColor('#684d3b').circle(x,py,3).fill(); });
    pdf.fillColor('#3b3935'); pdf.x = 48; pdf.y = y + height + 18;
  }
}

module.exports = {enrich,scheduleDiagram};
