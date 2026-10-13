# Publicação e operação

## Artefatos

Repositório solicitado: `https://github.com/Raiagues/testes_requisitos`. O Blueprint fica na raiz, com `rootDir: norte`. `Dockerfile` fixa Node 24.20.0 por digest, instala o lockfile, compila os arquivos de `codigo/` e executa como `node`, sem privilégios de root. Não há segredo de build, volume persistente ou navegador Chromium em produção.

```bash
cd norte
npm ci --ignore-scripts
npm run build
npm run check
npm test
npm run test:db
npx playwright install chromium
npm run test:browser
npm run scan:secrets
npm audit --audit-level=moderate
docker build -t norte:local .
node scripts/smoke-container.cjs norte:local
```

O executor local tem uma falha de sandbox anterior ao início dos comandos e a rede bridge do Docker não alcançou npm. O build foi validado com `docker build --network=host`; isso só afeta a instalação neste ambiente, não é configuração de rede de produção. Nenhum limite do renderizador foi removido.

## Banco

A conexão `MIGRATION_DATABASE_URL` foi configurada no arquivo privado local e as oito migrações foram aplicadas ao Supabase real em 13/10/2026. `npm run migrate` foi repetido sem duplicar registros. O executor utiliza a CA pública oficial do Supabase, além da cadeia padrão do Node, e exige validação do certificado e hostname. Origem e fingerprint da CA em `scripts/certificates/README.md`. A conexão e a senha não aparecem no diagnóstico de erro. O executor registra SHA-256 de cada migração e recusa uma migração já aplicada cujo conteúdo tenha mudado. Repetir o comando não duplica seeds. Migrações `001` a `008` criam os dados Norte, funções, permissões, buckets privados, limites e citações. Não substituem o serviço Auth/Storage do Supabase.

O teste `test:db` usa um PostgreSQL efêmero com contratos locais para `auth.uid()`, papéis e tabelas de Storage. Esses contratos **não** são migrações de produção. Nunca aplique `supabase/tests/bootstrap.sql` no Supabase.

Não armazene `MIGRATION_DATABASE_URL` nem `BACKUP_DATABASE_URL` no serviço web. Não execute migrações com uma identidade de usuário final. Não habilite `service_role` em um cliente de navegador.

## Render

Este repositório define somente o serviço **testes-requisitos**, com plano Free. O serviço **norte** que já existia no Render é outro protótipo e não deve ser associado a este repositório, receber suas variáveis ou ser renomeado. A pasta `norte/` continua sendo o diretório do código; isso não determina o nome do serviço no Render.

O serviço existente foi identificado pela API e suas variáveis foram preenchidas automaticamente. Não é necessário criar outro serviço, copiar sete variáveis nem associar o protótipo antigo. `scripts/setup-cloud.cjs` fixa o ID do alvo e recusa nome, repo, branch, raiz, runtime ou plano divergentes. `npm run setup:cloud -- plan` só consulta; `apply` configura este serviço e o Auth do Supabase correto. Veja o único campo pendente de SMTP em [CONFIGURACAO_FINAL.md](CONFIGURACAO_FINAL.md).

Para publicar um commit já testado e enviado ao GitHub, definir `DEPLOY_COMMIT` com o SHA completo e executar `npm run setup:cloud -- deploy`. A automação registra o identificador da implantação no `.env` privado. Conferir status `live`, SHA publicado, `/api/ready` e o teste hospedado. `revoke-previous-key` só revoga a chave substituída depois de conferir a variável remota, a implantação registrada e prontidão.

