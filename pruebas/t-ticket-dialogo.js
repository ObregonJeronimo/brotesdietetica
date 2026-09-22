/* LA PREGUNTA DEL TICKET, Y EL ENTER QUE NO PUEDE CONTESTARLA
   =============================================================================
   Segunda parte de SPEC-ROLES-TICKET.md §B. Lo que se vigila acá es una sola
   cosa, y es la que puede salir mal en el mostrador:

   UN LECTOR USB ES UN TECLADO. Su Enter llega a la página igual que el de una
   persona. Si alguien apoya algo sobre el gatillo —pasa, el lector vive sobre el
   mostrador— la pistola dispara Enters solos. Con un "¿Imprimir ticket?" en
   pantalla eso imprimía un ticket por lectura; con un "¿Eliminar la venta?", peor.
   La única parte del sistema que sabe de quién fue ese Enter es admin-lector.js,
   que ya distinguía la ráfaga para el doble Enter. El diálogo usa ESA distinción.

   Y lo otro: con un diálogo abierto, escanear no puede seguir de largo por
   debajo. Los diálogos no son `.modal-overlay`, así que ninguno de los chequeos
   viejos los veía: la lectura entraba a la venta de atrás sin que se viera.

   Se corre el código REAL de los tres archivos en un vm, con un panel de mentira.
   ============================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const LECTOR = fs.readFileSync(path.join(RAIZ, 'admin-lector.js'), 'utf8');
const DIALOGO = fs.readFileSync(path.join(RAIZ, 'admin-dialogo.js'), 'utf8');
const TICKET = fs.readFileSync(path.join(RAIZ, 'admin-ticket.js'), 'utf8');

let ok = 0, mal = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d + (extra ? '   (' + extra + ')' : '')); }
  else { mal++; console.log('  FALLA ' + d + (extra ? '   (' + extra + ')' : '')); }
};
const grupo = n => console.log('\n' + n);
const esperar = ms => new Promise(r => setTimeout(r, ms));

/* Una funcion del archivo real, o una que devuelve undefined si todavia no
   existe. Sin esto, correr esta suite contra el commit anterior -que es como se
   comprueba que las pruebas sirven para algo- revienta en la primera linea y no
   se llega a ver QUE mas falta. */
const valor = (nombre, sb) => { try { return vm.runInContext(nombre, sb); } catch (e) { return undefined; } };
const fn = (nombre, sb) => {
  try { const f = vm.runInContext(nombre, sb); return typeof f === 'function' ? f : () => undefined; }
  catch (e) { return () => undefined; }
};

/* =============================================================================
   EL LECTOR: quien marca el Enter
   ============================================================================= */
