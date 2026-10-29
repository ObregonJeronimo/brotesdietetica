/**
 * DESPUÉS DE GUARDAR UNA VENTA SE TRAE SOLO ESA, NO EL MES ENTERO (29/10/2026).
 *
 * Revisando las lecturas de la base apareció que cada venta guardada releía todas las ventas
 * del mes (loadVentas): con 400 ventas en el mes, 400 lecturas por venta, y eso crece con el
 * cuadrado de las ventas del mes. Ahora saveVenta llama a refrescarVentaEnLista(id): lee solo
 * esa venta y la pone en ventasData en su lugar.
 *
 * Lo que se sostiene acá: la lista queda IGUAL que si se hubiera releído el mes (se compara
 * contra la consulta de loadVentas, con cientos de ventas y ediciones al azar), y donde eso no
 * se puede asegurar se relee como antes: la lectura falla, la última carga de la lista todavía
 * no llegó o falló (al llegar pisaría la venta), o con "Todos los meses" y la lista llena la
 * venta sale de la lista o queda última. Si mientras tanto empezó otra carga, no se hace nada
 * (esa ya trae la venta). Las carreras se prueban con loadVentas y loadVentasViandas de verdad.
 * Y saveVenta no cambió nada de lo que escribe.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8').replace(/\r\n/g, '\n');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 500) + ']' : '')); }
};

function cuerpo(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('no encontre ' + firma);
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1);
}
const FUN = cuerpo(html, 'async function refrescarVentaEnLista(');

/* Una base de mentira: las ventas con la fecha como Timestamp de Firestore. */
const ts = d => ({ toDate: () => new Date(d.getTime()), _d: d });
function armar(opts) {
  const o = opts || {};
  const base = new Map();
  (o.ventas || []).forEach(v => base.set(v.id, Object.assign({}, v.datos, { fecha: ts(v.fecha) })));
  const reg = { cargas: [], filtros: [], lecturas: 0 };
  const els = {
    'sec-ventasViandas': { classList: { contains: () => !!o.enViandas } },
    ventaMesFiltro: { value: o.mes == null ? '' : o.mes },
    ventaVdsMesFiltro: { value: o.mesVds == null ? (o.mes == null ? '' : o.mes) : o.mesVds },
  };
  /* Releer: se anota y, con releeDeVerdad, se hace (la lista queda como la consulta, con la
     ficha de una carga nueva que llegó entera). */
  const recargar = cual => {
    reg.cargas.push(cual);
    if (!o.releeDeVerdad) return;
    ctx.window._ventasCargaTk++;
    ctx.ventasData = releer(base, (cual === 'viandas' ? els.ventaVdsMesFiltro : els.ventaMesFiltro).value);
    ctx.window._ventasCargaOk = ctx.window._ventasCargaTk;
  };
  const ctx = {
    console: { warn() {}, log() {} }, Object, Array, Date, Number, String, Math, JSON, Promise,
    window: { _ventasCargaTk: 7, _ventasCargaOk: o.cargaPendiente ? 6 : 7 },
    document: { getElementById: id => els[id] || null },
    ventasData: (o.lista || []).slice(), _ventasTope: !!o.tope, _ventasVdsTope: !!o.tope, ventasPage: 3,
    loadVentas: () => recargar('ventas'),
    filterVentas: () => reg.filtros.push('ventas'),
    filterVentasViandas: () => reg.filtros.push('viandas'),
    db: { collection: col => ({ doc: id => ({ get: async () => {
      reg.lecturas++;
      if (col !== 'ventas') throw new Error('coleccion equivocada ' + col);
      if (o.cargaEnElMedio) ctx.window._ventasCargaTk++;
      if (o.fallaLectura) throw new Error('sin conexion');
      const d = base.get(id);
      return { id, exists: !!d, data: () => Object.assign({}, d) };
    } }) }) },
  };
  if (o.conViandas !== false) ctx.loadVentasViandas = () => recargar('viandas');
  vm.createContext(ctx);
  vm.runInContext(FUN, ctx);
  return { ctx, base, reg };
}
/* Lo que devolveria loadVentas para ese mes (o las 500 mas recientes): la misma consulta,
   ordenada por fecha de la mas nueva a la mas vieja y, con la misma fecha, por id de mayor a
   menor (asi ordena Firestore; comprobado en el emulador el 29/10). */
