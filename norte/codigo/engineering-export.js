// As prévias e os arquivos usam os mesmos blocos de conteúdo.
function docHeading(text) { return {type: 'heading', text: text}; }
function docParagraph(text) { return {type: 'paragraph', text: String(text)}; }
function docTable(headers, rows, widths = []) { return {type: 'table', headers: headers, rows: rows.map(row => row.map(value => String(value ?? ''))), widths: widths}; }
function verificationMethodLabel(item) { return engineering.profile === 'ECSS' && item.method === 'Demonstração' ? 'Teste (demonstração)' : item.method; }
function documentBlocks(doc) {
  const blocks = [];
  const add = text => blocks.push(docParagraph(text));
  const section = text => blocks.push(docHeading(text));
  const table = (headers, rows, widths = []) => blocks.push(docTable(headers, rows, widths));
  section('1. Identificação e escopo');
  add(`Missão Aurora · ${doc.code} · versão 0.${engineering.version} · ${doc.state}. Projeto conceitual de demonstração, sem aprovação para implementação ou operação.`);
  add(docScope(doc.content));
  table(['Referência adotada', 'Entrega prevista', 'Categoria'], [[engineering.profile, doc.reviews.map(labelReview).join(', ') || 'Todo o projeto', docKindLabel(doc.kind)]], [0.2, 0.4, 0.4]);
  add('Maturidade esperada · ' + (doc.maturity || 'Conforme o plano da equipe.'));
  if (doc.content === 'requirements') {
    section('2. Registro dos requisitos');
    add('As declarações abaixo são a versão de trabalho. Pendências de redação, origem ou critério ficam explícitas até decisão da equipe. Não foram corrigidas automaticamente.');
    for (const req of requirements) {
      section(`${req.id} · ${req.subsystem} · v${req.version}`);
      add(req.text);
      table(['Atributo', 'Registro'], [['Tipo / nível', req.type + ' / ' + req.level], ['Origem / edição', (req.reference || 'A definir') + (req.sourceVersion ? ' · ' + req.sourceVersion : '')], ['Requisito superior', req.parent || 'Não associado'], ['Justificativa', req.rationale || 'A definir'], ['Verificação', req.method + ' · ' + (linksForRequirement(req.id).map(item => item.id).join(', ') || 'Sem atividade associada')], ['Critério de aceitação', req.acceptance || 'A definir'], ['Responsável', req.owner], ['Revisão da redação', req.review + (req.reviewer ? ' · ' + req.reviewer : '')]], [0.28, 0.72]);
    }
  } else if (doc.content === 'verification-plan') {
    section('2. Estratégia de verificação');
    add('Cada atividade identifica os requisitos atendidos, o método, o critério e a referência de evidência. A aprovação depende da execução na configuração acordada, não do simples vínculo na matriz.');
    add(engineering.profile === 'NASA' ? 'A verificação compara o produto com seus requisitos. A validação compara o uso pretendido com as necessidades das partes interessadas. O plano de validação ainda precisa ser definido pela equipe Aurora.' : 'O plano segue o recorte de verificação do produto. Na ECSS-E-ST-10-02C, demonstrações integram o método Teste. A classificação final de cada atividade deve ser acordada com o cliente.');
    for (const item of verifications) {
      section(`${item.id} · ${item.title}`);
      table(['Campo', 'Plano'], [['Método / nível', verificationMethodLabel(item) + ' / ' + item.level], ['Requisitos', item.requirementIds.join(', ') || 'Sem associação'], ['Responsável / revisão', item.owner + ' / ' + labelReview(item.review)], ['Critério', item.criteria || 'A definir antes da execução'], ['Procedimento', item.procedure || 'A elaborar e aprovar'], ['Condições e configuração', item.conditions || 'A definir'], ['Situação / resultado', item.status + ' / ' + item.result], ['Evidência', item.evidence || 'Ainda não registrada'], ['Observações', item.note || 'Sem observações']], [0.28, 0.72]);
    }
    section('3. Lacunas do planejamento');
    const missing = requirements.filter(req => !linksForRequirement(req.id).length);
    add(missing.length ? 'Requisitos sem atividade associada · ' + missing.map(req => req.id).join(', ') + '. A equipe precisa definir o método, o procedimento e os critérios antes do fechamento.' : 'Todos os requisitos têm vínculo com uma atividade. Confirmar se cada vínculo cobre o critério completo.');
    add('Instalações, instrumentação, calibração, segurança do ensaio e responsáveis nominais ainda precisam ser definidos. Nenhum teste foi executado pela plataforma.');
  } else if (doc.content === 'verification-matrix') {
    section('2. Controle de verificação');
    for (const req of requirements) {
      section(req.id + ' · ' + req.subsystem);
      add(req.text);
      const items = linksForRequirement(req.id);
      table(['Atividade', 'Método / revisão', 'Situação / resultado', 'Evidência'], items.length ? items.map(item => [item.id, verificationMethodLabel(item) + ' / ' + labelReview(item.review), item.status + ' / ' + item.result, item.evidence || 'Não registrada']) : [['A planejar', req.method, 'Sem atividade associada', 'Não registrada']], [0.16, 0.23, 0.31, 0.3]);
      add('Critério do requisito · ' + (req.acceptance || 'A definir'));
    }
    section('3. Controle de encerramento');
    add('Aceitação final, desvios, justificativas, versão verificada e aprovação do cliente precisam ser registrados quando aplicáveis. Um estado sem alertas na análise textual não significa conformidade verificada.');
  } else if (doc.content === 'traceability') {
    section('2. Origem e alocação');
    table(['Requisito', 'Origem / superior', 'Subsistema', 'Verificações'], requirements.map(req => [req.id + ' · v' + req.version, (req.reference || 'Referência a definir') + '\nSuperior · ' + (req.parent || 'Não associado'), req.subsystem, linksForRequirement(req.id).map(item => item.id).join(', ') || 'A planejar']), [0.17, 0.4, 0.2, 0.23]);
    section('3. Rastreabilidade inversa');
    table(['Verificação', 'Requisitos associados', 'Revisão'], verifications.map(item => [item.id + ' · ' + item.method, item.requirementIds.join(', ') || 'Sem associação', labelReview(item.review)]), [0.3, 0.48, 0.22]);
  } else if (doc.content === 'schedule') {
    section('2. Marcos e períodos de trabalho');
    add(`Início de referência · ${engDate(engineering.start)}. As datas são parâmetros do planejamento Aurora. O marco só pode ser concluído quando os critérios técnicos e as decisões forem atendidos.`);
    table(['Revisão', 'Preparação', 'Reunião prevista', 'Fechar ações'], activeReviews().map(review => [labelReview(review.id), engDate(addDays(review.date, -review.prepDays)), engDate(review.date), engDate(addDays(review.date, review.closeDays))]), [0.19, 0.27, 0.27, 0.27]);
    section('3. Pacote de cada revisão');
    for (const review of activeReviews()) {
      section(labelReview(review.id) + ' · ' + review.title);
      add(review.focus);
      table(['Documento', 'Papel', 'Obrigatoriedade'], reviewDocs(review.id).map(item => [item.code + '\n' + item.title, item.flow === 'output' ? 'Após a revisão' : 'Documento de entrada', docKindLabel(item.kind)]), [0.54, 0.19, 0.27]);
    }
    const inactive = scheduleList().filter(review => !review.active);
    section('4. Adaptações e aprovações');
    add(inactive.length ? 'Fora do plano selecionado · ' + inactive.map(review => labelReview(review.id)).join(', ') + '. Confirmar aplicabilidade e eventual dispensa com a autoridade competente.' : 'Nenhuma revisão deste recorte foi desmarcada. Confirmar a completude frente ao ciclo de vida contratual.');
    add('A distribuição ECSS por revisão é uma proposta do projeto a ser acordada com o cliente. Este calendário não substitui o cronograma integrado de todas as disciplinas.');
  } else if (doc.content === 'review-plan' || doc.content === 'review-record') {
    const review = scheduleList().find(item => item.id === doc.reviews[0]);
    section('2. Objetivo da revisão');
    add(review?.focus || 'Definir os objetivos com a equipe.');
    table(['Preparação', 'Revisão', 'Fechamento previsto'], [[engDate(addDays(review.date, -review.prepDays)), engDate(review.date), engDate(addDays(review.date, review.closeDays))]], [0.34, 0.33, 0.33]);
    if (doc.content === 'review-plan') {
      section('3. Critérios de entrada propostos');
      add('Confirmar escopo, identificação e edição dos documentos, pendências conhecidas, participantes e autoridade da revisão. Verificar a maturidade de cada produto antes de autorizar o início.');
      table(['Documento de entrada', 'Maturidade esperada'], reviewDocs(review.id, 'input').filter(item => item.id !== doc.id).map(item => [item.code + ' · ' + item.title, item.maturity]), [0.49, 0.51]);
      section('4. Condução e conclusão');
      add('A equipe apresenta o pacote e as pendências. Os revisores registram observações, discrepâncias e ações. A autoridade responsável define a decisão e as condições para prosseguir.');
      table(['Registro a completar', 'Situação'], [['Autoridade da revisão', 'A designar'], ['Participantes e responsabilidades', 'A confirmar'], ['Local, horário e agenda', 'A confirmar'], ['Critérios de sucesso específicos', 'A acordar antes da revisão'], ['Procedimento de aprovação', 'A confirmar com o cliente']], [0.48, 0.52]);
    } else {
      section('3. Ata e decisão');
      table(['Campo', 'Registro'], [['Data de realização', 'Ainda não realizada'], ['Participantes', 'A preencher'], ['Documentos e edições efetivamente revisados', 'A preencher após a reunião'], ['Parecer da equipe revisora', 'Não emitido'], ['Decisão da autoridade', 'Pendente'], ['Restrições e condições de avanço', 'A registrar'], ['Aprovação do registro', 'Não aprovada']], [0.45, 0.55]);
      section('4. Pontos para levar à revisão');
      const pending = requirements.flatMap(req => req.findings.map(finding => [req.id, finding.title, 'Decisão, responsável e prazo a definir']));
      table(['Origem', 'Ponto em aberto', 'Tratamento'], pending.length ? pending : [['Equipe', 'Nenhum apontamento ativo nas checagens', 'Confirmar avaliação técnica']], [0.16, 0.48, 0.36]);
      add('Esta lista é insumo de trabalho. Não constitui ata concluída, parecer de revisão nem aprovação de discrepâncias.');
    }
  } else if (doc.content === 'verification-results') {
    section('2. Registro de execução');
    for (const item of verifications) {
      section(item.id + ' · ' + item.title);
      table(['Campo', 'Resultado registrado'], [['Requisitos', item.requirementIds.join(', ')], ['Método / critério', item.method + ' / ' + (item.criteria || 'A definir')], ['Situação / resultado', item.status + ' / ' + item.result], ['Condições e configuração', item.conditions || 'Não registradas'], ['Evidência', item.evidence || 'Não registrada'], ['Observações', item.note || 'Nenhuma observação registrada']], [0.3, 0.7]);
    }
    add('Responsável pela execução, datas, instrumentação, desvios, dados brutos e aprovação precisam acompanhar os registros quando as atividades forem executadas.');
  } else if (doc.content === 'analysis') {
    section('2. Critérios ativos');
    add([settings.quality ? 'Clareza' : '', settings.trace ? 'Origem e rastreabilidade' : '', settings.verification ? 'Método e critério' : '', settings.anatel ? 'Triagem Anatel' : '', settings.itar ? 'Triagem ITAR' : ''].filter(Boolean).join(' · ') + '. Perfil de redação ' + settings.standard + '.');
    for (const req of requirements) {
      section(req.id + ' · ' + statusText(req));
      add(req.text);
      if (req.findings.length) { table(['Apontamento', 'Ação e referência'], req.findings.map(item => [item.title, item.message + '\n' + (SOURCES[item.source]?.title || '') + ' · ' + (SOURCES[item.source]?.section || '')]), [0.31, 0.69]); }
      else { add(req.status === 'pending' ? 'Versão atual ainda não analisada.' : 'Nenhum padrão de alerta encontrado pelas checagens habilitadas.'); }
    }
    add('Análise por regras de checagem. Não é uma interpretação completa de todas as normas e não executa verificações do produto.');
  } else if (doc.content === 'decisions') {
    section('2. Decisões da revisão de requisitos');
    table(['Requisito', 'Decisão', 'Revisor / registro'], requirements.map(req => [req.id, req.review, (req.reviewer || 'A designar') + '\n' + (req.reviewNote || 'Sem registro de decisão')]), [0.16, 0.31, 0.53]);
    section('3. Alterações desta sessão');
    table(['Data', 'Alteração'], engineering.changes.length ? engineering.changes.map(item => [dateLabel(item.at), item.action]) : [[dateLabel(now()), 'Configuração inicial do projeto Aurora']], [0.2, 0.8]);
  } else if (doc.content === 'custom') {
    section('2. Conteúdo da equipe');
    add(doc.body || 'Conteúdo ainda não preenchido pela equipe.');
    section('3. Aprovação');
    add('Responsável, critério de conclusão e aprovação interna a definir.');
  } else {
    addPlanningContent(doc, blocks);
  }
  section('Referência e controle do documento');
  const source = SOURCES[doc.source];
  if (source) { add(source.title + ' · ' + source.edition + ' · ' + doc.clause); add(source.url); }
  else { add(doc.clause || 'Documento escolhido pela equipe Aurora.'); }
  add('Obrigatório pela norma significa conteúdo exigido quando a referência for aplicável ao contrato e às adaptações aprovadas. O recorte não é uma lista completa de todos os documentos do setor espacial.');
  return blocks;
}
function docScope(content) {
  const scopes = {requirements: 'Especifica as declarações, origens e critérios de verificação cadastrados na sessão.', 'verification-plan': 'Organiza as atividades de verificação do recorte de telemetria, software e interfaces do Aurora.', 'verification-matrix': 'Relaciona cada requisito com as atividades, a situação e as evidências registradas.', traceability: 'Mantém os vínculos entre origem, requisito, subsistema e verificação em ambos os sentidos.', schedule: 'Registra os marcos selecionados, seus períodos de preparação e as entregas correspondentes.', 'review-plan': 'Prepara a revisão técnica e identifica os documentos de entrada e os critérios a acordar.', 'review-record': 'Reserva os campos para registrar pareceres, decisões e ações após a revisão.', 'verification-results': 'Reúne os resultados declarados no projeto. Campos sem evidência permanecem pendentes.', analysis: 'Apresenta os apontamentos das checagens de redação e das triagens selecionadas.', decisions: 'Consolida os registros da equipe e as alterações feitas nesta sessão.'};
  return scopes[content] || 'Documento de trabalho do recorte conceitual Aurora. As definições de engenharia ainda não aprovadas permanecem identificadas como pendentes.';
}
function addPlanningContent(doc, blocks) {
  const h = text => blocks.push(docHeading(text));
  const p = text => blocks.push(docParagraph(text));
  const t = (headers, rows, widths = []) => blocks.push(docTable(headers, rows, widths));
  const subs = Array.from(new Set(requirements.map(req => req.subsystem)));
  if (doc.content === 'semp') {
    h('2. Organização do trabalho');
    p('A equipe Aurora mantém identificação única, origem e versão para os requisitos. Antes de aprovar uma alteração, revisa os vínculos com a arquitetura, as atividades de verificação e os documentos afetados.');
    t(['Responsabilidade', 'Papel previsto'], [['Consolidar requisitos e interfaces', 'Engenharia de sistemas'], ['Planejar atividades e critérios', 'Responsáveis pelos subsistemas'], ['Revisar exigências regulatórias', 'Responsável regulatório'], ['Controlar versões e decisões', 'Gestão da configuração'], ['Autorizar avanço de fase', 'Autoridade do projeto a designar']], [0.57, 0.43]);
    h('3. Revisões e configuração');
    t(['Revisão', 'Data prevista', 'Foco'], activeReviews().map(review => [labelReview(review.id), engDate(review.date), review.focus]), [0.18, 0.22, 0.6]);
    p('O pacote de revisão usa a versão vigente dos documentos. Resultados de testes não são presumidos a partir da análise de texto. Alterações em requisitos já verificados exigem reavaliação das evidências.');
    h('4. Itens a completar');
    p('A equipe precisa confirmar o contrato aplicável, a matriz de conformidade e adaptações, o orçamento, os responsáveis nominais, a gestão de riscos, as ferramentas e o plano de validação. Este recorte não fecha essas decisões.');
  } else if (doc.content === 'needs' || doc.content === 'concept' || doc.content === 'moe') {
    h('2. Contexto do Aurora');
    p('O cenário de trabalho reúne transmissão e registro de telemetria, interface entre aquisição e computador de bordo e organização dos dados técnicos em solo. O objetivo da demonstração é manter as decisões rastreáveis desde a definição até a verificação.');
    t(['Parte interessada', 'Necessidade a confirmar'], [['Equipe de sistemas', 'Dispor de requisitos com origem, método e critério explícitos'], ['Equipe de ensaios', 'Relacionar procedimentos, configurações e resultados aos requisitos'], ['Gestão da configuração', 'Manter versões e registros de decisão'], ['Responsável regulatório', 'Confirmar aplicabilidade antes do uso de frequência ou compartilhamento de dados']], [0.32, 0.68]);
    h('3. Limites e definições pendentes');
    p('Finalidade científica, perfil da missão, limites de desempenho, disponibilidade, condições ambientais e medidas de eficácia ainda devem ser confirmados pelas partes interessadas. A demo não atribui valores técnicos não aprovados.');
    if (doc.content === 'moe') { t(['Medida de eficácia', 'Definição / aprovação'], [['Atendimento da missão', 'Definir resultado observável com o cliente'], ['Aceitação do produto', 'Definir evidências e critérios de sucesso'], ['Estado de aprovação', 'Nenhuma definição aprovada nesta sessão']], [0.4, 0.6]); }
  } else if (['architecture', 'preliminary', 'detailed'].includes(doc.content)) {
    h('2. Alocação atual');
    t(['Subsistema', 'Requisitos alocados', 'Definição de arquitetura'], subs.map(sub => [sub, requirements.filter(req => req.subsystem === sub).map(req => req.id).join(', '), requirements.filter(req => req.subsystem === sub).map(req => req.architecture).filter(Boolean).join('; ') || 'A definir pela engenharia']), [0.24, 0.29, 0.47]);
    h('3. Interfaces e decisões técnicas');
    p('Confirmar identificadores e versões dos documentos de interface, elementos de arquitetura, alternativas avaliadas e justificativas. Diagramas aprovados, dimensionamento e configuração detalhada não foram fornecidos para este recorte.');
  } else if (doc.content === 'integration') {
    h('2. Sequência de integração proposta para planejamento');
    t(['Etapa', 'Pré-condição', 'Saída esperada'], [['Preparar interfaces', 'Documento de interface identificado e revisado', 'Registro de compatibilidade'], ['Preparar configuração de ensaio', 'Itens, versões e procedimento acordados', 'Configuração controlada'], ['Integrar aquisição e registro', 'Critérios de aceitação definidos', 'Evidência vinculada aos requisitos'], ['Consolidar resultados', 'Desvios e resultados registrados', 'Pacote para a revisão de integração']], [0.26, 0.37, 0.37]);
    p('A ordem de execução final, as condições de segurança e os recursos precisam ser aprovados pela equipe. Não executar ensaios a partir deste rascunho.');
  } else if (doc.content === 'metrics') {
    h('2. Indicadores do registro de engenharia');
    t(['Indicador', 'Situação na sessão'], [['Requisitos registrados', requirements.length], ['Com vínculo de verificação', requirements.filter(req => linksForRequirement(req.id).length).length], ['Sem critério de aceitação preenchido', requirements.filter(req => !req.acceptance).length], ['Atividades concluídas', verifications.filter(item => item.status === 'Concluída').length]], [0.7, 0.3]);
    h('3. Medidas técnicas do produto');
    p('Definir com a equipe as medidas técnicas de desempenho, suas metas, margens, limites e frequência de acompanhamento. As contagens acima são indicadores do registro de engenharia e não substituem TPMs do produto.');
  } else if (doc.content === 'hsi') {
    h('2. Pessoas e interação com o sistema');
    t(['Grupo', 'Interação a avaliar'], [['Operadores', 'Leitura e interpretação da telemetria'], ['Equipe de montagem e integração', 'Identificação das interfaces e procedimentos'], ['Equipe de manutenção e ensaio', 'Configuração controlada e recuperação de registros']], [0.35, 0.65]);
    p('Definir responsabilidades, treinamento, restrições de operação, critérios de usabilidade e análise das tarefas. As interfaces humanas ainda não foram avaliadas no projeto.');
  } else if (['decommission', 'disposal'].includes(doc.content)) {
    h('2. Itens de planejamento');
    t(['Item', 'Definição pendente'], [['Escopo físico e operacional', 'Identificar os itens abrangidos'], ['Critérios de início', 'Definir autorização e pré-condições'], ['Responsabilidades', 'Designar responsáveis'], ['Segurança e ambiente', 'Identificar exigências específicas aplicáveis'], ['Evidência de conclusão', 'Definir registros e aprovação']], [0.37, 0.63]);
    p('Não há procedimento operacional de descomissionamento ou descarte aprovado nesta demonstração.');
  }
}

