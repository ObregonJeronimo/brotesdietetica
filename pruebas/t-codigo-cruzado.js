/* UN CODIGO NO PUEDE EXISTIR EN EL OTRO CAMPO DE OTRO PRODUCTO
   =============================================================================
   El lector busca en codigoBarras Y en codigo (admin-lector.js:
   coincidenciasCodigo). Si el interno de un producto es igual al de barras de
   otro, al escanear aparecen dos y el sistema -bien- no agrega ninguno: los dos
   productos quedan sin poder venderse por escaneo. Paso de verdad con "57" y
   "000057", dos arvejas.
   Las funciones se sacan del fuente real de admin.html. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ADMIN = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

let ok = 0, mal = 0;
const t = (d, c, extra) => { if (c) { ok++; console.log('  OK   ' + d + (extra ? '   (' + extra + ')' : '')); } else { mal++; console.log('  FALLA ' + d + (extra ? '   (' + extra + ')' : '')); } };

function cuerpo(nombre) {
  let i = ADMIN.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  /* dos de las cuatro son `async function`: sin el async, el vm rompe en el await */
  if (ADMIN.slice(i - 6, i) === 'async ') i -= 6;
  let prof = 0, fin = -1;
  for (let j = ADMIN.indexOf('{', i); j < ADMIN.length; j++) {
    if (ADMIN[j] === '{') prof++;
    else if (ADMIN[j] === '}') { prof--; if (!prof) { fin = j; break; } }
  }
  return fin < 0 ? null : ADMIN.slice(i, fin + 1);
}

const NEC = ['_mismoCodigo', 'normCodigo', 'validarCodigoProducto', 'validarCodigoBarras'];
const faltan = NEC.filter(n => !cuerpo(n));
console.log('\nLas funciones existen');
t('estan las ' + NEC.length, faltan.length === 0, faltan.join(', ') || 'ninguna falta');
if (faltan.length) { console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron'); process.exit(1); }

const vacio = { docs: [] };
const SB = { console, db: { collection: () => ({ where: () => ({ limit: () => ({ get: async () => vacio }) }) }) },
  allProducts: [] };
SB.globalThis = SB;
vm.createContext(SB);
vm.runInContext(NEC.map(cuerpo).join('\n'), SB, { filename: 'admin.html' });
const correr = js => vm.runInContext(js, SB);

SB.allProducts = [
  { id: 'a', nombre: 'Arveja suelta', codigo: '57', codigoBarras: '' },
  { id: 'b', nombre: 'Arveja bulto', codigo: '000999', codigoBarras: '7790001112223' },
  { id: 'c', nombre: 'Yerba', codigo: '000123', codigoBarras: '' }
];

(async () => {
  console.log('\nEl codigo interno no puede ser el de barras de otro');
  let m = await correr("validarCodigoProducto('7790001112223','nuevo')");
  t('lo rechaza', /código de barras de/.test(m), m);
  t('y dice de quien es', /Arveja bulto/.test(m));

  console.log('\nEl codigo de barras no puede ser el interno de otro');
  m = await correr("validarCodigoBarras('000123','nuevo')");
  t('lo rechaza', /código interno de/.test(m), m);
  t('y dice de quien es', /Yerba/.test(m));

  console.log('\nLos ceros a la izquierda no esconden el choque (el caso de las arvejas)');
  m = await correr("validarCodigoBarras('000057','nuevo')");
  t('"000057" choca con el interno "57"', /código interno de/.test(m), m);
  t('_mismoCodigo compara como el lector', correr("_mismoCodigo('000057','57')") === true);
  t('y no confunde distintos', correr("_mismoCodigo('000057','58')") === false);
  t('vacio nunca choca', correr("_mismoCodigo('','')") === false && correr("_mismoCodigo('','0')") === false);

  console.log('\nLo que SI tiene que dejar pasar');
  t('un codigo libre pasa', (await correr("validarCodigoProducto('000500','nuevo')")) === '');
  t('un codigo de barras libre pasa', (await correr("validarCodigoBarras('7790009998887','nuevo')")) === '');
  t('editar el propio producto no choca consigo mismo',
    (await correr("validarCodigoBarras('7790001112223','b')")) === '');
  t('el de barras vacio sigue siendo valido', (await correr("validarCodigoBarras('','nuevo')")) === '');

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('  EXPLOTO: ' + e.message); console.log('\n' + ok + ' pasaron, ' + (mal + 1) + ' fallaron'); process.exit(1); });
