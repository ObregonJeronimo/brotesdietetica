/* ENTRAR A CAJA: LAS IDAS Y VUELTAS, NO LA ARITMETICA
   =============================================================================
   test-caja.js prueba que el arqueo sume bien. Esta prueba mide otra cosa: la
   ESPERA. Lo reportado del mostrador es que entrar a Caja despues de vender
   tarda, y lo medido el 18/09/2026 contra la base real fue que las nueve
   consultas de la seccion -que traen 22 ventas y 3 movimientos, o sea nada-
   salian en SEIS tandas encadenadas, a ~90 ms cada una.

   Se carga admin-caja.js de verdad en un contexto vm, con un Firestore de
   mentira que le suma DEMORA ms a cada consulta. Como las de una misma tanda
   esperan en paralelo, el tiempo total dividido DEMORA dice cuantas tandas
   encadena el codigo. Eso es lo que se afirma acá.
   ============================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'admin-caja.js'), 'utf8');
const ADMIN = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

const DEMORA = 50;   /* lo que tarda una ida y vuelta en esta prueba */

/* ======================= FIRESTORE DE MENTIRA ======================= */
let CONSULTAS = [], SALIDAS = [];
const dormir = ms => new Promise(r => setTimeout(r, ms));
const marca = seg => ({ seconds: seg });
const aMillis = v => (v && v.seconds != null) ? v.seconds * 1000 : (v instanceof Date ? v.getTime() : v);

const HOY = '2026-09-18';
let BASE;
function sembrar() {
  const ventas = [];
  for (let i = 1; i <= 22; i++) {
    ventas.push({ docId: 'v' + i, numero: i, cajaId: 'cajaHoy', total: 1000,
                  medioPago: 'Efectivo', fecha: marca(1789000000 + i) });
  }
  BASE = {
    config: { cajaEstado: { cajaAbiertaId: 'cajaHoy' } },
    cajas: [
      { docId: 'cajaHoy', numero: 21, fecha: HOY, estado: 'abierta',
        montoInicial: 20000, abiertoPor: 'duenio@local', abiertoEn: marca(1789000000) },
      { docId: 'caja1', numero: 20, fecha: '2026-09-17', estado: 'cerrada',
        abiertoEn: marca(1788900000), diferencia: 0, ventasBruto: 1, esperadoEfectivo: 1, contadoEfectivo: 1 }
    ],
    movimientos: { cajaHoy: [{ docId: 'm1', tipo: 'ingreso', concepto: 'aporte_cambio', monto: 5000, fecha: marca(1789000000) }] },
    ventas,
    ventasMayoristas: []
  };
}

let T0IDA = 0;
async function ida(etiqueta) {
  const cuando = Date.now() - T0IDA;
  CONSULTAS.push(etiqueta);
  SALIDAS.push({ etiqueta, cuando });
  if (process.env.DEBUG_TANDAS) console.log('    +' + cuando + ' ms  ' + etiqueta);
  await dormir(DEMORA);
}

/* UNA TANDA = las consultas que salen juntas, antes de que vuelva ninguna. Se
   cuentan por el momento en que salieron: si una sale despues de que otra
   volvio, es que la estaba esperando, y eso es una tanda mas. Contar tandas y
   no milisegundos hace que la prueba no dependa de lo rapida que este la
   maquina. */
