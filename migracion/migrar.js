/* ============================================================================
   FRUTICOR de YERCO  ->  Brotes, lista nueva "FRUTICOR-TODOS"
   ----------------------------------------------------------------------------
   Modos:
     node migrar.js --dry        no escribe NADA. Calcula todo y deja el informe.
     node migrar.js --escribir   crea la lista y los 873 productos.
   Reglas de la casa que este script respeta (PENDIENTE.md §5):
     - a granel el precio es POR KILO y la cantidad y el stock van en GRAMOS
     - escribir en lotes de 450
     - los ids CAMBIAN al crear: padreId y gramajePadreId se remapean en 2da pasada
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { envase } = require('./envase.js');

const DIR = __dirname;
const MODO_ESCRIBIR = process.argv.includes('--escribir');
const LISTA_NUEVA = 'FRUTICOR-TODOS';

const fru = require('./fruticor.json');
const bro = require('./brotes.json');
const listasB = require('./brotes-listas.json');

/* ---------- 1. tipoVenta ------------------------------------------------- */
/* El envase que declara el proveedor manda:
     - en KG  -> es un bulto que el comercio abre y vende suelto -> 'peso'
     - en g / cc / l / u / sin envase -> se vende como viene -> 'unidad'
   Medido antes de escribir esta regla:
     - el stock de los 873 en YERCO va de 1 a 100: cuenta BULTOS, no gramos
     - Brotes ya tiene 198 productos a granel, y los que vinieron de esta misma
       lista (ARROZ LARGO FINO x 1kg, BICARBONATO x 1 Kg, AZUCAR DE COCO x 1 Kg)
       tienen el stock en miles: gramos. Es la convencion de la casa.
     - el precio cruza: YERCO "MIJO PELADO x 2,5 Kg $7000" = $2.800/kg, y Brotes
       vende "Mijo Pelado" a $3.517/kg. Mismo orden, con margen.
   Por eso un 'peso' NO se copia tal cual: hay que convertir precio y stock. */
/* Al proveedor a veces se le va la unidad: "MIX FRUT. SECOS CLASICO x 2,5", sin kg.
   No se adivina por el nombre: se mira el GRUPO. YERCO agrupa los gramajes del mismo
   producto con grupoId, y si los hermanos del grupo vienen en kg, el numero pelado
   son kilos. Se comprueba ademas contra el precio de los hermanos: solo vale si el
   precio por kilo que sale queda en el mismo orden. Medido: alcanza a 1 producto. */
const _hermanos = {};
fru.forEach(p => { if (p.grupoId) (_hermanos[p.grupoId] = _hermanos[p.grupoId] || []).push(p); });

function _kilosPorElGrupo(p) {
  if (!p.grupoId) return null;
  const refs = (_hermanos[p.grupoId] || []).map(h => ({ h, e: envase(h.nombre) }))
    .filter(x => x.e && x.e.u === 'kg' && (x.h.precio || 0) > 0);
  if (!refs.length) return null;
  const nPelado = String(p.nombre).match(/([\d]+(?:[.,][\d]+)?)\s*$/);
  if (!nPelado) return null;
  const kg = parseFloat(nPelado[1].replace(',', '.'));
  if (!(kg > 0)) return null;
  const porKiloHermanos = refs.map(x => x.h.precio / x.e.val).sort((a, b) => a - b);
  const medianaH = porKiloHermanos[Math.floor(porKiloHermanos.length / 2)];
  const porKilo = (p.precio || 0) / kg;
  if (!(medianaH > 0) || !(porKilo > 0)) return null;
  const razon = porKilo / medianaH;
  return (razon > 0.6 && razon < 1.7) ? kg : null;   /* mismo orden de precio */
}

/* Lo que el dueño YA decidio a mano manda sobre cualquier regla mia. 47 de estos
   873 ya estan cargados en Brotes (lista FRUTICOR 1) con su tipoVenta elegido por
   el. Contrastada contra esos 47, la regla del envase acierta 40: las 7 que fallan
   son todas de 500 gr que el vende sueltas -canela en rama, anis, clavo de olor,
   chips de chocolate- mas una fecula de 1 kg que vende envasada. O sea que el
   corte no es la unidad del nombre sino el producto. Donde hay dato suyo, se usa
   el dato; donde no, la regla del envase, que es la conservadora. */
const _yaDecidido = new Map();
bro.forEach(p => {
  const k = String(p.nombre || '').trim().toUpperCase();
  if (k && (p.tipoVenta === 'peso' || p.tipoVenta === 'unidad')) _yaDecidido.set(k, p.tipoVenta);
});

