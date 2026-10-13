# Configuração de testes_requisitos

## Situação atual

Este protótipo usa exclusivamente o serviço Render **testes-requisitos** e o Supabase identificado em `scripts/setup-cloud.cjs`. O outro serviço chamado **norte** não recebe operações desta automação. A pasta `norte/` é apenas o diretório do código.

As migrações `001` a `008` foram aplicadas no Supabase real e repetidas com sucesso. As variáveis do servidor, responsável e contato foram preenchidos pela API do Render. A origem e os redirecionamentos foram configurados no Supabase. Não é necessário repetir essas etapas no painel. Evidências e estado da publicação: [EXECUCAO.md](EXECUCAO.md) e [TESTES.md](TESTES.md).

## Único acesso ainda necessário para os e-mails

No arquivo privado local `norte/.env`, preencher somente `AUTH_SMTP_PASSWORD` com uma **senha de app** da conta Gmail informada como contato da Norte. O campo já está preparado. Não usar a senha normal da conta nem enviar valores pela conversa.

1. Entrar na conta Google correspondente e abrir [Senhas de app](https://myaccount.google.com/apppasswords).
2. Ativar a verificação em duas etapas se o Google exigir; criar uma senha de app chamada Norte.
3. Colocar as 16 letras em `AUTH_SMTP_PASSWORD=` e avisar que terminou. A automação configura remetente, host, porta, templates e variáveis do serviço.

A disponibilidade de senhas de app depende das políticas da conta Google. Se não houver essa opção, será necessária uma credencial de outro provedor SMTP; não se contratou serviço pago. [Orientação do Google](https://support.google.com/accounts/answer/185833?hl=pt-BR).

O Supabase recusou, por API, a edição dos templates enquanto o projeto Free usa o provedor padrão. Esse provedor também restringe destinatários à equipe da organização. Cadastro e recuperação ficam explicitamente indisponíveis enquanto SMTP e templates não estiverem configurados; login de contas já confirmadas continua disponível. Não se desliga a confirmação de e-mail para contornar a limitação. [Limites oficiais de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Depois de configurado, é preciso confirmar a chegada de uma mensagem na caixa de destino. Validar tokens de confirmação pela API não comprova entrega SMTP.

## Operação automatizada

Com os acessos já presentes apenas no `.env` local, os comandos abaixo são para manutenção, não etapas adicionais a cargo da usuária:

```bash
cd norte
npm run setup:cloud -- plan
npm run migrate
npm run setup:cloud -- apply
```

`plan` confere nome, ID, repositório, branch, raiz, Docker, plano Free e projeto Supabase antes de qualquer alteração. `apply` atualiza somente as variáveis necessárias, preserva as demais, mantém confirmação e senha mínima de 12 caracteres e aplica templates quando houver SMTP próprio. O SMTP é usado pelo Supabase, não por conexões SMTP do Render gratuito. O Gmail é uma opção para avaliação sujeita aos limites da conta, não uma garantia de operação de alto volume.

| Variáveis | Local e tratamento |
| --- | --- |
| `SITE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Render; origem e identificadores públicos, preenchidos automaticamente |
| `SERVICE_OWNER`, `PRIVACY_CONTACT` | Render; identificação fornecida pela usuária, preenchida automaticamente |
| `SESSION_ENCRYPTION_KEY`, `SUPABASE_SECRET_KEY` | Segredos do Render; preenchidos automaticamente, nunca no build |
| `AUTH_EMAIL_READY` | Render; controlado pela automação após configuração SMTP e templates |
| `MIGRATION_DATABASE_URL` | Somente `.env` operacional; já preenchida e validada com TLS |
| `SUPABASE_ACCESS_TOKEN`, `RENDER_API_KEY` | Somente `.env` operacional; não enviados ao serviço web |
| `AUTH_SMTP_PASSWORD` | Somente `.env` operacional e configuração secreta do Supabase Auth |

A chave de sessão aceita 64 caracteres hexadecimais ou base64 canônico de exatamente 32 bytes, inclusive `generateValue` do Render. Valores fracos ou malformados são recusados. O certificado público do Supabase acompanha o executor de migrações; validação da cadeia e do hostname permanece obrigatória. Não acrescentar `rejectUnauthorized:false` nem `sslmode=no-verify`.

## Administração e oferta

A identidade pública do responsável não cria uma conta administrativa nem confirma um e-mail. A conta da responsável deve ser cadastrada e confirmada pelo fluxo normal. Depois de conferir a titularidade, um operador atribui o cargo comercial em `norte_private.admins`; a usuária não precisa executar SQL. É obrigatório cadastrar e confirmar o segundo fator em **Meus projetos → Segundo fator** para acessar **Administração**.

A prévia comercial mostra valores calculados pelo servidor. O envio de contratação continua fechado até a validação operacional da oferta; salvar pedido não cobra nem ativa plano. Alterações de preços, planos e aprovações exigem administrador autorizado com MFA recente. Não foram inventadas licenças, disponibilidade de revisores nem aprovação comercial para liberar o botão.

## Recursos opcionais e limites pendentes

- **IA:** desligada por padrão; ajuda local e verificações determinísticas funcionam. Gemini exige as chaves específicas de ajuda ou análise, modelo escolhido, aprovação de tratamento de dados e limites no provedor. Variáveis exatas em `.env.example`; nenhuma chamada paga foi habilitada.
- **Avisos de pedidos:** opcionais com `RESEND_API_KEY`, `EMAIL_FROM` e `LEADS_EMAIL` no Render. Sem eles, pedidos permanecem no banco; não há promessa de e-mail enviado.
- **Uploads/importação:** fechados até haver inspeção e isolamento operacionais. Edição manual e exemplos aprovados continuam disponíveis.
- **Originais de normas:** dependem de licenças e ingestão conferidas; fichas e referências disponíveis não equivalem a uma licença de redistribuição.
- **Backup hospedado:** exportação/restauração implementadas e testadas localmente; restauração entre dois projetos Supabase ainda requer destino isolado e política de retenção.

Controles, resultados reais e simulações estão separados em [docs/seguranca/TESTES_SEGURANCA.md](docs/seguranca/TESTES_SEGURANCA.md) e [docs/seguranca/PENDENCIAS.md](docs/seguranca/PENDENCIAS.md).
