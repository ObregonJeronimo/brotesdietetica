/**
 * LANZADOR CON JAVA
 * =============================================================================
 * El emulador de Firestore es un programa Java. Si `java` no está en el PATH de
 * la terminal, firebase-tools corta con:
 *
 *     Error: Could not spawn `java -version`
 *
 * Y eso pasa aunque Java esté perfectamente instalado: una terminal hereda el
 * entorno del proceso que la abrió, así que cualquier ventana que ya estuviera
 * abierta durante la instalación -o cualquier terminal embebida en un editor que
 * arrancó antes- sigue con el PATH viejo hasta que se la cierra.
 *
 * Es un error que cuesta reconocer, porque el mensaje dice "asegurate de que Java
 * esté instalado" y Java está instalado.
 *
 * Este lanzador lo busca solo: primero en el PATH, y si no está, en las carpetas
 * donde los instaladores lo dejan. Si lo encuentra, arma el entorno y corre el
 * comando. Así `npm run sandbox` y `npm run test:reglas` andan en cualquier
 * terminal, recién abierta o no.
 *
 *   node sandbox/con-java.js <comando> [argumentos...]
 * =============================================================================
 */
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/* ¿Ya está a mano? */
function javaEnPath() {
  const r = spawnSync('java', ['-version'], { stdio: 'ignore', shell: true });
  return r.status === 0;
}

/* Las carpetas donde termina un JDK en Windows. Se ordenan al revés para que,
   habiendo varias versiones, gane la más nueva. */
function buscarJava() {
  const base = process.env.LOCALAPPDATA || '';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const candidatos = [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : null,
    path.join(base, 'Programs', 'Eclipse Adoptium'),
    path.join(pf, 'Eclipse Adoptium'),
    path.join(pf, 'Java'),
    path.join(pf, 'Microsoft', 'jdk'),
    path.join(pf, 'Amazon Corretto'),
    path.join(pf, 'Zulu'),
  ].filter(Boolean);

  for (const c of candidatos) {
    if (!fs.existsSync(c)) continue;
    /* Si el candidato ya es un bin con java adentro, listo. */
    if (fs.existsSync(path.join(c, 'java.exe'))) return c;
    let hijos;
    try { hijos = fs.readdirSync(c).sort().reverse(); } catch (e) { continue; }
    for (const h of hijos) {
      const bin = path.join(c, h, 'bin');
      if (fs.existsSync(path.join(bin, 'java.exe'))) return bin;
    }
  }
  return null;
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('  Falta el comando a correr.');
  process.exit(1);
}

const entorno = Object.assign({}, process.env);

/* El emulador de funciones carga el modulo y espera a que declare que exporta.
   El limite por defecto son 10 segundos y en una maquina cargada no alcanza: se
   cae con "Cannot determine backend specification. Timeout after 10000", que
   suena a un error del codigo y no lo es -el modulo carga en un instante-. */
if (!entorno.FUNCTIONS_DISCOVERY_TIMEOUT) entorno.FUNCTIONS_DISCOVERY_TIMEOUT = '90';

if (!javaEnPath()) {
  const bin = buscarJava();
  if (!bin) {
    console.error('');
    console.error('  No encontré Java, y el emulador de Firebase lo necesita.');
    console.error('');
    console.error('  Instalalo desde https://adoptium.net  (Temurin JDK, Windows x64, .msi)');
    console.error('  y acordate de dejar tildado "Add to PATH".');
    console.error('');
    console.error('  Si ya lo instalaste: cerrá esta terminal y abrí una nueva.');
    console.error('  Las que ya estaban abiertas se quedan con el PATH viejo.');
    console.error('');
    process.exit(1);
  }
  entorno.Path = bin + path.delimiter + (entorno.Path || entorno.PATH || '');
  entorno.PATH = entorno.Path;
  if (!entorno.JAVA_HOME) entorno.JAVA_HOME = path.dirname(bin);
  console.log('  Java: ' + bin + '  (no estaba en el PATH de esta terminal)');
}

/* Se arma UNA cadena y no una lista. Con shell:true, Node pega los argumentos
   con espacios y sin comillas, asi que el argumento
   `node pruebas/reglas-cliente.js` -que ya venia sin comillas porque se las comio
   el shell de npm- se partia en dos y firebase se quejaba de "too many
   arguments". Se vuelven a poner las comillas a lo que tenga espacios. */
const comando = args
  .map(a => (/[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a))
  .join(' ');

const p = spawn(comando, { stdio: 'inherit', shell: true, env: entorno });
p.on('exit', (c, sig) => process.exit(sig ? 1 : (c || 0)));
