/* CAJA VIANDAS (pedido de la clienta, 10/10/2026)
   =============================================================================
   Una caja APARTE para las viandas (los platos de la cocina), con su propia plata,
   que nunca se junta con la del local. Esta prueba carga de verdad admin-caja.js y
   admin-viandas.js en un contexto vm, con un Firestore de mentira en memoria, y
   revisa lo que importa para que la plata no se cruce:
     - cada caja usa SOLO su coleccion, su puntero y su numero;
     - las cuentas de una no tocan las de la otra;
     - "Ventas fuera de caja" y Adjuntar, cada caja solo las suyas;
     - el cierre congela los totales en la coleccion correcta;
     - el cobro por transferencia o tarjeta no suma al efectivo;
     - que es vianda y los tres frenos de la venta;
     - el pedido de la tienda con viandas y otras cosas (dos ventas);
     - y que admin.html quedo enganchado.
   ============================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CAJA = fs.readFileSync(path.join(RAIZ, 'admin-caja.js'), 'utf8');
const VDS = fs.readFileSync(path.join(RAIZ, 'admin-viandas.js'), 'utf8');
const ADMIN = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const STATS = fs.readFileSync(path.join(RAIZ, 'admin-stats.js'), 'utf8');
const REGLAS = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');

let ok = 0, mal = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { mal++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); }
};
const grupo = n => console.log('\n' + n);

/* ======================= FIRESTORE DE MENTIRA, EN MEMORIA ======================= */
function crearBase(inicial) {
  const datos = {};            /* 'col' -> { id -> doc }, y 'col/id/sub' -> { id -> doc } */
  const ops = [];              /* lo que se pidio, en orden: 'get col', 'add col', ... */
  let n = 0;
  const tabla = c => (datos[c] = datos[c] || {});
  Object.keys(inicial || {}).forEach(c => { Object.keys(inicial[c]).forEach(id => { tabla(c)[id] = Object.assign({}, inicial[c][id]); }); });
  const valor = v => (v && v.__inc != null) ? v : v;
  const aplicar = (doc, cambios) => {
    Object.keys(cambios).forEach(k => {
      const v = cambios[k];
      if (v && v.__borrar) delete doc[k];
      else if (v && v.__inc != null) doc[k] = Number(doc[k] || 0) + v.__inc;
      else doc[k] = (v && v.__ahora) ? { seconds: Math.floor(Date.now() / 1000) } : v;
    });
  };
  const snapDoc = (c, id) => { const d = tabla(c)[id]; return { id, exists: !!d, data: () => (d ? Object.assign({}, d) : undefined) }; };
  const ms = v => (v && v.seconds != null) ? v.seconds * 1000 : (v instanceof Date ? v.getTime() : v);
  function consulta(c) {
    const e = { wh: [], orden: null, tope: 0 };
    const api = {
      where: (k, op, v) => { e.wh.push([k, op, v]); return api; },
      orderBy: (k, dir) => { e.orden = [k, dir]; return api; },
      limit: x => { e.tope = x; return api; },
      get: async () => {
        ops.push('get ' + c + (e.wh.length ? ' where ' + e.wh.map(w => w[0] + w[1] + (typeof w[2] === 'string' ? w[2] : '?')).join(',') : ''));
        let filas = Object.keys(tabla(c)).map(id => Object.assign({ __id: id }, tabla(c)[id]));
        filas = filas.filter(d => e.wh.every(([k, op, v]) => {
          const x = d[k];
          if (op === '==') return x === v;
          if (op === '>=') return ms(x) >= ms(v);
          if (op === '<=') return ms(x) <= ms(v);
          return true;
        }));
        if (e.orden) filas.sort((a, b) => (ms(a[e.orden[0]]) > ms(b[e.orden[0]]) ? 1 : -1) * (e.orden[1] === 'desc' ? -1 : 1));
        if (e.tope) filas = filas.slice(0, e.tope);
        const docs = filas.map(d => { const id = d.__id; const x = Object.assign({}, d); delete x.__id; return { id, exists: true, data: () => x }; });
        return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
      }
    };
    return api;
  }
  function refDoc(c, id) {
    return {
      id,
      get: async () => { ops.push('get ' + c + '/' + id); return snapDoc(c, id); },
      set: async v => { ops.push('set ' + c + '/' + id); tabla(c)[id] = {}; aplicar(tabla(c)[id], v); },
      update: async v => { ops.push('update ' + c + '/' + id); if (!tabla(c)[id]) throw new Error('NOT_FOUND ' + c + '/' + id); aplicar(tabla(c)[id], v); },
      delete: async () => { ops.push('delete ' + c + '/' + id); delete tabla(c)[id]; },
      collection: sub => coleccion(c + '/' + id + '/' + sub)
    };
  }
  function coleccion(c) {
    const api = consulta(c);
    api.doc = id => refDoc(c, id);
    api.add = async v => { const id = 'n' + (++n); ops.push('add ' + c); tabla(c)[id] = {}; aplicar(tabla(c)[id], v); return { id }; };
    return api;
  }
  const db = {
    collection: coleccion,
    runTransaction: async fn => {
      const tx = {
        get: async r => r.get(),
        set: (r, v) => { r.set(v); },
        update: (r, v) => { r.update(v); }
      };
      return fn(tx);
    },
    batch: () => { const cola = []; return { update: (r, v) => cola.push(() => r.update(v)), commit: async () => { for (const f of cola) await f(); } }; }
  };
  return { db, datos, ops, tabla };
}

