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
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PUERTO = process.env.PUERTO_SANDBOX || '5173';

function correr(archivo, args) {
  return new Promise((ok, err) => {
    const p = spawn(process.execPath, [archivo].concat(args || []),
      { cwd: RAIZ, stdio: 'inherit' });
    p.on('exit', c => (c === 0 ? ok() : err(new Error(archivo + ' salió con ' + c))));
  });
}

(async () => {
  console.log('\n  ---------------------------------------------------------');
  console.log('   SANDBOX  ·  base de prueba, nada de esto es real');
  console.log('  ---------------------------------------------------------\n');

  await correr(path.join(__dirname, 'sembrar.js'));

  console.log('  Panel del emulador:  http://localhost:4000');
  console.log('  Cortá con Ctrl+C cuando termines. No queda nada guardado.\n');

  /* El servidor queda en primer plano: mientras no termine, emulators:exec no
     apaga el emulador. */
  const srv = spawn(process.execPath, [path.join(RAIZ, 'dev-server.js'), PUERTO],
    { cwd: RAIZ, stdio: 'inherit' });
  srv.on('exit', c => process.exit(c || 0));
  process.on('SIGINT', () => { srv.kill(); process.exit(0); });
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
