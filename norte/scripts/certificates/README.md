# CA pública do Supabase

`supabase-root-2021.crt` é um certificado público, não uma chave privada.

Obtido via HTTPS de `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt` em 2026-10-13. O endereço corresponde ao padrão `ssl:certificate_url` no [código oficial do painel Supabase](https://github.com/supabase/supabase/blob/6f36fe879bebb36bf6a95083af6205c524522933/apps/studio/hooks/custom-content/custom-content.json).

Impressão digital SHA-256: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`. Validade até 2031-04-26. A conexão mantém `rejectUnauthorized: true` e a verificação de hostname. A CA adicional só é usada nos endereços oficiais de PostgreSQL/Supavisor do Supabase; não muda a confiança TLS global da aplicação.
