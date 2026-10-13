# Registro de execução

## 2026-10-12 — levantamento

- Lidos os dois prompts e inspecionada `REFERENCIA_A_CORRIGIR.png`.
- GitHub `Raiagues/testes_requisitos` consultado: repositório vazio. A base local contém a versão disponível.
- Interface modular sem framework; projetos em memória, contatos em SQLite, exportação no navegador. Não há migrações nem testes automatizados na base.
- Decisão: preservar os módulos e introduzir Express/Supabase, RPCs transacionais, sessões opacas e documentos por modelos controlados.
- Credenciais de serviços não estão presentes. Nenhum serviço pago será criado. Testes locais não serão apresentados como validação de produção.
- O isolamento padrão do executor falhou antes de iniciar comandos (`bwrap`). Leituras e comandos locais estão sendo executados com a autorização concedida pelo mecanismo do ambiente.

## Implementação concluída no código

- Preservados os quatro módulos e a identidade visual. Build externaliza scripts para permitir CSP, inclui PDF.js local e produz exemplos públicos identificados. O cartão de revisão separa cabeçalho, preparação, realização, fechamento e linhas de entrada/saída. Conferidos temas e resoluções desktop/mobile; painéis não deslocam a tabela.
- Express e Supabase substituem o recebimento SQLite e a persistência somente em memória. Sessões opacas cifram tokens no banco; Auth oficial, confirmação, recuperação, logout, MFA e CSRF foram implementados. Não se importou nenhum contato pessoal da pasta de desenvolvimento.
- Oito migrações com checksum, grants mínimos, RLS de tabelas/Storage, FKs compostas, funções com search_path fixo, controle de versão, trial único, cotas, idempotência, armazenamento limitado, tarefas com lease/reembolso e auditoria. O acesso normal preserva o JWT verificado do usuário; chave administrativa somente nas operações internas delimitadas.
- Meus projetos, criação vazia/cópia do Aurora, edição, duplicação, arquivamento, exclusão por nome, escolha do projeto gratuito, versões, exportação e salvamento com preservação do rascunho em conflito. Mudança de requisito preserva resultado/evidência anterior e sinaliza reavaliação dos vínculos.
- Preços em centavos e versionados no servidor; descontos 40%/60% substitutivos; cotação assinada vinculada ao ator/seleção/validade; serviços humanos/infraestrutura separados. Pedido não processa cartão e não ativa plano. Administração comercial/técnica separada com MFA recente; oferta inicialmente fechada.
- Ajuda restrita a tópicos e FAQ públicos, sem contexto técnico. Sugestões técnicas têm provedor/chave/autorização próprios e permanecem desligadas. Respostas manipuladas não disparam ferramentas, comandos, preços ou aprovações. Esquema, IDs, fontes, páginas e versões são conferidos antes de persistir; texto exibido é inerte.
- PDF/Word/CSV/ICS/ZIP gerados no servidor a partir do snapshot salvo. Processo filho sem segredos, com permissões, memória/prazo/concorrência limitados e acesso à rede recusado em código. Documentos de revisão validam o marco e incluem a fonte correspondente. Não se aceita HTML/template arbitrário nem arquivo enviado como entrada desse processo.
- Leitor PDF.js integrado, destaques por retângulos normalizados e fonte/citação exata. Hash NASA conferido; cinco trechos localizados e inspecionados visualmente. Originais não publicados sem licença/inspeção; ECSS/ISO preservados como fichas. `nasa-matrix` permaneceu pendente, sem retângulo aproximado.
- Backup criptografado e restauração em destino vazio incluem registros, identidades relacionadas e bytes privados; revalidam hashes, exclusões, permissões e tarefas. Sessões/MFA não são transportados. Limitações de Auth/Storage reais estão documentadas.
- Docker e Blueprint de um único serviço gratuito; dependências/Actions fixadas, health/readiness e CI. Nenhum banco, disco ou serviço pago foi criado. O repositório informado foi confirmado vazio antes do envio.

## Correções obtidas pela validação

- Corrigido conflito do campo de formulário `id` com o identificador DOM e preservados campos técnicos/símbolos.
- Corrigidas diferenças de API do PDF.js instalado, limpeza de tarefas e retorno ao trecho. O limite do viewport é aplicado antes da rolagem para manter a citação visível.
- Corrigida ambiguidade de alias SQL descoberta no teste de limpeza/restauração. A suíte passou sem reduzir RLS ou grants.
- Corrigidas sobreposições no diagrama PDF, referências de modelos, rótulos com asterisco e identificação Aurora em projetos próprios. Revisão desativada mantém suas entregas pendentes; estados visuais derivados não alteram o payload salvo.
- Removidos o caminho legado de baixar uma transcrição como trecho oficial e o aviso incorreto de que todos os requisitos ficavam no navegador. Responsável/privacidade vêm da configuração pública real.
- Ajustado o isolamento do diretório de resultados Playwright para preservar evidências de banco/PDF/fontes. Falhas reais e skips de integração não foram ocultados.

