/* ============================================================================
   FUNDIR FRUTICOR 1 CONTRA FRUTICOR-TODOS
   ----------------------------------------------------------------------------
   FRUTICOR-TODOS es la lista de Fruticor completa, traida de YERCO, y es la que
   queda. FRUTICOR 1 era la lista que el negocio tenia de antes: misma mercaderia
   con otros nombres, mas algunos productos que NO son de Fruticor.

   Lo que el dueño quiere: que FRUTICOR 1 desaparezca, que ningun producto quede
   repetido, y que NO se pierdan los codigos, que es con lo que buscan en el
   mostrador en vez de tipear el nombre.

   POR QUE SOBREVIVE EL DE FRUTICOR-TODOS PERO CON LOS DATOS DEL DE FRUTICOR 1.
   Medido sobre los 52 nombres repetidos: el de FRUTICOR-TODOS esta OCULTO, con
   el stock redondo que traia de YERCO (8 kg, 10 kg, 25 kg) y con el precio de
   YERCO; el de FRUTICOR 1 esta VISIBLE, con el stock real (6,890 kg, 0,300 kg)
   y el precio de este negocio. Quedarse con el nombre y la foto de Fruticor esta
   bien; quedarse con su precio y su stock seria vender el bicarbonato a $2.600
   en vez de $4.100 y con 8 kg que no existen.

   Entonces, para cada par: el documento que queda es el de FRUTICOR-TODOS, y se
   le pasa del otro el codigo, el precio, el costo, el stock, la visibilidad, la
   categoria y como se vende. Se queda con su nombre, su foto y su lista.

   LOS QUE NO ESTAN EN FRUTICOR-TODOS NO SE BORRAN: no son de Fruticor -tes
   Tucangua, tostadas Molinos del Bosque, mieles Paneles del Mistol- y se mudan a
   la lista OTRO con su codigo.

   Modos:
     node migracion/fruticor1.js --dry        no escribe nada
     node migracion/fruticor1.js --escribir   aplica
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const ESCRIBIR = process.argv.includes('--escribir');

const bro = require(path.join(DIR, 'brotes.json'));
const listas = require(path.join(DIR, 'brotes-listas.json'));
const nom = {}; listas.forEach(l => nom[l.id] = l.nombre);
const L = p => nom[p.lista] || '(sin lista)';
const idLista = n => (listas.find(l => l.nombre === n) || {}).id;

const ID_F1 = idLista('FRUTICOR 1');
const ID_OTRO = idLista('OTRO');
if (!ID_F1 || !ID_OTRO) { console.error('no encuentro FRUTICOR 1 u OTRO'); process.exit(1); }

const f1 = bro.filter(p => p.lista === ID_F1);
const ft = bro.filter(p => L(p) === 'FRUTICOR-TODOS');

/* --------- el comparador de nombres ---------
   YERCO escribe "MIJO PELADO x 5 kg" y el negocio "Mijo Pelado". Hay que sacar
   la medida -venga con "x" delante o pegada al numero, como "330Gr"- y no exigir
   las marcas que del otro lado no existen (CACHAFAZ, MISTOL). */
const RUIDO = new Set(['CON', 'SIN', 'PARA', 'DEL', 'LOS', 'LAS', 'TACC', 'EXTRA', 'PREMIUM', 'TIPO', 'GRS', 'GRAMOS', 'CAJA', 'PAQUETE']);
const MEDIDA = /^[0-9]+([.,][0-9]+)?(KG|KILOS?|GR?|CC|ML|LTS?|L|U|UN|SAQ)?$/;
function pal(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/([0-9])\s*(KG|GR|CC|ML|LTS?|SAQ)\b/g, '$1 ')
    .replace(/[^A-Z0-9]/g, ' ').split(/\s+/)
    .filter(w => w && w.length > 2 && !RUIDO.has(w) && !MEDIDA.test(w));
}
const sing = w => w.length > 4 && w.endsWith('S') ? w.slice(0, -1) : w;
const P = s => pal(s).map(sing);
const vocab = new Set(); ft.forEach(p => P(p.nombre).forEach(w => vocab.add(w)));
const idx = ft.map(p => ({ p, w: new Set(P(p.nombre)) }));
const N = s => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
const exacto = new Map(); ft.forEach(p => { if (!exacto.has(N(p.nombre))) exacto.set(N(p.nombre), p); });

