const {readConfig} = require('./server/config.cjs');
const {createGateway} = require('./server/supabase.cjs');
const {createApp} = require('./server/app.cjs');
const {startWorker} = require('./server/jobs.cjs');
const config = readConfig();
const gateway = createGateway(config);
const app = createApp({config,gateway});
const server = app.listen(config.port,'0.0.0.0',() => console.log('Norte iniciada.'));
server.requestTimeout = 30000;
server.headersTimeout = 15000;
const stop = gateway ? startWorker(gateway,config) : () => {};
function shutdown() { stop(); server.close(); }
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