O Blueprint obtém a origem a partir do próprio serviço e permite chave de sessão gerada pelo Render em base64; o servidor valida exatamente 32 bytes. `sync: false` continua indicando segredo a preencher na criação; atualizações de segredos do serviço existente são feitas pela API, sem valores no Git. [Variáveis no Blueprint](https://render.com/docs/blueprint-spec).

`autoDeployTrigger: off` desliga deploys automáticos do código do serviço. A sincronização do Blueprint é uma configuração separada do Render e pode aplicar alterações em `render.yaml`. O serviço escuta `0.0.0.0:$PORT`. [Funcionamento dos Blueprints](https://render.com/docs/infrastructure-as-code).

A associação anterior ao serviço `norte`, confirmada pelo usuário, pode já ter aplicado mudanças nele. A remoção dessa definição do Blueprint não restaura configurações anteriores e não exclui o serviço. Não foram executados rollback, exclusão nem alteração de chaves do protótipo antigo; seu estado remoto não foi consultado nem alterado nesta configuração, por orientação expressa da usuária.

- Saúde: `/api/health`, sem dados sensíveis.
- Prontidão: `/api/ready`, verifica configuração e acesso ao banco; precisa responder 200 antes da abertura das contas.
- Interface e API têm a mesma origem. Não é necessário CORS para outras origens.
- Sessões, cotas, tarefas, pedidos e arquivos residem no Supabase. O disco temporário do Render só contém processos e dados transitórios.
- Verifique o hostname real antes de preencher `SITE_URL` e os redirecionamentos do Auth. O endereço `https://testes-requisitos.onrender.com` foi obtido diretamente do serviço autorizado na API do Render.

`trust proxy` permanece `false`: cookies Secure dependem do ambiente e URLs usam somente `SITE_URL`, nunca os cabeçalhos encaminhados. Isso impede falsificação de `X-Forwarded-*`, mas o limite por IP pode agregar visitantes sob o proxy do Render. Os limites por conta e globais permanecem no banco. Antes de ampliar o tráfego, conferir o caminho real do proxy e seus cabeçalhos em homologação; não alterar para `true` indiscriminadamente. [Express atrás de proxy](https://expressjs.com/en/guide/behind-proxies/).

O Blueprint usa explicitamente `plan: free`, porque omitir o plano pode selecionar capacidade paga. Não provisiona recursos pagos. O plano gratuito pode dormir após inatividade, possui recursos limitados e não é promessa de operação contínua. Tarefas persistem e retomam com lease após o serviço acordar. SMTP de Auth roda no provedor, e os avisos comerciais usam HTTPS; não dependem das portas SMTP bloqueadas no Render gratuito. [Limitações](https://render.com/docs/free), [Blueprint](https://render.com/docs/blueprint-spec).

Não defina `maxShutdownDelaySeconds`: o Render recusa essa personalização no plano gratuito. O Blueprint utiliza o prazo padrão da plataforma.

Supabase, e-mail e Gemini têm limites e condições próprios. Validar consumo e eventual orçamento nos painéis antes de abrir vendas. Os valores do Profissional são oferta inicial editável, não prova de margem operacional. Nenhum recurso externo pago foi criado.

## Backup e restauração isolada

`npm run backup` produz um arquivo AES-256-GCM em `BACKUP_DIRECTORY`, com modo 0600. Ele contém tabelas Norte, usuários e identidades de Auth vinculados à Norte e bytes dos três buckets, com SHA-256 por objeto. Inclui dados pessoais e hashes de senha: manter a chave separada, acesso restrito e armazenamento operacional protegido. Limite deste exportador: 512 MiB de objetos por execução; dimensionar outro processo para volumes maiores.

Sessões, refresh tokens e leases não são exportados. MFA não é transportado entre instâncias: revalidar a recuperação de identidade e recadastrar fatores no destino isolado antes de liberar a administração. O mecanismo não substitui o backup completo do serviço gerenciado. [Backups Supabase não incluem bytes do Storage](https://supabase.com/docs/guides/platform/backups).

```bash
npm run backup
node --env-file=.env scripts/backup.cjs deletions /caminho-protegido/exclusoes.enc
node --env-file=.env scripts/backup.cjs restore /caminho-protegido/norte-BACKUP.enc
```

Para restaurar, configure as variáveis `RESTORE_*`; `RESTORE_TARGET_ACK` deve coincidir com o hostname do banco de destino. Use outro projeto Supabase, sem usuários, projetos ou objetos Norte, com a mesma versão do esquema e sem tráfego. `RESTORE_DELETIONS_FILE` deve apontar para um registro criptografado de exclusões mais recente que o backup. O script recusa sobreposição de um ambiente com usuários.

A cópia roda em transação SQL. Somente os gatilhos de usuário das tabelas Norte são suspensos durante a reconstrução de registros históricos, e são reativados antes do commit; RLS, grants e chaves estrangeiras não são desligados. Isso evita que a cópia de auditoria dispare novos alertas e que a restauração reserve novamente cotas históricas. Não é um modo de processamento do serviço web. Falhas fazem rollback do banco; objetos já enviados ao destino isolado precisam ser removidos desse destino antes de repetir.

Ao concluir: cancelar tarefas antigas e devolver reservas uma vez; esvaziar contexto de tarefas; pausar outbox; desligar IA, geração e oferta; aplicar tombstones de exclusão; conferir os hashes após upload. Homologue RLS, login, arquivos, MFA e elegibilidade antes de habilitar o destino. Não reenvie a outbox pausada sem conferir quais mensagens já chegaram.

O teste local restaurou um segundo banco PostgreSQL vazio e bytes em um adaptador Storage simulado, com testes de integridade, revogação e tombstones. A restauração de Supabase hospedado e suas configurações de Auth ainda precisa de homologação real. Não há garantia de exclusão de backups antigos sem uma política operacional efetivamente aplicada.