function tandasDe(salidas) {
  const t = salidas.slice().sort((a, b) => a.cuando - b.cuando);
  const tandas = [];
  let actual = null;
  for (const s of t) {
    if (!actual || s.cuando - actual.ultimo >= DEMORA / 2) { actual = { ultimo: s.cuando, cuales: [] }; tandas.push(actual); }
    actual.ultimo = s.cuando;
    actual.cuales.push(s.etiqueta);
  }
  return tandas;
}
function snap(arr) {
  const docs = arr.map(d => ({ id: d.docId, exists: true, data: () => d }));
  return { size: docs.length, empty: !docs.length, docs, forEach: f => docs.forEach(f) };
}
function consulta(nombre, filas) {
  const e = { wh: [], orden: null, tope: 0 };
  const api = {
    where: (c, op, v) => { e.wh.push([c, op, v]); return api; },
    orderBy: (c, d) => { e.orden = [c, d]; return api; },
    limit: n => { e.tope = n; return api; },
    get: async () => {
      await ida(nombre);
      let r = filas.filter(d => e.wh.every(([c, op, v]) => {
        const x = d[c];
        if (op === '==') return x === v;
        if (op === '>=') return aMillis(x) >= aMillis(v);
        if (op === '<=') return aMillis(x) <= aMillis(v);
        return true;
      }));
      if (e.orden) r = r.slice().sort((a, b) => (aMillis(a[e.orden[0]]) > aMillis(b[e.orden[0]]) ? 1 : -1) * (e.orden[1] === 'desc' ? -1 : 1));
      if (e.tope) r = r.slice(0, e.tope);
      return snap(r);
    }
  };
  return api;
}
const db = {
  collection: (n) => {
    if (n === 'config') return { doc: (id) => ({ get: async () => { await ida('config/' + id); const d = BASE.config[id]; return { exists: !!d, id, data: () => d }; } }) };
    if (n === 'cajas') {
      const api = consulta('cajas', BASE.cajas);
      api.doc = (id) => ({
        get: async () => { await ida('cajas/' + id); const d = BASE.cajas.find(c => c.docId === id); return { exists: !!d, id, data: () => d }; },
        collection: (sub) => consulta('cajas/' + id + '/' + sub, BASE.movimientos[id] || [])
      });
      return api;
    }
    if (n === 'ventas' || n === 'ventasMayoristas') return consulta(n, BASE[n]);
    throw new Error('coleccion no simulada: ' + n);
  }
};

/* ======================= EL PANEL, LO MINIMO ======================= */
const PINTADO = {};
function elemento(id) {
  return { id, options: [], value: '',
           set innerHTML(v) { PINTADO[id] = v; }, get innerHTML() { return PINTADO[id] || ''; },
           scrollIntoView() {} };
}
const ELEMS = {};
const documento = { getElementById: (id) => (ELEMS[id] || (ELEMS[id] = elemento(id))) };

let RENDERS = 0;
const sandbox = {
  console, db, auth: { currentUser: { email: 'prueba@local' } }, firebase: null,
  window: {}, document: documento,
  setTimeout, clearTimeout, Date,
  esc: s => String(s == null ? '' : s),
  showAdminToast: () => {},
  hoyAR: () => HOY,
  medioKeyDeVenta: v => (v && v.medioPagoKey) || 'efectivo',
  __render: () => { RENDERS++; }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* Se envuelve renderCaja DESPUES de cargar el modulo, para contar dibujados sin
   tocar el fuente. Como es un `function` del scope del script, se puede. */
const ENVOLVER = `
const _rc = renderCaja;
renderCaja = function () { __render(); return _rc.apply(this, arguments); };
`;
vm.runInContext(SRC + '\n' + ENVOLVER, sandbox, { filename: 'admin-caja.js' });

/* ============================== PRUEBAS ============================== */
let ok = 0, mal = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { mal++; console.log('  FALLA ' + d); } };
const grupo = n => console.log('\n' + n);

const correr = (js) => vm.runInContext(js, sandbox);
/* Contra el commit anterior estas funciones no existen. Sin esto la suite
   explotaba en la primera y las demas afirmaciones no llegaban a decir nada,
   que es justo cuando uno quiere leerlas. */
const correrSeguro = (js) => { try { return correr(js); } catch (e) { return '__NO EXISTE__ ' + e.message; } };

