/* COBRAR UNA VENTA CON MAS DE UN MEDIO
   =============================================================================
   "Te pago $6.000 en efectivo y el resto te lo transfiero". Pedido del dueño
   (19/10). Lo que se vigila acá no es la pantalla: es que la plata caiga en el
   casillero que le toca, porque el arqueo hace

       esperado = montoInicial + porMedio.efectivo + ingresos - egresos

   o sea que espera en el cajón SOLO lo cobrado en efectivo. Si una venta mixta
   de $10.000 se contara entera como efectivo, la caja pediría $10.000 con
   $6.000 adentro y marcaría un FALTANTE DE $4.000 QUE NO EXISTE, todos los días
   y sin que nadie pueda explicarlo. Ése es el hueco que esta suite cuida.

   Lo otro que vigila: que las 246 ventas que ya están guardadas -que no tienen
   el campo `pagos`- sigan contándose exactamente igual que antes. Sin migrar
   nada. Una venta vieja y una nueva de un solo medio tienen que ser, para el
   que suma plata, la misma cosa.

   Todo sale del admin.html y de los módulos REALES, no de copias.
   ============================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const CAJA = fs.readFileSync(path.join(RAIZ, 'admin-caja.js'), 'utf8');
const STATS = fs.readFileSync(path.join(RAIZ, 'admin-stats.js'), 'utf8');
const TICKET = fs.readFileSync(path.join(RAIZ, 'admin-ticket.js'), 'utf8');

let ok = 0, mal = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d + (extra ? '   (' + extra + ')' : '')); }
  else { mal++; console.log('  FALLA ' + d + (extra ? '   (' + extra + ')' : '')); }
};
const grupo = n => console.log('\n' + n);

function cuerpo(txt, nombre) {
  let i = txt.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no se encontro ' + nombre);
  if (txt.slice(i - 6, i) === 'async ') i -= 6;
  let b = txt.indexOf('{', i), prof = 0, k;
  for (k = b; k < txt.length; k++) { if (txt[k] === '{') prof++; else if (txt[k] === '}') { prof--; if (!prof) break; } }
  return txt.slice(i, k + 1);
}

/* El nucleo, sacado del admin.html de verdad. */
const NUCLEO = ['keyDeMedio', 'medioKeyDeVenta', 'netoVenta', 'keyDePago', 'pagosDeVenta',
                '_repartirPagos', 'esPagoMixto', 'medioDeVenta', 'detallePagos', 'cobradoEn',
                'pagosCuadran'].map(n => cuerpo(HTML, n)).join('\n');
const TABLA = HTML.slice(HTML.indexOf('const _NOMBRE_MEDIO = {'), HTML.indexOf('};', HTML.indexOf('const _NOMBRE_MEDIO = {')) + 2);
const CONSTS = HTML.slice(HTML.indexOf('const MEDIO_MIXTO = '), HTML.indexOf('function keyDePago'));
const API = new Function(CONSTS + TABLA + '\n' + NUCLEO +
  '\nreturn {pagosDeVenta,esPagoMixto,medioDeVenta,detallePagos,cobradoEn,pagosCuadran,medioKeyDeVenta,netoVenta};')();

/* --- las ventas de ejemplo ------------------------------------------------- */
const VIEJA = { total: 10000, envio: 0, medioPago: 'Efectivo', medioPagoKey: 'efectivo' };
const VIEJA_SIN_KEY = { total: 10000, envio: 0, medioPago: 'Transferencia' };
const UNICA = { total: 10000, envio: 0, medioPago: 'Tarjeta', medioPagoKey: 'tarjeta',
                pagos: [{ key: 'tarjeta', medio: 'Tarjeta', monto: 10000 }] };
const MIXTA = { total: 10000, envio: 0, medioPago: 'Mixto', medioPagoKey: 'mixto',
                pagos: [{ key: 'efectivo', medio: 'Efectivo', monto: 6000 },
                        { key: 'transferencia', medio: 'Transferencia', monto: 4000 }] };

grupo('Una venta vieja se cuenta igual que siempre (no hay que migrar nada)');
let p = API.pagosDeVenta(VIEJA);
t('da un solo renglon', p.length === 1);
t('con el total entero', p[0].monto === 10000);
t('y en su medio', p[0].key === 'efectivo');
t('sin medioPagoKey lo deduce del nombre', API.pagosDeVenta(VIEJA_SIN_KEY)[0].key === 'transferencia');
t('no la marca como mixta', API.esPagoMixto(VIEJA) === false);
t('y el medio que se muestra es el de siempre', API.medioDeVenta(VIEJA) === 'Efectivo');
t('una venta con UN pago guardado tampoco es mixta', API.esPagoMixto(UNICA) === false);

