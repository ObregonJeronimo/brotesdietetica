/* ============================================================================
   CARGAR LOS PRECIOS QUE FALTABAN
   ----------------------------------------------------------------------------
   El catalogo original de Brotes salio de un reporte "Stock valorizado" del
   sistema viejo (Zoo Logic Dragonfish), pero 373 productos quedaron con precio
   en $0. El dueño paso las 16 paginas de ese reporte en fotos y de ahi salen los
   precios que faltan.

   POR QUE SE PUEDE EMPAREJAR POR CODIGO. Los codigos del reporte (000001-000684)
   son los MISMOS que los de Brotes, y donde Brotes ya tiene precio coincide con
   LISTA1: de 231 cotejables, 165 dan exacto. Los 66 que difieren no son errores
   de lectura sino subas de precio, y se nota porque son sistematicas -las 6
   Milanesas Sojitas todas en +28%, las chalitas en +9%-, cosa que un error de
   transcripcion no hace.

   EL COSTO NO ESTA EN EL REPORTE y se deduce: el margen de la casa es 65% sobre
   el costo, asi que costo = precio / 1,65. No es una creencia: de los 82
   productos que YA tienen costo y precio cargados, 79 estan exactamente en 1,65
   -la mediana, el p25 y el p75 son los tres 1,65-.

   EL GRANEL NO SE CONVIERTE. A granel Brotes guarda el precio POR KILO, y el
   reporte ya viene asi: de 70 productos a granel cotejables, 63 dan exacto. Por
   eso aca no hay ninguna division, y no aplica la trampa del x1000 de §5.

   Modos:
     node migracion/precios.js --dry        no escribe nada, muestra antes/despues
     node migracion/precios.js --escribir   aplica
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ESCRIBIR = process.argv.includes('--escribir');
const MARGEN = 1.65;               /* precio = costo x 1,65  ->  65% de ganancia */

const bro = require(path.join(DIR, 'brotes.json'));
const listas = require(path.join(DIR, 'brotes-listas.json'));
const nomLista = {}; listas.forEach(l => nomLista[l.id] = l.nombre);

/* Los precios leidos de las 16 fotos: codigo|LISTA1 */
const rep = {};
fs.readFileSync(path.join(DIR, 'lista1.txt'), 'utf8').trim().split('\n').forEach(l => {
  const [c, v] = l.split('|');
  const n = Number(v);
  /* $1,05 es el relleno que usa el sistema viejo para las filas sin precio real. */
  if (isFinite(n) && n > 1.05) rep[c] = n;
});

/* Solo el catalogo original: los 873 de FRUTICOR-TODOS ya vinieron con precio. */
const orig = bro.filter(p => nomLista[p.lista] !== 'FRUTICOR-TODOS');
const enCero = orig.filter(p => !(Number(p.precio) > 0));

const cambios = [], sinDato = [];
enCero.forEach(p => {
  const r = rep[String(p.codigo)];
  if (r === undefined) { sinDato.push(p); return; }
  const precio = Math.round(r * 100) / 100;
  cambios.push({
    id: p.id, codigo: p.codigo, nombre: p.nombre, tipoVenta: p.tipoVenta,
    lista: nomLista[p.lista] || '',
    antes: { precio: Number(p.precio) || 0, costo: Number(p.costo) || 0, porcentaje: Number(p.porcentaje) || 0 },
    despues: { precio, costo: Math.round(precio / MARGEN), porcentaje: 65 }
  });
});

const $ = n => '$' + Number(n || 0).toLocaleString('es-AR');
const L = [];
const say = s => { L.push(s); console.log(s); };

say('======================================================================');
say('  PRECIOS QUE FALTABAN — ' + new Date().toISOString().slice(0, 19).replace('T', ' ') +
    (ESCRIBIR ? '' : '   MODO SECO: no se escribe nada'));
say('======================================================================');
say('');
say('ANTES');
say('  catalogo original      : ' + orig.length + ' productos');
say('  en $0                  : ' + enCero.length);
say('  sin costo              : ' + orig.filter(p => !(Number(p.costo) > 0)).length);
say('');
say('DESPUES');
say('  quedarian en $0        : ' + (enCero.length - cambios.length));
say('  se les carga precio    : ' + cambios.length);
say('  ...y costo (precio/1,65) y porcentaje 65');
say('  visibles en la tienda  : ' + cambios.filter(c => {
  const p = orig.find(x => x.id === c.id); return p && p.oculto !== true;
}).length + '  (dejan de estar en $0 para el cliente)');
say('  a granel, precio POR KILO: ' + cambios.filter(c => c.tipoVenta === 'peso').length);
if (sinDato.length) {
  say('');
  say('  SIN dato en el reporte : ' + sinDato.length);
  sinDato.slice(0, 10).forEach(p => say('      ' + p.codigo + '  ' + p.nombre));
}