/* Cuanto pesa el bulto, en KILOS, venga el nombre en kg o en gramos. Es lo que
   permite pasar el precio del bulto a precio por kilo y el stock a gramos. */
function _kilosDelBulto(p) {
  const e = envase(p.nombre);
  if (e && e.u === 'kg') return e.val;
  if (e && e.u === 'g') return e.val / 1000;
  return _kilosPorElGrupo(p);
}

function clasificar(p) {
  const kg = _kilosDelBulto(p);
  const yaEs = _yaDecidido.get(String(p.nombre || '').trim().toUpperCase());
  if (yaEs) return { tipoVenta: yaEs, kg: yaEs === 'peso' ? kg : null,
    motivo: 'ya cargado en Brotes como ' + yaEs };

  const e = envase(p.nombre);
  if (!e) {
    if (kg) return { tipoVenta: 'peso', kg, motivo: kg + ' kg deducidos del grupo' };
    return { tipoVenta: 'unidad', kg: null, motivo: 'sin envase en el nombre' };
  }
  /* El corte: en KILOS es un bulto que el comercio abre y vende suelto; en gramos,
     cc, litros o unidades se vende como viene. Los de 500 gr que SI van sueltos
     estan cubiertos por la rama de arriba cuando el dueño ya los cargo. */
  if (e.u === 'kg' && !e.sellado) return { tipoVenta: 'peso', kg, motivo: 'envase de ' + e.val + ' kg' };
  if (e.u === 'kg' && e.sellado) return { tipoVenta: 'unidad', kg: null, motivo: 'kg pero envase sellado' };
  return { tipoVenta: 'unidad', kg: null, motivo: 'envase de ' + e.val + ' ' + e.u };
}

/* ---------- 2. codigo ---------------------------------------------------- */
/* Los 611 de Brotes usan 6 digitos con ceros adelante (607 de 611); el maximo
   real es 684. Se sigue esa serie, no la P-#### que sugiere el formulario:
   manda lo que hay cargado, no lo que dice el codigo. */
const usados = new Set(bro.map(p => String(p.codigo || '').trim().toUpperCase()).filter(Boolean));
const maxNum = bro.reduce((m, p) => {
  const n = parseInt(String(p.codigo || '').replace(/\D/g, ''), 10);
  return isNaN(n) ? m : Math.max(m, n);
}, 0);
let _next = maxNum + 1;
function codigoLibre() {
  for (;;) {
    const c = String(_next++).padStart(6, '0');
    if (!usados.has(c)) { usados.add(c); return c; }
  }
}

/* ---------- 3. el mapeo de un producto ----------------------------------- */
function redondearPrecio(n) { return Math.round(n); }

function mapear(p) {
  const cl = clasificar(p);
  const kg = cl.kg || null;
  const factor = kg || 1;              /* dividir plata por los kilos del bulto */
  const gramos = kg ? Math.round(kg * 1000) : null;

  const d = {
    nombre: p.nombre || '',
    nombreMostrado: p.nombreMostrado || null,
    descripcion: p.descripcion || p.nombre || '',
    categoria: p.categoria || '',
    subcategoria: p.subcategoria || null,

    codigo: codigoLibre(),
    tipoVenta: cl.tipoVenta,

    /* plata: por kilo si es granel, tal cual si va por unidad */
    costo: redondearPrecio((p.costo || 0) / factor),
    precio: redondearPrecio((p.precio || 0) / factor),
    precioMayorista: redondearPrecio((p.precioMayorista || 0) / factor),
    porcentaje: p.porcentaje || 0,
    porcentajeMayorista: p.porcentajeMayorista || 0,
    descuento: p.descuento || 0,

    /* stock: en GRAMOS si es granel (bultos x kg x 1000), en unidades si no */
    stock: kg ? (p.stock || 0) * gramos : (p.stock || 0),

    imagen: p.imagen || null,
    imagenesExtra: Array.isArray(p.imagenesExtra) ? p.imagenesExtra : [],
    valoresNutricionales: p.valoresNutricionales || '',
    codigoBarras: p.codigoBarras || null,
    gramaje: p.gramaje || null,
    popular: p.popular === true,
    oculto: p.oculto === true,
    lista: null,                        /* se completa con el id de la lista nueva */

    /* asociaciones: se copian tal cual y se REMAPEAN en la segunda pasada */
    envasadoPropio: p.envasadoPropio === true,

    /* agrupamiento de gramajes de YERCO. grupoId es un id sintetico propio
       ("grp_1782596314461_bia7n"), NO un id de documento: no se remapea. */
    grupoId: p.grupoId || null,
    grupoMascara: p.grupoMascara || null,
    grupoOrden: (typeof p.grupoOrden === 'number') ? p.grupoOrden : null,
    grupoPrincipal: p.grupoPrincipal === true,
    slug: p.slug || null
  };
  return { d, cl, kg, origen: p };
}

