/**
 * TAMAÑO DE LA LETRA DEL PANEL (Configuración, 10/11/2026).
 *
 * Pedido de la clienta: la letra más grande. En Configuración, "Cambiar tamaño de fuente
 * del sistema": 100% (como siempre), 125%, 150%, 200% o 250%. Se guarda en ESTA
 * computadora (localStorage), se aplica en el <head> antes de dibujar y al cambiarlo se
 * confirma y se recarga el panel (admin-letra.js).
 *
 * Dos partes:
 *  1. admin-letra.js de verdad, con un document y un localStorage de mentira: qué tamaño
 *     toma al cargar, las opciones, confirmar / cancelar / recargar, el navegador que no
 *     deja guardar, el doble clic y el menú pegado debajo de la barra de arriba.
 *  2. admin.html: que con 100% no aplique nada nuevo (todo va bajo html[data-letra]) y que
 *     cada casillero o ventana con ancho fijo en px tenga su regla en rem, con la misma
 *     medida al 100%. Sin eso, al 150% el "$250.000" de Cargar compra se veía cortado.
 *     Si mañana aparece un casillero nuevo con width:NNpx, esta prueba avisa.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(RAIZ, 'admin-letra.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* ------------------------------------------------------------ el navegador de mentira */
function almacen(inicial, opts) {
  const o = opts || {};
  const datos = Object.assign({}, inicial || {});
  return {
    datos,
    getItem: k => { if (o.rompeLeer) throw new Error('bloqueado'); return Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null; },
    setItem: (k, v) => { if (o.rompeGuardar) throw new Error('bloqueado'); datos[k] = String(v); },
    removeItem: k => { if (o.rompeGuardar) throw new Error('bloqueado'); delete datos[k]; },
  };
}

function cargar(ls, opts) {
  const o = opts || {};
  const attrs = {};
  const props = {};
  const raiz = {
    style: {
      fontSize: '',
      setProperty: (k, v) => { props[k] = v; },
      removeProperty: k => { delete props[k]; },
      getPropertyValue: k => props[k] || '',
    },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    removeAttribute: k => { delete attrs[k]; },
    getAttribute: k => (k in attrs ? attrs[k] : null),
  };
  const opciones = { innerHTML: '' };
  const barra = { offsetHeight: o.altoBarra === undefined ? 0 : o.altoBarra };
  const panel = { style: { display: 'none' } };
  const alListo = [];
  const observadores = { mutacion: [], tamanio: [] };
  const eventosVentana = {};
  const llamadas = { recargas: 0, preguntas: [], toasts: [], confirms: [] };
  let respuesta = o.respuesta === undefined ? true : o.respuesta;
  const ctx = {
    console, Math, Number, String, Object, Array, JSON, parseInt, Promise, setTimeout,
    localStorage: ls,
    document: {
      documentElement: raiz,
      getElementById: id => (id === 'letraOpciones' ? (o.sinTarjeta ? null : opciones) : id === 'dashboard' ? panel : null),
      querySelector: s => (s === '.topbar' ? barra : null),
      addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') alListo.push(fn); },
    },
    location: { reload: () => { llamadas.recargas++; } },
    addEventListener: (ev, fn) => { (eventosVentana[ev] = eventosVentana[ev] || []).push(fn); },
    confirm: m => { llamadas.confirms.push(m); return respuesta; },
    MutationObserver: function (fn) { this.observe = (el, op) => observadores.mutacion.push({ fn, el, op }); },
    ResizeObserver: function (fn) { this.observe = el => observadores.tamanio.push({ fn, el }); },
  };
  if (!o.sinDialogo) {
    ctx.pedirConfirmacion = (m, op) => {
      llamadas.preguntas.push({ m, op });
      return o.demora ? new Promise(r => setTimeout(() => r(respuesta), 5)) : Promise.resolve(respuesta);
    };
  }
  ctx.showAdminToast = (m, tipo) => llamadas.toasts.push({ m, tipo });
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return {
    ctx, raiz, attrs, props, opciones, barra, panel, alListo, observadores, eventosVentana, llamadas,
    listo: () => alListo.forEach(fn => fn()),
    responder: v => { respuesta = v; },
  };
}