say('');
say('EJEMPLOS (antes -> despues)');
say('  ' + 'cod'.padEnd(8) + 'producto'.padEnd(38) + 'tipo'.padEnd(8) + 'precio'.padStart(11) + 'costo'.padStart(11));
cambios.slice(0, 12).forEach(c => {
  say('  ' + c.codigo.padEnd(8) + String(c.nombre).slice(0, 36).padEnd(38) +
    String(c.tipoVenta).padEnd(8) + $(c.despues.precio).padStart(11) + $(c.despues.costo).padStart(11));
});

say('');
say('CONTROLES (todo tiene que dar 0)');
const malPrecio = cambios.filter(c => !(c.despues.precio > 0) || !isFinite(c.despues.precio));
const malCosto = cambios.filter(c => !(c.despues.costo > 0) || c.despues.costo >= c.despues.precio);
const pisaria = cambios.filter(c => c.antes.precio > 0);
const margenMal = cambios.filter(c => Math.abs(c.despues.precio / c.despues.costo - MARGEN) > 0.01);
const absurdo = cambios.filter(c => c.despues.precio < 100 || c.despues.precio > 200000);
say('  precio invalido                 : ' + malPrecio.length);
say('  costo invalido o >= al precio   : ' + malCosto.length);
say('  pisaria un precio ya cargado    : ' + pisaria.length);
say('  margen que no da 1,65           : ' + margenMal.length);
say('  precio fuera de $100..$200.000  : ' + absurdo.length +
    (absurdo.length ? '   ' + absurdo.slice(0, 3).map(c => c.codigo + ' ' + $(c.despues.precio)).join(' | ') : ''));

fs.writeFileSync(path.join(DIR, 'informe-precios.txt'), L.join('\n'));

if (malPrecio.length || malCosto.length || pisaria.length || margenMal.length) {
  console.log('\n!! Hay controles en rojo: no se escribe nada.');
  process.exit(1);
}
if (!ESCRIBIR) { console.log('\n>>> MODO SECO: no se escribio nada.'); process.exit(0); }

/* ---------------------------- ESCRITURA ---------------------------------- */
const admin = require('C:/Users/Usuario/Documents/brotesdietetica/functions/node_modules/firebase-admin');
const db = admin.initializeApp({ projectId: 'brotesdietetica-2f78e' }, 'pr').firestore();

(async () => {
  /* Respaldo del estado exacto de esos documentos ANTES de tocarlos. */
  fs.writeFileSync(path.join(DIR, 'respaldo-precios.json'), JSON.stringify({
    tomado: new Date().toISOString(),
    productos: cambios.map(c => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, ...c.antes }))
  }, null, 1));
  console.log('\nrespaldo: respaldo-precios.json (' + cambios.length + ' documentos, valores previos)');

  let lote = db.batch(), n = 0, escritos = 0;
  for (const c of cambios) {
    lote.update(db.collection('productos').doc(c.id), {
      precio: c.despues.precio, costo: c.despues.costo, porcentaje: c.despues.porcentaje
    });
    if (++n === 450) { await lote.commit(); escritos += n; console.log('   ' + escritos + '/' + cambios.length); lote = db.batch(); n = 0; }
  }
  if (n) { await lote.commit(); escritos += n; }
  console.log('escritos: ' + escritos);

  /* Se releen los documentos: se cuenta lo que quedo, no lo que se mando. */
  const snap = await db.collection('productos').get();
  const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const porId = new Map(todos.map(p => [p.id, p]));
  let ok = 0; const fallos = [];
  cambios.forEach(c => {
    const p = porId.get(c.id);
    if (p && Number(p.precio) === c.despues.precio && Number(p.costo) === c.despues.costo &&
        Number(p.porcentaje) === 65) ok++;
    else fallos.push(c.codigo + ' ' + c.nombre);
  });
  const origAhora = todos.filter(p => nomLista[p.lista] !== 'FRUTICOR-TODOS');
  console.log('\n--- MEDIDO DESPUES, releyendo la base ---');
  console.log('  quedaron con precio, costo y 65% correctos: ' + ok + ' de ' + cambios.length);
  console.log('  fallaron: ' + fallos.length + (fallos.length ? '  ' + fallos.slice(0, 5).join(' | ') : ''));
  console.log('  catalogo original en $0 ahora: ' + origAhora.filter(p => !(Number(p.precio) > 0)).length + '  (antes ' + enCero.length + ')');
  console.log('  visibles en $0 ahora        : ' + origAhora.filter(p => p.oculto !== true && !(Number(p.precio) > 0)).length);
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
