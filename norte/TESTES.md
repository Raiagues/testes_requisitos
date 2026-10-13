# Evidências de teste

Execução local em 12/10/2026. Dados sintéticos; nenhum ataque foi dirigido a serviços de terceiros.

| Verificação | Resultado observado | Limite da evidência |
| --- | --- | --- |
| `npm run build` | Interface, PDF.js, modelos e exemplos compilados | Ambiente local; também há build Docker |
| `npm run check` | Sintaxe, ESLint do servidor/scripts e ausência de scripts inline no HTML aprovados | Não é prova formal do código |
| `npm test` | 45 testes passaram | Provedor IA e SDK em testes HTTP usam simuladores explícitos |
| `npm run test:db` | 28 casos de banco + restauração passaram | PostgreSQL real; contratos Auth/Storage locais |
| `npm run test:browser` | 12 testes passaram no Chromium | Transporte autenticado e Storage de fixtures simulados |
| `npm run test:real` | 2 testes ignorados explicitamente | Sem credenciais de Supabase/Gemini de homologação |
| `npm audit` | Nenhuma vulnerabilidade reportada na consulta | Retrato do catálogo consultado, não garantia futura |
| `npm run scan:secrets` | Nenhum padrão detectado | Scanner por padrões e histórico Git acessível |
| Docker | Build e smoke test passaram: PDF, DOCX e ZIP, sem root, filesystem readonly, rede externa ausente | Publicação Render depende de conexão e configuração |
| GitHub Actions | [Execução 38334850799 aprovada](https://github.com/Raiagues/testes_requisitos/actions/runs/38334850799), commit `706dc8c` | 45 testes de aplicação, 28 de banco, restauração e 11 de navegador; original NASA ausente na CI gera um skip explícito |

## Banco, autorização e recuperação

O runner cria PostgreSQL temporário, executa as migrações e repete o executor para verificar idempotência. Usa contas A, B e administrativa, além de `anon`. Verifica leitura/busca, RPCs, atualização, exclusão, duplicação, versões, vínculos por FK composta, escrita direta de preços/planos e grants internos. Nenhuma consulta da conta B retorna o conteúdo da A.

Há concorrência em ativação de trial, criação e reserva de geração. Testam-se conflito de versão, limite de 50 requisitos, dez gerações no trial, chave idempotente, reembolso único, expiração, revogação de sessão/concessão, retomada de lease, resultado atrasado, slots globais de IA e reserva de armazenamento. Pedido salvo não ativa plano.

A restauração usa outro banco vazio; confere bytes, corrupção do backup criptografado, tombstones, tarefas canceladas, sessões ausentes e gatilhos/permissões após reconstrução. O adaptador que armazena os bytes no teste é simulado. Não foi apresentado como recuperação do serviço Supabase em produção.

`node scripts/smoke-container.cjs norte:verification` executou a imagem de produção com 512 MiB e 64 processos no máximo, sem capabilities, sem rede externa e com `/tmp` transitório. Gerou PDF (30.743 bytes), DOCX (13.794 bytes) e ZIP (42.506 bytes) de dados sintéticos. Saúde respondeu 200, prontidão sem credenciais respondeu 503 e `.env` respondeu 404. Os arquivos privados/de desenvolvimento não estavam na imagem.

## Respostas de IA deliberadamente manipuladas

Os casos substituem a resposta do provedor e tentam ferramentas/shell/SQL, outro projeto, outro requisito, fonte/citação inventada, página negativa, versão antiga, alteração comercial, aprovação, teste executado, trecho falso, segredo fictício e HTML/Markdown com rastreamento. Os validadores rejeitam e o teste HTTP verifica ausência de gravações ou ações privilegiadas. As permissões são testadas separadamente no PostgreSQL, sem depender de uma mensagem de recusa da IA.

A captura do corpo enviado ao provedor de ajuda contém somente tópico e FAQ aprovada. Chamadas diretas que incluem requisito, e-mail/contexto, papéis ou mensagens são rejeitadas. O adaptador técnico não recebe metadados, histórico, contatos ou credenciais; projetos privados/restritos ficam bloqueados. Entradas normativas legítimas PT/EN, palavras como command/instructions e símbolos não são alterados. Os casos executados não demonstram resistência universal a prompt injection.

## Interface, leitor e arquivos

Testados 1366×768, 1440×900, 1920×1080 e 390×844, temas claro/escuro, largura da tabela ao abrir detalhes, foco, teclado, redução de movimento, datas manuais, cadastro de requisito e conflito preservando o rascunho. O cartão indicado em `REFERENCIA_A_CORRIGIR.png` tem seções distintas e linhas documentais com padding real, sem categorias com asterisco.

PDF.js foi exercitado com PDF sintético contendo JavaScript, anotação externa e metadados maliciosos: nenhuma requisição de rastreamento. Texto repetido em duas colunas, pesquisa, zoom, quatro rotações e retorno ao trecho têm testes. O leitor desenha somente canvas e retângulos validados; não cria camada de formulários, scripts, anexos ou links ativos.

O handbook NASA foi obtido do endereço oficial autorizado para conferência local, com hash `8eeb4887a4dc57a23049da7dd2ed556833cf98e214b240468d987873164ff688` e 297 páginas. Cinco citações foram localizadas integralmente na página esperada; `nasa-matrix` ficou pendente porque a frase começa no meio de um item de texto. Não se publicou retângulo aproximado. O teste opcional local do original passa quando o arquivo autorizado e o relatório estão presentes; a CI o ignora quando não estão.

PDFs REQ, RTM e CRN foram rasterizados e todas as páginas dos exemplos foram inspecionadas. O cronograma foi corrigido para evitar sobreposição dos rótulos. Teste multipágina com 35 requisitos verifica texto selecionável, Unicode e ausência de páginas vazias. Word tem tabela com cabeçalho repetido e XML escapado; ZIP contém PDF e Word das entregas selecionadas, dados e manifesto. CSV neutraliza fórmulas e ICS escapa/folda linhas.

Evidências locais reproduzíveis: `test-results/`, incluindo `browser-results.json`, capturas, `pdf-visual/`, `pdfs/` e `sources/`. Esses artefatos não são publicados como arquivos oficiais de referência. A CI guarda somente fixtures e capturas sintéticas por sete dias.

A CI também concluiu análise estática, varredura do histórico Git, auditoria npm, build Docker e smoke test da imagem. Os logs completos desta execução estão em `test-results/github-ci-full.log` e no link acima. Commits posteriores restritos à documentação não alteram o código validado e não disparam repetição automática dessa suíte.

## Ainda não executado com serviços reais

Cadastro e entrega SMTP, confirmação/reutilização de link, recuperação, JWT/refresh/MFA hospedados, Storage HTTP real com HEAD/Range, envio Resend, retomada após sono do Render e restauração entre projetos Supabase. O modelo Gemini real também não foi chamado. O teste opcional registra modelo, temperatura zero, um caso de FAQ e uma tentativa; ele não cobre os ataques simulados nem avalia proteção universal.

Os comandos para esses testes e suas variáveis estão em `.env.test.example`, [CONFIGURACAO_FINAL.md](CONFIGURACAO_FINAL.md) e [docs/seguranca/TESTES_SEGURANCA.md](docs/seguranca/TESTES_SEGURANCA.md).

## 2026-10-13 — Blueprint do plano gratuito

Após a rejeição de `maxShutdownDelaySeconds` pelo painel do Render, o campo foi removido. Leitura do YAML com PyYAML passou, conferindo um único serviço, `plan: free`, `rootDir: norte` e ausência do campo incompatível; `git diff --check` passou. Essa checagem local não substitui a validação do Blueprint e a publicação no Render. O envio da alteração em `render.yaml` aciona novamente a suíte de CI existente.

A [CI 38398212516](https://github.com/Raiagues/testes_requisitos/actions/runs/38398212516) concluiu com sucesso para o commit `6a0c18ffddfbaca8d19554f535d0d0c3db5edca9`: build, análise estática, varredura de segredos, auditoria npm, testes de aplicação/banco/navegador e build/smoke Docker. Isso não comprova a configuração das integrações hospedadas. O painel enviado pelo usuário passou a exibir a revisão do Blueprint e a associação ao serviço existente, sem o erro anterior; a aplicação efetiva e o deploy ainda precisam ser confirmados no Render.