/* =========================================================== 1. el tamaño al cargar */
console.log('\n-- al cargar el panel --');
{
  const w = cargar(almacen());
  t('sin nada guardado: 100%, sin tocar <html>', w.raiz.style.fontSize === '' && w.raiz.getAttribute('data-letra') === null);
  t('letraGuardada() da 100', w.ctx.letraGuardada() === 100);
}
for (const v of [125, 150, 200, 250]) {
  const w = cargar(almacen({ brotesTamanioLetra: String(v) }));
  t('guardado ' + v + ': <html> al ' + v + '% y data-letra="' + v + '"',
    w.raiz.style.fontSize === v + '%' && w.raiz.getAttribute('data-letra') === String(v));
}
for (const raro of ['130', 'abc', '1000', '', '0', '-150', '100']) {
  const w = cargar(almacen({ brotesTamanioLetra: raro }));
  t('guardado "' + raro + '": queda en 100 sin tocar <html>', w.ctx.letraGuardada() === 100 && w.raiz.style.fontSize === '' && w.raiz.getAttribute('data-letra') === null);
}
{
  let w = null, err = null;
  try { w = cargar(almacen({ brotesTamanioLetra: '150' }, { rompeLeer: true })); } catch (e) { err = e; }
  t('el navegador no deja leer: no rompe y queda en 100', !err && w.ctx.letraGuardada() === 100 && w.raiz.style.fontSize === '');
}

