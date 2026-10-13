# Norte

Preserve os quatro módulos, a identidade visual e os arquivos editáveis em `codigo/`.
O servidor é Express, com Supabase Auth, PostgreSQL e Storage privados. Nunca use SQLite, arquivos locais ou localStorage para dados duráveis.
Todas as operações de projeto usam a identidade verificada do usuário. Escritas passam por RPCs transacionais que também impõem cotas. Chaves privilegiadas só atendem tarefas internas delimitadas.
IA só produz sugestões estruturadas; nunca executa ferramentas, altera permissões, preços ou aprova resultados. Uploads ficam fechados até haver inspeção e isolamento operacionais.
Execute `npm run check`, `npm test`, `npm run test:db`, `npm run test:browser` e `npm run build`. Integrações externas exigem ambiente de teste próprio e devem ser identificadas separadamente.
Registre execução em `EXECUCAO.md`, testes em `TESTES.md` e controles em `docs/seguranca/`. Nunca registre segredos.
Use funções simples; mantenha chamadas em uma linha e extraia variáveis quando necessário.
