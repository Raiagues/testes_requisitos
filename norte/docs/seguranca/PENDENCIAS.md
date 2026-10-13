# Pendências e bloqueios de liberação

Estado em 12/10/2026. A aplicação, migrações e testes locais existem. Não há implantação Render nem projeto Supabase hospedado validado nesta execução. Nenhum serviço pago foi provisionado.

| Dependência externa | Efeito atual | Ação do responsável |
| --- | --- | --- |
| Supabase próprio, segredos e aplicação das migrações | Contas/projetos persistentes indisponíveis sem configuração | Preencher variáveis e executar `npm run migrate`, conforme `CONFIGURACAO_FINAL.md` |
| Render conectado, origem HTTPS e deploy | Sem URL publicada | Criar o Blueprint gratuito, preencher Environment e validar `/api/ready` |
| SMTP do Auth e domínio de envio | Cadastro público e recuperação não homologados | Configurar remetente, templates TokenHash e URLs permitidas; testar entrega real |
| Administradores, TOTP, responsável e contato reais | Oferta não liberada | Atribuir papéis por UUID no banco, cadastrar MFA, preencher `SERVICE_OWNER`/`PRIVACY_CONTACT` e revisar a oferta |
| Homologação de Supabase/Render | Sem evidência de isolamento/recuperação nos serviços hospedados | Executar testes reais com contas sintéticas, incluindo Auth, Storage, MFA, reinício e restore |
| Inspeção e isolamento de arquivos | Uploads/importação continuam indisponíveis por código | Definir e implementar pipeline privado aprovado antes de reabrir; não publicar bucket nem desativar a verificação |
| Direitos sobre originais e ingestão | Apenas fichas/sínteses; leitor exato aguardando original autorizado | Resolver licença e conferir hash, edição, bytes, paginação e inspeção; ECSS/ISO sem redistribuição |
| Provedor/modelo Gemini aprovados | Ajuda local funciona; IA externa desativada | Validar termos, público/região, modelo da conta e orçamento; habilitar somente o fluxo autorizado |
| Resend opcional | Pedidos persistem, aviso fica pendente | Configurar domínio, remetente, chave e destino; confirmar entrega real |
| Retenção e operação de backup | Exportador/restaurador local testados; rotina externa não agendada | Armazenar backups cifrados e chave separadamente; definir retenção e testar recuperação real |

Detalhes e nomes exatos: [CONFIGURACAO_FINAL.md](../../CONFIGURACAO_FINAL.md) e [DEPLOY_RENDER.md](../../DEPLOY_RENDER.md). Segredos devem ser preenchidos no painel/terminal protegido, nunca em conversa ou commit.

## Limites conhecidos

- `trust proxy=false` evita aceitar cabeçalhos arbitrários, mas pode agregar os usuários sob o IP do proxy Render. Ajustar somente após comprovar a topologia, mantendo limites por conta e globais.
- O renderizador possui limite de heap, prazo, concorrência, permissões de arquivo/processo e não recebe segredos. Recusa rede por código controlado. Não há isolamento de rede por SO de um parser arbitrário; por isso uploads permanecem fechados.
- O backup lógico cobre registros Norte, usuários/identidades relacionados e bytes dos buckets Norte, com limite de 512 MiB. Não exporta MFA, sessões ou toda configuração gerenciada de Auth. É necessário recadastrar MFA e homologar o destino isolado.
- Leases e cotas sobrevivem ao reinício; a latência de retomada após sono do Render gratuito ainda não foi medida. Não há promessa de disponibilidade contínua.
- Tetos de chamadas, tokens de saída e concorrência reduzem consumo; não são limite monetário garantido. Configurar orçamento/alertas no provedor antes de habilitar IA.
- Logs locais evitam conteúdo técnico e segredos. Redação/retenção de URLs de confirmação nos logs dos provedores precisa de verificação operacional.
- Cinco trechos NASA foram conferidos localmente. `nasa-matrix` permanece sem localização exata. Fichas de outras fontes não indicam interpretação integral implementada.
- Modelos avançados são rascunhos com lacunas explícitas, não entregas certificadas. Classificação regulatória exige avaliação competente. Sugestão de IA não prova que uma citação sustenta a conclusão.

Falha real de autorização, exposição de segredo, execução indevida ou vazamento entre contas impede abrir o recurso afetado. Revisão independente antes de receber documentos confidenciais continua recomendada; esta entrega não a substitui. Nesta versão, documentos privados não são enviados ao Gemini e dados sujeitos a restrições não são aceitos em processamento externo.