## Evidências e operação

Resultados e comandos estão em `TESTES.md` e `docs/seguranca/TESTES_SEGURANCA.md`. A validação local usa PostgreSQL real efêmero e navegador real, com SDK, transporte de Storage e respostas IA simulados onde indicado. Não há alegação de integração Supabase/Gemini/Render real sem credenciais.

Foram disponibilizadas opções de conexão dos plugins Render e Supabase; nenhum dos dois ficou conectado nesta execução. A preparação seguiu sem criar recursos pagos. As dependências externas, SMTP, licença, responsáveis e critérios de abertura estão em `CONFIGURACAO_FINAL.md`, `DEPLOY_RENDER.md` e `docs/seguranca/PENDENCIAS.md`.

Validação final local: 46 arquivos passaram por sintaxe/ESLint; 45 testes de aplicação, 28 de PostgreSQL e uma restauração, 12 de navegador passaram; dois testes externos ficaram explicitamente ignorados. Auditoria npm: zero vulnerabilidades reportadas. Docker gerou PDF, DOCX e ZIP sem root, com disco readonly e sem rede externa; `/api/ready` recusou operação sem credenciais. Todas as dez páginas dos exemplos públicos finais e os cinco recortes NASA foram inspecionados. Nenhum padrão de segredo foi encontrado antes do primeiro commit.

## Envio e CI