/* Los que el comparador no resuelve solo y se revisaron a ojo, uno por uno.
   Van por codigo para que no dependan de como este escrito el nombre. */
const A_MANO = {
  '000484': 'YERBA KALENA DESPALADA (azul) x 2 Kg',
  '000038': 'LASFOR ALM. ARROZ DE AVELLANA x 1 Kg',
  '000039': 'LASFOR ALM. ARROZ DE FRUTILLA x 500 gr',
  '000182': 'GALL. INTEGRAL GRANOLA ALM Y MANI x 225g',
  '000181': 'GALL. INTEGRAL ALGARROBA x 225g',
  '000183': 'GALL. INTEGRAL CHIPS CHOC Y AVENA x 225g',
  '000307': 'MERM. DE ROSA MOSQUETA C/STEVIA x 330',
  '000551': 'MANI CON CHOCOLATE semiamargo x 500 gr',
  '000365': 'PASTA DE MANI -TRADICIONAL-oddis x 350g'
};
const porNombreFT = new Map(); ft.forEach(p => porNombreFT.set(p.nombre, p));

/* Los dos que el negocio ya habia recreado a mano DENTRO de FRUTICOR-TODOS con el
   codigo mal tipeado. Ahi el stock se SUMA: los dos numeros son reales. */
const SUMAR_STOCK = new Set(['000272', '000462']);

function candidatos(p) {
  if (A_MANO[p.codigo] && porNombreFT.has(A_MANO[p.codigo])) return [porNombreFT.get(A_MANO[p.codigo])];
  const e = exacto.get(N(p.nombre));
  if (e) return [e];
  const con = P(p.nombre).filter(w => vocab.has(w));
  if (!con.length) return [];
  let c = idx.filter(z => con.every(w => z.w.has(w)));
  /* UNA sola palabra en comun no alcanza como prueba si del otro lado el nombre
     dice tres cosas mas. Asi "Fibras" caia en "SALUTARIS FIBRA VEGETAL incaico x
     250g" -granel a $7.420 el kilo contra un envase de 250 g a $23.400-, "Miel
     Paneles Del Mistol" en "GALLETA -ORGANICA- CACAO Y MIEL" y "Mango Trozado
     Congelado" en "MERMELADA DE MANGO". Los de una palabra que si valen tienen
     enfrente un nombre corto: Oregano, Paprika, Garbanzos, Mijo. */
  if (con.length === 1) c = c.filter(z => z.w.size < 3);
  return c.map(z => z.p);
}

/* Entre varios candidatos gana el que AGREGA menos palabras, y recien despues el
   de precio parecido. Con el precio solo, "Lentejas" ($4.724) se iba a "LENTEJA
   TURCA x 1 kg" ($5.200) en vez de a "LENTEJA x 25 Kg" ($2.328), que es lenteja
   comun; y encima la turca ya tiene su propio producto en FRUTICOR 1. */
const palabrasDe = new Map(); ft.forEach(p => palabrasDe.set(p.id, P(p.nombre).length));
function elegir(p, c) {
  return c.slice().sort((x, y) =>
    (palabrasDe.get(x.id) - palabrasDe.get(y.id)) ||
    (Math.abs(Number(x.precio) - Number(p.precio)) - Math.abs(Number(y.precio) - Number(p.precio))))[0];
}

/* Asignacion UNICA: dos productos de FRUTICOR 1 no pueden fundirse contra el
   mismo de FRUTICOR-TODOS, o el codigo quedaria repetido, que es justo lo que se
   quiere evitar. Se resuelven primero los que tienen un solo candidato. */
const tomado = new Map();
const funde = [], mudan = [];
f1.map(p => ({ p, c: candidatos(p) })).filter(x => x.c.length)
  .sort((a, b) => a.c.length - b.c.length)
  .forEach(({ p, c }) => {
    const libres = c.filter(q => !tomado.has(q.id));
    if (!libres.length) return;                 /* se queda sin par: se muda */
    const q = elegir(p, libres);
    tomado.set(q.id, p.id);
    funde.push({ viejo: p, queda: q });
  });
