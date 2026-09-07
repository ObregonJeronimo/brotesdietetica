/**
 * ARRANQUE DEL SANDBOX
 * =============================================================================
 * Lo corre `npm run sandbox`, ya con el emulador levantado. Hace dos cosas:
 *
 *   1. siembra los datos inventados
 *   2. levanta el servidor local y se queda esperando
 *
 * Mientras este proceso viva, el emulador vive. Al cortarlo con Ctrl+C se apaga
 * todo y los datos desaparecen: el emulador no guarda nada en disco.
 * =============================================================================
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

function correr(archivo, args) {
  return new Promise((ok, err) => {
    const p = spawn(process.execPath, [archivo].concat(args || []),
      { cwd: RAIZ, stdio: 'inherit' });
    p.on('exit', c => (c === 0 ? ok() : err(new Error(archivo + ' salió con ' + c))));
  });
}

/* Si ya hay un `npm run dev` andando, el 5173 está ocupado y el servidor se caía
   con un volcado de Node -EADDRINUSE- que no le dice nada a nadie. Se busca el
   primero libre y se avisa cuál se usó. */
function libre(puerto) {
  return new Promise((ok) => {
    const s = net.createServer();
    s.once('error', () => ok(false));
    s.once('listening', () => s.close(() => ok(true)));
    /* Sin host, igual que dev-server.js: escuchar en 127.0.0.1 y escuchar en
       todas las interfaces no son lo mismo, y probar de una forma para despues
       escuchar de la otra daba el puerto por libre cuando no lo estaba. */
    s.listen(puerto);
  });
}

async function elegirPuerto() {
  const pedido = Number(process.env.PUERTO_SANDBOX) || 5173;
  for (const p of [pedido, pedido + 1, pedido + 2, pedido + 3]) {
    if (await libre(p)) return { puerto: p, movido: p !== pedido };
  }
  throw new Error('No hay ningún puerto libre entre ' + pedido + ' y ' + (pedido + 3) + '.');
}

(async () => {
  console.log('\n  ---------------------------------------------------------');
  console.log('   SANDBOX  ·  base de prueba, nada de esto es real');
  console.log('  ---------------------------------------------------------\n');

  await correr(path.join(__dirname, 'sembrar.js'));

  const { puerto, movido } = await elegirPuerto();
  if (movido) {
    console.log('  OJO: el 5173 estaba ocupado -tenés otro servidor andando-,');
    console.log('       así que el sandbox va por el ' + puerto + '.\n');
  }
  console.log('  Entrá a  http://localhost:' + puerto + '/sandbox');
  console.log('  Panel del emulador:  http://localhost:4000');
  console.log('  Cortá con Ctrl+C cuando termines. No queda nada guardado.\n');

  /* El servidor queda en primer plano: mientras no termine, emulators:exec no
     apaga el emulador. */
  const srv = spawn(process.execPath, [path.join(RAIZ, 'dev-server.js'), String(puerto)],
    { cwd: RAIZ, stdio: 'inherit',
      env: Object.assign({}, process.env, { MODO_SANDBOX: '1' }) });
  srv.on('exit', c => process.exit(c || 0));
  process.on('SIGINT', () => { srv.kill(); process.exit(0); });
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