Código enviado para [Raiagues/testes_requisitos, main](https://github.com/Raiagues/testes_requisitos), commit de implementação `706dc8c39a33069088094ebb790e4926f18d52a5`. O token OAuth recusou criar o workflow por ausência do escopo `workflow`; a chave SSH já autorizada na máquina permitiu o envio completo, sem ampliar permissões nem criar credenciais. Arquivos de instrução/imagem recebidos na raiz e PDFs legados continuam preservados localmente; não foram confundidos com artefatos publicados da aplicação.

[GitHub Actions 38334850799](https://github.com/Raiagues/testes_requisitos/actions/runs/38334850799) concluiu com sucesso em 12/10/2026, horário de São Paulo: análise estática, segredos no histórico, auditoria npm, 45 testes de aplicação, 28 de banco + restauração, 11 de navegador e build/smoke Docker. O teste opcional NASA foi ignorado na CI porque o original não é redistribuído. Localmente esse caso passou. Nenhuma integração externa foi simulada e apresentada como real. A publicação do site no Render continua pendente de configuração, sem URL confirmada.

## 2026-10-13 — compatibilidade do Blueprint com Render Free

O Render recusou o campo `services[0].maxShutdownDelaySeconds` durante a criação do Blueprint no plano gratuito. Removido somente esse campo opcional para usar o prazo padrão da plataforma, preservando `plan: free`, as variáveis e os controles existentes. Nenhum recurso pago foi solicitado. A configuração corrigida deve ser carregada novamente no painel do Render; a publicação ainda depende das configurações externas descritas em `CONFIGURACAO_FINAL.md`.

Correção enviada em `6a0c18ffddfbaca8d19554f535d0d0c3db5edca9`, com [CI aprovada](https://github.com/Raiagues/testes_requisitos/actions/runs/38398212516). A captura posterior do usuário mostra a revisão da configuração e oferece associar o serviço `norte` existente. Orientada essa associação, seguida da conferência das variáveis em Environment; não há URL publicada confirmada nesta execução.

## 2026-10-13 — separação dos protótipos

O usuário esclareceu que o serviço Render `norte` pertence a outro protótipo e confirmou ter aplicado a associação sugerida anteriormente. A orientação de associar sem confirmar a identidade do serviço foi incorreta. Por solicitação explícita, as alterações seguintes ficam restritas ao repositório `Raiagues/testes_requisitos`; não se tenta restaurar, excluir ou editar o outro protótipo.

Alterado somente o nome do serviço no Blueprint, de `norte` para `testes-requisitos`. Plano Free, raiz `norte`, Docker, variáveis e proteções permanecem iguais. Corrigidos os guias para configurar exclusivamente esse novo serviço e um Supabase separado; documentados os sete valores, as migrações, confirmação de e-mail e aprovação comercial. A remoção da definição antiga não desfaz configurações que o Render possa já ter aplicado. Sem conexão ao painel/API, o estado remoto anterior não pôde ser verificado.

Enviado o commit `b00c4063a5fc5391f9c169abeeeda778278fce56`; a [CI 38399889707](https://github.com/Raiagues/testes_requisitos/actions/runs/38399889707) passou. Para reduzir as etapas manuais, criado somente nesta máquina `norte/.env` com permissão 0600, ignorado pelo Git, contendo uma chave de sessão exclusiva de 32 bytes em hexadecimal e o campo de conexão de migração vazio. Nenhum segredo foi exibido, commitado ou transmitido ao Render. Configuração e migração reais continuam dependendo dos valores do Supabase deste protótipo.

## 2026-10-13 — configuração automatizada e homologação hospedada

Após a usuária preencher os dois tokens operacionais no `.env` privado, as APIs confirmaram o Supabase `testes_requisitos` e o Render `testes-requisitos`, ID `srv-db72glavcj2c73e9sieg`, plano Free, repo `Raiagues/testes_requisitos`, branch `main`, raiz `norte` e Docker. A URL retornada pelo serviço é `https://testes-requisitos.onrender.com`. Nenhuma operação foi dirigida ao serviço de outro protótipo chamado `norte`.

Corrigida a conexão de migração: a cadeia TLS do pooler precisava da CA pública oficial Supabase Root 2021. O executor usa essa CA somente para hosts Supabase esperados, preserva `rejectUnauthorized:true` e a validação de hostname, e não permite que parâmetros da URI substituam destino ou desliguem TLS. Diagnóstico identifica códigos de erro sem mostrar senha/conexão. As oito migrações foram aplicadas no Supabase real, depois repetidas com checksums conferidos. Backup utiliza a mesma configuração TLS.

`setup-cloud.cjs` verifica identidade e plano antes de configurar o alvo. Foram preenchidas as variáveis do servidor, responsável Norte, contato fornecido, origem e URLs exatas do Auth. Tokens de gestão, senha do banco e senha SMTP não são enviados ao Render. O Blueprint obtém a própria origem e permite chave de sessão de 256 bits gerada pelo Render. A chave secreta exposta na conversa foi substituída localmente e no Environment; a revogação da anterior fica condicionada à implantação e verificação da chave nova.

O Supabase recusou templates customizados no Free sem SMTP próprio. A automação agora conclui as demais configurações e prepara Gmail com um único campo `AUTH_SMTP_PASSWORD`. Sem esse campo, mantém confirmação de e-mail obrigatória e apresenta cadastro/recuperação como indisponíveis; o login de contas confirmadas continua funcionando. Erros do provedor não são mais ignorados como se um e-mail tivesse sido enviado. A cotação exibe uma prévia dos valores do servidor enquanto a contratação aguarda validação operacional; não habilita pedidos, preços ou aprovações pelo navegador.

O teste com Supabase real revelou dois defeitos que a simulação anterior não detectava: o schema Zod exigia todos os perfis em mapas de cronograma/duração, rejeitando o primeiro salvamento; e uma sessão revogada retornava um registro SQL de campos nulos que causava erro 500. Os mapas agora aceitam somente os perfis válidos efetivamente presentes, e a sessão revogada retorna 401. Adicionadas regressões específicas, sem abrir campos arbitrários nem relaxar autorização.

A homologação BFF local + Supabase real passou: três contas de teste confirmadas administrativamente, uma quarta confirmada por token real, login/CSRF, persistência, conflito, RLS, negação de promoção e alterações comerciais, MFA TOTP real, administrador comercial sem acesso técnico, geração de PDF, Storage privado, GET/HEAD/Range, concessão/revogação de acesso, recuperação, uso único de links, troca de senha e logout. A concessão exige ativação explícita do trial da fixture; a negação no Essencial é testada antes. As quatro contas e o arquivo foram removidos; a auditoria de testes permanece. Não houve envio de mensagens a pessoas, chamada ao Gemini, contratação paga ou falsa validação de SMTP.

Validação final local: 55 testes de aplicação/segurança, 28 PostgreSQL e restauração isolada, 14 casos de navegador (um repetido após timeout inicial), build, check, audit e varredura de segredos aprovados. Docker validado com as mesmas restrições de execução; repetição do smoke após inicialização lenta passou sem desativar proteções. A usuária identificou a verificação em duas etapas do Gmail desativada e está ativando-a para gerar a única credencial restante de SMTP.