const mapeados = fru.map(mapear);

/* ---------- 4. informe ---------------------------------------------------- */
const porTipo = { peso: 0, unidad: 0 };
mapeados.forEach(m => porTipo[m.d.tipoVenta]++);

const yaExiste = listasB.find(l => (l.nombre || '').toUpperCase() === LISTA_NUEVA);
const nombresB = new Map();
bro.forEach(p => nombresB.set(String(p.nombre || '').trim().toUpperCase(), p));
const choques = mapeados.filter(m => nombresB.has(m.d.nombre.trim().toUpperCase()));

const catsB = new Set(bro.map(p => p.categoria).filter(Boolean));
const catsNuevas = [...new Set(mapeados.map(m => m.d.categoria).filter(Boolean))]
  .filter(c => !catsB.has(c));

const conPadre = mapeados.filter(m => m.origen.padreId);
const conGramaje = mapeados.filter(m => m.origen.gramajePadreId);
const idsFru = new Set(fru.map(p => p.id));
const padreHuerfano = conPadre.filter(m => !idsFru.has(m.origen.padreId));
const gramajeHuerfano = conGramaje.filter(m => !idsFru.has(m.origen.gramajePadreId));

const L = [];
const say = s => { L.push(s); console.log(s); };

say('======================================================================');
say('  ENSAYO EN SECO — FRUTICOR (YERCO) -> Brotes / lista "FRUTICOR-TODOS"');
say('  ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '   NO SE ESCRIBE NADA');
say('======================================================================');
say('');
say('ANTES');
say('  Brotes: ' + bro.length + ' productos, ' + listasB.length + ' listas');
say('  lista "' + LISTA_NUEVA + '": ' + (yaExiste ? 'YA EXISTE (' + yaExiste.id + ')' : 'no existe'));
say('  codigo mas alto en uso: ' + String(maxNum).padStart(6, '0'));
say('');
say('DESPUES');
say('  Brotes: ' + (bro.length + mapeados.length) + ' productos (+' + mapeados.length + '), ' +
  (listasB.length + 1) + ' listas (+1)');
say('  codigos nuevos: ' + mapeados[0].d.codigo + ' .. ' + mapeados[mapeados.length - 1].d.codigo);
say('  ninguna lista existente se toca');
say('');
say('CLASIFICACION tipoVenta');
say('  peso   (granel, precio POR KILO, stock en GRAMOS): ' + porTipo.peso);
say('  unidad (se vende como viene)                     : ' + porTipo.unidad);
say('');
say('ASOCIACIONES');
say('  padreId a remapear        : ' + conPadre.length + '  (huerfanos: ' + padreHuerfano.length + ')');
say('  gramajePadreId a remapear : ' + conGramaje.length + '  (huerfanos: ' + gramajeHuerfano.length + ')');
say('  grupoId (agrupa gramajes) : ' + mapeados.filter(m => m.d.grupoId).length + ' — id sintetico, NO se remapea');
say('');
say('AVISOS');
say('  nombres que YA existen en Brotes y se van a duplicar: ' + choques.length);
say('  categorias de YERCO que Brotes no tiene            : ' + catsNuevas.length);
if (catsNuevas.length) catsNuevas.forEach(c => say('      ' + c));
say('  imagenes que siguen apuntando al bucket de YERCO   : ' +
  mapeados.filter(m => /yerco-bb620/.test(m.d.imagen || '')).length + ' (se reescriben al copiarlas)');
say('');

/* --- muestra de la conversion a granel, que es donde esta la plata --- */
say('CONVERSION A GRANEL — 15 ejemplos (antes -> despues)');
say('  ' + 'producto'.padEnd(42) + 'envase   precio YERCO -> $/kg      stock -> gramos');
mapeados.filter(m => m.d.tipoVenta === 'peso').slice(0, 15).forEach(m => {
  say('  ' + m.d.nombre.slice(0, 40).padEnd(42) +
    (m.kg + ' kg').padEnd(9) +
    ('$' + (m.origen.precio || 0)).padStart(9) + ' -> ' + ('$' + m.d.precio).padStart(8) +
    '   ' + String(m.origen.stock || 0).padStart(4) + ' -> ' + String(m.d.stock).padStart(7) + ' g');
});
say('');
say('SIN CONVERSION — 8 ejemplos por unidad');
mapeados.filter(m => m.d.tipoVenta === 'unidad').slice(0, 8).forEach(m => {
  say('  ' + m.d.nombre.slice(0, 40).padEnd(42) +
    ('$' + (m.origen.precio || 0)).padStart(9) + ' -> ' + ('$' + m.d.precio).padStart(8) +
    '   stock ' + String(m.origen.stock || 0).padStart(4) + ' -> ' + String(m.d.stock).padStart(4));
});
say('');

/* --- controles de coherencia: lo que tiene que dar cero --- */
say('CONTROLES (todo tiene que dar 0)');
const malPrecio = mapeados.filter(m => m.d.precio < 0 || !isFinite(m.d.precio));
const malStock = mapeados.filter(m => m.d.stock < 0 || !isFinite(m.d.stock) || !Number.isInteger(m.d.stock));
const sinNombre = mapeados.filter(m => !m.d.nombre.trim());
const codRep = (() => { const s = new Set(); let n = 0; mapeados.forEach(m => { if (s.has(m.d.codigo)) n++; s.add(m.d.codigo); }); return n; })();
const codChoca = mapeados.filter(m => bro.some(b => String(b.codigo || '').toUpperCase() === m.d.codigo));
const codMal = mapeados.filter(m => !/^[A-Z0-9._-]+$/.test(m.d.codigo) || m.d.codigo.length > 40);
const pesoSinKg = mapeados.filter(m => m.d.tipoVenta === 'peso' && !m.kg);
/* El precio nuevo por el peso del bulto tiene que devolver el precio del bulto.
   Sube cuando el bulto pesa menos de un kilo (500 g a $37.500 son $75.000/kg), asi
   que "subio" no es el control: el control es que la cuenta cierre al reves. */
const precioIncoherente = mapeados.filter(m => {
  const orig = m.origen.precio || 0;
  if (!m.kg) return m.d.precio !== orig;
  return Math.abs(m.d.precio * m.kg - orig) > Math.max(1, orig * 0.001);
});
const stockIncoherente = mapeados.filter(m => {
  const orig = m.origen.stock || 0;
  return m.kg ? (m.d.stock !== orig * Math.round(m.kg * 1000)) : (m.d.stock !== orig);
});
say('  precio invalido            : ' + malPrecio.length);
say('  stock invalido o no entero : ' + malStock.length);
say('  sin nombre                 : ' + sinNombre.length);
say('  codigo repetido entre nuevos: ' + codRep);
say('  codigo que choca con Brotes : ' + codChoca.length);
say('  codigo con formato invalido : ' + codMal.length);
say('  granel sin kilos parseados  : ' + pesoSinKg.length);
say('  precio incoherente con el bulto: ' + precioIncoherente.length + '  (precio/kg x kg tiene que dar el precio del bulto)');
say('  stock incoherente con el bulto : ' + stockIncoherente.length);
say('');

/* --- que se escribiria --- */
say('LO QUE ESCRIBIRIA EL MODO --escribir');
say('  1 documento en /listas  ("' + LISTA_NUEVA + '")');
say('  ' + mapeados.length + ' documentos en /productos, en ' + Math.ceil(mapeados.length / 450) + ' lotes de 450');
say('  ' + (conPadre.length + conGramaje.length) + ' updates en la 2da pasada (remapeo de punteros)');
say('  ' + catsNuevas.length + ' documentos en /_categorias');
say('  0 borrados, 0 updates sobre productos o listas que ya existen');
say('');

fs.writeFileSync(path.join(DIR, 'informe-seco.txt'), L.join('\n'));

/* CSV completo para revisar producto por producto */
const csv = ['codigo;nombre;categoria;tipoVenta;motivo;envase;precio_yerco;precio_brotes;costo_brotes;stock_yerco;stock_brotes;padreId_yerco;grupoId'];
mapeados.forEach(m => csv.push([
  m.d.codigo, '"' + m.d.nombre.replace(/"/g, "'") + '"', m.d.categoria, m.d.tipoVenta, m.cl.motivo,
  m.kg ? m.kg + 'kg' : '-',
  m.origen.precio || 0, m.d.precio, m.d.costo, m.origen.stock || 0, m.d.stock,
  m.origen.padreId || '', m.d.grupoId || ''
].join(';')));
fs.writeFileSync(path.join(DIR, 'clasificacion.csv'), '﻿' + csv.join('\n'));

const csv2 = ['nombre_que_se_duplica;codigo_existente;tipoVenta_existente;lista_existente'];
choques.forEach(m => {
  const b = nombresB.get(m.d.nombre.trim().toUpperCase());
  const nl = (listasB.find(l => l.id === b.lista) || {}).nombre || b.lista || '';
  csv2.push(['"' + m.d.nombre.replace(/"/g, "'") + '"', b.codigo, b.tipoVenta, nl].join(';'));
});
fs.writeFileSync(path.join(DIR, 'duplicados.csv'), '﻿' + csv2.join('\n'));

say('Informe: informe-seco.txt | clasificacion.csv (873 filas) | duplicados.csv (' + choques.length + ')');

if (!MODO_ESCRIBIR) { say(''); say('>>> MODO SECO: no se escribio nada.'); process.exit(0); }

/* ==========================================================================
   MODO --escribir
   ========================================================================== */
const admin = require('C:/Users/Usuario/Documents/brotesdietetica/functions/node_modules/firebase-admin');
const crypto = require('crypto');
const appY = admin.initializeApp({ projectId: 'yerco-bb620', storageBucket: 'yerco-bb620.firebasestorage.app' }, 'wy');
const appB = admin.initializeApp({ projectId: 'brotesdietetica-2f78e', storageBucket: 'brotesdietetica-2f78e.firebasestorage.app' }, 'wb');
const dbB = appB.firestore();
const buckY = appY.storage().bucket(), buckB = appB.storage().bucket();
const MAPA_IMG = path.join(DIR, 'mapa-imagenes.json');
const MAPA_IDS = path.join(DIR, 'mapa-ids.json');

const rutaDe = u => { const m = String(u || '').match(/\/o\/([^?]+)/); return m ? decodeURIComponent(m[1]) : null; };

(async () => {
  /* --- guarda: si la lista ya existe, alguien ya corrio esto --- */
  const yaL = await dbB.collection('listas').where('nombre', '==', LISTA_NUEVA).get();
  if (!yaL.empty) {
    console.log('\n!! ABORTADO: la lista "' + LISTA_NUEVA + '" ya existe (' + yaL.docs[0].id + ').');
    console.log('   Correr esto de nuevo duplicaria los 873 productos.');
    console.log('   Para rehacerla hay que borrar antes esa lista y sus productos.');
    process.exit(1);
  }

  /* --- 1. imagenes: bucket de YERCO -> bucket de Brotes ------------------
     Se copian del lado del servidor (no bajan a esta maquina). Cada copia
     estrena su propio token de descarga, que es lo que hace publica la URL.
     El mapa queda en disco: si el paso se corta, al volver a correr no se
     recopia lo que ya estaba. */
  let mapaImg = fs.existsSync(MAPA_IMG) ? JSON.parse(fs.readFileSync(MAPA_IMG, 'utf8')) : {};
  const rutas = new Set();
  fru.forEach(p => { const r = rutaDe(p.imagen); if (r) rutas.add(r); (p.imagenesExtra || []).forEach(u => { const x = rutaDe(u); if (x) rutas.add(x); }); });
  const pend = [...rutas].filter(r => !mapaImg[r]);
  console.log('\n[1/5] imagenes: ' + rutas.size + ' en total, ' + pend.length + ' por copiar');
  let n = 0;
  for (const r of pend) {
    const token = crypto.randomUUID();
    const destino = buckB.file(r);
    await buckY.file(r).copy(destino);
    await destino.setMetadata({ cacheControl: 'public,max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } });
    mapaImg[r] = 'https://firebasestorage.googleapis.com/v0/b/' + buckB.name +
      '/o/' + encodeURIComponent(r) + '?alt=media&token=' + token;
    if (++n % 50 === 0) { fs.writeFileSync(MAPA_IMG, JSON.stringify(mapaImg, null, 1)); console.log('      ' + n + '/' + pend.length); }
  }
  fs.writeFileSync(MAPA_IMG, JSON.stringify(mapaImg, null, 1));
  console.log('      copiadas: ' + n);

  const reapunta = u => { const r = rutaDe(u); return (r && mapaImg[r]) ? mapaImg[r] : u; };

  /* --- 2. la lista nueva --- */
  const refL = await dbB.collection('listas').add({ nombre: LISTA_NUEVA, pdfSemanal: false });
  console.log('[2/5] lista "' + LISTA_NUEVA + '" creada: ' + refL.id);

  /* --- 3. los 873 productos. Los ids los pone Firestore, asi que se guardan
           para la segunda pasada: escribir el padreId de YERCO tal cual dejaria
           153 hijos apuntando a documentos que en Brotes no existen. --- */
  const mapaIds = {};
  let lote = dbB.batch(), enLote = 0, escritos = 0;
  for (const m of mapeados) {
    const ref = dbB.collection('productos').doc();
    mapaIds[m.origen.id] = ref.id;
    const d = { ...m.d, lista: refL.id };
    d.imagen = d.imagen ? reapunta(d.imagen) : null;
    d.imagenesExtra = (d.imagenesExtra || []).map(reapunta);
    lote.set(ref, d);
    if (++enLote === 450) { await lote.commit(); escritos += enLote; console.log('      ' + escritos + '/' + mapeados.length); lote = dbB.batch(); enLote = 0; }
  }
  if (enLote) { await lote.commit(); escritos += enLote; }
  fs.writeFileSync(MAPA_IDS, JSON.stringify({ lista: refL.id, ids: mapaIds }, null, 1));
  console.log('[3/5] productos creados: ' + escritos);

  /* --- 4. remapeo de los punteros --- */
  let lote2 = dbB.batch(), enLote2 = 0, upd = 0;
  for (const m of mapeados) {
    const cambios = {};
    if (m.origen.padreId && mapaIds[m.origen.padreId]) cambios.padreId = mapaIds[m.origen.padreId];
    if (m.origen.padreNombre) cambios.padreNombre = m.origen.padreNombre;
    if (m.origen.gramajePadreId && mapaIds[m.origen.gramajePadreId]) cambios.gramajePadreId = mapaIds[m.origen.gramajePadreId];
    if (!Object.keys(cambios).length) continue;
    lote2.update(dbB.collection('productos').doc(mapaIds[m.origen.id]), cambios);
    if (++enLote2 === 450) { await lote2.commit(); upd += enLote2; lote2 = dbB.batch(); enLote2 = 0; }
  }
  if (enLote2) { await lote2.commit(); upd += enLote2; }
  console.log('[4/5] punteros remapeados: ' + upd);

  /* --- 5. las categorias que Brotes no tenia --- */
  let lote3 = dbB.batch();
  catsNuevas.forEach(c => lote3.set(dbB.collection('_categorias').doc(c),
    { nombre: c, subcategorias: [...new Set(mapeados.filter(m => m.d.categoria === c && m.d.subcategoria).map(m => m.d.subcategoria))], createdAt: new Date() }));
  if (catsNuevas.length) await lote3.commit();
  console.log('[5/5] categorias creadas: ' + catsNuevas.length);

  /* --- control: contar los documentos, no los contadores (PENDIENTE.md §1a) --- */
  const finalP = await dbB.collection('productos').get();
  const enLista = finalP.docs.filter(d => d.data().lista === refL.id);
  const hijos = enLista.filter(d => d.data().padreId);
  const idsNuevos = new Set(enLista.map(d => d.id));
  const huerfanos = hijos.filter(d => !idsNuevos.has(d.data().padreId));
  console.log('\n--- MEDIDO DESPUES, contando documentos ---');
  console.log('  productos en Brotes : ' + finalP.size + '  (antes ' + bro.length + ')');
  console.log('  en FRUTICOR-TODOS   : ' + enLista.length + '  (esperado ' + mapeados.length + ')');
  console.log('  hijos con padre     : ' + hijos.length + '  huerfanos: ' + huerfanos.length + ' (tiene que ser 0)');
  console.log('  a granel (peso)     : ' + enLista.filter(d => d.data().tipoVenta === 'peso').length);
  console.log('  con imagen en Brotes: ' + enLista.filter(d => /brotesdietetica/.test(d.data().imagen || '')).length);
  console.log('  todavia en YERCO    : ' + enLista.filter(d => /yerco-bb620/.test(d.data().imagen || '')).length + ' (tiene que ser 0)');
  console.log('\nMapa de ids: mapa-ids.json (para revertir: borrar los de esa lista)');
  console.log('OJO: Storage -> Configuracion -> recalcular el uso, que subio ~19 MB.');
  process.exit(0);
})().catch(e => { console.error('\nERROR: ' + e.message); process.exit(1); });
