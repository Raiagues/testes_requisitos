const tls = require('node:tls');
async function verifyGmail(settings) {
  return new Promise((resolve,reject) => {
    const socket = tls.connect({host:'smtp.gmail.com',port:465,servername:'smtp.gmail.com',rejectUnauthorized:true});
    let buffer = ''; let stage = 0; let finished = false;
    function finish(error) { if (finished) { return; } finished = true; socket.destroy(); if (error) { reject(error); } else { resolve(true); } }
    socket.setTimeout(15000,() => finish(new Error('SMTP: tempo de conexão excedido.')));
    socket.on('error',() => finish(new Error('SMTP: conexão TLS indisponível.')));
    socket.on('close',() => { if (!finished) { finish(new Error('SMTP: conexão encerrada antes da autenticação.')); } });
    socket.on('data',chunk => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'); const line = buffer.slice(0,end); buffer = buffer.slice(end + 2);
        if (!/^\d{3} /.test(line)) { continue; }
        const code = Number(line.slice(0,3)); const expected = [220,250,235][stage];
        if (code !== expected) { finish(new Error('SMTP: autenticação não concluída (código ' + code + ').')); return; }
        if (stage === 0) { stage = 1; socket.write('EHLO testes-requisitos.invalid\r\n'); }
        else if (stage === 1) { stage = 2; const token = Buffer.from('\0' + settings.smtp_user + '\0' + settings.smtp_pass).toString('base64'); socket.write('AUTH PLAIN ' + token + '\r\n'); }
        else { socket.write('QUIT\r\n'); finish(); return; }
      }
    });
  });
}
module.exports = {verifyGmail};
