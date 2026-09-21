/**
 * EL SEMBRADOR DEL SANDBOX CORRE ENTERO.
 *
 * El 14/09, al rehacer los pedidos de prueba, se borró sin querer prepararDepuracion
 * y main() la seguía llamando. `node --check` no lo ve -solo mira la sintaxis- y el
 * sandbox abierto ya estaba sembrado: el error recién iba a aparecer la próxima vez
 * que alguien sembrara, por ejemplo al armar el sandbox en otra PC.
 *
 * Acá se corre sembrar.js de punta a punta con un fetch de mentira que anota lo que
 * se escribiría. No hace falta el emulador, y no toca el sandbox que esté abierto.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'sandbox', 'sembrar.js'), 'utf8');
const escrito = {};
const pedidas = [];
const respuesta = cuerpo => ({ ok: true, status: 200, json: async () => cuerpo, text: async () => '' });
async function fetchDeMentira(url, opciones) {
  const metodo = ((opciones && opciones.method) || 'GET').toUpperCase();
  pedidas.push(metodo + ' ' + url);
  if (metodo === 'PATCH') {
    escrito[decodeURIComponent(url.split('/documents/')[1])] = JSON.parse(opciones.body).fields;
    return respuesta({});
  }
  return respuesta({ documents: [] });   /* borrarTodo: las colecciones están vacías */
}

(async () => {
  let salida = null, error = null;
  const errores = [];
  const ctx = {
    fetch: fetchDeMentira,
    console: { log() {}, error: (...a) => errores.push(a.join(' ')) },
    process: { env: {}, exit: c => { salida = c; } },
  };
  try {
    /* La última línea del archivo es main().catch(...): es lo que devuelve. */
    await vm.runInNewContext(src, ctx, { filename: 'sembrar.js' });
  } catch (e) { error = e; }
  const campo = (ruta, nombre) => (escrito[ruta] || {})[nombre] || {};

  console.log('\n-- corre entero --');
  t('no tira error', !error && salida === null && !errores.length);
  if (error || errores.length) console.log('       ' + (error ? error.message : errores.join(' | ')));
  t('solo le habla al emulador local, al proyecto demo',
    pedidas.length > 0 && pedidas.every(p => /^[A-Z]+ http:\/\/127\.0\.0\.1:8080\/v1\/projects\/demo-brotes\//.test(p)));

  console.log('\n-- la depuración --');
  const productos = Object.keys(escrito).filter(k => k.startsWith('productos/'));
  t('100 productos', productos.length === 100);
  t('uno depurado', campo('productos/prod090', 'depurado').booleanValue === true);
  t('uno sacado de la lista', campo('productos/prod095', 'excluidoDepuracion').booleanValue === true);
  t('uno nuevo', !!campo('productos/prod100', 'creadoEn').timestampValue);
  t('un principal con su presentación', campo('productos/prod057', 'gramajePadreId').stringValue === 'prod056');
  t('productos con la reposición registrada', productos.some(k => escrito[k].stockSubioEn));
  t('y desde cuándo hay registro', !!campo('config/depuracion', 'registroStockDesde').timestampValue);

  console.log('\n-- los pedidos --');
  const pedidos = Object.keys(escrito).filter(k => k.startsWith('pedidos/'));
  t('5 pedidos', pedidos.length === 5);
  t('todos con creadoEn: el tablero ordena por ese campo y Firestore deja afuera a los que no lo tienen',
    pedidos.every(k => !!(escrito[k].creadoEn || {}).timestampValue));
  /* Los estados del tablero de Pedidos, más el cancelado, que no tiene columna. */
  const ESTADOS = ['pendiente', 'confirmado', 'entregado', 'cancelado'];
  t('con estados que el panel conoce', pedidos.every(k => ESTADOS.includes((escrito[k].estado || {}).stringValue)));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
