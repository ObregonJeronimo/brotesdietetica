/**
 * Servidor estatico minimo para desarrollo local (sin dependencias).
 * Replica los rewrites de vercel.json para que /admin, /politicas, /mayoristas
 * funcionen igual que en produccion.
 *
 *   node dev-server.js         -> http://localhost:5173
 *   node dev-server.js 8080    -> http://localhost:8080
 *
 * NO se usa en produccion: Vercel sirve los archivos estaticos directamente.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.argv[2] || '5173', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.woff2': 'font/woff2',
};

/* Mismos rewrites que vercel.json */
const REWRITES = {
  '/': '/index.html',
  '/admin': '/admin.html',
  '/politicas': '/politicas.html',
  '/mayoristas': '/mayoristas.html',
  '/resena': '/resena.html',
  /* El sembrador se llama setup-inicial.html desde que reemplazo a seed.html: este rewrite
     apuntaba a un archivo que ya no existe, asi que /seed daba 404 en local.
     FALTA TAMBIEN EN vercel.json: el bloque de headers con "source": "/seed(.*)" (noindex +
     no-store) hay que pasarlo a "/setup-inicial(.*)", porque hoy la pagina de sembrado se
     sirve sin esas cabeceras y un proxy o el navegador la pueden cachear. */
  '/setup-inicial': '/setup-inicial.html',
};

http.createServer((req, res) => {
  let pathname = decodeURIComponent(req.url.split('?')[0]);
  if (REWRITES[pathname]) pathname = REWRITES[pathname];

  const filePath = path.join(ROOT, path.normalize(pathname).replace(/^([/\\])+/, ''));
  /* No servir nada fuera del proyecto */
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - ' + pathname);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Brotes Dietetica -> http://localhost:' + PORT);
});