const fundidos = new Set(funde.map(x => x.viejo.id));
f1.forEach(p => { if (!fundidos.has(p.id)) mudan.push(p); });

/* "00295" (mani, en FRUTICOR-TODOS) choca con "000295" (mani, en MARTIN F.S) en
   cuanto alguien busca sin los ceros. El dueño quiere los dos productos, asi que
   al mal escrito se le da un codigo libre de la serie, de 6 digitos. */
const usados = new Set(bro.map(p => String(p.codigo || '').trim()));
funde.forEach(x => usados.delete(String(x.viejo.codigo)));   /* los que se liberan */
let sig = 0; bro.forEach(p => { const n = Number(p.codigo); if (isFinite(n) && n > sig) sig = n; });
function codigoLibre() {
  do { sig++; } while (usados.has(String(sig).padStart(6, '0')));
  const c = String(sig).padStart(6, '0'); usados.add(c); return c;
}
const malCodificados = bro.filter(p => {
  const c = String(p.codigo || '').trim();
  return /^[0-9]+$/.test(c) && c.length !== 6 && !tomado.has(p.id) && p.lista !== ID_F1;
}).map(p => ({ p, nuevo: codigoLibre() }));

/* ------------------------------- INFORME -------------------------------- */
const $ = n => '$' + Number(n || 0).toLocaleString('es-AR');
const st = p => p.tipoVenta === 'peso' ? (Number(p.stock || 0) / 1000).toFixed(3).replace('.', ',') + ' kg' : Number(p.stock || 0) + ' u';
const say = console.log;
say('======================================================================');
say('  FRUTICOR 1 -> FRUTICOR-TODOS   ' + new Date().toISOString().slice(0, 16).replace('T', ' ') +
  (ESCRIBIR ? '' : '   MODO SECO: no se escribe nada'));
say('======================================================================');
say('');
say('ANTES');
say('  FRUTICOR 1      : ' + f1.length + ' productos   (' + f1.filter(p => p.oculto !== true).length + ' visibles)');
say('  FRUTICOR-TODOS  : ' + ft.length + ' productos');
say('  OTRO            : ' + bro.filter(p => p.lista === ID_OTRO).length + ' productos');
say('');
say('QUE SE HACE');
say('  se funden con su igual de FRUTICOR-TODOS : ' + funde.length);
say('     (el de alla se queda con el nombre, la foto y la lista,');
say('      y recibe codigo, precio, costo, stock, visibilidad y categoria)');
say('  se mudan a OTRO por no ser de Fruticor   : ' + mudan.length);
say('  se borra la lista FRUTICOR 1');
if (malCodificados.length) say('  codigos de menos de 6 digitos normalizados: ' + malCodificados.length +
  '   ' + malCodificados.map(x => JSON.stringify(x.p.codigo) + '->' + x.nuevo + ' ' + String(x.p.nombre).slice(0, 22)).join(' | '));
say('');
say('DESPUES');
say('  FRUTICOR 1      : 0 productos, lista borrada');
say('  FRUTICOR-TODOS  : ' + ft.length + ' productos  (NO cambia: no entra ni sale ninguno)');
say('  OTRO            : ' + (bro.filter(p => p.lista === ID_OTRO).length + mudan.length));
say('  productos totales: ' + (bro.length - funde.length) + '   (hoy ' + bro.length + ', se van los ' + funde.length + ' duplicados)');
say('');
say('EJEMPLOS DE FUSION (los que tienen stock real)');
funde.filter(x => Number(x.viejo.stock) > 0).slice(0, 8).forEach(x => {
  say('  ' + x.viejo.codigo + '  ' + String(x.queda.nombre).slice(0, 44));
  say('        queda : ' + $(x.viejo.precio).padStart(11) + st(x.viejo).padStart(12) + '   ' + (x.viejo.oculto ? 'oculto' : 'visible') + '   <- de FRUTICOR 1');
  say('        (era) : ' + $(x.queda.precio).padStart(11) + st(x.queda).padStart(12) + '   ' + (x.queda.oculto ? 'oculto' : 'visible') + '   <- de YERCO');
});
say('');
say('SE MUDAN A OTRO (' + mudan.length + ')');
mudan.slice().sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0)).forEach(p =>
  say('  ' + p.codigo + '  ' + String(p.nombre).slice(0, 46).padEnd(48) + st(p).padStart(10) + '  ' + (p.oculto ? 'oculto' : 'VISIBLE')));

