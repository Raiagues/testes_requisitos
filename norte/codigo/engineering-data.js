const originalSource = openSource;
const originalSaveDraft = saveDraft;
const originalShowView = showView;
const originalFitTable = fitTable;
// O perfil organiza as entregas. A aplicação contratual precisa ser confirmada.
const ENGINEERING_SOURCES = {
  nasaReviews: {org: 'NASA', title: 'NASA Systems Engineering Processes and Requirements', edition: 'NPR 7123.1D · Change 2', section: '5.2.2.2 e 5.2.3 · Produtos e conclusão das revisões', url: 'https://nodis3.gsfc.nasa.gov/displayDir.cfm?Internal_ID=N_PR_7123_001D_&page_name=Chapter5', quote: 'The technical team shall provide the following minimum products at the associated life-cycle review, at the indicated maturity level.', mark: 'minimum products', explanation: 'Os produtos e a maturidade esperada dependem da revisão. Os rascunhos são atualizados após os comentários e só depois entram na configuração aprovada.'},
  nasaSemp: {org: 'NASA', title: 'Systems Engineering Management Plan', edition: 'NPR 7123.1D · Change 2', section: '6.1 e 6.2 · SEMP', url: 'https://nodis3.gsfc.nasa.gov/displayDir.cfm?Internal_ID=N_PR_7123_001D_&page_name=Chapter6', quote: 'The SEMP may be a stand-alone document or may be included as sections within other documentation such as the program or project plan.', mark: 'may be included as sections', explanation: 'O conteúdo do plano pode integrar outro documento. Separar um arquivo por entrega é uma escolha de organização da Norte, não uma obrigação universal de formato.'},
  nasaCriteria: {org: 'NASA', title: 'Life-Cycle and Technical Review Entrance and Success Criteria', edition: 'NPR 7123.1D · Change 2', section: 'Apêndice G · G.1.1 e G.1.2', url: 'https://nodis3.gsfc.nasa.gov/displayDir.cfm?Internal_ID=N_PR_7123_001D_&page_name=AppendixG', quote: 'Tailoring and customizing are expected for projects and programs.', mark: 'Tailoring and customizing', explanation: 'Os critérios do apêndice são orientação. O contrato, as regras do programa e as adaptações aprovadas definem o pacote aplicável. A seleção da demo não aprova desvios.'},
  nasaVerification: {org: 'NASA', title: 'Systems Engineering Handbook', edition: 'NASA/SP-2016-6105 Rev. 2', section: '5.3 · Product Verification; Apêndice D', url: 'https://www.nasa.gov/reference/5-3-product-verification/', quote: 'Product verification proves that an end product', mark: 'Product verification', explanation: 'Planejar uma verificação é diferente de executá-la. Método, procedimento, critério, resultado e evidência ficam vinculados ao requisito.'},
  ecssSpec: {org: 'ECSS', title: 'Technical requirements specification', edition: 'ECSS-E-ST-10-06C · 6 março 2009', section: '7 e 8; Anexo A · TS', url: 'https://ecss.nl/standard/ecss-e-st-10-06c-technical-requirements-specification/', quote: 'The specification shall be identifiable, referable and related to a product or a system.', mark: 'identifiable, referable', explanation: 'A especificação identifica o produto e seus requisitos. A ficha da demo registra a referência, a alocação e como cada requisito será verificado.'},
  ecssVerification: {org: 'ECSS', title: 'Verification', edition: 'ECSS-E-ST-10-02C Rev. 1 · 1 fevereiro 2018', section: '5.2.8; Anexos A e B · VP e VCD', url: 'https://ecss.nl/standard/ecss-e-st-10-02c-rev-1-verification-1-february-2018/', quote: 'for the reviews as agreed with the customer', mark: 'as agreed with the customer', explanation: 'O plano e o controle de verificação são entregues nas revisões acordadas com o cliente. A distribuição por marcos aqui é uma proposta do Aurora, não uma transcrição de uma matriz universal.'},
  ecssEngineering: {org: 'ECSS', title: 'System engineering general requirements', edition: 'ECSS-E-ST-10C Rev. 1 · 15 fevereiro 2017', section: 'Cláusulas 5 e 7; Anexos B, D, G e N', url: 'https://ecss.nl/standard/ecss-e-st-10c-rev-1-system-engineering-general-requirements-15-february-2017/', quote: 'the application of this standard needs to be checked and if needed tailored', mark: 'needs to be checked', explanation: 'A aplicabilidade depende do tipo de produto e dos ajustes do projeto. Este recorte cobre engenharia de sistemas, não todas as disciplinas e entregas contratuais.'},
  ecssReviews: {org: 'ECSS', title: 'Organization and conduct of reviews', edition: 'ECSS-M-ST-10-01C · 15 novembro 2008', section: '5.3 a 5.6; Anexos A a D', url: 'https://ecss.nl/standard/ecss-m-st-10-01c-organization-and-conduct-of-reviews/', quote: 'The review procedure states the purpose and organization of the review and defines the review data-package.', mark: 'defines the review data-package', explanation: 'A preparação define critérios e documentos. Após a revisão, a equipe e a autoridade registram suas conclusões e o tratamento dos itens em aberto.'},
  ecssLifecycle: {org: 'ECSS', title: 'Project planning and implementation', edition: 'ECSS-M-ST-10C Rev. 1 · 6 março 2009', section: 'Ciclo de vida e marcos de revisão', url: 'https://ecss.nl/standard/ecss-m-st-10c-rev-1-project-planning-and-implementation/', quote: '', mark: '', explanation: 'As revisões são ajustadas à relação cliente-fornecedor e ao escopo. As datas, antecedências e durações da demo são parâmetros do projeto, não prazos prescritos pela norma.'}
};
for (const [key, source] of Object.entries(ENGINEERING_SOURCES)) { SOURCES[key] = {...source, format: 'html', kind: 'Referência técnica', page: '', pdfPage: null, scope: source.explanation, transcription: true, checkedAt: '2026-10-12'}; }
const REVIEW_PROFILES = {
  "NASA": [
    {
      "id": "MCR",
      "title": "Conceito da missão",
      "english": "Mission Concept Review",
      "phase": 0,
      "position": 1,
      "lane": 0,
      "week": 8,
      "active": true,
      "focus": "Confirmar a necessidade e o conceito da missão."
    },
    {
      "id": "SRR",
      "title": "Requisitos do sistema",
      "english": "System Requirements Review",
      "phase": 1,
      "position": 0.36,
      "lane": 1,
      "week": 12.32,
      "active": true,
      "focus": "Revisar requisitos, restrições e planejamento técnico."
    },
    {
      "id": "MDR-SDR",
      "title": "Definição da missão ou do sistema",
      "english": "Mission Definition Review / System Definition Review",
      "phase": 1,
      "position": 1,
      "lane": 1,
      "week": 20,
      "active": true,
      "focus": "Consolidar a arquitetura e a alocação dos requisitos."
    },
    {
      "id": "PDR",
      "title": "Projeto preliminar",
      "english": "Preliminary Design Review",
      "phase": 2,
      "position": 1,
      "lane": 1,
      "week": 36,
      "active": true,
      "focus": "Revisar a solução preliminar e a abordagem de verificação."
    },
    {
      "id": "CDR",
      "title": "Projeto detalhado",
      "english": "Critical Design Review",
      "phase": 3,
      "position": 0.7,
      "lane": 2,
      "week": 51.4,
      "active": true,
      "focus": "Revisar a maturidade do projeto detalhado."
    },
    {
      "id": "PRR",
      "title": "Prontidão para produção",
      "english": "Production Readiness Review",
      "phase": 3,
      "position": 0.84,
      "lane": 4,
      "week": 54.48,
      "active": false,
      "focus": "Avaliar a prontidão da produção quando aplicável."
    },
    {
      "id": "SIR",
      "title": "Prontidão para integração",
      "english": "System Integration Review",
      "phase": 3,
      "position": 1,
      "lane": 4,
      "week": 58,
      "active": true,
      "focus": "Confirmar as condições para integrar os elementos do sistema."
    },
    {
      "id": "TRR",
      "title": "Prontidão para testes",
      "english": "Test Readiness Review",
      "phase": 4,
      "position": 0.22,
      "lane": 3,
      "week": 62.84,
      "active": true,
      "focus": "Conferir procedimentos, configuração e critérios de teste."
    },
    {
      "id": "SAR",
      "title": "Aceitação do sistema",
      "english": "System Acceptance Review",
      "phase": 4,
      "position": 0.53,
      "lane": 4,
      "week": 69.66,
      "active": true,
      "focus": "Revisar o produto e as evidências para sua aceitação."
    },
    {
      "id": "ORR",
      "title": "Prontidão operacional",
      "english": "Operational Readiness Review",
      "phase": 4,
      "position": 0.78,
      "lane": 4,
      "week": 75.16,
      "active": true,
      "focus": "Avaliar o preparo do sistema e da equipe de operação."
    },
    {
      "id": "FRR",
      "title": "Prontidão para voo",
      "english": "Flight Readiness Review",
      "phase": 4,
      "position": 0.96,
      "lane": 3,
      "week": 79.12,
      "active": true,
      "focus": "Avaliar as condições e os riscos para o voo."
    },
    {
      "id": "PLAR",
      "title": "Avaliação após o lançamento",
      "english": "Post-Launch Assessment Review",
      "phase": 5,
      "position": 0.15,
      "lane": 5,
      "week": 87.8,
      "active": true,
      "focus": "Revisar o desempenho inicial da missão."
    },
    {
      "id": "CERR",
      "title": "Prontidão para evento crítico",
      "english": "Critical Event Readiness Review",
      "phase": 5,
      "position": 0.53,
      "lane": 5,
      "week": 107.56,
      "active": false,
      "focus": "Preparar um evento crítico definido pelo projeto."
    },
    {
      "id": "PFAR",
      "title": "Avaliação após o voo",
      "english": "Post-Flight Assessment Review",
      "phase": 5,
      "position": 0.81,
      "lane": 5,
      "week": 122.12,
      "active": false,
      "focus": "Aplicável a missões tripuladas, conforme o programa."
    },
    {
      "id": "DR",
      "title": "Descomissionamento",
      "english": "Decommissioning Review",
      "phase": 5,
      "position": 1,
      "lane": 6,
      "week": 132,
      "active": true,
      "focus": "Revisar a retirada de serviço e seus recursos."
    },
    {
      "id": "DRR",
      "title": "Prontidão para descarte",
      "english": "Disposal Readiness Review",
      "phase": 6,
      "position": 0.86,
      "lane": 6,
      "week": 138.88,
      "active": true,
      "focus": "Revisar as condições para a disposição final."
    }
  ],
  "ECSS": [
    {
      "id": "MDR",
      "title": "Definição da missão",
      "english": "Mission Definition Review",
      "phase": 0,
      "position": 1,
      "lane": 0,
      "week": 8,
      "active": true,
      "focus": "Consolidar a missão e as necessidades."
    },
    {
      "id": "PRR",
      "title": "Requisitos preliminares",
      "english": "Preliminary Requirements Review",
      "phase": 1,
      "position": 1,
      "lane": 0,
      "week": 20,
      "active": true,
      "focus": "Conferir a viabilidade e os requisitos preliminares."
    },
    {
      "id": "SRR",
      "title": "Requisitos do sistema",
      "english": "System Requirements Review",
      "phase": 2,
      "position": 0.37,
      "lane": 1,
      "week": 25.92,
      "active": true,
      "focus": "Revisar a especificação e a definição preliminar."
    },
    {
      "id": "PDR",
      "title": "Projeto preliminar",
      "english": "Preliminary Design Review",
      "phase": 2,
      "position": 1,
      "lane": 1,
      "week": 36,
      "active": true,
      "focus": "Consolidar o projeto preliminar e os planos."
    },
    {
      "id": "CDR",
      "title": "Projeto detalhado",
      "english": "Critical Design Review",
      "phase": 3,
      "position": 1,
      "lane": 2,
      "week": 58,
      "active": true,
      "focus": "Conferir a definição detalhada do produto."
    },
    {
      "id": "TRR",
      "title": "Prontidão para testes",
      "english": "Test Readiness Review",
      "phase": 4,
      "position": 0.18,
      "lane": 3,
      "week": 61.24,
      "active": false,
      "focus": "Revisão de testes adicional a acordar com o cliente."
    },
    {
      "id": "QR",
      "title": "Qualificação",
      "english": "Qualification Review",
      "phase": 4,
      "position": 0.52,
      "lane": 3,
      "week": 67.36,
      "active": true,
      "focus": "Revisar os resultados de qualificação."
    },
    {
      "id": "AR",
      "title": "Aceitação",
      "english": "Acceptance Review",
      "phase": 4,
      "position": 0.87,
      "lane": 4,
      "week": 73.66,
      "active": true,
      "focus": "Revisar evidências e condições de entrega."
    },
    {
      "id": "ORR",
      "title": "Prontidão operacional",
      "english": "Operational Readiness Review",
      "phase": 4,
      "position": 1,
      "lane": 4,
      "week": 76,
      "active": true,
      "focus": "Preparar a operação e liberar o segmento de solo."
    },
    {
      "id": "FRR",
      "title": "Prontidão para voo",
      "english": "Flight Readiness Review",
      "phase": 5,
      "position": 0.1,
      "lane": 5,
      "week": 81.6,
      "active": true,
      "focus": "Avaliar a prontidão dos segmentos antes do lançamento."
    },
    {
      "id": "LRR",
      "title": "Prontidão para lançamento",
      "english": "Launch Readiness Review",
      "phase": 5,
      "position": 0.22,
      "lane": 5,
      "week": 88.32,
      "active": true,
      "focus": "Avaliar as condições imediatamente anteriores ao lançamento."
    },
    {
      "id": "CRR",
      "title": "Resultado do comissionamento",
      "english": "Commissioning Result Review",
      "phase": 5,
      "position": 0.44,
      "lane": 5,
      "week": 100.64,
      "active": true,
      "focus": "Revisar o comissionamento antes da operação de rotina."
    },
    {
      "id": "ELR",
      "title": "Fim de vida",
      "english": "End-of-Life Review",
      "phase": 5,
      "position": 1,
      "lane": 6,
      "week": 132,
      "active": true,
      "focus": "Preparar o encerramento da operação e o descarte."
    },
    {
      "id": "MCR",
      "title": "Encerramento da missão",
      "english": "Mission Close-out Review",
      "phase": 6,
      "position": 1,
      "lane": 6,
      "week": 140,
      "active": true,
      "focus": "Revisar a conclusão das atividades de descarte."
    }
  ]
};
// As datas são hipóteses de planejamento do projeto Aurora.
let engineering = {module: 'requirements', profile: 'NASA', start: '2026-11-02', prepDays: 10, closeDays: 7, schedules: {}, docReview: '', docKind: '', docQuery: '', expandedReview: '', reviewPicker: false, sourceBack: null, docId: '', version: 1, changes: [], customDocs: []};
const DOCUMENT_DEFINITIONS = [
  {id: 'NEC', title: 'Necessidades e partes interessadas', kind: 'norm', content: 'needs', nasa: {reviews: ['MCR'], source: 'nasaReviews', clause: '5.2.2.2.a(1) · SE-35', maturity: 'Definições sob controle de configuração'}},
  {id: 'CON', title: 'Conceito da missão', kind: 'norm', content: 'concept', nasa: {reviews: ['MCR'], source: 'nasaReviews', clause: '5.2.2.2.a(2) · SE-36', maturity: 'Conceito sob controle de configuração'}, ecss: {reviews: ['MDR', 'PRR'], source: 'ecssEngineering', clause: 'Anexos B e C · MDD e conceito', maturity: 'Conceito na maturidade acordada'}},
  {id: 'MOE', title: 'Critérios de sucesso da missão', kind: 'norm', content: 'moe', nasa: {reviews: ['MCR'], source: 'nasaReviews', clause: '5.2.2.2.a(3) · SE-37', maturity: 'Definições aprovadas de medidas de eficácia'}},
  {id: 'SEMP', title: 'Plano de engenharia de sistemas', kind: 'norm', content: 'semp', nasa: {reviews: ['SRR', 'PDR', 'CDR'], source: 'nasaSemp', clause: '5.2.2.2.b(1) · SE-38; cap. 6', maturity: 'Base de configuração na SRR; atualizações seguintes'}, ecss: {reviews: ['SRR', 'PDR', 'CDR'], source: 'ecssEngineering', clause: 'Anexo D · System engineering plan', maturity: 'Plano ajustado e acordado com o cliente', code: 'SEP'}},
  {id: 'REQ', title: 'Especificação de requisitos', kind: 'norm', content: 'requirements', nasa: {reviews: ['SRR', 'MDR-SDR', 'PDR', 'CDR'], source: 'nasaReviews', clause: '5.2.2.2.b(2) · SE-39', maturity: 'Requisitos sob controle de configuração desde a SRR'}, ecss: {reviews: ['SRR', 'PDR', 'CDR'], source: 'ecssSpec', clause: 'Cláusulas 7 e 8; Anexo A · TS', maturity: 'Especificação na maturidade acordada', code: 'TS'}},
  {id: 'HSI', title: 'Abordagem de integração humana', kind: 'norm', content: 'hsi', nasa: {reviews: ['SRR'], source: 'nasaReviews', clause: '5.2.2.2.b(3) · SE-66', maturity: 'Abordagem sob controle de configuração; pode integrar o SEMP'}},
  {id: 'ARQ', title: 'Arquitetura e alocação', kind: 'norm', content: 'architecture', nasa: {reviews: ['MDR-SDR'], source: 'nasaReviews', clause: '5.2.2.2.c(2–3) · SE-41 e SE-42', maturity: 'Arquitetura e alocação sob controle de configuração'}, ecss: {reviews: ['PDR', 'CDR'], source: 'ecssEngineering', clause: 'Anexo G · Design definition file', maturity: 'Definição preliminar na PDR e detalhada na CDR'}},
  {id: 'TPM', title: 'Indicadores e tendências técnicas', kind: 'norm', content: 'metrics', nasa: {reviews: ['MDR-SDR'], source: 'nasaReviews', clause: '5.2.2.2.c(1,4) · SE-40 e SE-43', maturity: 'Indicadores definidos e tendências iniciais registradas'}},
  {id: 'PRE', title: 'Definição do projeto preliminar', kind: 'norm', content: 'preliminary', nasa: {reviews: ['PDR'], source: 'nasaReviews', clause: '5.2.2.2.d(1) · SE-45', maturity: 'Definição preliminar da solução'}},
  {id: 'DET', title: 'Definição do projeto detalhado', kind: 'norm', content: 'detailed', nasa: {reviews: ['CDR'], source: 'nasaReviews', clause: '5.2.2.2.e · SE-46', maturity: 'Projeto detalhado sob controle de configuração'}},
  {id: 'INT', title: 'Plano de integração', kind: 'norm', content: 'integration', nasa: {reviews: ['PDR', 'SIR'], source: 'nasaReviews', clause: '5.2.2.2.d(2) e f(1) · SE-67 e SE-47', maturity: 'Base na PDR; plano atualizado na SIR'}},
  {id: 'VVP', title: 'Plano de verificação e validação', kind: 'norm', content: 'verification-plan', nasa: {reviews: ['PDR', 'TRR'], source: 'nasaReviews', clause: '5.2.2.2.d(3) · SE-68; Apêndice G.11', maturity: 'Base na PDR; consulta atualizada para os testes'}, ecss: {reviews: ['PDR', 'CDR', 'TRR'], source: 'ecssVerification', clause: '5.2.8.1; Anexo A · VP', maturity: 'Planejamento na maturidade acordada', code: 'VP', title: 'Plano de verificação'}},
  {id: 'VCD', title: 'Matriz de verificação', kind: 'optional', content: 'verification-matrix', nasa: {reviews: ['SRR', 'PDR', 'CDR', 'TRR'], source: 'nasaVerification', clause: 'NASA/SP-2016-6105 · Apêndice D', maturity: 'Formato de apoio; o arquivo separado não é exigência do guia'}, ecss: {reviews: ['PDR', 'CDR', 'TRR', 'QR', 'AR'], source: 'ecssVerification', clause: '5.2.8.2 e 5.4.4.1; Anexo B · VCD', maturity: 'Documento de controle com evidências e situação', kind: 'norm', title: 'Documento de controle de verificação'}},
  {id: 'RTM', title: 'Matriz de rastreabilidade', kind: 'optional', content: 'traceability', nasa: {reviews: ['SRR', 'MDR-SDR', 'PDR', 'CDR'], source: 'nasaVerification', clause: 'Apêndice D; NPR 7123.1D 3.2.12', maturity: 'Formato de apoio à rastreabilidade exigida pelo processo'}, ecss: {reviews: ['SRR', 'PDR', 'CDR'], source: 'ecssEngineering', clause: 'Anexo N · Requirements traceability matrix', maturity: 'Rastreabilidade na maturidade acordada', kind: 'norm'}},
  {id: 'RES', title: 'Resultados de verificação', kind: 'norm', content: 'verification-results', nasa: {reviews: ['SIR', 'ORR'], source: 'nasaReviews', clause: '5.2.2.2.f(2) e g(1) · SE-48 e SE-69', maturity: 'Resultados iniciais na SIR e preliminares na ORR'}, ecss: {reviews: ['QR', 'AR'], source: 'ecssVerification', clause: '5.3.2; Anexos C a F conforme método', maturity: 'Relatórios após executar as atividades aplicáveis'}},
  {id: 'DES', title: 'Plano de descomissionamento', kind: 'norm', content: 'decommission', nasa: {reviews: ['ORR'], source: 'nasaReviews', clause: '5.2.2.2.g(2) · SE-51', maturity: 'Plano sob controle de configuração'}},
  {id: 'DSP', title: 'Plano de descarte', kind: 'norm', content: 'disposal', nasa: {reviews: ['ORR'], source: 'nasaReviews', clause: '5.2.2.2.g(3) · SE-52', maturity: 'Plano sob controle de configuração'}},
  {id: 'REG', title: 'Registro de decisões da equipe', kind: 'company', content: 'decisions', all: {reviews: ['SRR', 'PDR', 'CDR'], source: '', clause: 'Plano Aurora · decisão interna da demonstração', maturity: 'Decisões da equipe registradas antes da revisão'}},
  {id: 'ANA', title: 'Análise dos requisitos', kind: 'optional', content: 'analysis', all: {reviews: ['SRR', 'PDR', 'CDR'], source: 'nasa-verification', clause: 'Checagens selecionadas na Norte', maturity: 'Apontamentos gerados com os critérios ativos'}},
  {id: 'CRN', title: 'Cronograma de revisões', kind: 'company', content: 'schedule', all: {reviews: [], source: '', clause: 'Plano Aurora · calendário de trabalho da equipe', maturity: 'Datas previstas, dependentes dos critérios de entrada'}}
];
let verifications = [
  {id: 'VER-001', title: 'Tempo de transmissão da telemetria', method: 'Teste', subsystem: 'Telemetria', requirementIds: ['AUR-001'], owner: 'Engenharia de telecomunicações', review: 'TRR', level: 'Sistema', stage: 'Qualificação', status: 'Bloqueada', result: 'Não executada', criteria: 'Definir o limite de tempo e a condição do ensaio antes de executar.', procedure: 'Registrar o instante de origem e o recebimento do pacote. Comparar o tempo decorrido com o limite aprovado.', conditions: 'Bancada de telemetria e relógios com sincronização definida.', evidence: '', note: 'A redação atual não contém um limite verificável.'},
  {id: 'VER-002', title: 'Integridade do registro de pacotes', method: 'Teste', subsystem: 'Software', requirementIds: ['AUR-003'], owner: 'Engenharia de software', review: 'TRR', level: 'Subsistema', stage: 'Qualificação', status: 'Planejada', result: 'Não executada', criteria: 'Cada pacote do conjunto de ensaio deve estar presente no registro não volátil, com conteúdo preservado.', procedure: 'Preparar um conjunto identificável de pacotes. Enviar o conjunto. Comparar os pacotes recebidos e os registros persistidos.', conditions: 'Conjunto de ensaio controlado e versão do software registrada.', evidence: '', note: ''},
  {id: 'VER-003', title: 'Compatibilidade documental da interface', method: 'Análise', subsystem: 'Interfaces', requirementIds: ['AUR-004'], owner: 'Equipe de interfaces', review: 'CDR', level: 'Sistema', stage: 'Qualificação', status: 'Em preparação', result: 'Não executada', criteria: 'As definições de origem e destino devem corresponder à versão aprovada do documento de interface.', procedure: 'Comparar os registros dos dois lados da interface com o documento de referência controlado.', conditions: 'Documento de interface identificado por código e versão.', evidence: '', note: 'A referência ainda precisa de identificação completa. O requisito indica Inspeção e esta atividade propõe Análise; a equipe precisa confirmar os métodos aplicáveis.'},
  {id: 'VER-004', title: 'Fluxo de recepção e registro', method: 'Demonstração', subsystem: 'Telemetria', requirementIds: ['AUR-001', 'AUR-003'], owner: 'Engenharia de sistemas', review: 'TRR', level: 'Sistema', stage: 'Qualificação', status: 'Planejada', result: 'Não executada', criteria: 'O fluxo deve apresentar os pacotes recebidos e sua persistência no conjunto de ensaio.', procedure: 'Executar o cenário em bancada e observar o fluxo completo até o registro.', conditions: 'Cenário controlado. A atividade não encerra o critério de tempo de AUR-001.', evidence: '', note: 'Verificação complementar, não substitui VER-001.'}
];