function releer(base, mes) {
  let arr = [...base.entries()].map(([id, r]) => Object.assign({ docId: id }, r, { fecha: r.fecha.toDate() }));
  if (mes) {
    const [y, m] = mes.split('-').map(Number);
    const desde = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime(), hasta = new Date(y, m, 0, 23, 59, 59, 999).getTime();
    arr = arr.filter(v => v.fecha.getTime() >= desde && v.fecha.getTime() <= hasta);
  }
  arr.sort((a, b) => (b.fecha - a.fecha) || (a.docId < b.docId ? 1 : a.docId > b.docId ? -1 : 0));
  return mes ? arr : arr.slice(0, 500);
}
const plano = arr => JSON.stringify(arr.map(v => Object.assign({}, v, { fecha: v.fecha instanceof Date ? v.fecha.toISOString() : v.fecha })));
const venta = (id, fecha, total, extra) => ({ id, fecha, datos: Object.assign({ numero: Number(id.replace(/\D/g, '')) || 0, total, cliente: 'Consumidor Final' }, extra || {}) });

/* Con las cargas DE VERDAD: loadVentas (admin.html) y loadVentasViandas (admin-viandas.js) junto
   a refrescarVentaEnLista, contra una base de mentira que responde la consulta con lo que había
   al momento de pedirla (como el servidor). Con aMano, cada respuesta llega cuando la prueba
   dice: así se arman las carreras (una carga que llega tarde, otra que empieza en el medio). */
