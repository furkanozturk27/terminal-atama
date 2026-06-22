// Vecta Atama - Electron ana süreç.
// dist klasörünü 127.0.0.1 üzerinde küçük bir HTTP sunucusuyla servis eder
// (WASM/web worker'lar file:// altında çalışmadığı için), sonra pencerede açar.
const { app, BrowserWindow, shell } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

const DIST = path.join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/') urlPath = '/index.html';
        const filePath = path.normalize(path.join(DIST, urlPath));
        if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
        fs.readFile(filePath, (err, data) => {
          if (err) {
            // SPA geri dönüşü
            fs.readFile(path.join(DIST, 'index.html'), (e2, d2) => {
              if (e2) { res.writeHead(404); res.end('Not found'); }
              else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d2); }
            });
            return;
          }
          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
          res.end(data);
        });
      } catch (e) {
        res.writeHead(500); res.end('Server error');
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function createWindow() {
  let url;
  try {
    const port = await startServer();
    url = `http://127.0.0.1:${port}/`;
  } catch (e) {
    url = 'data:text/html,<h2>Sunucu başlatılamadı</h2>';
  }
  const win = new BrowserWindow({
    width: 1320,
    height: 920,
    backgroundColor: '#f8fafc',
    title: 'Vecta Atama — Terminal Kadıköy',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  // Harici linkleri tarayıcıda aç
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(url);
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
