# Fontes, versões e limites do mapeamento

Conferência em 12/10/2026. Catálogo, síntese Norte, modelo de trabalho e publicação oficial são objetos distintos. Nenhum PDF oficial integra a imagem Docker ou o repositório. Os PDFs públicos de REQ, RTM e CRN são exemplos identificados da Missão Aurora, gerados pela Norte.

## Referências prioritárias

| Fonte e edição conferida | Uso implementado | Situação do original |
| --- | --- | --- |
| [NASA/SP-2016-6105 Rev. 2, dezembro de 2016](https://www.nasa.gov/reference/systems-engineering-handbook/) | Orientação de redação e verificação; cinco citações do apêndice C localizadas no PDF | Conferência local; redistribuição e ingestão ainda pendentes |
| [NPR 7123.1D, Change 2, 05/07/2023](https://nodis3.gsfc.nasa.gov/displayDir.cfm?t=NPR&c=7123&s=1D) | Produtos e maturidade das revisões, conforme condições do NPR | Metadados; sem PDF hospedado ou trechos marcados como conferidos |
| [ECSS-E-ST-10C Rev. 1, 15/02/2017](https://ecss.nl/standard/ecss-e-st-10c-rev-1-system-engineering-general-requirements-15-february-2017/) | Correspondência orientativa dos modelos com DRDs | Metadados; reprodução e indexação não habilitadas |
| [ECSS-E-ST-10-06C, 06/03/2009](https://ecss.nl/standard/ecss-e-st-10-06c-technical-requirements-specification/) | Especificação técnica, cláusulas 7 e 8 e anexo A | Metadados; licença pendente |
| [ECSS-E-ST-10-02C Rev. 1, 01/02/2018](https://ecss.nl/standard/ecss-e-st-10-02c-rev-1-verification-1-february-2018/) | Plano, controle e relatórios de verificação, conforme método | Metadados; licença pendente |
| [ECSS-M-ST-10-01C, 15/11/2008](https://ecss.nl/standard/ecss-m-st-10-01c-organization-and-conduct-of-reviews/) | Preparação, registros e ações de revisão | Metadados; licença pendente |

O handbook é orientação. A aplicabilidade do NPR depende do seu escopo, do contrato e das decisões da equipe. Selecionar NASA ou ECSS não cria obrigação universal nem comprova conformidade. O catálogo original de outras referências foi preservado como fichas; não representa análise integral implementada.

## Conferência dos anexos ECSS

Conferidos os PDFs primários das quatro edições acima. Em E-ST-10C Rev. 1, os DRDs B–L, N–P são normativos; A e R são informativos. M foi eliminado; Q foi substituído pelo S informativo. A matriz de entregas de A não deve ser transformada em calendário universal obrigatório.

Em E-ST-10-06C, o anexo A é o DRD normativo da especificação técnica. Referências cruzadas à edição de E-ST-10 então vigente precisam de reconciliação antes de usar cláusulas da revisão de 2017.

Em E-ST-10-02C Rev. 1, A e B tratam de VP e VCD; C–F são DRDs normativos de relatórios por método/combinação. G foi eliminado. A análise referencia o relatório de análise de E-ST-10, anexo S informativo. O modelo Norte de resultados não reúne automaticamente todas as exigências desses relatórios.

Em M-ST-10-01C, A–D são normativos; E e F são informativos. Correspondências usadas: procedimento 5.3.2.a/A; RID 5.6.c/B; relatório da equipe 5.3.4.d/C; autoridade 5.5.6.b(6)/D. Uma ata Norte orientativa não substitui esses conteúdos nem a decisão da autoridade.

## Licença e autorização operacional

O [acordo ECSS](https://ecss.nl/license-agreement-disclaimer/) não foi tratado como autorização automática de redistribuição comercial. ECSS e ISO permanecem sem cópias, indexação integral ou transmissão a modelos. Registrar evidência real de direitos no catálogo técnico; uma decisão administrativa não substitui a licença do titular.

As [orientações NASA de uso de mídia](https://www.nasa.gov/nasa-brand-center/images-and-media/) exigem atenção a materiais de terceiros. O handbook contém créditos, inclusive de imagens da capa. Os trechos técnicos conferidos não resolvem os direitos sobre a distribuição do arquivo inteiro. Por isso `license_status=pending`, `checked=false` e `storage_path` vazio continuam fechando seu acesso na aplicação.

O administrador técnico com MFA pode registrar a condição de licença e a permissão de IA. Essa ação não marca um arquivo como inspecionado nem preenche seu caminho. A importação de novos originais continua retornando erro controlado enquanto não houver inspeção e isolamento operacionais. Não contornar esse bloqueio publicando o bucket.

## Evidência de paginação e destaques

Arquivo NASA obtido do [endereço oficial](https://www.nasa.gov/wp-content/uploads/2018/09/nasa_systems_engineering_handbook_0.pdf): 297 páginas; SHA-256 `8eeb4887a4dc57a23049da7dd2ed556833cf98e214b240468d987873164ff688`. Os bytes ficaram somente no ambiente local de conferência. A migração 008 registra metadados e coordenadas, sem distribuir o original.

| Citação | Página impressa | Índice do PDF, base zero | Estado |
| --- | --- | --- | --- |
| `nasa-form` | 197 | 206 | Texto integral e retângulos conferidos |
| `nasa-clarity` | 198 | 207 | Texto integral e retângulos conferidos |
| `nasa-rationale` | 198 | 207 | Texto integral e retângulos conferidos |
| `nasa-trace` | 199 | 208 | Texto integral e retângulos conferidos |
| `nasa-verification` | 200 | 209 | Texto integral e retângulos conferidos |
| `nasa-matrix` | — | — | Localização não confirmada; nenhum destaque publicado |

`scripts/verify-source.cjs` exige correspondência integral única na página esperada, guarda contexto e calcula caixas dos itens de texto. Normalização ocorre em uma cópia para comparação. As cinco capturas foram conferidas visualmente. PDF.js aplica as coordenadas ao viewport real, inclusive zoom e rotação; conteúdo ambíguo ou inválido não recebe destaque aproximado. O teste com bytes NASA usa transporte local simulado, não o Storage hospedado.

## Modelos e decisões da equipe

`codigo/engineering-data.js` preserva a definição dos modelos; `server/documents.cjs` e `document-content.cjs` geram PDF/Word por estruturas controladas. REQ, RTM e CRN usam dados salvos; os demais modelos combinam registros disponíveis e campos explicitamente pendentes. Não são documentos automaticamente completos ou aprovados. Fontes adotadas, versões, justificativa e responsável entram no snapshot e no manifesto do pacote.

O projeto adota cada edição por decisão explícita versionada. Documentos indicam aplicação a confirmar, referência adotada, exigência da empresa ou opcional. Retirar uma revisão mantém suas entregas como pendentes de reatribuição. A obrigação pode se referir a conteúdo dentro de outro documento; a interface não presume um arquivo separado para cada DRD.

Uma edição nova deve receber outro identificador, licença/hash e conferência próprios. A migração do projeto exige adoção explícita e avaliação dos itens vinculados. Não substituir arquivos em uma edição existente nem promover metadados a análise implementada.

Fontes DejaVu distribuídas em `assets/fonts/`, com licença preservada. Dependências e versões estão em `package-lock.json`.
