# Resposta a incidentes

Usar somente operadores autorizados e evidência necessária. Não copiar conteúdo de clientes, chaves ou respostas completas da IA para issues, analytics ou ferramentas externas.

## Conter

1. Na administração técnica com TOTP recente, desligar IA e/ou geração conforme o incidente. As flags persistem no banco e são revalidadas no processamento. Uploads/importação já permanecem fechados. Se a administração estiver indisponível, um operador autorizado pode ajustar `norte_controls` pelo SQL Editor privado, registrando quem, quando e por quê; não conceder acesso de emergência a usuários.
2. Suspender a conta afetada em `norte_accounts.suspended` e no Auth, ou remover somente a concessão afetada de `norte_access`. Revogar suas sessões BFF com `select public.norte_revoke_sessions('UUID_DA_CONTA');` usando conexão operacional privilegiada. Requisições futuras revalidam o acesso; bytes já baixados não podem ser recolhidos.
3. Se a integridade de uma fonte falhar, manter `suspended=true`, bloquear novas análises e conferir bytes/hash/edição/licença em área privada. Não substituir silenciosamente o original aprovado ou fabricar um novo hash para fazer passar.
4. Se houver suspeita de comprometimento do servidor ou da chave privilegiada, suspender o serviço afetado no Render. Não confiar apenas em RLS contra uma chave que possui bypass. Preservar os registros mínimos de auditoria antes de qualquer limpeza.

## Investigar

Correlacionar `requestId`, horário, ator, projeto, evento/resultado e tarefa/lease nas tabelas de auditoria, alertas e jobs. Alertas técnicos não dão acesso automático ao conteúdo do projeto. Acesso de investigação a dados exige autorização específica.

Reproduzir o caso com fixtures sintéticas em homologação. Para IA, salvar a saída manipulada sintética no teste e verificar o efeito real em API, banco, arquivos e chamadas de rede. Não considerar uma frase de recusa como correção.

Eventos têm retenção de 90 dias, auditoria de 180 dias e alertas de 90 dias. A limpeza depende do worker ativo. Contatos/pedidos não têm uma política comercial de exclusão automática inventada: o responsável deve definir a retenção aplicável. Conservar tombstones necessários para impedir reintrodução de dados por backups.

## Rotacionar e recuperar

- Revogar a chave afetada no painel do provedor e preencher a nova em Render → Environment. Credenciais de Supabase, Gemini, Resend, conexão operacional e chave de backup são independentes.
- Comprometimento de `SESSION_ENCRYPTION_KEY`: revogar todas as sessões Norte, rotacionar a chave e exigir novo login. Não basta mudar a chave e assumir que tokens já emitidos foram revogados no Auth.
- Segredo em commit/imagem: revogar primeiro; retirar o artefato exposto e avaliar histórico/caches com o proprietário do repositório. A varredura deve confirmar o conteúdo acessível; apagar só o arquivo atual não remove o histórico.
- Restaurar em outro ambiente vazio seguindo [DEPLOY_RENDER.md](../../DEPLOY_RENDER.md), com registro de exclusões mais recente que o backup. Destino inicia com IA, geração, oferta e outbox pausadas; sessões e fatores MFA antigos não são reaproveitados.
- Confirmar permissões, integridade dos objetos, exclusões, cancelamento e devolução única de reservas. Não reprocessar pedidos/e-mails já entregues nem ativar plano por restaurar um registro de intenção.

## Retomar

Adicionar regressão que reproduza a falha, executar testes relevantes e obter evidência no serviço real afetado. Reabrir somente aquele fluxo quando a causa estiver corrigida. Registrar duração, impacto confirmado, dados potencialmente envolvidos, ações e lacunas restantes. Comunicação aos envolvidos cabe ao responsável real do serviço, sem contato ou prazo legal inventado por esta implementação.