const LOAD_VENTAS = cuerpo(html, 'async function loadVentas(');
const LOAD_VDS = cuerpo(fs.readFileSync(path.join(RAIZ, 'admin-viandas.js'), 'utf8').replace(/\r\n/g, '\n'), 'async function loadVentasViandas(');
function consultar(base, e) {
  let arr = [...base.entries()].map(([id, r]) => ({ id, r: Object.assign({}, r) }));
  (e.where || []).forEach(([campo, op, val]) => {
    arr = arr.filter(x => { const tt = x.r[campo].toDate().getTime(); return op === '>=' ? tt >= val.getTime() : op === '<=' ? tt <= val.getTime() : false; });
  });
  arr.sort((a, b) => (b.r.fecha.toDate() - a.r.fecha.toDate()) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  if (e.limit) arr = arr.slice(0, e.limit);
  return { docs: arr.map(x => ({ id: x.id, data: () => Object.assign({}, x.r) })) };
}
function armarReal(opts) {
  const o = opts || {};
  const base = new Map();
  (o.ventas || []).forEach(v => base.set(v.id, Object.assign({}, v.datos, { fecha: ts(v.fecha) })));
  const vista = { viandas: !!o.enViandas };
  const els = {
    'sec-ventasViandas': { classList: { contains: () => vista.viandas } },
    ventaMesFiltro: { value: o.mes || '', options: { length: 13 } },
    ventaVdsMesFiltro: { value: o.mes || '', options: { length: 13 } },
    ventasList: { innerHTML: '' }, ventasVdsList: { innerHTML: '' },
  };
  const reg = { consultas: 0, lecturas: 0, pintadas: [] };
  const enEspera = [];
  const responder = valor => (o.aMano ? new Promise((bien, mal) => enEspera.push({ ok: () => bien(valor), mal })) : Promise.resolve(valor));
  const consulta = e => ({
    where: (campo, op, val) => consulta(Object.assign({}, e, { where: (e.where || []).concat([[campo, op, val]]) })),
    orderBy: () => consulta(e),
    limit: n => consulta(Object.assign({}, e, { limit: n })),
    get: () => { reg.consultas++; return responder(consultar(base, e)); },
    doc: id => ({ get: () => {
      reg.lecturas++;
      const d = base.get(id), copia = d && Object.assign({}, d);
      return responder({ id, exists: !!d, data: () => Object.assign({}, copia) });
    } }),
  });
  const ctx = {
    console: { warn() {}, log() {} }, Object, Array, Date, Number, String, Math, JSON, Promise,
    window: {}, document: { getElementById: id => els[id] || null },
    ventasData: [], _ventasTope: false, ventasPage: 0, _ventasVdsTope: false, ventasVdsPagina: 0,
    _buildMesOptions: () => {}, esc: s => String(s),
    filterVentas: () => reg.pintadas.push('ventas'),
    filterVentasViandas: () => reg.pintadas.push('viandas'),
    db: { collection: col => consulta({ col }) },
  };
  vm.createContext(ctx);
  vm.runInContext(LOAD_VENTAS + '\n' + FUN + '\n' + LOAD_VDS, ctx);
  return { ctx, base, els, vista, reg, enEspera };
}
const tick = () => new Promise(r => setImmediate(r));

(async () => {
console.log('\n-- una venta nueva --');
{
  const ventas = [venta('v1', new Date(2026, 9, 3, 10), 1000), venta('v2', new Date(2026, 9, 10, 12), 2000)];
  const { ctx, base, reg } = armar({ ventas, mes: '2026-10' });
  ctx.ventasData = releer(base, '2026-10');
  base.set('v3', { numero: 3, total: 3500, cliente: 'Marta', fecha: ts(new Date(2026, 9, 28, 18, 5, 9)), creadoEn: ts(new Date(2026, 9, 28, 18, 5, 10)) });
  await ctx.refrescarVentaEnLista('v3');
  t('queda arriba de todo, igual que si se releyera el mes', plano(ctx.ventasData) === plano(releer(base, '2026-10')), ctx.ventasData.map(v => v.docId));
  t('  una sola lectura (la de esa venta) y sin releer el mes', reg.lecturas === 1 && reg.cargas.length === 0, reg);
  t('  la fecha es un Date, como la arma loadVentas, y la hora del servidor queda como vino', ctx.ventasData[0].fecha instanceof Date &&
    ctx.ventasData[0].docId === 'v3' && typeof ctx.ventasData[0].creadoEn.toDate === 'function');
  t('  se vuelve a dibujar la lista de Ventas, desde la primera página', JSON.stringify(reg.filtros) === '["ventas"]' && ctx.ventasPage === 0);
}

console.log('\n-- editar una venta --');
{
  const ventas = [venta('v1', new Date(2026, 9, 3, 10), 1000), venta('v2', new Date(2026, 9, 10, 12), 2000), venta('v3', new Date(2026, 9, 20, 9), 500)];
  const { ctx, base, reg } = armar({ ventas, mes: '2026-10' });
  ctx.ventasData = releer(base, '2026-10');
  base.get('v2').total = 2400; base.get('v2').cliente = 'Pedro';
  await ctx.refrescarVentaEnLista('v2');
  t('cambia el total y el cliente, en el mismo lugar', plano(ctx.ventasData) === plano(releer(base, '2026-10')) && ctx.ventasData.length === 3 &&
    ctx.ventasData.find(v => v.docId === 'v2').total === 2400, ctx.ventasData.map(v => v.docId + ':' + v.total));
  base.get('v1').fecha = ts(new Date(2026, 9, 25, 8));
  await ctx.refrescarVentaEnLista('v1');
  t('  si le cambian la fecha, se mueve a su lugar nuevo', plano(ctx.ventasData) === plano(releer(base, '2026-10')) &&
    ctx.ventasData.map(v => v.docId).join(',') === 'v1,v3,v2', ctx.ventasData.map(v => v.docId));
  base.get('v3').fecha = ts(new Date(2026, 8, 30, 20));
  await ctx.refrescarVentaEnLista('v3');
  t('  si la pasan a otro mes, sale de este, como con la relectura', plano(ctx.ventasData) === plano(releer(base, '2026-10')) &&
    !ctx.ventasData.some(v => v.docId === 'v3'), ctx.ventasData.map(v => v.docId));
  t('  sin releer nunca el mes', reg.cargas.length === 0 && reg.lecturas === 3);
}

console.log('\n-- casos raros --');
{
  const ventas = [venta('Ab2', new Date(2026, 9, 15, 12, 0, 0), 100), venta('zz0', new Date(2026, 9, 15, 12, 0, 0), 200), venta('Kq9', new Date(2026, 9, 14), 300)];
  const { ctx, base } = armar({ ventas, mes: '2026-10' });
  ctx.ventasData = releer(base, '2026-10');
  base.set('aZ1', { numero: 9, total: 900, fecha: ts(new Date(2026, 9, 15, 12, 0, 0)) });
  await ctx.refrescarVentaEnLista('aZ1');
  t('con la misma fecha, por id de mayor a menor, como Firestore', ctx.ventasData.map(v => v.docId).join(',') === 'zz0,aZ1,Ab2,Kq9', ctx.ventasData.map(v => v.docId));
}
{
  const ventas = [venta('v1', new Date(2026, 9, 3), 1000), venta('v2', new Date(2026, 9, 9), 2000)];
  const { ctx, base } = armar({ ventas, mes: '2026-10' });
  ctx.ventasData = releer(base, '2026-10');
  base.delete('v2');
  await ctx.refrescarVentaEnLista('v2');
  t('si la venta ya no está en la base, sale de la lista', ctx.ventasData.map(v => v.docId).join(',') === 'v1');
}
{
  const ventas = [venta('v1', new Date(2026, 9, 3), 1000)];
  const { ctx, base, reg } = armar({ ventas, mes: '2026-10' });
  ctx.ventasData = releer(base, '2026-10');
  base.set('v2', { numero: 2, total: 50, fecha: ts(new Date(2026, 8, 30)) });
  await ctx.refrescarVentaEnLista('v2');
  t('una venta nueva cargada con fecha de otro mes no aparece en este (como en la consulta)', ctx.ventasData.map(v => v.docId).join(',') === 'v1' && reg.cargas.length === 0);
}

console.log('\n-- si algo sale mal, se relee el mes como antes --');
{
  const lista = [{ docId: 'v1', fecha: new Date(2026, 9, 3), total: 1 }];
  const { ctx, reg } = armar({ ventas: [venta('v1', new Date(2026, 9, 3), 1)], mes: '2026-10', lista, fallaLectura: true });
  const antes = ctx.ventasData;
  await ctx.refrescarVentaEnLista('v1');
  t('si la lectura falla: relee el mes y no toca la lista', JSON.stringify(reg.cargas) === '["ventas"]' && ctx.ventasData === antes && ctx.ventasData.length === 1 &&
    reg.filtros.length === 0, reg);
}
{
  const lista = [{ docId: 'v0', fecha: new Date(2026, 9, 1), total: 1 }];
  const { ctx, reg } = armar({ ventas: [venta('v1', new Date(2026, 9, 3), 1)], mes: '2026-10', lista, cargaPendiente: true });
  const antes = ctx.ventasData;
  await ctx.refrescarVentaEnLista('v1');
  t('si la última carga de la lista todavía no llegó (o falló): relee como antes, sin leer la venta ni tocar la lista',
    JSON.stringify(reg.cargas) === '["ventas"]' && reg.lecturas === 0 && ctx.ventasData === antes && reg.filtros.length === 0, reg);
  const vds = armar({ ventas: [venta('v1', new Date(2026, 9, 3), 1)], mes: '2026-10', lista, cargaPendiente: true, enViandas: true });
  await vds.ctx.refrescarVentaEnLista('v1');
  t('  en Viandas, relee la de Viandas', JSON.stringify(vds.reg.cargas) === '["viandas"]' && vds.reg.lecturas === 0, vds.reg);
}
{
  const { ctx, reg } = armar({ ventas: [venta('v1', new Date(2026, 9, 3), 1)], mes: '2026-10', lista: [], cargaEnElMedio: true });
  await ctx.refrescarVentaEnLista('v1');
  t('si mientras tanto empezó otra carga de la lista (cambiaron de mes): no mete nada ni relee otra vez (esa carga empezó después de guardar y ya la trae)',
    reg.cargas.length === 0 && ctx.ventasData.length === 0 && reg.filtros.length === 0, reg);
}
{
  const { ctx, reg } = armar({ ventas: [venta('v1', new Date(2026, 9, 3), 1)], mes: '2026-10', lista: [], cargaEnElMedio: true, fallaLectura: true });
  await ctx.refrescarVentaEnLista('v1');
  t('  y si además falla la lectura, tampoco relee: la otra carga se encarga', reg.cargas.length === 0 && reg.filtros.length === 0, reg);
}
{
  const { ctx, reg } = armar({ ventas: [venta('v1', new Date(2026, 9, 3), 1)], mes: '2026-10', lista: [], enViandas: true, fallaLectura: true });
  await ctx.refrescarVentaEnLista('v1');
  t('en la lista de Viandas, si falla, relee la de Viandas', JSON.stringify(reg.cargas) === '["viandas"]', reg);
}

console.log('\n-- la lista de Viandas y "Todos los meses" --');
{
  const ventas = [venta('v1', new Date(2026, 9, 3), 1000, { cajaTipo: 'viandas' }), venta('v2', new Date(2026, 9, 5), 2000)];
  const { ctx, base, reg } = armar({ ventas, enViandas: true, mes: '2026-09', mesVds: '2026-10' });
  ctx.ventasData = releer(base, '2026-10');
  base.set('v3', { numero: 3, total: 18000, cajaTipo: 'viandas', fecha: ts(new Date(2026, 9, 28)) });
  await ctx.refrescarVentaEnLista('v3');
  t('estando en Viandas: usa el mes de esa lista y la vuelve a dibujar', plano(ctx.ventasData) === plano(releer(base, '2026-10')) &&
    JSON.stringify(reg.filtros) === '["viandas"]' && reg.cargas.length === 0, { ids: ctx.ventasData.map(v => v.docId), reg });
}
{
  const ventas = [];
  for (let i = 0; i < 520; i++) ventas.push(venta('w' + String(i).padStart(4, '0'), new Date(2026, 5, 1 + Math.floor(i / 5), i % 24), i));
  const { ctx, base } = armar({ ventas, mes: '', tope: true });
  ctx.ventasData = releer(base, '');
  base.set('nueva', { numero: 999, total: 1, fecha: ts(new Date(2026, 9, 28)) });
  await ctx.refrescarVentaEnLista('nueva');
  t('con "Todos los meses": quedan las 500 más recientes, como en la consulta', plano(ctx.ventasData) === plano(releer(base, '')) &&
    ctx.ventasData.length === 500 && ctx.ventasData[0].docId === 'nueva' && ctx._ventasTope === true);
  const sinTope = armar({ ventas: ventas.slice(0, 10), mes: '' });
  sinTope.ctx.ventasData = releer(sinTope.base, '');
  sinTope.base.set('otra', { numero: 1000, total: 1, fecha: ts(new Date(2026, 9, 28)) });
  await sinTope.ctx.refrescarVentaEnLista('otra');
  t('  con menos de 500, el aviso de "las 500 más recientes" no aparece', sinTope.ctx._ventasTope === false && sinTope.ctx.ventasData.length === 11);
}

console.log('\n-- "Todos los meses" con la lista llena (500): cuándo hay que releer --');
{
  /* 520 ventas: la lista tiene las 500 más recientes y las 20 más viejas no están en memoria. */
  const ventas = [];
  for (let i = 0; i < 520; i++) ventas.push(venta('w' + String(i).padStart(4, '0'), new Date(2026, 5, 1 + Math.floor(i / 5), i % 24), 1000 + i));
  const prep = () => { const r = armar({ ventas, mes: '', tope: true, releeDeVerdad: true }); r.ctx.ventasData = releer(r.base, ''); return r; };
  {
    const { ctx, base, reg } = prep();
    const id = ctx.ventasData[200].docId;
    base.get(id).total = 77;
    await ctx.refrescarVentaEnLista(id);
    t('editar el total de una del medio: sin releer, igual que releer', reg.cargas.length === 0 && plano(ctx.ventasData) === plano(releer(base, '')) &&
      ctx.ventasData.length === 500 && ctx._ventasTope === true, reg);
  }
  {
    const { ctx, base, reg } = prep();
    const id = ctx.ventasData[0].docId;
    base.get(id).fecha = ts(new Date(2026, 0, 2));
    await ctx.refrescarVentaEnLista(id);
    t('pasarle una fecha más vieja que la última de la lista: relee (la que sigue no está en memoria) y queda igual',
      JSON.stringify(reg.cargas) === '["ventas"]' && plano(ctx.ventasData) === plano(releer(base, '')) && ctx.ventasData.length === 500 &&
      !ctx.ventasData.some(v => v.docId === id) && ctx.ventasData[499].docId === 'w0019', reg);
  }
  {
    const { ctx, base, reg } = prep();
    const id = ctx.ventasData[499].docId;
    base.get(id).total = 5;
    await ctx.refrescarVentaEnLista(id);
    t('editar la última de la lista: relee por las dudas, y queda igual', JSON.stringify(reg.cargas) === '["ventas"]' && plano(ctx.ventasData) === plano(releer(base, '')), reg);
  }
  {
    const { ctx, base, reg } = prep();
    const id = ctx.ventasData[10].docId;
    base.delete(id);
    await ctx.refrescarVentaEnLista(id);
    t('una de la lista que ya no está en la base: relee (entra la que seguía) y queda igual', JSON.stringify(reg.cargas) === '["ventas"]' &&
      plano(ctx.ventasData) === plano(releer(base, '')) && ctx.ventasData.length === 500, reg);
  }
  {
    const { ctx, base, reg } = prep();
    base.set('vieja', { numero: 9000, total: 1, fecha: ts(new Date(2026, 0, 2)) });
    await ctx.refrescarVentaEnLista('vieja');
    t('una nueva con fecha más vieja que toda la lista: no entra, y sin releer', reg.cargas.length === 0 && plano(ctx.ventasData) === plano(releer(base, '')), reg);
  }
  {
    const { ctx, base, reg } = prep();
    const ultima = ctx.ventasData[499].docId;
    base.set('medio', { numero: 9001, total: 1, fecha: ts(new Date(2026, 7, 1)) });
    await ctx.refrescarVentaEnLista('medio');
    t('una nueva en el medio: entra y sale la última, sin releer', reg.cargas.length === 0 && plano(ctx.ventasData) === plano(releer(base, '')) &&
      ctx.ventasData.length === 500 && !ctx.ventasData.some(v => v.docId === ultima) && ctx.ventasData.some(v => v.docId === 'medio'), { reg, ultima });
  }
}

console.log('\n-- contra la relectura, con muchas ventas y ediciones al azar --');
{
  let semilla = 29102026;
  const azar = n => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  for (const mes of ['2026-10', '']) {
    const ventas = [];
    for (let i = 0; i < 300; i++) ventas.push(venta('x' + azar(1e9).toString(36), new Date(2026, 8 + azar(3), 1 + azar(28), azar(24), azar(2) * 30, 0), azar(50000)));
    const { ctx, base, reg } = armar({ ventas, mes });
    ctx.ventasData = releer(base, mes);
    let iguales = 0, pasos = 0;
    for (let k = 0; k < 400; k++) {
      const ids = [...base.keys()];
      let id;
      if (azar(3) === 0) {
        id = 'n' + k + azar(1e6).toString(36);
        base.set(id, { numero: 1000 + k, total: azar(90000), fecha: ts(new Date(2026, 8 + azar(3), 1 + azar(28), azar(24), azar(2) * 30, 0)) });
      } else {
        id = ids[azar(ids.length)];
        const d = base.get(id);
        if (azar(2)) d.total = azar(90000);
        if (azar(3) === 0) d.fecha = ts(new Date(2026, 8 + azar(3), 1 + azar(28), azar(24), azar(2) * 30, 0));
      }
      await ctx.refrescarVentaEnLista(id);
      pasos++;
      if (plano(ctx.ventasData) === plano(releer(base, mes))) iguales++;
    }
    t((mes ? 'mes ' + mes : '"Todos los meses"') + ': después de cada una de las 400 ventas o ediciones, la lista es idéntica a releer (' + iguales + '/' + pasos + ')',
      iguales === pasos);
    t('  y en total se leyeron ' + reg.lecturas + ' ventas en vez de releer el mes 400 veces', reg.lecturas === 400 && reg.cargas.length === 0);
  }
}
{
  /* Más de 500 ventas con "Todos los meses": la lista llena, y ventas nuevas, ediciones (del
     total y de la fecha, que a veces la sacan de la lista) y alguna que ya no está. */
  let semilla = 4242;
  const azar = n => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  const fecha = () => new Date(2026, 6 + azar(4), 1 + azar(28), azar(24), azar(2) * 30, 0);
  const ventas = [];
  for (let i = 0; i < 520; i++) ventas.push(venta('y' + azar(1e9).toString(36), fecha(), azar(50000)));
  const { ctx, base, reg } = armar({ ventas, mes: '', tope: true, releeDeVerdad: true });
  ctx.ventasData = releer(base, '');
  let iguales = 0, pasos = 0;
  for (let k = 0; k < 400; k++) {
    const ids = [...base.keys()];
    const op = azar(10);
    let id;
    if (op < 3) {
      id = 'n' + k + azar(1e6).toString(36);
      base.set(id, { numero: 2000 + k, total: azar(90000), fecha: ts(fecha()) });
    } else if (op === 3) {
      id = ids[azar(ids.length)];
      base.delete(id);
    } else {
      id = ids[azar(ids.length)];
      const d = base.get(id);
      if (azar(2)) d.total = azar(90000);
      if (azar(3) === 0) d.fecha = ts(fecha());
    }
    await ctx.refrescarVentaEnLista(id);
    pasos++;
    if (plano(ctx.ventasData) === plano(releer(base, '')) && ctx._ventasTope === (ctx.ventasData.length >= 500)) iguales++;
  }
  t('"Todos los meses" con más de 500: después de cada una de las 400, la lista es idéntica a releer (' + iguales + '/' + pasos +
    '), releyendo solo ' + reg.cargas.length + ' veces', iguales === pasos && reg.cargas.length < 100);
}

console.log('\n-- con las cargas de verdad (loadVentas y loadVentasViandas) --');
const v12 = () => [venta('v1', new Date(2026, 9, 3, 10), 1000), venta('v2', new Date(2026, 9, 10, 12), 2000)];
const v3 = () => ({ numero: 3, total: 3500, cliente: 'Marta', fecha: ts(new Date(2026, 9, 28, 18)) });
{
  const { ctx, enEspera } = armarReal({ ventas: v12(), mes: '2026-10', aMano: true });
  ctx.loadVentas();
  const enCamino = ctx.window._ventasCargaOk !== ctx.window._ventasCargaTk;
  enEspera.shift().ok(); await tick();
  const llego = ctx.window._ventasCargaOk === 1 && ctx.window._ventasCargaTk === 1 && ctx.ventasData.length === 2;
  ctx.loadVentas(); enEspera.shift().mal(new Error('sin conexion')); await tick();
  const fallo = ctx.window._ventasCargaOk === 1 && ctx.window._ventasCargaTk === 2;
  t('loadVentas marca la carga cuando llega entera; no mientras viene ni si falla', enCamino && llego && fallo, ctx.window);
}
{
  const ventas = [venta('c1', new Date(2026, 9, 7), 900, { cajaTipo: 'viandas' }), venta('v1', new Date(2026, 9, 3), 1000)];
  const { ctx, enEspera } = armarReal({ ventas, mes: '2026-10', enViandas: true, aMano: true });
  ctx.loadVentasViandas();
  const enCamino = ctx.window._ventasCargaOk !== ctx.window._ventasCargaTk;
  enEspera.shift().ok(); await tick();
  const llego = ctx.window._ventasCargaOk === 1 && ctx.window._ventasCargaTk === 1 && ctx.ventasData.length === 2;
  ctx.loadVentasViandas(); enEspera.shift().mal(new Error('sin conexion')); await tick();
  const fallo = ctx.window._ventasCargaOk === 1 && ctx.window._ventasCargaTk === 2;
  t('  loadVentasViandas, lo mismo', enCamino && llego && fallo, ctx.window);
}
{
  const { ctx, enEspera } = armarReal({ ventas: v12(), mes: '2026-10', aMano: true });
  ctx.loadVentas(); ctx.loadVentas();
  enEspera[1].ok(); await tick(); enEspera[0].ok(); await tick();
  t('  una carga que llega tarde (ya había empezado otra) no se marca', ctx.window._ventasCargaOk === 2 && ctx.window._ventasCargaTk === 2, ctx.window);
}
{
  const { ctx, base, reg } = armarReal({ ventas: v12(), mes: '2026-10' });
  await ctx.loadVentas();
  base.set('v3', v3());
  await ctx.refrescarVentaEnLista('v3');
  t('con la lista ya cargada: trae solo esa venta (1 lectura, ninguna consulta más) y queda igual que releer',
    reg.consultas === 1 && reg.lecturas === 1 && plano(ctx.ventasData) === plano(releer(base, '2026-10')) && reg.pintadas.join() === 'ventas,ventas', reg);
}
{
  const ventas = [venta('c1', new Date(2026, 9, 7), 900, { cajaTipo: 'viandas' }), venta('v1', new Date(2026, 9, 3), 1000)];
  const { ctx, base, reg } = armarReal({ ventas, mes: '2026-10', enViandas: true });
  await ctx.loadVentasViandas();
  base.set('c2', { numero: 5, total: 4000, cajaTipo: 'viandas', fecha: ts(new Date(2026, 9, 20)) });
  await ctx.refrescarVentaEnLista('c2');
  t('  en Viandas, lo mismo', reg.consultas === 1 && reg.lecturas === 1 && plano(ctx.ventasData) === plano(releer(base, '2026-10')) &&
    reg.pintadas.join() === 'viandas,viandas', reg);
}
for (const orden of ['la vieja llega última', 'la vieja llega primero']) {
  /* La carrera: entran a Ventas (o tocan "Volver a cargar") y, mientras la lista viene en camino
     (conexión lenta), hacen una venta. La consulta de esa carga se tomó ANTES de guardar. */
  const { ctx, base, enEspera, reg } = armarReal({ ventas: v12(), mes: '2026-10', aMano: true });
  ctx.loadVentas(); enEspera.shift().ok(); await tick();
  ctx.loadVentas();
  base.set('v3', v3());
  ctx.refrescarVentaEnLista('v3');
  const vieja = enEspera[0], nueva = enEspera[1];
  if (orden === 'la vieja llega última') { nueva.ok(); await tick(); vieja.ok(); await tick(); }
  else { vieja.ok(); await tick(); nueva.ok(); await tick(); }
  t('venta hecha mientras la lista todavía venía (' + orden + '): la venta queda en la lista, igual que releer',
    enEspera.length === 2 && reg.lecturas === 0 && ctx.ventasData.some(v => v.docId === 'v3') && plano(ctx.ventasData) === plano(releer(base, '2026-10')),
    { ids: ctx.ventasData.map(v => v.docId), reg });
}
{
  const { ctx, base, enEspera, reg } = armarReal({ ventas: v12(), mes: '2026-10', aMano: true });
  ctx.loadVentas(); enEspera.shift().ok(); await tick();
  ctx.loadVentas(); enEspera.shift().mal(new Error('sin conexion')); await tick();
  base.set('v3', v3());
  ctx.refrescarVentaEnLista('v3');
  enEspera.shift().ok(); await tick();
  t('si la última carga falló (la lista muestra el error): relee como antes y queda bien', reg.lecturas === 0 && reg.consultas === 3 &&
    plano(ctx.ventasData) === plano(releer(base, '2026-10')), reg);
}
{
  const ventas = v12().concat([venta('s1', new Date(2026, 8, 5), 700)]);
  const { ctx, base, els, enEspera, reg } = armarReal({ ventas, mes: '2026-10', aMano: true });
  ctx.loadVentas(); enEspera.shift().ok(); await tick();
  base.set('v3', v3());
  ctx.refrescarVentaEnLista('v3');
  els.ventaMesFiltro.value = '2026-09'; ctx.loadVentas();
  enEspera[0].ok(); await tick();
  enEspera[1].ok(); await tick();
  t('si mientras se trae la venta eligen otro mes: no se relee otra vez y queda ese mes entero', reg.consultas === 2 && reg.lecturas === 1 &&
    plano(ctx.ventasData) === plano(releer(base, '2026-09')), { ids: ctx.ventasData.map(v => v.docId), reg });
}
{
  const ventas = v12().concat([venta('c1', new Date(2026, 9, 7), 900, { cajaTipo: 'viandas' })]);
  const { ctx, base, vista, enEspera, reg } = armarReal({ ventas, mes: '2026-10', aMano: true });
  ctx.loadVentas(); enEspera.shift().ok(); await tick();
  base.set('v3', v3());
  ctx.refrescarVentaEnLista('v3');
  vista.viandas = true; ctx.loadVentasViandas();
  enEspera[0].ok(); await tick();
  enEspera[1].ok(); await tick();
  t('si mientras se trae la venta pasan a Viandas: Viandas se dibuja con su carga, sin que se la corte una relectura de Minoristas',
    JSON.stringify(reg.pintadas) === '["ventas","viandas"]' && reg.consultas === 2 && plano(ctx.ventasData) === plano(releer(base, '2026-10')), reg);
}

console.log('\n-- saveVenta: lo que escribe no cambió, solo cómo se refresca la lista --');
{
  const sv = cuerpo(html, 'async function saveVenta(');
  t('guarda el id de la venta que edita al empezar', /const isEdit=!!editingVentaId;\/\*[^*]*\*\/let _idGuardada=isEdit\?editingVentaId:null;/.test(sv));
  t('  y el de la que crea, justo después del add', /const ventaRefNueva=await db\.collection\('ventas'\)\.add\(venta\);_idGuardada=ventaRefNueva\.id;/.test(sv));
  t('  al final trae solo esa venta, y si no se sabe cuál es, relee el mes como antes',
    /if\(_idGuardada&&typeof refrescarVentaEnLista==='function'\)refrescarVentaEnLista\(_idGuardada\);else if\(typeof loadVentasViandas==='function'&&[^;]*\)loadVentasViandas\(\);else loadVentas\(\);/.test(sv));
  t('  ya no relee el mes después de cada venta (loadVentas solo queda como respaldo)', (sv.match(/loadVentas\(\)/g) || []).length === 1);
  const escrituras = (sv.match(/\.(add|update|set|delete)\(|runTransaction|aplicarStock/g) || []).length;
  t('  las mismas 13 escrituras de siempre', escrituras === 13, escrituras);
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
