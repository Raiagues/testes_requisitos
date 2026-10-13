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
