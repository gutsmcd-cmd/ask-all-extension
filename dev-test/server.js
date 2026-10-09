// TEST ONLY: one HTTPS server that pretends to be every chat site (chosen by Host header).
const https = require('https');
const fs = require('fs');
const path = require('path');
const logs = [];
// Self-signed certificate for the fake sites, kept OUTSIDE the extension folder
// (Chrome warns about .pem files inside an unpacked extension). Needs openssl.
const CERT_DIR = path.join(require('os').tmpdir(), 'askall-mock-cert');
if (!fs.existsSync(path.join(CERT_DIR, 'key.pem'))) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  require('child_process').execSync('openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=mock"', { cwd: CERT_DIR, stdio: 'ignore' });
}
const byHost = {
  'grok.com': 'grok.html', 'chatgpt.com': 'chatgpt.html', 'claude.ai': 'claude.html',
  'gemini.google.com': 'gemini.html', 'www.meta.ai': 'meta.html', 'chat.deepseek.com': 'deepseek.html'
};
const srv = https.createServer({ key: fs.readFileSync(path.join(CERT_DIR, 'key.pem')), cert: fs.readFileSync(path.join(CERT_DIR, 'cert.pem')) }, (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  if (req.url === '/__log' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { logs.push(JSON.parse(b)); res.end('ok'); }); return;
  }
  if (req.url === '/__logs') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(logs)); }
  if (req.url === '/__reset') { logs.length = 0; return res.end('ok'); }
  if (req.url === '/__mock/common.js') { res.setHeader('content-type', 'text/javascript'); return res.end(fs.readFileSync(path.join(__dirname, 'mocks/common.js'))); }
  if (req.url.startsWith('/favicon')) { res.statusCode = 404; return res.end(); }
  const f = byHost[host];
  if (!f) { res.statusCode = 404; return res.end('unknown host ' + host); }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(__dirname, 'mocks', f)));
});
srv.listen(8443, '127.0.0.1', () => console.log('mock server on 8443'));
