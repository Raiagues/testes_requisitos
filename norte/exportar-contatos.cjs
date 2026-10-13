console.error('Contatos ficam no Supabase e são visíveis somente à administração comercial autenticada com MFA. SQLite e exportação local foram desativados. Use o backup criptografado autorizado para recuperação.');
process.exitCode = 1;