/* ======================= EL PANEL, LO MINIMO ======================= */
function crearPanel(base, extras) {
  const PINTADO = {};
  const ELEMS = {};
  const clases = () => { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, v) => (v === undefined ? (s.has(c) ? s.delete(c) : s.add(c)) : (v ? s.add(c) : s.delete(c))) }; };
  const elemento = id => ({
    id, options: [], value: '', disabled: false, style: {}, classList: clases(),
    set innerHTML(v) { PINTADO[id] = v; }, get innerHTML() { return PINTADO[id] || ''; },
    set textContent(v) { PINTADO[id] = v; }, get textContent() { return PINTADO[id] || ''; },
    focus() {}, scrollIntoView() {}
  });
  const documento = {
    getElementById: id => (ELEMS[id] || (ELEMS[id] = elemento(id))),
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => elemento(''), body: { appendChild() {} },
    addEventListener() {}, removeEventListener() {}
  };
  const reg = { toasts: [], logs: [], preguntas: [] };
  const ctx = Object.assign({
    /* Los console.warn de las lecturas que fallan a proposito ensucian la salida: se callan. */
    console: { log: console.log, error: console.error, warn() {} }, Date, Math, Number, String, Object, Array, Set, Map, Promise, JSON, setTimeout: f => f(), clearTimeout() {},
    db: base.db, auth: { currentUser: { email: 'prueba@local' } },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => ({ __ahora: 1 }), delete: () => ({ __borrar: 1 }), increment: x => ({ __inc: x }), arrayUnion: () => [] } } },
    window: {}, document: documento,
    esc: s => String(s == null ? '' : s),
    showAdminToast: (m, tipo) => reg.toasts.push((tipo || '') + ': ' + m),
    logAction: (a, b, c) => reg.logs.push(a + ' | ' + b + ' | ' + (c || '')),
    pedirConfirmacion: async (m, o) => { reg.preguntas.push(m); return true; },
    hoyAR: () => '2026-10-10',
    montoAR: s => Number(String(s || '').replace(/\D/g, '')) || 0,
    medioKeyDeVenta: v => (v && v.medioPagoKey) || (/^efec/i.test((v && v.medioPago) || '') ? 'efectivo' : /^trans/i.test((v && v.medioPago) || '') ? 'transferencia' : /tarj/i.test((v && v.medioPago) || '') ? 'tarjeta' : /corriente|fiado/i.test((v && v.medioPago) || '') ? 'cuenta_corriente' : 'otro'),
    removePagination() {}, renderAdminPagination() {},
    _buildMesOptions() {}
  }, extras || {});
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(CAJA + '\n' + VDS, ctx, { filename: 'admin-caja+viandas.js' });
  return { ctx, PINTADO, reg, run: js => vm.runInContext(js, ctx) };
}

const HOY = '2026-10-10';
const ts = (d, h) => new Date(d + 'T' + (h || '12:00') + ':00');