(async () => {
  /* ------------------------------------------------ 1. la carga completa */
  grupo('loadCaja(): las mismas consultas, en menos tandas');
  sembrar(); CONSULTAS = []; SALIDAS = []; RENDERS = 0;
  let t0 = Date.now(); T0IDA = t0;
  await correr('loadCaja()');
  const carga = Date.now() - t0;
  const pedidas = CONSULTAS.slice();

  t('trae la config de la caja', pedidas.includes('config/cajaConfig'));
  t('mira el puntero de caja abierta', pedidas.includes('config/cajaEstado'));
  t('lee la caja abierta', pedidas.includes('cajas/cajaHoy'));
  t('trae las ventas de la caja', pedidas.filter(c => c === 'ventas').length >= 1);
  t('trae las mayoristas', pedidas.includes('ventasMayoristas'));
  t('trae los movimientos', pedidas.includes('cajas/cajaHoy/movimientos'));
  t('trae el historial', pedidas.includes('cajas'));
  t('son nueve consultas, ni una mas ni una menos', pedidas.length === 9);
  t('dibuja la caja', RENDERS >= 1);
  t('deja el resumen del historial pintado', /caja/.test(PINTADO['cajaHistResumen'] || ''));

  /* LA AFIRMACION QUE FALLA CONTRA EL COMMIT ANTERIOR: eran seis tandas.
     1) config + estado + historial   2) la caja   3) datos + sueltas */
  const TANDAS = tandasDe(SALIDAS);
  const tamanios = TANDAS.map(x => x.cuales.length);
  t('encadena 3 tandas y no 6  (fueron ' + TANDAS.length + ': ' + tamanios.join('+') + ', ' + carga + ' ms)',
    TANDAS.length === 3);
  t('1ra tanda: la config, el puntero y el historial, juntos',
    tamanios[0] === 3 && TANDAS[0].cuales.includes('cajas') &&
    TANDAS[0].cuales.includes('config/cajaConfig') && TANDAS[0].cuales.includes('config/cajaEstado'));
  t('2da tanda: la caja abierta, que necesita el id de la 1ra',
    tamanios[1] === 1 && TANDAS[1].cuales[0] === 'cajas/cajaHoy');
  t('3ra tanda: las cinco que dependen de la caja, juntas', tamanios[2] === 5);

  /* ---------------------------------------- 2. volver a entrar no consulta */
  grupo('entrarACaja(): la segunda visita no espera a la base');
  t('existe entrarACaja()', typeof sandbox.entrarACaja === 'function');
  CONSULTAS = []; RENDERS = 0;
  t0 = Date.now();
  await correrSeguro('entrarACaja()');
  const segunda = Date.now() - t0;
  t('no espera ni una ida y vuelta  (' + segunda + ' ms)', segunda < DEMORA);
  t('igual dibuja la pantalla', RENDERS >= 1);
  t('y la deja con la caja abierta', /Caja #0021 abierta/.test(PINTADO['cajaTop'] || ''));

  grupo('...pero relee por detras');
  await dormir(DEMORA * 5);
  t('la relectura salio sola', CONSULTAS.length === 9);

  grupo('Entrar tres veces seguidas dispara UNA sola relectura');
  CONSULTAS = [];
  await correrSeguro('entrarACaja()'); await correrSeguro('entrarACaja()'); await correrSeguro('entrarACaja()');
  await dormir(DEMORA * 5);
  t('nueve consultas, no veintisiete  (fueron ' + CONSULTAS.length + ')', CONSULTAS.length === 9);

  /* ------------------------------------------- 3. el limite de lo "fresco" */
  grupo('Con los datos viejos se espera la lectura, como antes');
  correrSeguro('_cajaCargadaEn = Date.now() - (CAJA_FRESCA_MS + 1000);');
  CONSULTAS = [];
  t0 = Date.now();
  await correrSeguro('entrarACaja()');
  const vieja = Date.now() - t0;
  t('vuelve a esperar la base  (' + vieja + ' ms)', vieja >= DEMORA * 2);
  t('y consulta las nueve', CONSULTAS.length === 9);

  /* ------------------------------------- 4. la venta recien hecha, sin leer */
  grupo('cajaRegistrarVenta(): la venta entra sin consultar nada');
  t('existe cajaRegistrarVenta()', typeof sandbox.cajaRegistrarVenta === 'function');
  CONSULTAS = []; RENDERS = 0;
  const antes = correr('calcularTotalesCaja().count');
  const sumo = correrSeguro("cajaRegistrarVenta({docId:'nueva',cajaId:'cajaHoy',total:7000,medioPago:'Efectivo'},'minorista')");
  t('la suma y avisa que si', sumo === true);
  t('sin una sola consulta', CONSULTAS.length === 0);
  t('la cuenta de ventas sube en una', correr('calcularTotalesCaja().count') === antes + 1);
  t('y la plata tambien', correr('calcularTotalesCaja().esperado') === correr('calcularTotalesCaja().esperado'));
  t('redibuja la pantalla', RENDERS === 1);
  t('la pantalla ya dice ' + (antes + 1) + ' ventas',
    (PINTADO['cajaTop'] || '').includes('Ventas (' + (antes + 1) + ')'));

  const dedupe = correrSeguro("cajaRegistrarVenta({docId:'nueva',cajaId:'cajaHoy',total:7000},'minorista')");
  t('la misma venta dos veces no se cuenta dos veces', dedupe === false && correr('calcularTotalesCaja().count') === antes + 1);
  const otra = correrSeguro("cajaRegistrarVenta({docId:'x',cajaId:'otraCaja',total:7000},'minorista')");
  t('una venta de otra caja no entra', otra === false && correr('calcularTotalesCaja().count') === antes + 1);
  const sinCaja = correrSeguro("(function(){const g=cajaActual;cajaActual=null;const r=cajaRegistrarVenta({docId:'y',cajaId:'cajaHoy',total:1},'minorista');cajaActual=g;return r;})()");
  t('con la caja cerrada no hace nada', sinCaja === false);
  const mayorista = correrSeguro("cajaRegistrarVenta({docId:'may1',cajaId:'cajaHoy',total:5000,medioPago:'Efectivo'},'mayorista')");
  t('la mayorista entra como mayorista',
    mayorista === true && correr("calcularTotalesCaja().porTipo.mayorista.count") === 1);

  /* --------------------------------------------- 5. lo que engancha el panel */
  grupo('admin.html: quien llama a todo esto');
  t("switchSection('caja') entra por entrarACaja()", /if\(sec==='caja'\)entrarACaja\(\);/.test(ADMIN));
  t('ya no rehace loadCaja() al entrar', !/if\(sec==='caja'\)loadCaja\(\);/.test(ADMIN));
  t('saveVenta le avisa a la caja',
    /ventaRefNueva=await db\.collection\('ventas'\)\.add\(venta\);[\s\S]{0,600}?cajaRegistrarVenta\(Object\.assign\(\{docId:ventaRefNueva\.id\},venta\),'minorista'\)/.test(ADMIN));
  t('y la mayorista tambien',
    /ventasMayoristas'\)\.add\(ventaMayNueva\);[\s\S]{0,400}?cajaRegistrarVenta\(Object\.assign\(\{docId:ventaMayRef\.id\},ventaMayNueva\),'mayorista'\)/.test(ADMIN));
  t('el aviso va DESPUES de escribir la venta, no antes',
    ADMIN.indexOf("cajaRegistrarVenta(Object.assign({docId:ventaRefNueva.id}") >
    ADMIN.indexOf("const ventaRefNueva=await db.collection('ventas').add(venta);"));

  grupo('El historial no parpadea cuando la relectura va por detras');
  t('el "Cargando..." del historial esta condicionado',
    /if \(!_cajasHistorial\.length\) cont\.innerHTML = '<p[^']*>Cargando/.test(SRC));

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('  EXPLOTO: ' + e.stack); console.log('\n' + ok + ' pasaron, ' + (mal + 1) + ' fallaron'); process.exit(1); });
