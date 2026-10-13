# Testes de segurança executados

Ambiente: máquina local autorizada, Node 24.20.0, PostgreSQL 17 efêmero e Chromium do Playwright. Contas, requisitos e arquivos sintéticos. Não houve varredura ou ataque a infraestrutura de terceiros. Resultados consolidados em [TESTES.md](../../TESTES.md); logs e capturas em `test-results/`.

## Fronteira atacada e efeito observado

| Suíte | Tentativas e resultado verificado |
| --- | --- |
| `tests/api.test.cjs` | Express real com SDK simulado: IDs alheios em projeto, exportação, tarefa e GET/HEAD/Range recusados antes de ler arquivo privilegiado; sessão opaca sem JWT; origem/CSRF forjados negados; administração sem MFA negada |
| `tests/security.test.cjs` | Provedor deliberadamente adulterado: JSON inválido, campos extras, ferramenta/shell/SQL, alteração comercial, aprovação/execução, requisito/fonte/citação alheios, versão antiga, página inválida e trecho falso recusados |
| `tests/api.test.cjs` | Resposta adulterada pela rota técnica não produz gravação de análise válida nem ação privilegiada; ajuda captura somente tópico/FAQ e recusa corpo com projeto, e-mail, papéis ou histórico |
| `tests/database.cjs` | PostgreSQL real: RLS de contas distintas, RPCs/grants, escrita direta proibida, dono imutável, vínculo por chave composta, pesquisa/listagem, concessões e expiração; administrador comercial sem acesso técnico |
| `tests/database.cjs` | Concorrência de projetos/trial/reservas, conflitos de versão, repetição de pedido, retry após lease, devolução única de cota, slots de IA, espaço por conta/global e suspensão operacional |
| `tests/boundaries.test.cjs` | DNS público fixado na conexão; rebinding sem segunda consulta, IP interno/IPv6/metadata/redirect negados; conteúdo/tamanho de download restritos; cotação adulterada ou de outro ator/seleção/versão/validade recusada |
| `tests/documents.test.cjs` | PDF e DOCX reais: texto técnico Unicode, XML inerte, multipáginas sem páginas vazias, manifesto do ZIP, limite de concorrência; URL em texto não alcança canário HTTP local |
| `tests/browser/*.spec.cjs` | Navegador real: XSS inerte, sem requisição externa; PDF sintético com JavaScript, metadados e anotação maliciosos não executa nem rastreia; pesquisa/zoom/rotação e seleção exata de coluna |
| `tests/api.test.cjs` | Uploads com MIME/path/conteúdo ativo/estrutura abusiva são recusados pelo bloqueio do fluxo antes de extrair ou processar; ausência de scanner nunca libera o arquivo |
| `tests/restore.cjs` | Segundo PostgreSQL vazio + adaptador Storage simulado: autenticação de backup cifrado, hashes/bytes, tombstones, cancelamento/reembolso, políticas/gatilhos preservados e conteúdo excluído inacessível |

Não há endpoint de miniatura ou recorte privado desprotegido: recortes são canvas locais do original obtido pela rota autenticada. Não há URL assinada duradoura nem cache compartilhado de conteúdo privado. O teste HTTP de Range usa SDK simulado; políticas Storage e RLS foram executadas no contrato SQL local. O servidor Storage gerenciado ainda precisa ser exercitado.

## IA simulada e dados legítimos

Os ataques substituem a saída do modelo, sem esperar que um prompt convença o modelo a recusar. Não há interpretador de comandos nem dispatcher de ferramentas no consumidor da resposta. Asserções verificam rejeição de estrutura e ausência de efeitos/gravações; as políticas SQL são verificadas independentemente. Uma resposta aceita ainda é sugestão, sem aprovação nem aplicação automática.

Casos legítimos em português/inglês incluem linguagem normativa, system/command/instructions, unidades, desigualdades, letras gregas, aspas e títulos longos. Passaram sem alterar silenciosamente o texto. Isso não mede toda a população de entradas legítimas nem elimina a possibilidade de falso bloqueio. Conteúdo suspeito mantém edição/exportação manual.

A ajuda recebe um enum, nunca a frase digitada nem o contexto da página. A integração técnica monta apenas requisitos autorizados e citações conferidas, não histórico, metadados de PDFs ou credenciais. Chave da ajuda não é fallback da chave técnica. URL/modelo não são escolhidos pela resposta da IA.

## Serviços externos: explicitamente não verificados

`npm run test:real` possui dois testes condicionais, ignorados sem `.env.test` e autorização de um projeto de homologação. O primeiro usa duas contas sintéticas confirmadas para Supabase Auth/RLS/Storage. O segundo exige `RUN_REAL_GEMINI=true` além da configuração anterior: um tópico público, uma tentativa, temperatura zero; registra modelo escolhido na conta. Nenhuma chamada real Gemini foi executada nesta entrega.

Ainda faltam evidências reais de SMTP/entrega, confirmação e recuperação, refresh/revogação de Auth, TOTP, Storage HTTP/Range, Resend, interrupção/retomada no Render e restauração entre projetos Supabase. Não se declara que o contrato local substitui essas verificações.

## Ferramentas e repetição

```bash
npm run build
npm run check
npm test
npm run test:db
npm run test:browser
npm run test:real
npm run scan:secrets
npm audit --audit-level=moderate
```

O scanner procura padrões em fontes, build e histórico Git acessível; não imprime valores. Ausência de padrões e resultado limpo do catálogo npm não provam ausência universal de segredos/vulnerabilidades. CI usa dependências e Actions fixadas, permissões de leitura e artefatos sintéticos com sete dias de retenção. O teste do original NASA é local e opcional; a CI sem esse arquivo registra skip.

## Homologação externa em 13/10/2026

Separação de evidências:

- **Simulados:** respostas manipuladas do provedor IA e cenários de SSRF/erros do provedor. A saída do modelo continua incapaz de chamar ferramentas, SQL, shell, outros projetos, alterar preços ou aprovações. Nenhuma chamada real ao Gemini foi realizada.
- **Locais reais:** PostgreSQL efêmero com contratos de Auth/Storage, Chromium e geração PDF/DOCX; o transporte de Storage no teste de restauração continua simulado.
- **Supabase hospedado real:** `tests/real/hosted.test.cjs` passou com Auth, MFA TOTP, JWT, RLS, RPC, PostgreSQL TLS e Storage privados. BFF inicialmente local. Inclui recuperação, confirmação e uso único de links sem enviar e-mail; isso não valida SMTP. Fixtures removidas (4 usuários, projetos e 1 arquivo); auditoria mantida.
- **Render:** configuração feita por API após verificar ID, repo, branch, raiz, runtime e plano Free. A evidência do teste sobre o endereço publicado é registrada separadamente em EXECUCAO.md, sem confundir a homologação local com deploy.

Os ensaios encontraram dois defeitos de funcionalidade: mapas de enum do Zod exigiam todos os perfis, e uma sessão removida vinha como objeto SQL com campos nulos. Regressões específicas verificam salvamento de projeto vazio e retorno 401 após revogação. Os schemas continuam estritos para nomes de perfis e demais campos. A correção não libera ações, contas ou envio de e-mail sem configuração.

Migração: CA oficial com fingerprint fixado, validade conferida, `rejectUnauthorized:true` e verificação de hostname. Tests tentam `sslmode=disable`, `no-verify`, substituição de host via query string e cadeias/hosts divergentes. O modo sem TLS só existe para localhost explícito no teste efêmero. Segredos operacionais permanecem fora do repositório, build e imagem. A varredura também cobre padrões de tokens de gestão Supabase/Render.