say('');
say('CONTROLES (todo tiene que dar 0)');
/* Como queda el catalogo despues, armado en memoria a partir de lo que se va a
   escribir. Se controla sobre eso, no sobre la intencion. */
const norm = c => String(c || '').trim().replace(/^0+/, '');
const despues = [];
bro.forEach(p => {
  if (fundidos.has(p.id)) return;                       /* se borra */
  const rec = funde.find(x => x.queda.id === p.id);
  const mal = malCodificados.find(x => x.p.id === p.id);
  if (rec) despues.push(Object.assign({}, p, {
    codigo: rec.viejo.codigo, precio: rec.viejo.precio, oculto: rec.viejo.oculto,
    stock: SUMAR_STOCK.has(rec.viejo.codigo) ? Number(p.stock || 0) + Number(rec.viejo.stock || 0) : rec.viejo.stock
  }));
  else if (mal) despues.push(Object.assign({}, p, { codigo: mal.nuevo }));
  else if (p.lista === ID_F1) despues.push(Object.assign({}, p, { lista: ID_OTRO }));
  else despues.push(p);
});
const agrupar = (arr, f) => { const m = new Map(); arr.forEach(p => { const c = f(p); if (!c) return; if (!m.has(c)) m.set(c, []); m.get(c).push(p); }); return [...m.entries()].filter(([, v]) => v.length > 1); };
const repes = agrupar(despues, p => String(p.codigo || '').trim());
const repesN = agrupar(despues, p => norm(p.codigo));
const sinCod = despues.filter(p => !String(p.codigo || '').trim());
const quedanF1 = despues.filter(p => p.lista === ID_F1);
const perdidos = f1.filter(p => !fundidos.has(p.id) && !mudan.some(m => m.id === p.id));
const ftCambia = despues.filter(p => L(p) === 'FRUTICOR-TODOS').length - ft.length;
const sinPrecio = despues.filter(p => !(Number(p.precio) > 0));
const stockNeg = funde.filter(x => Number(x.viejo.stock) < 0);
say('  codigos repetidos                   : ' + repes.length + (repes.length ? '   ' + repes.slice(0, 3).map(([c]) => c).join(', ') : ''));
say('  codigos que chocan sin los ceros    : ' + repesN.length + (repesN.length ? '   ' + repesN.slice(0, 3).map(([c]) => c).join(', ') : ''));
say('  productos sin codigo                : ' + sinCod.length);
say('  productos que quedan en FRUTICOR 1  : ' + quedanF1.length);
say('  productos de FRUTICOR 1 sin destino : ' + perdidos.length);
say('  cuantos entran o salen de F-TODOS   : ' + ftCambia);
say('  productos que quedarian en $0       : ' + sinPrecio.length);
say('  fusiones que dejarian stock negativo: ' + stockNeg.length);
const rojo = repes.length || repesN.length || sinCod.length || quedanF1.length || perdidos.length || ftCambia || sinPrecio.length;
if (rojo) { say(''); say('!! Hay controles en rojo: no se escribe nada.'); process.exit(1); }
if (!ESCRIBIR) { say(''); say('>>> MODO SECO: no se escribio nada.'); process.exit(0); }

/* ------------------------------ ESCRITURA -------------------------------- */
const admin = require('C:/Users/Usuario/Documents/brotesdietetica/functions/node_modules/firebase-admin');
const db = admin.initializeApp({ projectId: 'brotesdietetica-2f78e' }, 'f1').firestore();