// PDF sem dependências externas, com tabelas e páginas controladas.
function engineeringPDFPage(pdf, spec, continued = false) {
  pdf.page = {ops: '', links: []}; pdf.pages.push(pdf.page);
  pdfText(pdf, 'NORTE', 42, 38, 13, true, '0.46 0.33 0.24');
  pdfText(pdf, 'MISSÃO AURORA', 112, 38, 8, false, '0.46 0.46 0.41');
  pdfText(pdf, engDate(now().slice(0, 10)), 495, 38, 8, false, '0.46 0.46 0.41');
  pdfLine(pdf, 42, 53, 553.28, 53);
  pdf.y = 83;
  const title = continued ? spec.code + ' · continuação' : spec.title;
  const size = continued ? 14 : 23;
  for (const line of pdfWrap(pdf, title, size, 503, true)) { pdfText(pdf, line, 42, pdf.y, size, true); pdf.y += size * 1.3; }
  pdfText(pdf, `${spec.code} · ${engineering.profile} · v0.${engineering.version} · ${spec.state}`, 42, pdf.y + 9, 9, false, '0.46 0.46 0.41');
  pdf.y += 37;
}
function engineeringPDFNeed(pdf, height, spec) { if (pdf.y + height > 765) { engineeringPDFPage(pdf, spec, true); } }
function engineeringPDFParagraph(pdf, text, spec, heading = false) {
  const size = heading ? 12 : 10.5;
  const leading = heading ? 17 : 15;
  const lines = pdfWrap(pdf, text, size, 511, heading);
  if (heading) { engineeringPDFNeed(pdf, Math.min(lines.length * leading + 38, 610), spec); pdf.y += 8; }
  for (const line of lines) { engineeringPDFNeed(pdf, leading + 3, spec); pdfText(pdf, line, 42, pdf.y, size, heading, heading ? '0.46 0.33 0.24' : '0.17 0.18 0.16'); pdf.y += leading; }
  pdf.y += heading ? 5 : 8;
}
function engineeringPDFTable(pdf, block, spec) {
  const fractions = block.widths.length === block.headers.length ? block.widths : block.headers.map(() => 1 / block.headers.length);
  const widths = fractions.map(value => value * 511);
  const font = 9.3;
  const leading = 13.3;
  const headerLines = block.headers.map((text, index) => pdfWrap(pdf, text, 9, widths[index] - 16, true));
  const headerHeight = Math.max(...headerLines.map(lines => lines.length)) * 12 + 14;
  function head() {
    pdfRect(pdf, 42, pdf.y - 10, 511, headerHeight, '0.94 0.93 0.90');
    let x = 42;
    headerLines.forEach((lines, index) => { lines.forEach((line, n) => pdfText(pdf, line, x + 8, pdf.y + 2 + n * 12, 9, true, '0.40 0.37 0.32')); x += widths[index]; });
    pdf.y += headerHeight;
  }
  engineeringPDFNeed(pdf, headerHeight + 40, spec); head();
  for (const row of block.rows) {
    const cells = row.map((text, index) => pdfWrap(pdf, text, font, widths[index] - 16));
    let offset = 0;
    const count = Math.max(1, ...cells.map(lines => lines.length));
    while (offset < count) {
      const fullHeight = (count - offset) * leading + 16;
      if (pdf.y + fullHeight > 763 && fullHeight <= 480 && offset === 0) { engineeringPDFPage(pdf, spec, true); head(); }
      const capacity = Math.floor((760 - pdf.y - 16) / leading);
      if (capacity < 1) { engineeringPDFPage(pdf, spec, true); head(); continue; }
      const n = Math.min(capacity, count - offset);
      const height = n * leading + 16;
      let x = 42;
      cells.forEach((lines, index) => { lines.slice(offset, offset + n).forEach((line, i) => pdfText(pdf, line, x + 8, pdf.y + 5 + i * leading, font)); x += widths[index]; });
      pdfLine(pdf, 42, pdf.y + height - 9, 553, pdf.y + height - 9);
      pdf.y += height; offset += n;
      if (offset < count) { engineeringPDFPage(pdf, spec, true); head(); }
    }
  }
  pdf.y += 10;
}
function buildEngineeringPDF(spec) {
  const pdf = pdfNew();
  engineeringPDFPage(pdf, spec);
  for (const block of documentBlocks(spec)) {
    if (block.type === 'table') { engineeringPDFTable(pdf, block, spec); }
    else { engineeringPDFParagraph(pdf, block.text, spec, block.type === 'heading'); }
  }
  return pdfFinish(pdf, `${spec.code} · Rascunho de trabalho · Aprovação pendente`);
}

