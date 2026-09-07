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
/* Lo prende sandbox/arrancar.js. Cambia una sola cosa: /admin pide confirmacion
   antes de servir el panel que apunta a la base real. */
const SANDBOX = process.env.MODO_SANDBOX === '1';

/* Solo la propia maquina, salvo que se pida lo contrario.
   Escuchaba en TODAS las interfaces, que es el default de Node cuando no se le
   dice host. Eso significaba que cualquiera en la misma red -un wifi compartido,
   un locutorio, la conexion de un cliente- podia abrir /admin, que es el panel
   que apunta a la base REAL. Para hacer algo hacia falta una cuenta de admin, asi
   que no era un agujero de datos, pero es superficie que no hace falta.
   Para probar la tienda desde el celular en la misma red:  ABRIR_EN_LA_RED=1 */
const HOST = process.env.ABRIR_EN_LA_RED === '1' ? '0.0.0.0' : '127.0.0.1';

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
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
};

/* Mismos rewrites que vercel.json */
const REWRITES = {
  '/': '/index.html',
  '/admin': '/admin.html',
  '/politicas': '/politicas.html',
  '/mayoristas': '/mayoristas.html',
  '/resena': '/resena.html',
  /* El sandbox: el MISMO admin.html, con otro archivo de configuracion. Ver
     firebase-config.sandbox.js. Se resuelve mas abajo, no aca, porque hay que
     reescribir el contenido y no solo cambiar de archivo. */
  /* El sembrador se llama setup-inicial.html desde que reemplazo a seed.html: este rewrite
     apuntaba a un archivo que ya no existe, asi que /seed daba 404 en local.
     FALTA TAMBIEN EN vercel.json: el bloque de headers con "source": "/seed(.*)" (noindex +
     no-store) hay que pasarlo a "/setup-inicial(.*)", porque hoy la pagina de sembrado se
     sirve sin esas cabeceras y un proxy o el navegador la pueden cachear. */
  '/setup-inicial': '/setup-inicial.html',
};

http.createServer((req, res) => {
  const pedida = decodeURIComponent(req.url.split('?')[0]);
  let pathname = pedida;
  if (REWRITES[pathname]) pathname = REWRITES[pathname];

  const filePath = path.join(ROOT, path.normalize(pathname).replace(/^([/\\])+/, ''));
  /* No servir nada fuera del proyecto */
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  /* ---------------------------------------------------------------- SANDBOX
     Se sirve admin.html tal cual esta en disco, cambiando UNA linea: cual es el
     archivo de configuracion de Firebase. El panel no se toca ni se copia, asi
     que lo que se ve en /sandbox es exactamente lo que ve la clienta.

     Esto vive en dev-server.js a proposito, que esta en .vercelignore: en
     produccion la ruta /sandbox no existe y firebase-config.sandbox.js no se
     publica. */
  /* -------------------------------------------------- EL PANEL REAL, CON AVISO
     Cuando el servidor lo levanto el sandbox, /admin sigue existiendo y sigue
     apuntando a la base de la clienta. Eso es una trampa: se corre
     `npm run sandbox`, se escribe /admin de costumbre, y se termina mirando -o
     tocando- datos reales creyendo que son de prueba. La unica senal era la
     chapa amarilla, que se nota cuando ya entraste.

     Asi que en modo sandbox /admin no se sirve derecho: primero se pregunta. */
  if (SANDBOX && (pedida === '/admin' || pedida === '/admin/') && !/[?&]igual=1/.test(req.url)) {
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    res.end('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
      '<title>Ojo: este es el panel real</title><style>' +
      'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'background:#12151b;color:#e8edf4;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;padding:2rem}' +
      '.c{max-width:560px;text-align:center}h1{font-size:1.3rem;margin:0 0 .8rem}' +
      'p{color:#8d9aad;margin:0 0 1rem}b{color:#e8edf4}' +
      'a{display:inline-block;text-decoration:none;border-radius:9px;padding:.65rem 1.1rem;' +
      'font-weight:600;margin:.3rem}' +
      '.s{background:#4ea774;color:#0d1116}.r{background:#2a1c1c;color:#e0655f;border:1px solid #e0655f}' +
      '.n{font-size:.82rem;color:#6c7889;margin-top:1.4rem}</style></head><body><div class="c">' +
      '<div style="font-size:2.4rem">🛑</div>' +
      '<h1>Pediste <b>/admin</b>, que es el panel real</h1>' +
      '<p>Tenés el sandbox andando, pero esta dirección se conecta a la base de ' +
      '<b>la clienta</b>. Lo que toques acá le pasa a ella de verdad.</p>' +
      '<a class="s" href="/sandbox">Ir al sandbox</a>' +
      '<a class="r" href="/admin?igual=1">Entrar al panel real igual</a>' +
      '<p class="n">Esto solo aparece mientras corre <b>npm run sandbox</b>. ' +
      'Con <b>npm run dev</b>, /admin entra derecho como siempre.</p>' +
      '</div></body></html>');
    return;
  }

  if (pedida === '/sandbox' || pedida === '/sandbox/') {
    fs.readFile(path.join(ROOT, 'admin.html'), 'utf8', (err, html) => {
      if (err) { res.writeHead(500).end('no pude leer admin.html'); return; }
      const marca = 'firebase-config.js';
      if (html.indexOf(marca) < 0) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('admin.html ya no carga ' + marca + ': hay que actualizar el sandbox.');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME['.html'],
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      res.end(html.replace(marca, 'firebase-config.sandbox.js'));
    });
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
}).listen(PORT, HOST, () => {
  console.log('Brotes Dietetica -> http://localhost:' + PORT +
    (HOST === '0.0.0.0' ? '   (ABIERTO A LA RED LOCAL)' : ''));
});