grupo('La venta mixta reparte');
p = API.pagosDeVenta(MIXTA);
t('da dos renglones', p.length === 2);
t('6.000 en efectivo', API.cobradoEn(MIXTA, 'efectivo') === 6000);
t('4.000 en transferencia', API.cobradoEn(MIXTA, 'transferencia') === 4000);
t('y suman el total', p.reduce((s, x) => s + x.monto, 0) === MIXTA.total);
t('se muestra como Mixto', API.medioDeVenta(MIXTA) === 'Mixto');
t('con el desglose al lado', API.detallePagos(MIXTA) === 'Efectivo $6.000 + Transferencia $4.000',
  API.detallePagos(MIXTA));
t('una venta de un solo medio no tiene desglose', API.detallePagos(VIEJA) === '');

grupo('EL ARQUEO: la caja espera SOLO el efectivo');
/* Se corre calcularTotalesCaja() del archivo real. */
function arqueo(ventas, inicial) {
  /* calcularTotalesCaja(k) pasa por _caja(k): la misma funcion sirve para la caja
     del local y para la de viandas, asi que arreglarla una vez cubre las dos. */
  const sb = {
    _caja: () => ({ ventas: ventas, movs: [], actual: { montoInicial: inicial || 0 }, k: 'local' }),
    _movEnEfectivo: () => true,
    pagosDeVenta: API.pagosDeVenta, medioKeyDeVenta: API.medioKeyDeVenta, console
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(cuerpo(CAJA, 'calcularTotalesCaja') + '\nvar _r = calcularTotalesCaja();', sb);
  return sb._r;
}
let a = arqueo([MIXTA], 5000);
t('el efectivo del cajon es 6.000, no 10.000', a.porMedio.efectivo === 6000, 'efectivo: ' + a.porMedio.efectivo);
t('la transferencia va a su casillero', a.porMedio.transferencia === 4000);
t('el bruto sigue siendo la venta entera', a.bruto === 10000);
t('y lo ESPERADO en el cajon son 11.000 (5.000 iniciales + 6.000)', a.esperado === 11000,
  'esperado: ' + a.esperado);
/* El bug que esto evita, escrito como numero. */
t('NO pide los 15.000 que pediria contando la venta entera como efectivo', a.esperado !== 15000);

a = arqueo([VIEJA], 5000);
t('con una venta vieja el arqueo no cambia en nada', a.porMedio.efectivo === 10000 && a.esperado === 15000);

a = arqueo([MIXTA, VIEJA, UNICA], 0);
t('mezclando viejas, nuevas y mixtas suma bien el efectivo', a.porMedio.efectivo === 16000,
  'efectivo: ' + a.porMedio.efectivo);
t('y la tarjeta', a.porMedio.tarjeta === 10000);
t('el total de ventas es la suma de los totales', a.bruto === 30000);
t('la suma de todos los medios da el bruto',
  Object.values(a.porMedio).reduce((s, x) => s + x, 0) === a.bruto);

grupo('Fiado parcial: "te pago la mitad y la otra mitad me la fias"');
const MITAD_FIADO = { total: 10000, envio: 0, medioPago: 'Mixto', medioPagoKey: 'mixto',
  pagos: [{ key: 'efectivo', medio: 'Efectivo', monto: 5000 },
          { key: 'cuenta_corriente', medio: 'Cuenta Corriente', monto: 5000 }] };
a = arqueo([MITAD_FIADO], 0);
t('solo entran 5.000 al cajon', a.esperado === 5000);
t('y los otros 5.000 quedan como fiado', a.porMedio.cuenta_corriente === 5000);

grupo('EL NETO: las estadisticas descuentan el envio y reparten proporcional');
const CON_ENVIO = { total: 11000, envio: 1000, medioPago: 'Mixto',
  pagos: [{ key: 'efectivo', medio: 'Efectivo', monto: 6000 },
          { key: 'transferencia', medio: 'Transferencia', monto: 5000 }] };
let pn = API.pagosDeVenta(CON_ENVIO, 'neto');
t('el neto es 10.000', API.netoVenta(CON_ENVIO) === 10000);
t('y las partes del neto suman exactamente el neto',
  pn.reduce((s, x) => s + x.monto, 0) === 10000, pn.map(x => x.monto).join(' + '));
t('repartido en proporcion', pn[0].monto === 5455 && pn[1].monto === 4545,
  pn.map(x => x.monto).join(' + '));

/* El caso del peso suelto: tres pagos que no dividen justo. */
const TRES = { total: 10, envio: 0, medioPago: 'Mixto',
  pagos: [{ key: 'efectivo', monto: 3 }, { key: 'tarjeta', monto: 3 }, { key: 'transferencia', monto: 4 }] };
pn = API.pagosDeVenta(TRES, 'neto');
t('con numeros que no dividen justo igual suman el neto',
  pn.reduce((s, x) => s + x.monto, 0) === 10, pn.map(x => x.monto).join(' + '));

const SOLO_ENVIO = { total: 1000, envio: 1000, medioPago: 'Efectivo' };
t('una venta que es todo envio da neto 0 y no explota',
  API.pagosDeVenta(SOLO_ENVIO, 'neto')[0].monto === 0);

grupo('Las estadisticas reparten igual que la caja');
function porMedioStats(ventas) {
  const acum = {};
  const sb = { pagosDeVenta: API.pagosDeVenta, medioKeyDeVenta: API.medioKeyDeVenta, console };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(cuerpo(STATS, '_porMedio'), sb);
  ventas.forEach(v => vm.runInContext('_porMedio', sb)(Object.assign({ _neto: API.netoVenta(v) }, v), acum));
  return acum;
}
let sm = porMedioStats([CON_ENVIO]);
t('el efectivo del neto va a su casillero', sm.efectivo === 5455, JSON.stringify(sm));
t('y la suma de los casilleros es el neto',
  Object.values(sm).reduce((s, x) => s + x, 0) === 10000);
sm = porMedioStats([VIEJA]);
t('una venta vieja sigue cayendo entera en un solo medio', sm.efectivo === 10000);

grupo('EL TICKET: el vuelto es sobre la parte en EFECTIVO');
const SB = { console, window: {}, NEGOCIO: { nombre: 'Brotes' }, Date, Math, Number, String, Object, Array };
SB.globalThis = SB; vm.createContext(SB); vm.runInContext(TICKET, SB);
const doc = (v) => vm.runInContext('ticketDocumento(' + JSON.stringify(v) + ',null)', SB);

const TK_MIXTA = { numero: 1, fecha: { seconds: 1789000000 }, medioPago: 'Mixto', total: 10000, pagoCon: 8000,
  pagos: [{ key: 'efectivo', medio: 'Efectivo', monto: 6000 },
          { key: 'transferencia', medio: 'Transferencia', monto: 4000 }],
  items: [{ nombre: 'Yerba', precio: 10000, cantidad: 1, tipoVenta: 'unidad', subtotal: 10000 }] };
let h = doc(TK_MIXTA);
t('imprime los dos medios con su importe',
  h.indexOf('Efectivo') > 0 && h.indexOf('$6.000') > 0 && h.indexOf('Transferencia') > 0 && h.indexOf('$4.000') > 0);
t('el vuelto se calcula sobre los 6.000 de efectivo: $2.000', h.indexOf('$2.000') > 0);
t('y NO dice vuelto $0, que es lo que daria contra el total', h.indexOf('Vuelto') > 0);

h = doc(Object.assign({}, TK_MIXTA, { pagoCon: 5000 }));
t('si paga con menos que su parte en efectivo, no hay vuelto', h.indexOf('Vuelto') < 0);

const TK_SIN_EFECTIVO = Object.assign({}, TK_MIXTA, { pagoCon: 20000,
  pagos: [{ key: 'tarjeta', medio: 'Tarjeta', monto: 6000 }, { key: 'transferencia', medio: 'Transferencia', monto: 4000 }] });
t('sin nada en efectivo no hay vuelto aunque diga con cuanto paga', doc(TK_SIN_EFECTIVO).indexOf('Vuelto') < 0);

const TK_VIEJA = { numero: 2, fecha: { seconds: 1789000000 }, medioPago: 'Efectivo', medioPagoKey: 'efectivo',
  total: 8208, pagoCon: 10000,
  items: [{ nombre: 'Almendras', precio: 32830, cantidad: 250, tipoVenta: 'peso', subtotal: 8208 }] };
h = doc(TK_VIEJA);
t('una venta vieja imprime su medio como siempre', h.indexOf('Efectivo') > 0);
t('y su vuelto de siempre: $1.792', h.indexOf('$1.792') > 0);

grupo('Datos que no cuadran se pueden ver, no se esconden en una suma');
const ROTA = { total: 10000, pagos: [{ key: 'efectivo', monto: 6000 }, { key: 'tarjeta', monto: 3000 }] };
t('pagosCuadran() avisa', API.pagosCuadran(ROTA) === false);
t('una venta sana da true', API.pagosCuadran(MIXTA) === true);
t('una venta vieja tambien', API.pagosCuadran(VIEJA) === true);
t('y los pagos se devuelven como estan, sin inventar',
  API.pagosDeVenta(ROTA).reduce((s, x) => s + x.monto, 0) === 9000);

grupo('Casos borde');
t('pagos vacio cae al medio de siempre', API.pagosDeVenta({ total: 500, pagos: [], medioPago: 'Efectivo' })[0].monto === 500);
t('un pago en 0 no cuenta como medio usado',
  API.esPagoMixto({ total: 500, pagos: [{ key: 'efectivo', monto: 500 }, { key: 'tarjeta', monto: 0 }] }) === false);
t('una venta sin nada no explota', API.pagosDeVenta({}).length === 1);
t('pagos que no es lista se ignora', API.pagosDeVenta({ total: 100, pagos: 'si', medioPago: 'Efectivo' })[0].monto === 100);

grupo('Lo que el panel escribe al guardar');
t('la venta guarda el campo pagos', /pagos:_pagosVta/.test(HTML));
t('con varios medios el medioPago es Mixto', /medioParaGuardar/.test(HTML) && /return MEDIO_MIXTO;/.test(HTML));
t('y la key tambien', /MEDIO_MIXTO_KEY:\(typeof keyDeMedio/.test(HTML) || /\?MEDIO_MIXTO_KEY:/.test(HTML));
t('se valida ANTES de escribir nada', HTML.indexOf('const _errPagos=') < HTML.indexOf('db.collection(\'ventas\').add(venta)'));
t('editar una venta tambien guarda sus pagos', (HTML.match(/pagos:_pagosVta/g) || []).length === 2);

/* =============================================================================
   LA PANTALLA
   =============================================================================
   Se corre el codigo REAL del modal con un DOM de mentira. Lo que se vigila es
   la regla que hace que esto sea comodo en el mostrador: EL ULTIMO RENGLON SE
   QUEDA CON LO QUE FALTA. Se escribe 6000 en efectivo y transferencia pasa sola
   a 4000, sin que nadie haga una resta a mano con el cliente esperando.
   ============================================================================= */
function panelUI(total) {
  const els = {};
  const el = id => {
    if (!els[id]) els[id] = { id, value: '', innerHTML: '', textContent: '', style: {}, disabled: false,
      classList: { _c: [], add(c){ if(!this._c.includes(c)) this._c.push(c); },
                   remove(c){ this._c = this._c.filter(x => x !== c); },
                   contains(c){ return this._c.includes(c); } },
      focus(){}, select(){} };
    return els[id];
  };
  ['ventaMedio','pagosWrap','pagosLista','pgResumen','pgDividirBtn','pgDividirTxt','pgAgregarBtn'].forEach(el);
  els.ventaMedio.value = 'Efectivo';
  const doc = {
    getElementById: id => els[id] || null,
    querySelectorAll: () => [],
    activeElement: null
  };
  const sb = {
    console, document: doc,
    calcularTotalesVenta: () => ({ total: total, subtotal: total }),
    keyDeMedio: API.medioKeyDeVenta ? (m => {
      const t = (m||'').toLowerCase();
      if (t.startsWith('efec')) return 'efectivo';
      if (t.startsWith('tarj')) return 'tarjeta';
      if (t.startsWith('trans')) return 'transferencia';
      if (t.includes('corriente')) return 'cuenta_corriente';
      return 'otro';
    }) : null,
    esc: s => String(s == null ? '' : s),
    limpiarMonto: () => {},
    MEDIO_MIXTO: 'Mixto',
    _NOMBRE_MEDIO: { efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia',
                     cuenta_corriente:'Cuenta Corriente', otro:'Otro', mixto:'Mixto' }
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  const FUNCS = ['pagoDividido','_pgTotal','_pgSuma','_pgFalta','_pgMedioLibre','_pgAjustarUltimo',
                 'togglePagoDividido','agregarPago','quitarPago','cambiarMedioPago','onInputPago',
                 'renderPagos','renderResumenPagos','pagosParaGuardar','validarPagos',
                 'medioParaGuardar','cargarPagosDeVenta'].map(n => cuerpo(HTML, n)).join('\n');
  const CONST_UI = HTML.slice(HTML.indexOf('let ventaPagos = null;'), HTML.indexOf('function pagoDividido()'));
  vm.runInContext(CONST_UI + '\n' + FUNCS, sb);
  const call = (n, ...a) => vm.runInContext(n, sb)(...a);
  return {
    sb, els, call,
    pagos: () => vm.runInContext('ventaPagos', sb),
    montos: () => (vm.runInContext('ventaPagos', sb) || []).map(p => p.monto),
    medios: () => (vm.runInContext('ventaPagos', sb) || []).map(p => p.medio),
    escribir: (i, v) => { const campo = { value: String(v) }; call('onInputPago', i, campo); }
  };
}

grupo('Dividir el pago: arranca con el total puesto');
let U = panelUI(10000);
U.call('togglePagoDividido');
t('se abre con dos renglones', U.pagos().length === 2);
t('el primero con el medio que ya estaba elegido', U.medios()[0] === 'Efectivo');
t('el segundo con otro medio, no repetido', U.medios()[1] !== 'Efectivo');
/* El total arranca entero en el PRIMER renglon, que es el medio que ya estaba
   elegido, y el segundo en cero. Dividir es entonces SACARLE una parte al
   primero -se escribe 6000 y el segundo pasa solo a 4000-, que es un numero
   tipeado y no dos. */
t('el total arranca entero en el primero', U.montos()[0] === 10000, U.montos().join(' + '));
t('y el segundo en cero, esperando que le saquen una parte', U.montos()[1] === 0);
t('el panel muestra el bloque', U.els.pagosWrap.style.display === '');
t('y esconde el select de un solo medio', U.els.ventaMedio.style.display === 'none');

grupo('EL ULTIMO RENGLON ABSORBE: se escribe uno solo');
U = panelUI(10000);
U.call('togglePagoDividido');
U.escribir(0, 6000);
t('escribiendo 6.000 en el primero...', U.montos()[0] === 6000);
t('...el segundo pasa solo a 4.000', U.montos()[1] === 4000, U.montos().join(' + '));
t('y siempre suman el total', U.montos().reduce((s,x)=>s+x,0) === 10000);
U.escribir(0, 9500);
t('se corrige el primero y el segundo lo sigue', U.montos().join(',') === '9500,500');
U.escribir(0, 12000);
t('si el primero se pasa del total, el ultimo no queda negativo', U.montos()[1] === 0, U.montos().join(' + '));

grupo('Escribir en el ULTIMO es ser explicito: ahi no se toca nada');
U = panelUI(10000);
U.call('togglePagoDividido');
U.escribir(0, 6000);
U.escribir(1, 3000);
t('queda lo que se escribio', U.montos().join(',') === '6000,3000');
t('y el resumen dice cuanto falta', /Falta/.test(U.els.pgResumen.innerHTML), U.els.pgResumen.innerHTML.replace(/<[^>]*>/g,' '));
t('y no deja guardar', U.call('validarPagos') !== '');

grupo('Un tercer medio se lleva el resto');
U = panelUI(10000);
U.call('togglePagoDividido');
U.escribir(0, 5000);
U.call('agregarPago');
t('ahora son tres', U.pagos().length === 3);
t('los tres medios son distintos', new Set(U.medios()).size === 3, U.medios().join(', '));
t('y el ultimo tiene lo que falta', U.montos().reduce((s,x)=>s+x,0) === 10000, U.montos().join(' + '));
U.call('agregarPago');
t('se puede llegar a cuatro', U.pagos().length === 4);
U.call('agregarPago');
t('pero no a cinco: no hay mas medios', U.pagos().length === 4);
t('y el boton de agregar queda deshabilitado', U.els.pgAgregarBtn.disabled === true);

grupo('Quitar renglones');
U = panelUI(10000);
U.call('togglePagoDividido');
U.escribir(0, 6000);
U.call('agregarPago');
U.call('quitarPago', 2);
t('quedan dos', U.pagos().length === 2);
t('y el ultimo reabsorbe', U.montos().reduce((s,x)=>s+x,0) === 10000);
U.call('quitarPago', 1);
t('al quedar uno solo se vuelve al select', U.pagos() === null);
t('con el medio que habia quedado', U.els.ventaMedio.value === 'Efectivo');
t('y el bloque se esconde', U.els.pagosWrap.style.display === 'none');

grupo('Volver a "un solo medio" no pierde lo elegido');
U = panelUI(10000);
U.els.ventaMedio.value = 'Transferencia';
U.call('togglePagoDividido');
U.call('togglePagoDividido');
t('vuelve al select', U.pagos() === null);
t('con Transferencia, que era lo elegido', U.els.ventaMedio.value === 'Transferencia');

grupo('El total que cambia arrastra la division');
U = panelUI(10000);
U.call('togglePagoDividido');
U.escribir(0, 6000);
U.sb.calcularTotalesVenta = () => ({ total: 15000, subtotal: 15000 });
vm.runInContext('calcularTotalesVenta = ' + String(() => ({ total: 15000, subtotal: 15000 })), U.sb);
U.call('_pgAjustarUltimo');
t('sube el total y el ultimo absorbe la diferencia', U.montos().join(',') === '6000,9000', U.montos().join(' + '));

grupo('Lo que se guarda');
U = panelUI(10000);
U.call('togglePagoDividido');
U.escribir(0, 6000);
let g = U.call('pagosParaGuardar');
t('son dos pagos', g.length === 2);
t('con su key calculada', g[0].key === 'efectivo');
t('con su monto', g[0].monto === 6000 && g[1].monto === 4000);
t('y el medio de la venta es Mixto', U.call('medioParaGuardar') === 'Mixto');
t('la validacion pasa', U.call('validarPagos') === '');

U = panelUI(10000);
t('sin dividir no se guarda ningun pago', U.call('pagosParaGuardar') === null);
t('y el medio es el del select', U.call('medioParaGuardar') === 'Efectivo');
t('la validacion no se mete', U.call('validarPagos') === '');

grupo('Lo que NO deja guardar');
U = panelUI(10000);
U.call('togglePagoDividido');
U.escribir(0, 6000); U.escribir(1, 3000);
t('si falta plata lo dice con el numero', /faltan \$1\.000/.test(U.call('validarPagos')), U.call('validarPagos'));
U.escribir(1, 5000);
t('si sobra tambien', /se pasan del total por \$1\.000/.test(U.call('validarPagos')), U.call('validarPagos'));
U = panelUI(10000);
U.call('togglePagoDividido');
U.escribir(0, 10000);
t('un solo renglon con monto no es una division', /un solo medio/.test(U.call('validarPagos')), U.call('validarPagos'));
U = panelUI(10000);
U.call('togglePagoDividido');
U.call('cambiarMedioPago', 1, 'Efectivo');
U.escribir(0, 5000);
t('dos renglones con el mismo medio se rechazan', /dos renglones/.test(U.call('validarPagos')), U.call('validarPagos'));

grupo('Editar una venta que ya era mixta');
U = panelUI(10000);
U.call('cargarPagosDeVenta', MIXTA);
t('se abre dividida', U.pagos() && U.pagos().length === 2);
t('con sus montos', U.montos().join(',') === '6000,4000');
t('y sus medios', U.medios().join(',') === 'Efectivo,Transferencia');
t('guardar sin tocar nada deja lo mismo', U.call('validarPagos') === '');
U = panelUI(10000);
U.call('cargarPagosDeVenta', VIEJA);
t('una venta vieja se abre sin dividir', U.pagos() === null);
U.call('cargarPagosDeVenta', UNICA);
t('y una de un solo pago tambien', U.pagos() === null);

grupo('NINGUN lugar se queda mostrando una etiqueta sola');
/* Esta es la prueba que faltaba. Al rehacer el pago mixto sobre la caja de
   viandas me olvide de reaplicar las etiquetas en admin-caja.js: el calculo
   repartia bien, pero el comprobante del arqueo, el CSV y el PDF mostraban la
   clave cruda "mixto" en vez de "Efectivo $6.000 + Transferencia $4.000".
   No lo encontro ninguna prueba porque todas miraban los NUMEROS.

   En vez de listar los sitios -que es lo que se olvida- se vigila la REGLA:
   todo lugar que saque el medio de una venta para mostrarlo tiene que tener al
   lado su desglose. Si manana se agrega un listado nuevo, esto lo cachea. */
const SITIOS = (CAJA.match(/const medio = \(typeof medioKeyDeVenta/g) || []).length;
t('hay sitios que etiquetan la venta en la caja', SITIOS >= 5, SITIOS + ' sitios');
const CON_MIX = (CAJA.match(/const _mix = \(typeof detallePagos/g) || []).length;
t('todos tienen su desglose al lado', CON_MIX === SITIOS, CON_MIX + ' de ' + SITIOS);

/* Y que lo USEN: ninguna etiqueta puede imprimirse sin pasar antes por _mix. */
const SIN_USAR = (CAJA.match(/(?<!_mix \|\| )_MEDIOS?_NOMBRE\[medio\] \|\| medio/g) || []);
t('y ninguna se imprime sin el', SIN_USAR.length === 0, SIN_USAR.join(' / '));
const SIN_USAR2 = (CAJA.match(/(?<!_mix \|\| )nombresMedio\[medio\] \|\| medio/g) || []);
t('tampoco en la tabla del dia', SIN_USAR2.length === 0);

t('las tablas de nombres conocen "mixto"',
  (CAJA.match(/mixto: 'Mixto'/g) || []).length >= 2,
  (CAJA.match(/mixto: 'Mixto'/g) || []).length + ' tablas');

grupo('El reparto de la caja NO se cuela en las etiquetas');
/* El sitio que reparte la plata usa _pagos, no _mix: son dos cosas distintas y
   confundirlas haria que el arqueo sumara texto. */
t('el calculo usa pagosDeVenta, no el texto', /_pagos\.forEach\(pg => \{ porMedio\[pg\.key\]/.test(CAJA));
/* Un solo forEach reparte: el renglon es `porMedio[k] = (porMedio[k]||0) + monto`,
   o sea que la clave aparece dos veces en esa unica linea. */
t('y hay un solo lugar donde se reparte', (CAJA.match(/_pagos\.forEach\(/g) || []).length === 1);

grupo('Los otros modulos tampoco muestran la etiqueta pelada');
const TKPED = fs.readFileSync(path.join(RAIZ, 'admin-ticket-pedido.js'), 'utf8');
t('el ticket del pedido muestra el desglose', /_mix \|\| venta\.medioPago/.test(TKPED));
t('y el pedido partido junta los pagos de las dos ventas', /pagos: \(typeof pagosDeVenta/.test(TKPED));
const VDS = fs.readFileSync(path.join(RAIZ, 'admin-viandas.js'), 'utf8');
t('el buscador de viandas busca por cualquiera de los medios', /detallePagos\(v\)/.test(VDS));
const STATS2 = fs.readFileSync(path.join(RAIZ, 'admin-stats.js'), 'utf8');
t('las estadisticas no suman por un medio solo',
  !/porMedio\[k\] = \(.*porMedio\[k\] \|\| 0\) \+ v\._neto/.test(STATS2));
/* Dos llamadas, mas la definicion de la funcion: tres apariciones. */
t('las dos sumas pasan por _porMedio', (STATS2.match(/_porMedio\(v, /g) || []).length === 3);
t('el fiado suma solo la parte fiada', /p\.key==='cuenta_corriente'/.test(HTML));
t('y sigue descartando lo ya cobrado', /_montoFiadoImpago[\s\S]{0,200}_esFiadoImpago\(v\)/.test(HTML));

/* LA FICHA DEL CLIENTE Y EL COBRO DEL FIADO (21/10/2026)
   Sumaban el total de la venta: una mixta con $2.000 en efectivo y $6.000 fiados decia
   "Debe $8.000", y al cobrarla entraban $8.000 a la caja (un faltante inventado de $2.000 si
   el cliente pagaba lo que debia, o $2.000 de mas si pagaba lo que decia la pantalla). Se
   corren las funciones de verdad del admin.html, con una ficha y una base de mentira. */
grupo('LA FICHA Y EL COBRO: el cliente debe solo la parte fiada');
(async () => {
  const PIEZAS = ['_esFiadoImpago', '_montoFiadoImpago', '_tieneFiado', '_deudaFiado', '_attrHtml', 'nroVta',
    'renderFichaResumen', 'renderFichaCC', 'renderFichaCompras', 'openCobroCC', 'closeCobroCC', 'toggleCobroCC',
    '_cobroCCVentas', '_pintarTotalCobroCC', 'confirmarCobroCC'].map(n => cuerpo(HTML, n)).join('\n');
  const EL = {};
  const el = id => EL[id] || (EL[id] = { id, innerHTML: '', value: '', disabled: false, classList: { add() {}, remove() {} } });
  const escrito = { updates: [], movs: [] };
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, Number, Math, Array, Object, String, Date, Promise, JSON,
    document: { getElementById: el },
    esc: s => String(s == null ? '' : s), fmtCantidad: i => String(i.cantidad || 0), esPorPeso: () => false,
    showAdminToast() {}, logAction() {}, showClienteHist: async () => {}, loadCaja() {},
    getCajaAbiertaId: k => (k === 'viandas' ? 'cajaV' : 'cajaL'),
    getCajaAbiertaIdLive: async k => (k === 'viandas' ? 'cajaV' : 'cajaL'),
    auth: { currentUser: { email: 'caja@local' } },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'ahora' } } },
    db: {
      batch: () => { const cola = []; return { update: (ref, d) => cola.push([ref, d]), commit: async () => { cola.forEach(([r, d]) => escrito.updates.push({ ruta: r.ruta, d })); } }; },
      collection: col => ({ doc: id => ({ ruta: col + '/' + id,
        collection: sub => ({ add: async d => { escrito.movs.push(Object.assign({ ruta: col + '/' + id + '/' + sub }, d)); } }) }) })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(CONSTS + TABLA + '\n' + NUCLEO + '\n' + PIEZAS +
    '\nvar _fichaCliente = null, _cobroCCSel = {}, _cobroCCCajas = { principal: null, viandas: null };', ctx);
  const it = (nombre, precio) => ({ nombre, precio, cantidad: 1, subtotal: precio });
  const hoy = new Date();
  const V = {
    /* mixta: $2.000 en efectivo y $6.000 fiados */
    mix: { docId: 'mix', _col: 'ventas', numero: 101, fecha: hoy, total: 8000, envio: 0, medioPago: 'Mixto', medioPagoKey: 'mixto',
      items: [it('Almendra', 8000)], pagos: [{ key: 'efectivo', medio: 'Efectivo', monto: 2000 }, { key: 'cuenta_corriente', medio: 'Cuenta Corriente', monto: 6000 }] },
    /* fiada entera, de un solo medio y con envio: debe el total, envio incluido (como siempre) */
    entera: { docId: 'entera', _col: 'ventas', numero: 102, fecha: hoy, total: 10000, envio: 1500, medioPago: 'Cuenta Corriente', medioPagoKey: 'cuenta_corriente',
      items: [it('Yerba', 8500)] },
    /* mixta de la caja de viandas: $1.000 transferidos y $4.000 fiados */
    vds: { docId: 'vds', _col: 'ventas', numero: 103, fecha: hoy, total: 5000, envio: 0, cajaTipo: 'viandas', medioPago: 'Mixto', medioPagoKey: 'mixto',
      items: [it('Tarta', 5000)], pagos: [{ key: 'transferencia', medio: 'Transferencia', monto: 1000 }, { key: 'cuenta_corriente', medio: 'Cuenta Corriente', monto: 4000 }] },
    /* mixta con el fiado ya cobrado */
    cobrada: { docId: 'cobrada', _col: 'ventas', numero: 104, fecha: hoy, total: 3000, envio: 0, medioPago: 'Mixto', medioPagoKey: 'mixto', ccPagado: true,
      items: [it('Miel', 3000)], pagos: [{ key: 'efectivo', medio: 'Efectivo', monto: 1000 }, { key: 'cuenta_corriente', medio: 'Cuenta Corriente', monto: 2000 }] },
    /* sin nada fiado */
    contado: { docId: 'contado', _col: 'ventas', numero: 105, fecha: hoy, total: 1000, envio: 0, medioPago: 'Efectivo', medioPagoKey: 'efectivo', items: [it('Te', 1000)] }
  };
  ctx._fichaCliente = { id: 'cli1', nombre: 'Marta', ventas: [V.mix, V.entera, V.vds, V.cobrada, V.contado] };
  vm.runInContext('_fichaCliente = this._fichaCliente;', ctx);
  const deuda = k => vm.runInContext('_deudaFiado(_fichaCliente.ventas[' + k + '])', ctx);
  t('la mixta debe solo su parte fiada: $6.000 (no $8.000)', deuda(0) === 6000);
  t('la fiada entera de un solo medio debe el total, envio incluido: $10.000 (como siempre)', deuda(1) === 10000);
  t('la mixta de viandas debe $4.000', deuda(2) === 4000);
  t('la ya cobrada y la de contado no deben nada', deuda(3) === 0 && deuda(4) === 0);
  vm.runInContext('renderFichaResumen(); renderFichaCC(); renderFichaCompras();', ctx);
  t('el resumen de la ficha: Debe $20.000 (6.000 + 10.000 + 4.000)', /Debe<\/div><strong[^>]*>\$20\.000</.test(EL.clienteFichaResumen.innerHTML), EL.clienteFichaResumen.innerHTML.slice(0, 120));
  t('el recuadro de la deuda: "Debe $20.000", 3 ventas sin cobrar', /Debe \$20\.000/.test(EL.clienteFichaCC.innerHTML) && /3 ventas sin cobrar/.test(EL.clienteFichaCC.innerHTML));
  t('  repartida por caja: del local $16.000 y de viandas $4.000', /De la caja del local \$16\.000 &middot; de la caja de viandas \$4\.000/.test(EL.clienteFichaCC.innerHTML));
  const compras = EL.clienteHistList.innerHTML;
  t('en las compras, la mixta dice "DEBE $6.000" y la entera solo "DEBE"', /DEBE \$6\.000</.test(compras) && />DEBE</.test(compras));
  t('  la mixta ya cobrada dice COBRADO (antes no tenia marca)', (compras.match(/>COBRADO</g) || []).length === 1);
  vm.runInContext('openCobroCC();', ctx);
  const lista = EL.cobroCCLista.innerHTML;
  t('registrar cobro: la mixta figura por $6.000, aclarando "fiado de una venta de $8.000"', /\$6\.000<span[^>]*>fiado de una venta de \$8\.000/.test(lista));
  t('  la entera por $10.000 y la de viandas por $4.000', /\$10\.000<\/span>/.test(lista) && /\$4\.000<span[^>]*>fiado de una venta de \$5\.000/.test(lista));
  t('  la ya cobrada no aparece', !/#000104/.test(lista));
  vm.runInContext("['mix','entera','vds'].forEach(function (id) { toggleCobroCC({ checked: true, value: id }); }); document.getElementById('cobroCCMedio').value = 'efectivo'; _pintarTotalCobroCC();", ctx);
  t('el total a cobrar: $20.000', /Total a cobrar<\/span><strong[^>]*>\$20\.000</.test(EL.cobroCCTotal.innerHTML), EL.cobroCCTotal.innerHTML.slice(0, 160));
  t('  y el aviso: lo del local $16.000 y lo de viandas $4.000', /lo del local \(\$16\.000\)/i.test(EL.cobroCCCaja.innerHTML) && /lo de viandas \(\$4\.000\)/i.test(EL.cobroCCCaja.innerHTML), EL.cobroCCCaja.innerHTML.slice(0, 200));
  await vm.runInContext('confirmarCobroCC()', ctx);
  const movL = escrito.movs.find(m => m.ruta === 'cajas/cajaL/movimientos');
  const movV = escrito.movs.find(m => m.ruta === 'cajasViandas/cajaV/movimientos');
  t('al cobrar, a la caja del local entran $16.000 (no $18.000)', movL && movL.monto === 16000 && movL.medio === 'efectivo', movL && movL.monto);
  t('  y a la de viandas $4.000 (no $5.000)', movV && movV.monto === 4000, movV && movV.monto);
  t('  y las tres ventas quedan saldadas', escrito.updates.length === 3 && escrito.updates.every(u => u.d.ccPagado === true));
  /* Una ficha con solo fiado mixto ya cobrado: antes no decia que estaba todo cobrado. */
  vm.runInContext("_fichaCliente = { id: 'cli2', nombre: 'Luis', ventas: [this._cobrada] }; renderFichaCC();", Object.assign(ctx, { _cobrada: V.cobrada }));
  t('con solo una mixta ya cobrada: "Sin deuda pendiente: todo el fiado... esta cobrado"', /Sin deuda pendiente/.test(EL.clienteFichaCC.innerHTML));
  t('la lista de ventas tambien marca el fiado de una mixta (y cuanto)', /_tieneFiado\(v\):mk==='cuenta_corriente'/.test(HTML) && /Fiado sin cobrar'\+\(\(_dF&&_dF!==Number\(v\.total\|\|0\)\)/.test(HTML));

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.log('ERROR ' + e.stack); process.exit(1); });