// ZIP padrão, também usado pelo Word editável.
const zipEncoder = new TextEncoder();
function zipCRC(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i += 1) { crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipBytes(value) { return typeof value === 'string' ? zipEncoder.encode(value) : value; }
function makeZip(entries, type = 'application/zip') {
  const local = [], central = [];
  let offset = 0, centralSize = 0;
  for (const entry of entries) {
    const name = zipEncoder.encode(entry.name);
    const bytes = zipBytes(entry.bytes);
    const crc = zipCRC(bytes);
    const head = new Uint8Array(30); const view = new DataView(head.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true); view.setUint16(12, 0x5821, true); view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true); view.setUint16(26, name.length, true);
    local.push(head, name, bytes);
    const dir = new Uint8Array(46); const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, 0x800, true); dv.setUint16(14, 0x5821, true); dv.setUint32(16, crc, true); dv.setUint32(20, bytes.length, true); dv.setUint32(24, bytes.length, true); dv.setUint16(28, name.length, true); dv.setUint32(42, offset, true);
    central.push(dir, name); centralSize += 46 + name.length; offset += 30 + name.length + bytes.length;
  }
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], {type: type});
}
function xmlText(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[char])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
function wordParagraph(text, style = 'Normal') {
  const runs = String(text).split('\n').map(line => `<w:r><w:t xml:space="preserve">${xmlText(line)}</w:t></w:r>`).join('<w:r><w:br/></w:r>');
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${runs}</w:p>`;
}
function wordTable(block) {
  const fractions = block.widths.length === block.headers.length ? block.widths : block.headers.map(() => 1 / block.headers.length);
  const widths = fractions.map(value => Math.round(value * 10000));
  let xml = '<w:tbl><w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="DEDCD3"/><w:bottom w:val="single" w:sz="4" w:color="DEDCD3"/><w:insideH w:val="single" w:sz="4" w:color="DEDCD3"/><w:insideV w:val="single" w:sz="4" w:color="DEDCD3"/></w:tblBorders><w:tblCellMar><w:top w:w="95" w:type="dxa"/><w:left w:w="115" w:type="dxa"/><w:bottom w:w="95" w:type="dxa"/><w:right w:w="115" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + widths.map(width => `<w:gridCol w:w="${width}"/>`).join('') + '</w:tblGrid>';
  for (const [n, row] of [block.headers, ...block.rows].entries()) {
    xml += `<w:tr><w:trPr><w:cantSplit/>${n === 0 ? '<w:tblHeader/>' : ''}</w:trPr>`;
    row.forEach((cell, i) => { xml += `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${n === 0 ? '<w:shd w:fill="EFEEE7"/>' : ''}<w:vAlign w:val="top"/></w:tcPr>${wordParagraph(cell, n === 0 ? 'TableHeader' : 'TableText')}</w:tc>`; });
    xml += '</w:tr>';
  }
  return xml + '</w:tbl>' + wordParagraph('', 'TableGap');
}
function buildEngineeringDocx(spec) {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  let body = wordParagraph('NORTE / MISSÃO AURORA', 'Brand');
  body += wordParagraph(spec.title, 'Title');
  body += wordParagraph(`${spec.code} · ${engineering.profile} · v0.${engineering.version} · ${spec.state}`, 'Subtitle');
  for (const block of documentBlocks(spec)) { body += block.type === 'table' ? wordTable(block) : wordParagraph(block.text, block.type === 'heading' ? 'Heading1' : 'Normal'); }
  body += '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="953" w:bottom="850" w:left="953" w:header="450" w:footer="450"/></w:sectPr>';
  const documentXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${ns}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:color w:val="292C29"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="285" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Brand"><w:name w:val="Brand"/><w:pPr><w:spacing w:after="260"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="77533E"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:keepNext/><w:spacing w:after="160" w:line="520"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:keepNext/><w:spacing w:after="250"/></w:pPr><w:rPr><w:sz w:val="20"/><w:color w:val="74746B"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="230" w:after="110"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/><w:color w:val="77533E"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:pPr><w:spacing w:after="0" w:line="250"/></w:pPr><w:rPr><w:b/><w:sz w:val="19"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:pPr><w:spacing w:after="0" w:line="250"/><w:widowControl/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableGap"><w:name w:val="Table Gap"/><w:pPr><w:spacing w:after="65" w:line="40"/></w:pPr><w:rPr><w:sz w:val="2"/></w:rPr></w:style></w:styles>`;
  const contentTypes = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>';
  const relationships = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const docRels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';
  const footer = `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="${ns}"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="74746B"/></w:rPr><w:t>${xmlText(spec.code)} · Rascunho · </w:t></w:r><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>`;
  const files = [{name: '[Content_Types].xml', bytes: contentTypes}, {name: '_rels/.rels', bytes: relationships}, {name: 'word/document.xml', bytes: documentXML}, {name: 'word/styles.xml', bytes: styles}, {name: 'word/_rels/document.xml.rels', bytes: docRels}, {name: 'word/footer1.xml', bytes: footer}];
  return makeZip(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
function csvCell(value) { let text = String(value ?? ''); if (/^[\s]*[=+\-@]/.test(text)) { text = "'" + text; } return '"' + text.replace(/"/g, '""') + '"'; }
function csvFile(rows) { return '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n'); }
function traceCSV() {
  const rows = [['Requisito', 'Versão', 'Declaração', 'Subsistema', 'Origem', 'Superior', 'Atividade', 'Método', 'Revisão', 'Situação', 'Resultado', 'Evidência']];
  for (const req of requirements) {
    const items = linksForRequirement(req.id);
    if (!items.length) { rows.push([req.id, req.version, req.text, req.subsystem, req.reference, req.parent, '', req.method, '', 'Sem atividade', '', '']); }
    for (const item of items) { rows.push([req.id, req.version, req.text, req.subsystem, req.reference, req.parent, item.id, item.method, labelReview(item.review), item.status, item.result, item.evidence]); }
  }
  return csvFile(rows);
}
function projectJSON() { return JSON.stringify({application: 'Norte', schema: 'norte.project.3', exportedAt: now(), project: project, analysis: settings, requirements: requirements, verifications: verifications, planning: engineering, phaseDurations: typeof lifecycle !== 'undefined' ? {NASA: lifeDurations('NASA'), ECSS: lifeDurations('ECSS')} : {}}, null, 2); }
function calendarText(value) { return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function calendarFile() {
  let lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Norte//Projeto Aurora//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const review of activeReviews()) {
    const notes = review.focus + '\nDocumentos de entrada: ' + reviewDocs(review.id, 'input').map(doc => doc.code).join(', ') + '\nPreparar a partir de ' + engDate(addDays(review.date, -review.prepDays)) + '. Fechamento previsto ' + engDate(addDays(review.date, review.closeDays)) + '. Datas de planejamento, sujeitas à maturidade.';
    lines.push('BEGIN:VEVENT', 'UID:aurora-' + engineering.profile.toLowerCase() + '-' + review.id.toLowerCase() + '@norte.local', 'DTSTAMP:' + now().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), 'DTSTART;VALUE=DATE:' + review.date.replaceAll('-', ''), 'DTEND;VALUE=DATE:' + addDays(review.date, 1).replaceAll('-', ''), 'SUMMARY:' + calendarText('Aurora · ' + labelReview(review.id) + ' · ' + review.title), 'DESCRIPTION:' + calendarText(notes), 'STATUS:TENTATIVE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(line => { let count = 0, folded = ''; for (const char of line) { const length = zipEncoder.encode(char).length; if (count + length > 73) { folded += '\r\n '; count = 1; } folded += char; count += length; } return folded; }).join('\r\n') + '\r\n';
}
let packageBusy = false;
async function downloadPackage(reviewId = '') {
  if (packageBusy) { return; }
  packageBusy = true;
  hidePopovers();
  const docs = reviewId ? reviewDocs(reviewId) : currentDocuments();
  if (!docs.length) { message('Nenhum documento selecionado para baixar.', true); packageBusy = false; return; }
  try {
    message('Preparando ' + docs.length + ' documentos…');
    const rendered = docs.map(doc => ({doc: doc, pdf: buildEngineeringPDF(doc), word: buildEngineeringDocx(doc)}));
    const files = [];
    if (typeof lifeSVG === 'function') { files.push({name: 'cronograma-diagrama.svg', bytes: lifeSVG(false, true)}); }
    for (const item of rendered) { files.push({name: 'PDF/' + item.doc.code + '.pdf', bytes: new Uint8Array(await item.pdf.arrayBuffer())}); files.push({name: 'Word/' + item.doc.code + '.docx', bytes: new Uint8Array(await item.word.arrayBuffer())}); }
    const manifest = [['Código', 'Título', 'Obrigatoriedade', 'Revisões', 'Entrada ou saída', 'Estado', 'Referência', 'Seção'], ...docs.map(doc => [doc.code, doc.title, docKindLabel(doc.kind), doc.reviews.map(labelReview).join(', '), doc.flow === 'output' ? 'Saída' : 'Entrada', doc.state, SOURCES[doc.source]?.url || 'Decisão da equipe', doc.clause])];
    files.push({name: 'indice-documentos.csv', bytes: csvFile(manifest)}, {name: 'matriz-rastreabilidade.csv', bytes: traceCSV()}, {name: 'cronograma.ics', bytes: calendarFile()}, {name: 'projeto-aurora.json', bytes: projectJSON()});
    const note = 'NORTE · PROJETO AURORA\n\nPDF e Word contêm a mesma versão do projeto nesta sessão.\nRascunhos de trabalho, não entregas aprovadas. Os campos pendentes não foram inventados.\nObrigatoriedade normativa depende do contrato, do escopo e das adaptações aprovadas. O recorte de documentos não é exaustivo.\nAs datas são parâmetros do planejamento da equipe. A agenda não autoriza o avanço de fase.\nAs fontes oficiais e as seções consultadas constam em cada documento e no índice.\nA relação entre requisitos e verificações consta no CSV e no JSON. Nenhum ensaio é executado pela plataforma.\n';
    files.push({name: 'LEIA-ME.txt', bytes: note});
    const suffix = reviewId ? '-' + reviewId : '';
    downloadBlob(makeZip(files), 'aurora-' + engineering.profile.toLowerCase() + suffix + '-documentos.zip');
    message(`${docs.length} documentos preparados em PDF e Word.`);
  } catch (error) { console.error(error); message('Não foi possível preparar o pacote. Tente um documento individual.', true); }
  finally { packageBusy = false; }
}