/* =========================================================== las opciones de Configuración */
console.log('\n-- las opciones en Configuración --');
{
  const w = cargar(almacen({ brotesTamanioLetra: '150' }));
  w.listo();
  const h = w.opciones.innerHTML;
  const botones = h.match(/<button /g) || [];
  t('cinco opciones', botones.length === 5, botones.length);
  t('en orden: 100, 125, 150, 200, 250', /100%[\s\S]*125%[\s\S]*150%[\s\S]*200%[\s\S]*250%/.test(h));
  t('una sola marcada, la de 150', (h.match(/letra-op activa/g) || []).length === 1 && /letra-op activa"[^>]*elegirLetra\(150\)/.test(h));
  t('la marcada dice "En uso" y la de 100 dice "Normal"', /En uso/.test(h) && /elegirLetra\(100\)[\s\S]*?Normal/.test(h));
  /* El "Aa" muestra el tamaño real de cada opción aunque la página ya esté al 150%. */
  const tam = v => { const m = h.match(new RegExp('elegirLetra\\(' + v + '\\)[^]*?font-size:([\\d.]+)rem')); return m ? parseFloat(m[1]) : NaN; };
  t('el "Aa" de 150 (el actual) mide 1rem', tam(150) === 1, tam(150));
  t('el "Aa" de 100 mide 0.667rem (100/150)', tam(100) === 0.667, tam(100));
  t('el "Aa" de 250 mide 1.667rem (250/150)', tam(250) === 1.667, tam(250));
}
{
  const w = cargar(almacen());
  w.listo();
  const h = w.opciones.innerHTML;
  t('con 100: el "Aa" de 200 mide 2rem y el de 100, 1rem', /elegirLetra\(200\)[^]*?font-size:2rem/.test(h) && /elegirLetra\(100\)[^]*?font-size:1rem/.test(h));
}
{
  let err = null;
  try { cargar(almacen(), { sinTarjeta: true }).listo(); } catch (e) { err = e; }
  t('sin la tarjeta en la página no rompe', !err);
}

/* =========================================================== elegir otro tamaño */
console.log('\n-- elegir otro tamaño --');
(async () => {
  {
    const w = cargar(almacen({ brotesTamanioLetra: '150' }));
    await w.ctx.elegirLetra(150);
    t('tocar el que ya está: no pregunta ni recarga', w.llamadas.preguntas.length === 0 && w.llamadas.recargas === 0);
    await w.ctx.elegirLetra(175);
    await w.ctx.elegirLetra('200');
    t('un tamaño que no está en la lista: nada', w.llamadas.preguntas.length === 0 && w.llamadas.recargas === 0);
  }
  {
    const ls = almacen();
    const w = cargar(ls, { respuesta: false });
    await w.ctx.elegirLetra(200);
    t('"Cancelar": pregunta una vez', w.llamadas.preguntas.length === 1);
    t('"Cancelar": no guarda nada ni recarga', !('brotesTamanioLetra' in ls.datos) && w.llamadas.recargas === 0);
  }
  {
    const ls = almacen();
    const w = cargar(ls);
    await w.ctx.elegirLetra(200);
    const p = w.llamadas.preguntas[0] || { m: '', op: {} };
    t('la pregunta dice el tamaño y que se vuelve a cargar', /al 200%/.test(p.m) && /se vuelve a cargar/.test(p.m) && /F5/.test(p.m), p.m);
    t('con título y el botón "Cambiar"', p.op.titulo === 'Cambiar el tamaño de la letra' && p.op.aceptar === 'Cambiar');
    t('"Cambiar": guarda 200 en esta computadora', ls.datos.brotesTamanioLetra === '200');
    t('"Cambiar": recarga el panel una vez', w.llamadas.recargas === 1);
    t('y no toca la página antes de recargar (lo aplica la carga nueva)', w.raiz.style.fontSize === '');
  }
  {
    const ls = almacen({ brotesTamanioLetra: '250' });
    const w = cargar(ls);
    await w.ctx.elegirLetra(100);
    t('volver a 100: la pregunta dice "tamaño normal (100%)"', /tamaño normal \(100%\)/.test((w.llamadas.preguntas[0] || {}).m || ''));
    t('volver a 100: borra lo guardado y recarga', !('brotesTamanioLetra' in ls.datos) && w.llamadas.recargas === 1);
  }
  {
    const ls = almacen({}, { rompeGuardar: true });
    const w = cargar(ls);
    await w.ctx.elegirLetra(150);
    t('el navegador no deja guardar: avisa en rojo y NO recarga',
      w.llamadas.recargas === 0 && w.llamadas.toasts.length === 1 && w.llamadas.toasts[0].tipo === 'error' && /no lo permite/.test(w.llamadas.toasts[0].m));
  }
  {
    const ls = almacen();
    const w = cargar(ls, { demora: true });
    const a = w.ctx.elegirLetra(125), b = w.ctx.elegirLetra(125), c = w.ctx.elegirLetra(150);
    await Promise.all([a, b, c]);
    t('doble clic mientras pregunta: una sola pregunta y una sola recarga', w.llamadas.preguntas.length === 1 && w.llamadas.recargas === 1, w.llamadas.preguntas.length + '/' + w.llamadas.recargas);
    await w.ctx.elegirLetra(200);
    t('después de contestar se puede volver a elegir', w.llamadas.preguntas.length === 2);
  }
  {
    const ls = almacen();
    const w = cargar(ls, { sinDialogo: true });
    await w.ctx.elegirLetra(150);
    t('sin los diálogos del panel cargados, usa el confirm del navegador', w.llamadas.confirms.length === 1 && ls.datos.brotesTamanioLetra === '150' && w.llamadas.recargas === 1);
  }

  /* ========================================================= el menú debajo de la barra */
  console.log('\n-- el menú pegado debajo de la barra de arriba --');
  {
    const w = cargar(almacen());
    w.listo();
    t('con 100: no mide ni observa nada (el panel queda como siempre)',
      w.observadores.mutacion.length === 0 && w.observadores.tamanio.length === 0 && !w.eventosVentana.resize && w.props['--letra-barra'] === undefined);
  }
  {
    const w = cargar(almacen({ brotesTamanioLetra: '150' }), { altoBarra: 0 });
    w.listo();
    t('con 150 y el panel todavía oculto (antes de entrar): no anota un alto de 0', w.props['--letra-barra'] === undefined);
    t('observa cuando se muestra el panel (#dashboard, su style)',
      w.observadores.mutacion.length === 1 && w.observadores.mutacion[0].el === w.panel && JSON.stringify(w.observadores.mutacion[0].op.attributeFilter) === '["style"]');
    t('y el tamaño de la barra, y la ventana', w.observadores.tamanio.length === 1 && w.observadores.tamanio[0].el === w.barra && (w.eventosVentana.resize || []).length === 1);
    w.barra.offsetHeight = 100;
    w.observadores.mutacion[0].fn();
    t('al aparecer el panel: --letra-barra = 100px', w.props['--letra-barra'] === '100px');
    w.barra.offsetHeight = 124;
    w.observadores.tamanio[0].fn();
    t('si la barra cambia de alto, se vuelve a medir (124px)', w.props['--letra-barra'] === '124px');
    w.barra.offsetHeight = 0;
    w.eventosVentana.resize[0]();
    t('si el panel se oculta (sesión cerrada), se queda con el último alto', w.props['--letra-barra'] === '124px');
  }
  {
    const w = cargar(almacen({ brotesTamanioLetra: '200' }), { altoBarra: 124 });
    w.listo();
    t('si el panel ya se ve al cargar, mide enseguida', w.props['--letra-barra'] === '124px');
  }

  admin();
  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FALLA la prueba se cortó: ' + e.stack); process.exit(1); });

/* =========================================================== 2. admin.html */
function admin() {
  console.log('\n-- admin.html: dónde se carga y la tarjeta --');
  const head = HTML.slice(0, HTML.indexOf('</head>'));
  const iScript = head.indexOf('<script src="admin-letra.js"></script>');
  t('admin-letra.js se carga en el <head>', iScript > 0);
  const otroScript = head.search(/<script(?![^>]*admin-letra)/);
  t('antes del <style> y de cualquier otro script del panel',
    iScript > 0 && iScript < head.indexOf('<style>') && (otroScript < 0 || iScript < otroScript));
  t('se carga una sola vez', (HTML.match(/src="admin-letra\.js"/g) || []).length === 1);
  const iConfig = HTML.indexOf('id="sec-config"');
  const iPedidos = HTML.indexOf('Configuraci&oacute;n de pedidos');
  const iTarjeta = HTML.indexOf('id="letraOpciones"');
  t('la tarjeta está en Configuración, arriba de todo', iConfig > 0 && iTarjeta > iConfig && iTarjeta < iPedidos);
  t('con el título que pidió Thiago', HTML.slice(iConfig, iTarjeta).indexOf('Cambiar tama&ntilde;o de fuente del sistema') > 0);
  t('y dice que se guarda en esta computadora', /Se guarda en esta computadora/.test(HTML.slice(iConfig, iTarjeta + 200)));

  /* Que el módulo no declare un nombre que admin.html declara después: se carga primero,
     así que el que cae sería el bloque entero de admin.html. */
  const nombres = [...SRC.matchAll(/^(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  const choca = nombres.filter(n => new RegExp('(?:^|[;{}\\s])(?:const|let|var|function|class)\\s+' + n.replace(/\$/g, '\\$') + '\\b').test(HTML));
  t('ningún nombre de admin-letra.js se declara en admin.html (' + nombres.length + ' nombres)', choca.length === 0, choca.join(', '));

  console.log('\n-- admin.html: con 100% no cambia nada --');
  const ini = HTML.indexOf('/* Con la letra agrandada (html[data-letra]');
  const fin = HTML.indexOf('</style>', ini);
  const bloque = ini > 0 && fin > ini ? HTML.slice(ini, fin) : '';
  t('está el bloque de reglas de la letra agrandada', bloque.length > 1000, bloque.length);
  /* Cada regla del bloque (sacando comentarios y los @media que solo envuelven) empieza con html[data-letra]. */
  const sinCom = bloque.replace(/\/\*[\s\S]*?\*\//g, '');
  const reglas = [];
  {
    const re = /@media[^{]*\{((?:[^{}]*\{[^}]*\})*)\s*\}|([^{}@]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(sinCom))) {
      if (m[1] !== undefined) {
        for (const r of m[1].matchAll(/([^{}]+)\{([^}]*)\}/g)) reglas.push({ sel: r[1].trim(), dec: r[2], media: true });
      } else reglas.push({ sel: m[2].trim(), dec: m[3], media: false });
    }
  }
  const sueltas = reglas.filter(r => r.sel.split(',').some(s => !/^html\[data-letra(="\d+")?\]/.test(s.trim())));
  t('todas las reglas del bloque son de html[data-letra] (' + reglas.length + ' reglas)', reglas.length > 80 && sueltas.length === 0, sueltas.map(r => r.sel).slice(0, 3).join(' | '));
  t('fuera del bloque, nadie más usa data-letra', HTML.split('data-letra').length - 1 === (bloque.split('data-letra').length - 1));
  t('la variable de la barra tiene su valor de siempre (57px)', /html\[data-letra\]\{--letra-barra:57px\}/.test(bloque));

  console.log('\n-- admin.html: lo que tiene ancho fijo en px crece igual que la letra --');
  const css = HTML.match(/<style>[\s\S]*?<\/style>/)[0];
  /* Las reglas de siempre (fuera del bloque y de los @media), con su selector y declaraciones. */
  const cssSinBloque = css.replace(bloque, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const originales = {};
  {
    let i = 0, sinMedia = '', d = 0;
    /* saca los @media para quedarse con las reglas de pantalla grande */
    while (i < cssSinBloque.length) {
      const k = cssSinBloque.indexOf('@media', i);
      if (k < 0) { sinMedia += cssSinBloque.slice(i); break; }
      sinMedia += cssSinBloque.slice(i, k);
      let j = cssSinBloque.indexOf('{', k) + 1; d = 1;
      while (d && j < cssSinBloque.length) { if (cssSinBloque[j] === '{') d++; else if (cssSinBloque[j] === '}') d--; j++; }
      i = j;
    }
    for (const r of sinMedia.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      for (const s of r[1].split(',')) {
        const sel = s.trim().replace(/\s+/g, ' ');
        originales[sel] = (originales[sel] || '') + ';' + r[2];
      }
    }
  }
  const nuevas = {};
  for (const r of reglas) {
    for (const s of r.sel.split(',')) {
      const sel = s.trim().replace(/^html\[data-letra(="\d+")?\]\s*/, '').replace(/\s+/g, ' ');
      if (!r.media || !/data-letra="/.test(s)) nuevas[sel] = (nuevas[sel] || '') + ';' + r.dec;
    }
  }
  /* a) Las reglas de casilleros (inputs, selects) con un ancho fijo de 20 px o más. */
  const deCasillero = /(input|select|textarea|form-input|-qty|-monto|threshold|lp-cant|stock-input|pp-new-input|mayo-input-wrap)/i;
  const faltan = [];
  for (const [sel, dec] of Object.entries(originales)) {
    if (!deCasillero.test(sel)) continue;
    const px = [...dec.matchAll(/(?:^|;)\s*(?:(?:min-|max-)?width|flex(?:-basis)?)\s*:[^;]*?(\d+)px/g)].map(m => +m[1]).filter(n => n >= 20);
    if (px.length && !nuevas[sel]) faltan.push(sel);
  }
  t('cada casillero con ancho fijo tiene su regla', faltan.length === 0, faltan.join(' | '));

  /* b) Los casilleros con el ancho escrito en línea (style="width:46px"), en admin.html y módulos. */
  const archivos = ['admin.html', ...fs.readdirSync(RAIZ).filter(f => /^admin-.*\.js$/.test(f))];
  const enLinea = new Set(), maxEnLinea = new Set();
  for (const f of archivos) {
    const txt = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    for (const m of txt.matchAll(/<(input|select|textarea|div|section|span|label|form|table)\b([^<>]*?)\bstyle=(\\?["'])(.*?)\3/g)) {
      const tag = m[1], attrs = m[2], st = m[4];
      if (tag === 'input' && !/type=\\?["']?(checkbox|radio)/.test(attrs + m[0])) {
        const w = st.match(/^width:(\d+)px/);
        if (w) enLinea.add(+w[1]);
        if (/(^|;)\s*width\s*:\s*\d+px/.test(st) && !/^width:/.test(st)) enLinea.add('no al principio: ' + st.slice(0, 40));
      }
      for (const x of st.matchAll(/(?:^|;)\s*max-width\s*:\s*(\d+)px/g)) maxEnLinea.add(+x[1]);
    }
  }
  const sinRegla = [...enLinea].filter(v => {
    if (typeof v === 'string') return true;
    const m = bloque.match(new RegExp('html\\[data-letra\\] input\\[style\\^="width:' + v + 'px"\\]\\{width:([\\d.]+)rem!important\\}'));
    return !m || +m[1] * 16 !== v;
  });
  t('cada ancho en línea de casillero (' + enLinea.size + ' distintos) tiene su regla, con la misma medida al 100%', enLinea.size > 5 && sinRegla.length === 0, sinRegla.join(', '));
  const maxSin = [...maxEnLinea].filter(v => {
    const m = bloque.match(new RegExp('html\\[data-letra\\] \\[style\\*="max-width:' + v + 'px"\\]\\{max-width:([\\d.]+)rem!important\\}'));
    return !m || +m[1] * 16 !== v;
  });
  t('cada ventana o tarjeta con max-width en línea (' + maxEnLinea.size + ' distintos) tiene su regla, con la misma medida al 100%', maxEnLinea.size > 10 && maxSin.length === 0, maxSin.join(', '));

  /* c) Lo que se pasó a rem da EXACTAMENTE lo mismo que antes al 100% (rem x 16 = px). */
  const aPx = s => s.replace(/([\d.]+)rem/g, (_, n) => (+n * 16) + 'px').replace(/\s+/g, ' ').trim();
  const distintos = [];
  let comparados = 0;
  for (const [sel, dec] of Object.entries(nuevas)) {
    const orig = originales[sel];
    if (!orig) continue;
    for (const d of dec.split(';')) {
      const m = d.match(/^\s*([\w-]+)\s*:\s*(.+?)\s*(!important)?\s*$/);
      if (!m || !/rem/.test(m[2])) continue;
      const prop = m[1];
      let o = null;
      const enOrig = orig.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)'));
      if (enOrig) o = enOrig[1].trim();
      else if (prop === 'flex-basis') { const f = orig.match(/(?:^|;)\s*flex\s*:\s*[\d.]+\s+[\d.]+\s+(\d+px)/); if (f) o = f[1]; }
      if (o === null) continue;
      comparados++;
      if (aPx(m[2]) !== aPx(o)) distintos.push(sel + ' ' + prop + ': ' + m[2] + ' vs ' + o);
    }
  }
  t('las ' + comparados + ' medidas pasadas a rem dan lo mismo que antes al 100%', comparados > 40 && distintos.length === 0, distintos.slice(0, 4).join(' | '));
  t('el menú: 13.75rem = los 220px de siempre', /\.sidebar\{width:13\.75rem;/.test(bloque) && /\.sidebar\{[^}]*width:220px/.test(css));

  /* d) Lo que en pantallas chicas pasa a una columna, solo en pantallas grandes. */
  const enMediaChica = ['.prov-split', '.venta-modal-body', '.stats-row', '.ini-cajas', '.vt-kpis', '.tb-pop'];
  const malos = enMediaChica.filter(c => reglas.some(r => !r.media && r.sel.indexOf(c) >= 0));
  t('lo que en el celular cambia, se agranda solo en pantallas grandes', malos.length === 0, malos.join(', '));
  t('la venta pasa a una columna antes, en proporción a la letra (900 x 1,25 / 1,5 / 2 / 2,5)',
    ['1125px){html[data-letra="125"]', '1350px){html[data-letra="150"]', '1800px){html[data-letra="200"]', '2250px){html[data-letra="250"]']
      .every(s => bloque.indexOf('@media (max-width:' + s + ' .venta-modal-body{grid-template-columns:1fr}}') >= 0));
}
