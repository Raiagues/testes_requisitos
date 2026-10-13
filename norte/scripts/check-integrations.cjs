async function main() {
  if (!process.env.GEMINI_API_KEY) { throw new Error('Configure GEMINI_API_KEY no terminal operacional.'); }
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY},signal:AbortSignal.timeout(12000),redirect:'error'});
  if (!response.ok) { throw new Error('Não foi possível consultar os modelos desta conta.'); }
  const data = await response.json();
  const models = (data.models || []).filter(model => model.supportedGenerationMethods?.includes('generateContent') && !/preview|experimental|latest|exp-/i.test(model.name));
  console.log(models.map(model => model.name.replace('models/','')).join('\n'));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