(async () => {

  /* ------------------------------------------------------------------ 1 */
  grupo('1. Cada caja, su coleccion, su puntero y su numero');
  {
    const base = crearBase({
      config: { cajaEstado: { cajaAbiertaId: 'cL' }, cajaViandasEstado: { cajaAbiertaId: 'cV' } },
      cajas: { cL: { numero: 30, estado: 'abierta', fecha: HOY, montoInicial: 20000, abiertoEn: ts(HOY, '08:00') } },
      cajasViandas: { cV: { numero: 2, estado: 'abierta', fecha: HOY, montoInicial: 5000, abiertoEn: ts(HOY, '08:05') } },
      ventas: {
        v1: { numero: 101, total: 10000, medioPago: 'Efectivo', cajaId: 'cL', fecha: ts(HOY, '09:00') },
        v2: { numero: 102, total: 15000, medioPago: 'Efectivo', cajaId: 'cV', cajaTipo: 'viandas', fecha: ts(HOY, '09:30') },
        v3: { numero: 103, total: 8000, medioPago: 'Transferencia', cajaId: 'cV', cajaTipo: 'viandas', fecha: ts(HOY, '10:00') }
      },
      ventasMayoristas: { m1: { numero: 7, total: 50000, medioPago: 'Efectivo', cajaId: 'cL', fecha: ts(HOY, '11:00') } },
      'cajas/cL/movimientos': { a: { tipo: 'egreso', concepto: 'gasto', monto: 1000, fecha: ts(HOY, '10:30') } },
      'cajasViandas/cV/movimientos': { b: { tipo: 'ingreso', concepto: 'aporte_cambio', monto: 2000, fecha: ts(HOY, '08:10') } }
    });
    const P = crearPanel(base);
    await P.run("loadCaja('viandas')");
    const opsV = base.ops.slice();
    t('la de viandas lee SU puntero y SU coleccion', opsV.includes('get config/cajaViandasEstado') && opsV.includes('get cajasViandas/cV') &&
      opsV.some(o => o.startsWith('get cajasViandas/cV/movimientos')), opsV);
    t('  y no toca nada de la caja del local', !opsV.some(o => /config\/cajaEstado|get cajas\b|cajas\/cL/.test(o)), opsV);
    t('  ni las mayoristas (las viandas no se venden por mayor)', !opsV.some(o => o.indexOf('ventasMayoristas') >= 0), opsV);
    const tv = P.run("calcularTotalesCaja('viandas')");
    t('sus cuentas: 2 ventas, $23.000, efectivo $15.000', tv.count === 2 && tv.bruto === 23000 && tv.porMedio.efectivo === 15000 && tv.porMedio.transferencia === 8000, tv);
    t('  esperado = 5.000 + 15.000 + 2.000 = 22.000', tv.esperado === 22000, tv.esperado);
    t('la del local no se cargo: sigue vacia', P.run('cajaActual') === null && P.run("calcularTotalesCaja().count") === 0);
    base.ops.length = 0;
    await P.run('loadCaja()');
    const opsL = base.ops.slice();
    t('la del local lee lo suyo, como siempre (9 consultas)', opsL.length === 9 && opsL.includes('get config/cajaEstado') && opsL.includes('get cajas/cL'), opsL);
    t('  y no toca nada de la de viandas', !opsL.some(o => /cajaViandasEstado|cajasViandas/.test(o)), opsL);
    const tl = P.run('calcularTotalesCaja()');
    t('sus cuentas: la minorista y la mayorista, sin las de viandas', tl.count === 2 && tl.bruto === 60000 && tl.esperado === 20000 + 60000 - 1000, tl);
    const tv2 = P.run("calcularTotalesCaja('viandas')");
    t('y las de viandas siguen igual despues de cargar la otra', tv2.count === 2 && tv2.esperado === 22000, tv2);
    P.run("renderCaja('viandas')");
    t('la pantalla de viandas se pinta en vCajaTop: "Caja viandas #0002 abierta"', /Caja viandas #0002 abierta/.test(P.PINTADO.vCajaTop || ''), (P.PINTADO.vCajaTop || '').slice(0, 200));
    t('  con sus botones llamando a la caja de viandas', /openMovModal\('ingreso','viandas'\)/.test(P.PINTADO.vCajaTop) && /openCierreModal\('viandas'\)/.test(P.PINTADO.vCajaTop) && /openCorteParcial\('viandas'\)/.test(P.PINTADO.vCajaTop));
    t('  sin el desglose minorista/mayorista', !/Mayorista -/.test(P.PINTADO.vCajaTop));
    t('la del local sigue pintandose en cajaTop, con sus botones de siempre', /Caja #0030 abierta/.test(P.PINTADO.cajaTop || '') && /openMovModal\('ingreso'\)/.test(P.PINTADO.cajaTop) && /openCierreModal\(\)/.test(P.PINTADO.cajaTop));
    t('getCajaAbiertaId: cada una la suya', P.run("getCajaAbiertaId()") === 'cL' && P.run("getCajaAbiertaId('viandas')") === 'cV');
    t('getCajaAbiertaIdLive: cada una la suya', await P.run("getCajaAbiertaIdLive()") === 'cL' && await P.run("getCajaAbiertaIdLive('viandas')") === 'cV');
    t('una venta nueva va a la caja de SU id', P.run("cajaRegistrarVenta({docId:'x1',cajaId:'cV',total:3000,medioPago:'Efectivo',cajaTipo:'viandas'},'minorista')") === true &&
      P.run("calcularTotalesCaja('viandas').count") === 3 && P.run('calcularTotalesCaja().count') === 2);
    t('  y una del local, a la del local', P.run("cajaRegistrarVenta({docId:'x2',cajaId:'cL',total:1000,medioPago:'Efectivo'},'minorista')") === true &&
      P.run('calcularTotalesCaja().count') === 3 && P.run("calcularTotalesCaja('viandas').count") === 3);
  }

  /* ------------------------------------------------------------------ 2 */
  grupo('2. Si la lectura falla, la de viandas NUNCA cae en la caja del local');
  {
    const base = crearBase({});
    const P = crearPanel(base);
    P.run("cajaActual = { docId: 'cL', estado: 'abierta' };");
    P.ctx.db = { collection: () => ({ doc: () => ({ get: async () => { throw new Error('sin red'); } }) }) };
    P.run("db = globalThis.db;");
    t('falla la lectura: la del local cae en la suya en memoria (como siempre)', await P.run("getCajaAbiertaIdLive()") === 'cL');
    t('  la de viandas, sin una suya en memoria, da null (y no la del local)', await P.run("getCajaAbiertaIdLive('viandas')") === null);
  }

  /* ------------------------------------------------------------------ 3 */
  grupo('3. Ventas fuera de caja: cada caja solo las suyas');
  {
    const base = crearBase({
      config: { cajaEstado: { cajaAbiertaId: 'cL' }, cajaViandasEstado: { cajaAbiertaId: 'cV' } },
      cajas: { cL: { numero: 1, estado: 'abierta', fecha: HOY, montoInicial: 0, abiertoEn: ts(HOY) } },
      cajasViandas: { cV: { numero: 1, estado: 'abierta', fecha: HOY, montoInicial: 0, abiertoEn: ts(HOY) } },
      ventas: {
        s1: { numero: 1, total: 1000, medioPago: 'Efectivo', fecha: ts(HOY, '09:00') },
        s2: { numero: 2, total: 2000, medioPago: 'Efectivo', cajaTipo: 'viandas', fecha: ts(HOY, '09:10') },
        s3: { numero: 3, total: 3000, medioPago: 'Efectivo', cajaId: 'cL', fecha: ts(HOY, '09:20') }
      },
      ventasMayoristas: { m: { numero: 9, total: 4000, medioPago: 'Efectivo', fecha: ts(HOY, '09:30') } }
    });
    const P = crearPanel(base);
    await P.run('loadCaja()');
    await P.run("loadCaja('viandas')");
    const sl = P.run('cajaVentasSueltas.map(v=>v.docId).sort().join()');
    const sv = P.run("CAJAS.viandas.sueltas.map(v=>v.docId).join()");
    t('la del local ve la minorista y la mayorista sin caja, NO la de viandas', sl === 'm,s1', sl);
    t('la de viandas ve solo la de viandas sin caja', sv === 's2', sv);
    P.run("renderCaja('viandas')");
    t('  y su aviso dice "Ventas de viandas fuera de caja (1)" con Adjuntar a ESTA caja', /Ventas de viandas fuera de caja \(1\)/.test(P.PINTADO.vCajaTop) && /adjuntarVentasSueltas\('viandas'\)/.test(P.PINTADO.vCajaTop));
    await P.run("adjuntarVentasSueltas('viandas')");
    t('Adjuntar en la de viandas le pone SU id solo a la de viandas', base.tabla('ventas').s2.cajaId === 'cV' && !base.tabla('ventas').s1.cajaId);
    t('  y la plata entra a su cuenta', P.run("calcularTotalesCaja('viandas').porMedio.efectivo") === 2000);
    await P.run('adjuntarVentasSueltas()');
    t('Adjuntar en la del local: la minorista y la mayorista, a la del local', base.tabla('ventas').s1.cajaId === 'cL' && base.tabla('ventasMayoristas').m.cajaId === 'cL' && base.tabla('ventas').s2.cajaId === 'cV');
  }

  /* ------------------------------------------------------------------ 4 */
  grupo('4. Abrir: la de viandas no la frena la del local, ni al reves');
  {
    const base = crearBase({
      config: { cajaEstado: { cajaAbiertaId: 'cL' }, cajasCount: { count: 30 } },
      cajas: { cL: { numero: 30, estado: 'abierta', fecha: HOY, montoInicial: 20000, abiertoEn: ts(HOY) } }
    });
    const P = crearPanel(base);
    P.run("document.getElementById('vCajaMontoInicial').value = '5000';");
    await P.run("abrirCaja('viandas')");
    const cv = Object.keys(base.tabla('cajasViandas'));
    t('con la del local abierta, la de viandas se abre igual', cv.length === 1, P.reg.toasts);
    const doc = base.tabla('cajasViandas')[cv[0]];
    t('  en cajasViandas, con su numero 1 (su propio contador) y su fondo', doc && doc.numero === 1 && doc.montoInicial === 5000 && doc.estado === 'abierta' && doc.fecha === HOY, doc);
    t('  el contador de la del local no se toco', base.tabla('config').cajasCount.count === 30 && base.tabla('config').cajasViandasCount.count === 1);
    t('  su puntero apunta a ella y el de la del local sigue igual', base.tabla('config').cajaViandasEstado.cajaAbiertaId === cv[0] && base.tabla('config').cajaEstado.cajaAbiertaId === 'cL');
    t('  el historial dice "Caja viandas #1 abierta"', P.reg.logs.some(l => /abrir \| Caja viandas #1 abierta/.test(l)), P.reg.logs);
    P.run("document.getElementById('vCajaMontoInicial').value = '5000';");
    await P.run("abrirCaja('viandas')");
    t('una segunda de viandas no: "Ya hay una caja de viandas abierta"', Object.keys(base.tabla('cajasViandas')).length === 1 && P.reg.toasts.some(m => /Ya hay una caja de viandas abierta/.test(m)));
  }

  /* ------------------------------------------------------------------ 5 */
  grupo('5. Movimientos y cierre de la de viandas, en SU coleccion');
  {
    const base = crearBase({
      config: { cajaEstado: { cajaAbiertaId: 'cL' }, cajaViandasEstado: { cajaAbiertaId: 'cV' } },
      cajas: { cL: { numero: 30, estado: 'abierta', fecha: HOY, montoInicial: 20000, abiertoEn: ts(HOY) } },
      cajasViandas: { cV: { numero: 2, estado: 'abierta', fecha: HOY, montoInicial: 5000, abiertoEn: ts(HOY) } },
      ventas: {
        v2: { numero: 102, total: 15000, medioPago: 'Efectivo', cajaId: 'cV', cajaTipo: 'viandas', fecha: ts(HOY, '09:30') },
        v4: { numero: 104, total: 6000, medioPago: 'Cuenta Corriente', cajaId: 'cV', cajaTipo: 'viandas', fecha: ts(HOY, '10:30') }
      }
    });
    const P = crearPanel(base);
    await P.run("loadCaja('viandas')");
    P.run("openMovModal('egreso','viandas')");
    P.run("document.getElementById('vMovMonto').value='1500'; document.getElementById('vMovDetalle').value='bandejas para la cocina'; document.getElementById('vMovConcepto').value='gasto';");
    await P.run("guardarMovimiento('viandas')");
    const movsV = base.tabla('cajasViandas/cV/movimientos');
    t('el egreso se guarda en la caja de viandas', Object.values(movsV).some(m => m.tipo === 'egreso' && m.monto === 1500), movsV);
    t('  y nada en la del local', !Object.keys(base.datos).some(k => k.indexOf('cajas/cL/movimientos') === 0 && Object.keys(base.datos[k]).length));
    /* un cobro de fiado por transferencia en la de viandas: anotado, pero no suma al efectivo */
    base.tabla('cajasViandas/cV/movimientos').cob = { tipo: 'ingreso', concepto: 'cobro_cuenta_corriente', monto: 4000, medio: 'transferencia', fecha: ts(HOY, '11:00') };
    base.tabla('cajasViandas/cV/movimientos').cob2 = { tipo: 'ingreso', concepto: 'cobro_cuenta_corriente', monto: 2500, medio: 'efectivo', fecha: ts(HOY, '11:05') };
    await P.run("cargarDatosCaja('cV','viandas')");
    const tv = P.run("calcularTotalesCaja('viandas')");
    t('el cobro por transferencia NO suma al efectivo esperado; el de efectivo si', tv.ingresos === 2500 && tv.ingresosOtros === 4000 && tv.esperado === 5000 + 15000 + 2500 - 1500, tv);
    P.run("renderCaja('viandas')");
    t('  la pantalla lo muestra aparte: "cobros por transferencia o tarjeta (no entran al cajón)"', /cobros por transferencia o tarjeta \(no entran al cajón\)/.test(P.PINTADO.vCajaTop));
    t('  y el movimiento lleva su marca TRANSFERENCIA', /badge-medio[^>]*>TRANSFERENCIA/.test(P.PINTADO.vCajaTop));
    await P.run("openCierreModal('viandas')");
    P.run("document.getElementById('vCajaContado').value='21000'; document.getElementById('vCajaRetiro').value='16000'; document.getElementById('vCajaMotivo').value='';");
    P.run("onContadoInput('viandas')");
    t('al contar justo lo esperado ($21.000) se puede cerrar', P.ctx.document.getElementById('vCajaCerrarBtn').disabled === false);
    await P.run("confirmarCierre('viandas')");
    const cv = base.tabla('cajasViandas').cV;
    t('se cierra la de viandas, en SU coleccion', cv.estado === 'cerrada', cv);
    t('  con los totales congelados: esperado 21.000, contado 21.000, diferencia 0', cv.esperadoEfectivo === 21000 && cv.contadoEfectivo === 21000 && cv.diferencia === 0, cv);
    t('  ventas 2 por $21.000 (efectivo 15.000, fiado 6.000)', cv.ventasCount === 2 && cv.ventasBruto === 21000 && cv.ventasPorMedio.efectivo === 15000 && cv.ventasPorMedio.cuenta_corriente === 6000, cv.ventasPorMedio);
    t('  ingresos 2.500 (los que suman) y 4.000 aparte, que no suman', cv.totalIngresos === 2500 && cv.ingresosNoEfectivo === 4000 && cv.totalEgresos === 1500, cv);
    t('  queda 5.000 de fondo para mañana', cv.retiroFinal === 16000 && cv.dejaEnCaja === 5000);
    t('  su puntero queda vacio y el de la del local sigue apuntando a la suya', base.tabla('config').cajaViandasEstado.cajaAbiertaId === null && base.tabla('config').cajaEstado.cajaAbiertaId === 'cL');
    t('  la caja del local no se toco', base.tabla('cajas').cL.estado === 'abierta' && base.tabla('cajas').cL.esperadoEfectivo === undefined);
    t('  el historial dice "Caja viandas #2 cerrada"', P.reg.logs.some(l => /cerrar \| Caja viandas #2 cerrada/.test(l)), P.reg.logs);
    t('  la del local en memoria, intacta', P.run('cajaActual') === null && P.run("CAJAS.viandas.actual") === null);
  }

  /* ------------------------------------------------------------------ 6 */
  grupo('6. El arqueo impreso y los archivos dicen "viandas"');
  {
    const P = crearPanel(crearBase({}));
    const d = { caja: { numero: 3, fecha: '2026-10-10', ventasPorMedio: { efectivo: 1000 }, esperadoEfectivo: 1000, contadoEfectivo: 1000, diferencia: 0, ingresosNoEfectivo: 500 }, movs: [], ventas: [], k: 'viandas' };
    const html = P.ctx.buildArqueoHTML(d);
    t('el comprobante dice "Arqueo de caja de viandas" y "Caja viandas #0003"', /Arqueo de caja de viandas/.test(html) && /Caja viandas #0003/.test(html));
    t('  y que los cobros por transferencia no entran', /Tampoco \$500 de cobros por transferencia o tarjeta/.test(html));
    P.run("_cajaDetalle = " + JSON.stringify(d) + ";");
    t('el archivo: BROTES_arqueo_cajaviandas0003_2026-10-10.pdf', P.run("_nombreArchivoArqueo('pdf')") === 'BROTES_arqueo_cajaviandas0003_2026-10-10.pdf', P.run("_nombreArchivoArqueo('pdf')"));
    P.run("_cajaDetalle.k = undefined;");
    t('el de la del local sigue igual: BROTES_arqueo_caja0003_...', P.run("_nombreArchivoArqueo('csv')") === 'BROTES_arqueo_caja0003_2026-10-10.csv');
  }

  /* ------------------------------------------------------------------ 7 */
  grupo('7. Que es vianda (por el proveedor marcado como la cocina)');
  {
    const P = crearPanel(crearBase({}), {
      listasData: [{ id: 'L1', nombre: 'GENERAL' }, { id: 'COC', nombre: 'COCINA', cocina: true }],
      allProducts: [
        { id: 'tarta', nombre: 'Tarta de pollo', lista: 'COC' },
        { id: 'tortm', nombre: 'Tortilla de espinaca mediana', lista: 'COC', categoria: '' },
        { id: 'almen', nombre: 'Almendra', lista: 'L1' },
        { id: 'sinprov', nombre: 'Algo sin proveedor' }
      ]
    });
    t('un producto de la cocina es vianda (aunque no tenga categoria)', P.run("esVianda(allProducts[0]) && esVianda(allProducts[1])") === true);
    t('uno de otro proveedor, o sin proveedor, no', P.run("esVianda(allProducts[2]) || esVianda(allProducts[3])") === false);
    t('por id, lo mismo; y uno que ya no esta en el catalogo no es vianda', P.run("esViandaId('tarta') && !esViandaId('almen') && !esViandaId('borrado')") === true);
    t('sin ninguna cocina marcada no hay viandas', P.run("(()=>{listasData[1].cocina=false; const r=esVianda(allProducts[0]); listasData[1].cocina=true; return r;})()") === false);

    grupo('   los tres frenos');
    P.run("window._ventaViandas = false;");
    t('en la minorista el buscador deja afuera las viandas', P.run("(()=>{const f=_filtroVentaCtx('min'); return !f(allProducts[0]) && f(allProducts[2]);})()") === true);
    t('  agregar una vianda avisa que va en Ventas → Viandas', /es una vianda: se cobra en Ventas → Viandas/.test(P.run("ventaTipoPermite(allProducts[0],'min')")));
    t('  y lo demas pasa', P.run("ventaTipoPermite(allProducts[2],'min')") === '');
    t('en la mayorista: "Las viandas no se venden por mayor"', /no se venden por mayor/.test(P.run("ventaTipoPermite(allProducts[0],'may')")) && P.run("ventaTipoPermite(allProducts[2],'may')") === '');
    P.run("window._ventaViandas = true;");
    t('en la de viandas el buscador muestra solo viandas', P.run("(()=>{const f=_filtroVentaCtx('min'); return f(allProducts[0]) && !f(allProducts[2]);})()") === true);
    t('  y la mayorista sigue sin viandas aunque la bandera este puesta', P.run("(()=>{const f=_filtroVentaCtx('may'); return !f(allProducts[0]);})()") === true);
    t('  agregar algo que no es vianda avisa', /solo van viandas/.test(P.run("ventaTipoPermite(allProducts[2],'min')")));
    t('al guardar se controla todo: una venta de viandas con una almendra no pasa', /solo van viandas/.test(P.run("viandasControlVenta([{id:'tarta',nombre:'Tarta'},{id:'almen',nombre:'Almendra'}],'min',null)")));
    P.run("window._ventaViandas = false;");
    t('  una minorista con una tarta tampoco', /es una vianda/.test(P.run("viandasControlVenta([{id:'almen'},{id:'tarta',nombre:'Tarta de pollo'}],'min',null)")));
    t('  al EDITAR solo se miran los renglones nuevos (las ventas viejas tienen platos de cocina)', P.run("viandasControlVenta([{id:'tarta'},{id:'almen'}],'min',[{id:'tarta'}])") === '');
    t('  pero uno nuevo que es vianda, no', /es una vianda/.test(P.run("viandasControlVenta([{id:'almen'},{id:'tartas2',nombre:'x'},{id:'tortm',nombre:'Tortilla'}],'min',[{id:'almen'}])")));
    t('  la mayorista con una tarta no pasa', /no se venden por mayor/.test(P.run("viandasControlVenta([{id:'tarta',nombre:'Tarta'}],'may',null)")));
    t('el aviso del buscador dice cuantas viandas coinciden (con la funcion de busqueda del panel)',
      /1 vianda coincide: se cobra en Ventas → Viandas/.test(P.run("_coincideVenta=(p,t)=>(p.nombre||'').toLowerCase().includes(t); viandasPieBusqueda('min','tarta')")));
  }

  /* ------------------------------------------------------------------ 8 */
  grupo('8. Pedidos de la tienda con viandas y otras cosas: dos ventas');
  {
    const P = crearPanel(crearBase({}), {
      listasData: [{ id: 'L1' }, { id: 'COC', cocina: true }],
      allProducts: [{ id: 'tarta', lista: 'COC' }, { id: 'almen', lista: 'L1' }]
    });
    const mixto = { items: [{ id: 'tarta', cantidad: 2 }, { id: 'almen', cantidad: 500 }] };
    const r = P.ctx.viandasDelPedido(mixto);
    t('separa las viandas de lo demas', r.vds.length === 1 && r.vds[0].id === 'tarta' && r.nor.length === 1 && r.nor[0].id === 'almen');
    t('un pedido con la del local y las viandas pendientes ofrece pasarlas', P.ctx.viandasPendientesDelPedido({ ventaId: 'v1', viandasPendientes: true }) === true);
    t('  uno ya con las dos ventas, no', P.ctx.viandasPendientesDelPedido({ ventaId: 'v1', viandasPendientes: false, ventaViandasId: 'v2' }) === false);
    t('  uno sin venta todavia, tampoco (ese se convierte entero)', P.ctx.viandasPendientesDelPedido({ viandasPendientes: true }) === false);
  }

  /* ------------------------------------------------------------------ 9 */
  grupo('9. Estadisticas: lo de cada caja y el color del dia');
  {
    const ctx = { console, Math, Number, String, Object, Array, Set, Date, esc: s => String(s), netoVenta: v => Number(v.total || 0) - Number(v.envio || 0), medioKeyDeVenta: () => 'efectivo', window: {}, document: { getElementById: () => null } };
    vm.createContext(ctx);
    vm.runInContext(STATS, ctx, { filename: 'admin-stats.js' });
    const d = {
      cajas: [{ fecha: '2026-10-09', estado: 'cerrada', diferencia: 0 }],
      cajasViandas: [{ fecha: '2026-10-09', estado: 'cerrada', diferencia: -800 }],
      pedidos: [],
      ventas: [
        { _dia: '2026-10-09', _neto: 10000, total: 10000, _tipo: 'minorista' },
        { _dia: '2026-10-09', _neto: 6000, total: 6000, _tipo: 'minorista', cajaTipo: 'viandas' },
        { _dia: '2026-10-08', _neto: 4000, total: 4000, _tipo: 'minorista', cajaTipo: 'viandas' }
      ]
    };
    const dias = ctx.agruparPorDia(d);
    const x = dias['2026-10-09'];
    t('el dia separa: 1 venta del local y 1 de viandas', x.countNormal === 1 && x.countVds === 1 && x.porTipo.viandas.total === 6000 && x.porTipo.minorista.total === 10000, x.porTipo);
    t('  el color es el de la PEOR de las dos cajas (la de viandas falto 800)', x.estado === 'diferencia_ok' || x.estado === 'diferencia', x.estado);
    t('un dia con viandas vendidas y sin caja de viandas abierta: "Ventas sin caja"', dias['2026-10-08'].estado === 'sin_caja', dias['2026-10-08'].estado);
    const tm = ctx.totalesMes(Object.assign({}, d, { porDia: dias }));
    t('el mes: caja normal $10.000, caja viandas $10.000, total $20.000', tm.normal === 10000 && tm.viandas === 10000 && tm.facturado === 20000 && tm.viandasCount === 2, tm);
    t('un dia armado a mano sin el detalle por caja se lee como antes', ctx.estadoDelDia({ count: 3, caja: null }) === 'sin_caja' && ctx.estadoDelDia({ count: 0, caja: null }) === 'sin_actividad');
  }

  /* ------------------------------------------------------------------ 10 */
  grupo('10. admin.html y las reglas: quedo todo enganchado');
  /* Los ids de la pantalla y de los modales de la caja de viandas: los mismos que los de la
     del local con una "v" adelante. check-admin no los puede ver (se arman en _cel), asi
     que se revisan aca: todos, de las dos cajas. */
  const usados = new Set();
  (CAJA.match(/_c(?:el|id)\(C,\s*'([A-Za-z]+)'\)/g) || []).forEach(m => usados.add(m.match(/'([A-Za-z]+)'/)[1]));
  const faltan = [];
  usados.forEach(id => {
    if (ADMIN.indexOf('id="' + id + '"') < 0) faltan.push(id);
    const v = 'v' + id.charAt(0).toUpperCase() + id.slice(1);
    if (ADMIN.indexOf('id="' + v + '"') < 0) faltan.push(v);
  });
  t('los ' + usados.size + ' ids de la caja existen en admin.html, en las dos versiones', usados.size > 25 && !faltan.length, faltan);
  t('el menu: "Caja viandas" abajo de Caja, y "Viandas" en Ventas', /switchSection\('caja'\)[\s\S]{0,200}switchSection\('cajaViandas'\)/.test(ADMIN) && /switchSection\('ventasMay'\)[\s\S]{0,200}switchSection\('ventasViandas'\)/.test(ADMIN));
  t('switchSection entra a cada una', /if\(sec==='cajaViandas'\)entrarACaja\('viandas'\);/.test(ADMIN) && /if\(sec==='ventasViandas'&&typeof loadVentasViandas==='function'\)/.test(ADMIN));
  t('las dos secciones nuevas existen', ADMIN.indexOf('id="sec-cajaViandas"') > 0 && ADMIN.indexOf('id="sec-ventasViandas"') > 0);
  t('la venta de viandas se guarda con cajaTipo y la caja de viandas',
    /cajaId:\(typeof getCajaAbiertaIdLive==='function'\?await getCajaAbiertaIdLive\(_vds\?'viandas':undefined\):null\),\.\.\.\(_vds\?\{cajaTipo:'viandas'\}:\{\}\)/.test(ADMIN));
  t('  la bandera se lee al empezar a guardar y se borra al abrir y al cerrar el modal',
    /const isEdit=!!editingVentaId;[\s\S]{0,700}const _vds=window\._ventaViandas===true;/.test(ADMIN) &&
    /window\._pedidoEstadoDestino=null;\/\*[^*]*\*\/window\._ventaViandas=false;/.test(ADMIN) &&
    /window\._pedidoEstadoDestino=null;window\._ventaViandas=false;/.test(ADMIN));
  t('  el control final esta en las dos ventas (minorista y mayorista)',
    /viandasControlVenta\(ventaItems,'min'/.test(ADMIN) && /viandasControlVenta\(ventaMayItems,'may'/.test(ADMIN));
  t('  y el freno al agregar, antes de cualquier pregunta', /async function _agregarItemVenta\(id, ctx, ocultoVisto\)\{\s*const p=[^\n]*\n[\s\S]{0,400}ventaTipoPermite\(p,ctx\)/.test(ADMIN));
  t('Minoristas deja afuera las de viandas', /ventasFiltered=ventasData\.filter\(v=>v\.cajaTipo!=='viandas'\)/.test(ADMIN));
  t('editar una venta de viandas de una caja cerrada marca SU caja', /db\.collection\(\(ventaPrevia&&ventaPrevia\.cajaTipo==='viandas'\)\?'cajasViandas':'cajas'\)\.doc\(_cajaIdVenta\)/.test(ADMIN));
  t('el cobro del fiado: pregunta como pago y va a la caja de cada venta',
    ADMIN.indexOf('id="cobroCCMedio"') > 0 && /col:'cajasViandas'/.test(ADMIN) && /monto:g\.total, medio:medio/.test(ADMIN) && /getCajaAbiertaIdLive\(g\.k\)/.test(ADMIN));
  t('el pedido partido: la primera vuelta deja las viandas pendientes y la segunda se anota aparte',
    /viandasPendientes:true,viandasStockDescontado:_pv1\.stockDescontado===true,viandasIds:_pv1\.ids\|\|\[\]/.test(ADMIN) && /update\(Object\.assign\(\{ventaViandasId:ventaDocId,viandasPendientes:false,viandasStockDescontado:false\}/.test(ADMIN));
  t('  la segunda no vuelve a descontar el stock que la tienda ya desconto',
    /const _yaDescontado=_pv2\?\(_pv2\.stockDescontado===true\):/.test(ADMIN));
  t('  ni crea otro token de reseña', /const _esVentaWeb=!!window\._pedidoOrigenVentaId&&!_pv2;/.test(ADMIN));
  t('  borrar la del local mientras exista la de viandas no se deja', /borrá primero esa \(en Ventas → Viandas\) y después esta/.test(ADMIN));
  t('la regla nueva: cajasViandas y sus movimientos, solo admins',
    /match \/cajasViandas\/\{doc\} \{\s*allow read, write: if isAdmin\(\);\s*\}/.test(REGLAS) && /match \/cajasViandas\/\{doc\}\/movimientos\/\{mov\} \{\s*allow read, write: if isAdmin\(\);\s*\}/.test(REGLAS));
  t('el modulo nuevo se carga despues de la caja', ADMIN.indexOf('<script src="admin-viandas.js">') > ADMIN.indexOf('<script src="admin-caja.js">'));

  /* ------------------------------------------------------------------ 11 */
  grupo('11. Lo que encontro la revision (10/10/2026), arreglado');
  {
    const P = crearPanel(crearBase({}), {
      listasData: [{ id: 'L1' }, { id: 'COC', cocina: true }],
      allProducts: [{ id: 'tarta', lista: 'COC' }, { id: 'almen', lista: 'L1' }, { id: 'yerba', lista: 'L1' }]
    });
    const ped = { items: [{ id: 'tarta' }, { id: 'almen' }, { id: 'yerba' }], viandasIds: ['tarta', 'yerba'] };
    const r = P.ctx.viandasDelPedido(ped);
    t('pasada la primera venta, las viandas del pedido son las que quedaron anotadas (no se recalculan)',
      r.vds.map(i => i.id).join() === 'tarta,yerba' && r.nor.map(i => i.id).join() === 'almen');
    P.run("listasData[1].cocina = false;");
    t('  aunque despues se destilde la cocina, siguen siendo las mismas', P.ctx.viandasDelPedido(ped).vds.length === 2);

    /* La marca de la cocina se relee de la base (otra compu pudo tildarla). */
    const base = crearBase({ listas: { L1: { nombre: 'GENERAL' }, COC: { nombre: 'COCINA', cocina: true } } });
    const P2 = crearPanel(base, { listasData: [{ id: 'L1', nombre: 'GENERAL' }, { id: 'COC', nombre: 'COCINA' }] });
    t('sin releer, esta compu no sabe que COCINA es la cocina', P2.run('hayCocina()') === false);
    await P2.run('viandasRefrescarCocinas(true)');
    t('  al releer (antes de vender) se entera', P2.run('hayCocina()') === true && base.ops.some(o => /get listas where cocina==/.test(o)), base.ops);
    const n = base.ops.length;
    await P2.run('viandasRefrescarCocinas()');
    t('  y no vuelve a leer hasta dentro de 5 minutos', base.ops.length === n);
  }
  {
    /* El ticket del pedido con las dos ventas juntas. */
    const TP = fs.readFileSync(path.join(RAIZ, 'admin-ticket-pedido.js'), 'utf8');
    const ctx = { console, Math, Number, String, Object, Array, Date, window: {}, document: { getElementById: () => null }, db: null };
    vm.createContext(ctx);
    vm.runInContext(TP, ctx, { filename: 'admin-ticket-pedido.js' });
    const a = { numero: 45, items: [{ id: 'almen', subtotal: 2000 }], subtotalProductos: 2000, descuentoMonto: 0, cupon: { codigo: 'PROMO', monto: 2000 }, envio: 1500, total: 1500, medioPago: 'Efectivo' };
    const b = { numero: 46, items: [{ id: 'tarta', subtotal: 9000 }], subtotalProductos: 9000, descuentoMonto: 0, cupon: { codigo: 'PROMO', monto: 1000 }, envio: 0, total: 8000, medioPago: 'Efectivo' };
    const j = ctx._tpVentasJuntas(a, b);
    t('el ticket del pedido junta las dos ventas: los renglones de las dos', j.items.length === 2);
    t('  la plata sumada: subtotal 11.000, cupon 3.000, envio 1.500, total 9.500', j.subtotalProductos === 11000 && j.cupon.monto === 3000 && j.envio === 1500 && j.total === 9500, j);
    t('  y los dos numeros de venta', Array.isArray(j._numeros) && j._numeros.join() === '45,46');
    t('  con medios distintos lo dice', ctx._tpVentasJuntas(a, Object.assign({}, b, { medioPago: 'Transferencia' })).medioPago === 'Efectivo y Transferencia');
    t('imprimir el ticket del pedido usa las dos (o el pedido entero si faltan las viandas)',
      /if \(p\.ventaViandasId\) \{\s*const vds = await _tpVentaDe\(p\.ventaViandasId\);\s*if \(venta && vds\) venta = _tpVentasJuntas\(venta, vds\);/.test(TP) &&
      /viandasPendientesDelPedido\(p\)\) \{\s*venta = null;/.test(TP));
  }
  t('el cupon del pedido partido: la del local guarda lo que se le aplico y el resto pasa a la de viandas',
    /cuponMonto,subtotalConDesc,envio,total:subtotalConDesc\+envio\}/.test(ADMIN) &&
    /viandasCupon:\(window\._pedidoCuponVenta&&Number\(window\._pedidoCuponVenta\.monto\|\|0\)>Number\(totales\.cuponMonto\|\|0\)\)/.test(ADMIN) &&
    /window\._pedidoCuponVenta=\(p\.viandasCupon&&Number\(p\.viandasCupon\.monto\)>0\)\?p\.viandasCupon:null;/.test(ADMIN));
  t('  y el uso del cupon se registra una sola vez', /if\(!_pv2&&typeof cuponCajaRegistrarUso==='function'\)/.test(ADMIN));
  t('borrar un pedido a medio pasar devuelve lo que la tienda desconto de sus viandas',
    /const soloVds=!vivo\.stockDescontado&&vivo\.viandasPendientes===true&&vivo\.viandasStockDescontado===true;/.test(ADMIN));
  t('pasar a confirmado o entregado un pedido con las viandas sin cobrar manda a pasarlas',
    /&&\(!p\.ventaId\|\|\(typeof viandasPendientesDelPedido==='function'&&viandasPendientesDelPedido\(p\)\)\)\)\{/.test(ADMIN));
  t('  y el tablero lo marca: "Faltan las viandas"', /<i class="bi bi-egg-fried"><\/i> Faltan las viandas<\/span>/.test(ADMIN));
  t('la segunda venta relee el pedido antes de crearse', /if\(_pv2&&!isEdit\)\{try\{const _ps2=await db\.collection\('pedidos'\)\.doc\(_pv2\.pedidoId\)\.get\(\);/.test(ADMIN));
  t('  solo se abre si el pedido quedo marcado, y nunca despues de editar otra venta', /if\(_pv1&&!isEdit&&typeof viandasSegundaParte==='function'\)\{if\(_pedMarcado\)/.test(ADMIN));
  t('editar una venta borra las marcas de las dos vueltas', /showAdminToast\('Venta no encontrada','error'\);return;\}window\._pedidoParteViandas1=null;window\._pedidoParteViandas2=null;/.test(ADMIN));
  t('la carga de Minoristas y la de Viandas no se pisan (ficha de carga)', /if\(_tkV!==window\._ventasCargaTk\)return;/.test(ADMIN) && /if \(tk !== window\._ventasCargaTk\) return;/.test(VDS));
  t('"Ver ventas" lleva tambien a Viandas', /irASeccionVentas\('viandas'\)/.test(ADMIN));
  t('la primera caja de viandas sugiere 0 de fondo (no el del cajon del local)', /let sugerido = C\.k === 'viandas' \? 0 : cajaCfg\.fondoFijoSugerido;/.test(CAJA));

  /* ------------------------------------------------------------------ 12 */
  grupo('12. Lo que encontro la prueba en el sandbox (10/10/2026), arreglado');
  {
    const base = crearBase({
      config: { cajaEstado: { cajaAbiertaId: 'cL' }, cajaViandasEstado: { cajaAbiertaId: 'cV' } },
      cajas: { cL: { numero: 3, estado: 'abierta', fecha: HOY, montoInicial: 20000, abiertoEn: ts(HOY, '08:00') } },
      cajasViandas: { cV: { numero: 4, estado: 'abierta', fecha: HOY, montoInicial: 5000, abiertoEn: ts(HOY, '08:05') } }
    });
    const P = crearPanel(base);
    await P.run('loadCaja()');
    await P.run("loadCaja('viandas')");
    const corteV = P.run("renderCorteParcial(calcularTotalesCaja('viandas'),'viandas')");
    const corteL = P.run('renderCorteParcial(calcularTotalesCaja())');
    t('el corte parcial de la de viandas nombra SU boton de cierre', /<b>Cerrar caja de viandas y arquear<\/b>/.test(corteV));
    t('  y el de la del local, el suyo', /<b>Cerrar caja y arquear<\/b>/.test(corteL) && !/de viandas/.test(corteL));
  }
  t('el pedido mixto deja a la vista que sus viandas van en otra venta (no solo un cartel que se va)',
    /_nVds\.id='ventaVdsAparte';/.test(ADMIN) && /se cobran aparte, con la caja de viandas: al registrar esta venta se abre sola la de las viandas\./.test(ADMIN));
  t('  y la nota se borra al abrir y al cerrar cualquier venta',
    /cuponRowOld\.remove\(\);const _vdsApOld=document\.getElementById\('ventaVdsAparte'\);if\(_vdsApOld\)_vdsApOld\.remove\(\);/.test(ADMIN) &&
    /function closeVentaModal\(\)\{const ac=[^\n]{0,200}?if\(cr\)cr\.remove\(\);const _vdsAp=document\.getElementById\('ventaVdsAparte'\);if\(_vdsAp\)_vdsAp\.remove\(\);/.test(ADMIN));
  t('  y al editar otra venta (Escape cierra el modal sin closeVentaModal)',
    /const _vdsApEd=document\.getElementById\('ventaVdsAparte'\);if\(_vdsApEd\)_vdsApEd\.remove\(\);/.test(ADMIN));
  t('borrar la del local de un pedido a medio pasar limpia tambien la memoria del tablero',
    /delete _pm\.viandasPendientes;delete _pm\.viandasStockDescontado;delete _pm\.viandasIds;delete _pm\.viandasCupon;/.test(ADMIN));

  /* ------------------------------------------------------------------ 13 */
  grupo('13. La tecla C abre la venta de viandas (Thiago, 10/10/2026)');
  {
    const ATJ = fs.readFileSync(path.join(RAIZ, 'admin-atajos.js'), 'utf8');
    let escucha = null, hayVentana = false;
    const llamadas = [], cola = [];
    const ctxA = {
      console: { log() {}, warn() {}, error() {} },
      document: {
        addEventListener: (tipo, fn) => { if (tipo === 'keydown') escucha = fn; },
        getElementById: () => null,
        querySelector: s => ((hayVentana && /modal-overlay\.show/.test(s)) ? {} : null),
        querySelectorAll: () => []
      },
      /* La demora de los atajos (por el lector de codigos): se corre a mano. */
      setTimeout: f => { cola.push(f); return cola.length; }, clearTimeout() {},
      abrirVentaViandas: () => llamadas.push('viandas'), openVentaModal: () => llamadas.push('minorista'),
      openVentaMayModal: () => llamadas.push('mayorista'), showAdminToast() {}
    };
    ctxA.window = ctxA;
    vm.createContext(ctxA);
    vm.runInContext(ATJ, ctxA, { filename: 'admin-atajos.js' });
    vm.runInContext('ATAJOS = atajosPorDefecto();', ctxA);
    const tecla = k => { escucha({ key: k, target: { tagName: 'BODY' }, ctrlKey: false, altKey: false, metaKey: false, preventDefault() {} }); cola.splice(0).forEach(f => f()); };
    tecla('c');
    t('la C abre la venta de viandas', llamadas.join() === 'viandas', llamadas);
    tecla('C');
    t('  tambien con mayuscula', llamadas.join() === 'viandas,viandas', llamadas);
    tecla('v'); tecla('m');
    t('  y la V y la M siguen con lo suyo', llamadas.slice(2).join() === 'minorista,mayorista', llamadas);
    hayVentana = true; llamadas.length = 0;
    tecla('c');
    t('  con una ventana abierta no hace nada (como los demas atajos)', llamadas.length === 0);
    const defs = vm.runInContext('Object.keys(ATAJOS_ACCIONES).map(function (k) { return ATAJOS_ACCIONES[k].def; })', ctxA);
    t('ninguna tecla se repite entre los atajos', new Set(defs).size === defs.length, defs);
    t('sale en la ayuda y en Configuracion como "Nueva venta de viandas"',
      vm.runInContext('ATAJOS_ACCIONES.nuevaVentaVds.etq + "|" + ATAJOS_ACCIONES.nuevaVentaVds.grupo', ctxA) === 'Nueva venta de viandas|Acciones');
  }

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('  EXPLOTO: ' + e.stack); console.log('\n' + ok + ' pasaron, ' + (mal + 1) + ' fallaron'); process.exit(1); });