(async () => {
  fs.writeFileSync(path.join(DIR, 'respaldo-fruticor1.json'), JSON.stringify({
    tomado: new Date().toISOString(),
    seBorran: funde.map(x => x.viejo),
    seModifican: funde.map(x => x.queda).concat(malCodificados.map(x => x.p)),
    seMudan: mudan,
    listaBorrada: listas.find(l => l.id === ID_F1)
  }, null, 1));
  console.log('\nrespaldo: respaldo-fruticor1.json');

  const ops = [];
  funde.forEach(x => {
    const v = x.viejo, q = x.queda;
    ops.push(['update', q.id, {
      codigo: v.codigo, precio: Number(v.precio) || 0, costo: Number(v.costo) || 0,
      porcentaje: Number(v.porcentaje) || 0, descuento: Number(v.descuento) || 0,
      precioMayorista: Number(v.precioMayorista) || 0, porcentajeMayorista: Number(v.porcentajeMayorista) || 0,
      stock: SUMAR_STOCK.has(v.codigo) ? Number(q.stock || 0) + Number(v.stock || 0) : Number(v.stock) || 0,
      oculto: v.oculto === true, tipoVenta: v.tipoVenta || 'unidad',
      categoria: v.categoria || q.categoria, subcategoria: v.subcategoria || q.subcategoria || ''
    }]);
    ops.push(['delete', v.id, null]);
  });
  mudan.forEach(p => ops.push(['update', p.id, { lista: ID_OTRO }]));
  malCodificados.forEach(x => ops.push(['update', x.p.id, { codigo: x.nuevo }]));

  let lote = db.batch(), n = 0, hechas = 0;
  for (const [op, id, data] of ops) {
    if (op === 'update') lote.update(db.collection('productos').doc(id), data);
    else lote.delete(db.collection('productos').doc(id));
    if (++n === 450) { await lote.commit(); hechas += n; console.log('   ' + hechas + '/' + ops.length); lote = db.batch(); n = 0; }
  }
  if (n) { await lote.commit(); hechas += n; }
  console.log('operaciones: ' + hechas);
  await db.collection('listas').doc(ID_F1).delete();
  console.log('lista FRUTICOR 1 borrada');

  /* Se relee todo: se cuenta lo que quedo, no lo que se mando. */
  const snap = await db.collection('productos').get();
  const hoy = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const ls = await db.collection('listas').get();
  const nombres = {}; ls.docs.forEach(d => nombres[d.id] = (d.data() || {}).nombre);
  let ok = 0; const fallos = [];
  funde.forEach(x => {
    const q = hoy.find(p => p.id === x.queda.id);
    if (q && String(q.codigo) === String(x.viejo.codigo) &&
      Number(q.precio) === (Number(x.viejo.precio) || 0) &&
      !hoy.some(p => p.id === x.viejo.id)) ok++;
    else fallos.push(x.viejo.codigo + ' ' + x.viejo.nombre);
  });
  const mudOk = mudan.filter(p => { const q = hoy.find(z => z.id === p.id); return q && q.lista === ID_OTRO; }).length;
  console.log('\n--- MEDIDO DESPUES, releyendo la base ---');
  console.log('  fusiones correctas (codigo y precio pasados, el viejo borrado): ' + ok + ' de ' + funde.length);
  console.log('  fallaron                     : ' + fallos.length + (fallos.length ? '  ' + fallos.slice(0, 5).join(' | ') : ''));
  console.log('  mudados a OTRO               : ' + mudOk + ' de ' + mudan.length);
  console.log('  productos ahora              : ' + hoy.length + '  (antes ' + bro.length + ')');
  console.log('  en FRUTICOR 1                : ' + hoy.filter(p => p.lista === ID_F1).length);
  console.log('  la lista FRUTICOR 1 existe   : ' + (nombres[ID_F1] ? 'SI' : 'no'));
  console.log('  en FRUTICOR-TODOS            : ' + hoy.filter(p => nombres[p.lista] === 'FRUTICOR-TODOS').length + '  (antes ' + ft.length + ')');
  console.log('  en OTRO                      : ' + hoy.filter(p => p.lista === ID_OTRO).length);
  console.log('  codigos repetidos            : ' + agrupar(hoy, p => String(p.codigo || '').trim()).length);
  console.log('  codigos que chocan sin ceros : ' + agrupar(hoy, p => norm(p.codigo)).length);
  console.log('  productos sin codigo         : ' + hoy.filter(p => !String(p.codigo || '').trim()).length);
  console.log('  productos en $0              : ' + hoy.filter(p => !(Number(p.precio) > 0)).length);
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
