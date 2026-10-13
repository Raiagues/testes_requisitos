# Configuração que depende do responsável pela Norte

Nenhum segredo deve ser colocado em uma conversa, commit ou arquivo público. Os nomes abaixo são os usados pelo código. Não há uma URL Render publicada nesta execução.

Este guia é exclusivo de **Raiagues/testes_requisitos → serviço Render testes-requisitos**. O serviço antigo chamado **norte** pertence a outro protótipo. Use também um projeto Supabase exclusivo de `testes_requisitos`; não substitua as chaves nem execute migrações no banco do outro protótipo.

O código já está em [Raiagues/testes_requisitos, branch main](https://github.com/Raiagues/testes_requisitos), com [CI aprovada](https://github.com/Raiagues/testes_requisitos/actions/runs/38334850799). Isso é publicação do código, não implantação da aplicação.

## Para contas, projetos e documentos persistentes

1. No Supabase, selecione ou crie um projeto exclusivo chamado `testes-requisitos`, no plano gratuito. No botão **Connect**, copie a Project URL; em **Settings → API Keys**, obtenha as chaves Publishable e Secret desse mesmo projeto. Não é necessário girar as chaves do outro Norte. [Localização das chaves](https://supabase.com/docs/guides/getting-started/api-keys#find-your-keys).
2. Em **Supabase → Connect → Session pooler**, copie a conexão PostgreSQL com TLS e substitua o marcador da senha pela senha desse banco. Coloque-a em `MIGRATION_DATABASE_URL` no arquivo local e ignorado pelo Git `norte/.env`. Execute `npm run migrate` dentro de `norte/`, uma vez para preparar esse banco. Nunca coloque essa conexão no serviço web. As oito migrações já foram executadas e verificadas em PostgreSQL temporário; a aplicação no Supabase hospedado continua dependendo dessa conexão.
3. No Render, abra o Blueprint ligado a `Raiagues/testes_requisitos` e use **Manual Sync** se ele ainda não carregou o arquivo corrigido. Abra o novo serviço **testes-requisitos**, mantendo o plano **Free**. A definição corrigida não contém o serviço antigo `norte`. Para uma primeira criação, use **New → Blueprint**, branch `main`, arquivo `render.yaml`; não associe um protótipo diferente. Siga [DEPLOY_RENDER.md](DEPLOY_RENDER.md).
4. Em **Render → testes-requisitos → Environment → Add Environment Variable**, preencha os sete valores:

| Nome | Tipo | Valor a obter/configurar |
| --- | --- | --- |
| `SITE_URL` | Público | Endereço HTTPS exibido no topo do serviço **testes-requisitos**, sem barra final |
| `SUPABASE_URL` | Público | Project URL em **Supabase → projeto testes-requisitos → Connect** |
| `SUPABASE_PUBLISHABLE_KEY` | Publicável | Chave publicável daquele projeto; RLS continua obrigatório |
| `SUPABASE_SECRET_KEY` | Segredo | Chave administrativa, exclusivamente no servidor |
| `SESSION_ENCRYPTION_KEY` | Segredo | 32 bytes aleatórios em 64 caracteres hexadecimais; gerar localmente com `openssl rand -hex 32` |
| `SERVICE_OWNER` | Público | Nome real do responsável pelo serviço |
| `PRIVACY_CONTACT` | Público | Canal real para privacidade e pedidos sobre dados |

`NODE_ENV=production` já consta no Blueprint. `PORT` é fornecida pelo Render. Ausência de configuração impede operações protegidas; a exploração pública do Aurora continua disponível. A oferta comercial também exige responsável e contato preenchidos.

Gere o valor de `SESSION_ENCRYPTION_KEY` no terminal com `openssl rand -hex 32` e copie a saída somente para o Environment desse serviço. Depois de preencher todos os valores, clique em **Save, rebuild, and deploy**. Não use o botão de geração automática de segredo do Render para este campo: a aplicação exige o formato hexadecimal acima.

Nesta máquina, a chave de sessão já foi gerada em `norte/.env`, arquivo privado ignorado pelo Git. Copie somente o valor de `SESSION_ENCRYPTION_KEY` desse arquivo para o campo correspondente do Render; não é necessário gerar outra chave. `MIGRATION_DATABASE_URL` continua em branco para ser preenchida com a conexão do Supabase exclusivo deste protótipo.

O arquivo `norte/.env` precisa conter somente a conexão para essa etapa de migração:

```dotenv
MIGRATION_DATABASE_URL="COLE_A_CONEXAO_SESSION_POOLER_DE_TESTES_REQUISITOS"
```

No computador que contém este repositório, execute:

```bash
cd /home/rodriger/Documents/testes_requisitos/norte
npm run migrate
```

Após o deploy, abra o endereço real do novo serviço seguido de `/api/ready`. A resposta `{"ready":true}` confirma configuração básica e acesso à tabela de configuração do banco; não substitui o teste de cadastro, confirmação de e-mail e salvamento. Nenhuma URL do protótipo antigo é necessária para configurar este.

## E-mail de cadastro e recuperação

Em **Supabase → Authentication → URL Configuration**, use `SITE_URL` e permita somente `SITE_URL/auth/confirm` como redirecionamento. Não use curingas em produção.

Em **Authentication → Email / SMTP Settings**, configure um remetente e um provedor SMTP próprio, verifique o domínio e os registros exigidos pelo provedor. Mantenha a confirmação de e-mail ligada e configure senha mínima de 12 caracteres. O SMTP padrão do Supabase é limitado e não valida a entrega pública do produto. [Documentação de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Para um primeiro teste pessoal, o SMTP padrão pode enviar somente para os endereços autorizados da equipe da organização Supabase, dentro da cota do provedor. Para usuários externos, configure SMTP próprio. Não é necessário contratar Gemini, Resend ou outro serviço pago para iniciar a edição de projetos.

Em **Authentication → Email Templates**, o link deve usar o hash de confirmação consumido pelo BFF:

```html
<!-- Confirm signup -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirmar conta</a>
<!-- Reset password -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Recuperar acesso</a>
```

O navegador envia o hash por POST com CSRF e remove a consulta do endereço. Testar entrega, expiração, repetição do link, recuperação e logout com contas sintéticas antes da abertura pública. Confirmar a retenção/redação dos logs de acesso do provedor para que URLs de confirmação não sejam copiadas para analytics.

## Administração e oferta

Cadastre e confirme as contas administrativas. Em **Supabase → SQL Editor**, atribua explicitamente o UUID correto:

```sql
insert into norte_private.admins(user_id, role)
values ('UUID_DA_CONTA_CONFIRMADA', 'commercial');
-- Para a administração técnica, use outra conta e role 'technical'.
```

Na aplicação, abra **Meus projetos → Segundo fator**, cadastre TOTP e confirme um código recente. Depois abra **Administração**. Metadados de perfil não atribuem cargo.

O administrador comercial revisa preços, campanha, limites, feedbacks e pedidos e marca a oferta como validada somente após homologar o serviço. O Profissional só é ativado em pedido confirmado, por ação administrativa explícita. Não existe cobrança automática nem gateway de pagamento.

O administrador técnico controla IA, geração, catálogo, evidências de licença, limite de armazenamento e alertas. Acesso técnico a um projeto requer concessão explícita; ser administrador não abre os projetos dos clientes. Consulte [FONTES_E_LICENCAS.md](FONTES_E_LICENCAS.md).

## Integrações opcionais

| Integração | Onde configurar | Variáveis usadas |
| --- | --- | --- |
| Aviso comercial por e-mail | Resend: domínio e remetente verificados; Render: Environment | `RESEND_API_KEY`, `EMAIL_FROM`, `LEADS_EMAIL` |
| Gemini para ajuda pública | Google AI Studio / projeto Google; Render: Environment; Administração técnica: permitir IA | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_HELP_APPROVED=true` |
| Gemini para sugestões técnicas públicas | Aprovação separada do provedor e dos dados; Render: Environment; catálogo e projeto autorizados | `REQUIREMENTS_AI_PROVIDER=gemini`, `REQUIREMENTS_GEMINI_API_KEY`, `REQUIREMENTS_GEMINI_MODEL`, `REQUIREMENTS_AI_APPROVED=true` |

Sem Resend, os pedidos continuam no banco com aviso pendente. Sem Gemini, a ajuda usa FAQ local e as demais funções continuam disponíveis. `REQUIREMENTS_AI_PROVIDER=none` é o padrão.

Execute `node --env-file=.env scripts/check-integrations.cjs` para listar candidatos estáveis disponíveis na conta; confirme o modelo na [documentação oficial](https://ai.google.dev/gemini-api/docs/models). Nenhum modelo real foi escolhido sem acesso à conta. `AI_DAILY_CALL_LIMIT=100` e `AI_MAX_CONCURRENCY=2` são tetos operacionais da Norte, não cotas prometidas pelo Google. Configure também limites e alertas no projeto do provedor. Não se habilitou faturamento.

A ativação de Gemini depende de validar público, idade, região e tratamento de dados segundo os [termos consultados](https://ai.google.dev/gemini-api/terms). A configuração desta versão continua recusando análise externa de projetos privados ou restritos, mesmo com plano pago.

## Backup e homologação

Somente no terminal operacional: `BACKUP_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_DIRECTORY`, além das credenciais Supabase do servidor. A chave de backup é independente da chave de sessão. Restauração utiliza `RESTORE_DATABASE_URL`, `RESTORE_SUPABASE_URL`, `RESTORE_SUPABASE_SECRET_KEY`, `RESTORE_TARGET_ACK` e `RESTORE_DELETIONS_FILE`. Procedimento e limites em [DEPLOY_RENDER.md](DEPLOY_RENDER.md).

Para testes reais, copie `.env.test.example` para `.env.test`, em um projeto exclusivo de homologação. Preencha as duas contas sintéticas e confirme `REAL_TEST_ACK`. `npm run test:real` permanece explicitamente ignorado sem essa configuração. Não usar clientes reais como fixtures.

## Bloqueios atuais

- Render e Supabase ainda não estão conectados; faltam configuração e homologação externa de Auth, SMTP, RLS/Storage hospedados, MFA e recuperação. Não há endereço publicado confirmado.
- Uploads e importações de novos arquivos estão fechados no código: falta inspeção de arquivos e isolamento operacional apropriado. Selecionar um plano não libera esses caminhos.
- Originais oficiais aguardam licença e ingestão conferida. ECSS/ISO não são redistribuídos. O PDF NASA foi usado localmente para conferir citações; sua disponibilização comercial ainda está pendente.
- A oferta aguarda validação operacional, identidade do responsável e política organizacional de retenção/contato. O plano gratuito do Render serve à avaliação; sua suspensão por inatividade interrompe temporariamente o processamento de tarefas.

Não há obrigação de habilitar Gemini ou contratar ferramentas pagas para usar edição, cronograma, rastreabilidade e documentos por modelo.