function panelLector(opts) {
  opts = opts || {};
  const est = { avisos: [], llamadas: [] };
  let teclado = null;
  const doc = {
    addEventListener(tipo, fn, cap) { if (tipo === 'keydown' && cap) teclado = fn; },
    getElementById: (id) => ({ id, value: '', textContent: '', classList: { add() {}, remove() {}, contains: () => false }, focus() {} }),
    querySelector: (sel) => {
      if (sel === '.dlg-overlay') return opts.dialogoAbierto ? {} : null;
      if (sel === '.modal-overlay.show') return null;
      if (sel === '.section-content.active') return { id: 'sec-ventas' };
      return null;
    },
    querySelectorAll: () => []
  };
  const sb = {
    console, document: doc, window: {}, setTimeout, clearTimeout, Date,
    allProducts: [],
    showAdminToast: (m, k) => est.avisos.push(m),
    switchSection: s => est.llamadas.push('switchSection:' + s),
    openModal: id => est.llamadas.push('openModal:' + id),
    openVentaModal: () => est.llamadas.push('openVentaModal'),
    addVentaItem: id => est.llamadas.push('addVentaItem:' + id),
    renderAsignarCodigoLista: () => est.llamadas.push('asignarCodigo'),
    pedirConfirmacion: () => Promise.resolve(false)
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(LECTOR, sb, { filename: 'admin-lector.js' });
  return { sb, est, teclado };
}

/* Una tecla como la manda el navegador: lo que importa es el timeStamp, que es
   de donde sale la distincion maquina/persona. */
function tecla(key, ts) {
  return { key, timeStamp: ts, target: {}, ctrlKey: false, altKey: false, metaKey: false,
           preventDefault() { this._pd = true; }, stopPropagation() { this._sp = true; } };
}

/* Escribe un codigo entero con el ritmo pedido y devuelve el evento del Enter. */
function teclear(teclado, cod, gap, t0) {
  let ts = t0 || 1000;
  for (const ch of cod) { teclado(tecla(ch, ts)); ts += gap; }
  const ent = tecla('Enter', ts);
  teclado(ent);
  return ent;
}

grupo('El lector marca el Enter que mandó él');
let P = panelLector({ dialogoAbierto: true });
let evRafaga = teclear(P.teclado, '7790001234567', 10);
t('un Enter de ráfaga queda marcado', evRafaga._lecRafaga === true);
t('y enterDeRafaga() lo reconoce', fn('enterDeRafaga', P.sb)(evRafaga) === true);

P = panelLector({ dialogoAbierto: true });
let evHumano = teclear(P.teclado, '7790001234567', 150);
t('un Enter tecleado por una persona NO queda marcado', !evHumano._lecRafaga);
t('y enterDeRafaga() dice que no', fn('enterDeRafaga', P.sb)(evHumano) === false);
t('sin evento tampoco explota', fn('enterDeRafaga', P.sb)(null) === false);

grupo('Con un diálogo abierto no se escanea por debajo');
P = panelLector({ dialogoAbierto: true });
teclear(P.teclado, '7790001234567', 10);
t('no abre ninguna venta ni cambia de sección', P.est.llamadas.length === 0, P.est.llamadas.join(' + '));
t('y avisa que hay algo que responder', P.est.avisos.some(m => /antes de escanear/.test(m)), P.est.avisos.join(' | '));

P = panelLector({ dialogoAbierto: false });
vm.runInContext("procesarCodigoLeido('7790001234567')", P.sb);
/* Sin dialogo el codigo desconocido queda pendiente de asignar, que es lo de
   siempre: el bloqueo de arriba no puede haber roto el camino normal. */
t('sin diálogo sigue funcionando como siempre',
  (valor('_lecCodigoPendiente', P.sb) || {}).cod === '7790001234567');
P = panelLector({ dialogoAbierto: true });
vm.runInContext("procesarCodigoLeido('7790001234567')", P.sb);
t('con diálogo ni siquiera lo deja pendiente', valor('_lecCodigoPendiente', P.sb) === null);

/* =============================================================================
   EL DIALOGO
   =============================================================================
   Un DOM de mentira con lo justo: el diálogo solo necesita crear el cuadro,
   encontrar sus dos botones y saber cuál tiene el foco.
   ============================================================================= */
function panelDialogo() {
  const est = { teclados: [], quitados: 0, abiertos: 0 };
  const doc = { activeElement: null, body: null };

  function boton(cls, cont) {
    const b = {
      className: cls, tagName: 'BUTTON', _clicks: [],
      classList: { contains: c => c === cls },
      focus() { doc.activeElement = b; },
      addEventListener(ev, fn) { if (ev === 'click') b._clicks.push(fn); },
      click() { b._clicks.forEach(f => f()); },
      _cont: cont
    };
    return b;
  }

  function crear() {
    const el = {
      className: '', style: {}, innerHTML: '', _hijos: [], _btns: {}, _quitado: false,
      appendChild(h) { el._hijos.push(h); },
      remove() { el._quitado = true; est.abiertos--; },
      addEventListener() {},
      set textContent(v) { el.innerHTML = String(v); },
      get textContent() { return el.innerHTML; },
      _boton(sel) {
        const cls = sel.replace('.', '').trim();
        if (el.innerHTML.indexOf(cls) < 0) return null;
        if (!el._btns[cls]) el._btns[cls] = boton(cls, el);
        return el._btns[cls];
      },
      querySelector(sel) { return el._boton(sel); },
      querySelectorAll(sel) { return sel.split(',').map(s => el._boton(s)).filter(Boolean); }
    };
    return el;
  }

  doc.createElement = crear;
  doc.body = { appendChild(el) { est.abiertos++; est.ultimo = el; } };
  doc.addEventListener = (tipo, fn, cap) => { if (tipo === 'keydown') est.teclados.push(fn); };
  doc.removeEventListener = (tipo, fn) => { const i = est.teclados.indexOf(fn); if (i >= 0) { est.teclados.splice(i, 1); est.quitados++; } };

  const sb = { console, document: doc, window: {}, setTimeout, clearTimeout, Promise, Date };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(DIALOGO, sb, { filename: 'admin-dialogo.js' });
  /* El clasificador del lector, tal cual sale del archivo real. */
  vm.runInContext(LECTOR.slice(LECTOR.indexOf('function enterDeRafaga'),
    LECTOR.indexOf('}', LECTOR.indexOf('function enterDeRafaga')) + 1), sb);
  return { sb, est, doc };
}

async function abrirDialogo() {
  const D = panelDialogo();
  const p = vm.runInContext(
    "pedirConfirmacion('#0019 · $8.208', {titulo:'¿Imprimir ticket?', aceptar:'Imprimir', cancelar:'No imprimir'})",
    D.sb);
  await esperar(60);   /* el foco entra a los 30 ms */
  D.promesa = p;
  D.tecla = (ev) => D.est.teclados.slice().forEach(f => f(ev));
  D.ov = D.est.ultimo;
  return D;
}

(async () => {
  grupo('Se abre con Imprimir enfocado');
  let D = await abrirDialogo();
  t('el cuadro está en pantalla', D.est.abiertos === 1);
  t('dice Imprimir y No imprimir', D.ov.innerHTML.indexOf('Imprimir') > 0 && D.ov.innerHTML.indexOf('No imprimir') > 0);
  t('el foco arranca en Imprimir', D.doc.activeElement && D.doc.activeElement.className === 'dlg-si');

  grupo('El Enter de la PISTOLA no imprime');
  D = await abrirDialogo();
  const rafaga = tecla('Enter', 500); rafaga._lecRafaga = true;
  D.doc.activeElement = null;     /* el foco no esta en ningun boton */
  D.tecla(rafaga);
  let resuelta = false;
  D.promesa.then(() => { resuelta = true; });
  await esperar(20);
  t('la pregunta sigue abierta', !resuelta && D.est.abiertos === 1);
  t('y no se imprimió nada', !resuelta);

  grupo('El Enter de una PERSONA sí');
  D = await abrirDialogo();
  D.doc.activeElement = null;
  D.tecla(tecla('Enter', 500));
  t('contesta que sí', (await D.promesa) === true);
  t('y el cuadro se cierra', D.est.abiertos === 0);

  grupo('Esc equivale a No imprimir');
  D = await abrirDialogo();
  D.tecla(tecla('Escape', 500));
  t('contesta que no', (await D.promesa) === false);
  t('se cierra', D.est.abiertos === 0);
  t('y deja de escuchar el teclado', D.est.quitados === 1);

  grupo('Las flechas eligen sin soltar el teclado');
  D = await abrirDialogo();
  t('arranca en Imprimir', D.doc.activeElement.className === 'dlg-si');
  D.tecla(tecla('ArrowLeft', 500));
  t('← pasa a No imprimir', D.doc.activeElement.className === 'dlg-no');
  D.tecla(tecla('ArrowRight', 501));
  t('→ vuelve a Imprimir', D.doc.activeElement.className === 'dlg-si');

  grupo('El foco no se escapa del diálogo');
  D = await abrirDialogo();
  D.tecla(tecla('Tab', 500));
  t('Tab queda adentro, en el otro botón', D.doc.activeElement.className === 'dlg-no');
  D.tecla(tecla('Tab', 501));
  t('y el siguiente Tab vuelve, no se va a la venta de atrás', D.doc.activeElement.className === 'dlg-si');

  /* ===========================================================================
     LA DECISION DE IMPRIMIR
     =========================================================================== */
  function panelTicket(cfgGuardada, respuesta) {
    const est = { preguntas: [], impresos: [], logs: [], secciones: [] };
    const sb = {
      console, setTimeout, clearTimeout, Date, Promise,
      NEGOCIO: { nombre: 'Brotes Dietética' },
      document: { getElementById: () => null, querySelector: () => null },
      db: { collection: () => ({ doc: () => ({
        get: () => Promise.resolve({ exists: !!cfgGuardada, data: () => cfgGuardada }),
        set: (d) => { est.guardado = d; return Promise.resolve(); }
      }) }) },
      pedirConfirmacion: (msg, o) => { est.preguntas.push((o && o.titulo) + '|' + (o && o.aceptar)); return Promise.resolve(respuesta); },
      showAdminToast: (m) => est.avisos = (est.avisos || []).concat(m),
      switchSection: (s) => est.secciones.push(s),
      logAction: (a, b, c) => est.logs.push(a + '|' + b),
      ventasData: [{ docId: 'V1', numero: 7, fecha: { seconds: 1789000000 }, medioPago: 'Efectivo', total: 8208,
                     items: [{ nombre: 'Almendras', precio: 32830, cantidad: 250, tipoVenta: 'peso', subtotal: 8208 }] }]
    };
    sb.window = sb;
    sb.window.open = () => ({ document: { write: h => est.impresos.push(h), close() {} }, focus() {}, print() { est.imprimio = true; } });
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(TICKET, sb, { filename: 'admin-ticket.js' });
    return { sb, est };
  }
  const VENTA = { numero: 19, fecha: { seconds: 1789000000 }, medioPago: 'Efectivo', total: 8208,
                  items: [{ nombre: 'Almendras', precio: 32830, cantidad: 250, tipoVenta: 'peso', subtotal: 8208 }] };
  const preguntar = (T) => fn('preguntarImprimirTicket', T.sb)(VENTA);

  grupo('Sin formato configurado no se manda nada a la impresora');
  let T = panelTicket(null, true);
  let r = await preguntar(T);
  t('no imprime', r === false && !T.est.impresos.length);
  t('ofrece Configurar', T.est.preguntas.some(p => /\|Configurar$/.test(p)), T.est.preguntas.join(' + '));
  t('y lleva a Configuración', T.est.secciones.includes('config'));

  T = panelTicket(null, false);
  r = await preguntar(T);
  t('si dice "Ahora no", no va a ningún lado', r === false && !T.est.secciones.length);

  const CFG = { ancho: '80', rollo: 'continuo', pie: 'Gracias', despuesDeVender: 'preguntar', configurado: true };

  grupo('Configurado: pregunta, y solo imprime si le dicen que sí');
  T = panelTicket(CFG, true);
  r = await preguntar(T);
  t('pregunta ¿Imprimir ticket?', T.est.preguntas.some(p => /^¿Imprimir ticket\?\|Imprimir$/.test(p)), T.est.preguntas.join(' + '));
  t('imprime', r === true && T.est.impresos.length === 1);
  t('y el papel lleva los 0,250 kg', T.est.impresos[0].indexOf('0,250 kg') > 0);

  T = panelTicket(CFG, false);
  r = await preguntar(T);
  t('si dicen que no, no imprime', r === false && !T.est.impresos.length);

  grupo('"Imprimir directo" no pregunta, y "No imprimir" ni eso');
  T = panelTicket(Object.assign({}, CFG, { despuesDeVender: 'directo' }), false);
  r = await preguntar(T);
  t('directo imprime sin preguntar', r === true && !T.est.preguntas.length && T.est.impresos.length === 1);

  T = panelTicket(Object.assign({}, CFG, { despuesDeVender: 'no' }), true);
  r = await preguntar(T);
  t('en "no imprimir" no pregunta ni imprime', r === false && !T.est.preguntas.length && !T.est.impresos.length);

  grupo('Reimprimir usa los precios de ESA venta');
  T = panelTicket(CFG, true);
  r = await fn('reimprimirTicket', T.sb)('V1');
  t('imprime', r === true && T.est.impresos.length === 1);
  t('con el importe guardado, no recalculado', T.est.impresos[0].indexOf('$8.208') > 0);
  t('y NO el x1000', T.est.impresos[0].indexOf('8.207.500') < 0);
  t('queda registrado como impresión', T.est.logs.some(l => /^imprimir\|/.test(l)), T.est.logs.join(' + '));

  T = panelTicket(CFG, true);
  r = await fn('reimprimirTicket', T.sb)('NO-EXISTE');
  t('una venta que no está no imprime nada', r === false && !T.est.impresos.length);

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch(e => {
  console.error('  EXPLOTO: ' + e.stack);
  console.log('\n' + ok + ' pasaron, ' + (mal + 1) + ' fallaron');
  process.exit(1);
});
