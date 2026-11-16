/**
 * COLORES DEL PANEL: NORMAL, ALTO CONTRASTE Y PERSONALIZAR (16/11/2026).
 *
 * Pedido de la clienta: "opciones de contraste de colores, porque la escala de grises confunde".
 * En Configuración, "Colores del sistema": dos opciones rápidas (Normal y Alto contraste) y
 * "Personalizar" (Thiago), cada cosa por separado: fondo, bordes, letra gris, color de lo elegido
 * y renglón bajo el mouse, con una muestra y "Volver a como estaba". Se guarda en esta
 * computadora (localStorage), se aplica en el <head> antes de dibujar y se cambia en el momento,
 * sin recargar. Con todo "como siempre" no hay ningún data-col-*: el panel queda como antes.
 *
 * Corre admin-colores.js de verdad con un DOM de mentira, y revisa admin.html.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); }
};

const CODIGO = fs.readFileSync(path.join(RAIZ, 'admin-colores.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const ALTO = { fondo: 'negro', bordes: 'marcados', texto: 'blanca', acento: 'verde-fuerte', fila: 'marcada' };

/* Una página de mentira: <html> con atributos, el contenedor de las opciones, localStorage y
   los avisos del panel. */
function pagina(o) {
  o = o || {};
  const attrs = {};
  const raiz = {
    setAttribute: (k, v) => { attrs[k] = String(v); },
    removeAttribute: k => { delete attrs[k]; },
    getAttribute: k => (k in attrs ? attrs[k] : null),
  };
  const cont = { innerHTML: '' };
  const guardado = Object.assign({}, o.guardado || {});
  const localStorage = {
    getItem: k => { if (o.sinLeer) throw new Error('bloqueado'); return k in guardado ? guardado[k] : null; },
    setItem: (k, v) => { if (o.sinGuardar) throw new Error('bloqueado'); guardado[k] = String(v); },
    removeItem: k => { if (o.sinGuardar) throw new Error('bloqueado'); delete guardado[k]; },
  };
  const avisos = [];
  const oyentes = {};
  const ctx = {
    document: {
      documentElement: raiz,
      getElementById: id => (id === 'coloresOpciones' && !o.sinContenedor ? cont : null),
      addEventListener: (ev, fn) => { (oyentes['doc:' + ev] = oyentes['doc:' + ev] || []).push(fn); },
    },
    localStorage,
    showAdminToast: (m, tp) => avisos.push((tp || 'info') + ': ' + m),
    JSON,
  };
  ctx.window = { addEventListener: (ev, fn) => { (oyentes['win:' + ev] = oyentes['win:' + ev] || []).push(fn); } };
  vm.createContext(ctx);
  vm.runInContext(CODIGO + '\n;this.__api={elegirColores,cambiarColor,volverColores,coloresGuardados,pintarOpcionesColores,actual:()=>_coloresActual};', ctx);
  const api = ctx.__api;
  const disparar = (k, ev, arg) => (oyentes[k + ':' + ev] || []).forEach(fn => fn(arg));
  const col = () => Object.keys(attrs).filter(k => k.startsWith('data-col')).sort().map(k => k.slice(9) + '=' + attrs[k]).join(' ');
  return { api, attrs, cont, guardado, avisos, disparar, col };
}
const ALTO_ATTRS = 'acento=verde-fuerte bordes=marcados fila=marcada fondo=negro texto=blanca';

console.log('\n-- al abrir el panel --');
{
  const p = pagina();
  t('sin nada guardado: ningún data-col (el panel como siempre)', p.col() === '');
  t('con Alto contraste guardado: sus cinco ajustes antes de dibujar', pagina({ guardado: { brotesColores: JSON.stringify(ALTO) } }).col() === ALTO_ATTRS);
  t('lo guardado por la primera versión ("alto") es Alto contraste', pagina({ guardado: { brotesColores: 'alto' } }).col() === ALTO_ATTRS);
  t('un ajuste raro queda como siempre y los demás se respetan',
    pagina({ guardado: { brotesColores: JSON.stringify({ fondo: 'violeta', acento: 'azul' }) } }).col() === 'acento=azul');
  t('algo que no se entiende guardado: como siempre', pagina({ guardado: { brotesColores: '{roto' } }).col() === '');
  t('el navegador no deja leer: como siempre, sin romper', pagina({ sinLeer: true }).col() === '');
}

console.log('\n-- lo que se ve en Configuración --');
{
  const p = pagina();
  p.disparar('doc', 'DOMContentLoaded');
  const h = p.cont.innerHTML;
  t('dos opciones rápidas: Normal y Alto contraste', (h.match(/<button[^>]*class="colores-op/g) || []).length === 2 && /Alto contraste/.test(h));
  t('  Normal marcada', /class="colores-op activa"[^>]*elegirColores\('normal'\)/.test(h));
  t('Personalizar con los cinco ajustes', ['Fondo', 'Bordes de recuadros y casilleros', 'Letra gris (las aclaraciones)', 'Color de lo elegido', 'Renglón bajo el mouse']
    .every(x => h.includes('<div class="colores-ajuste-titulo">' + x + '</div>')));
  t('  con sus opciones (3, 3, 3, 5 y 2)', (h.match(/<button[^>]*class="colores-chip/g) || []).length === 16);
  t('  cada ajuste con "como siempre" marcado', (h.match(/class="colores-chip activa"/g) || []).length === 5 &&
    /class="colores-chip activa"[^>]*cambiarColor\('acento','verde'\)/.test(h));
  t('  los colores de lo elegido con su punto de color', (h.match(/class="colores-punto"/g) || []).length === 5);
  t('la muestra que cambia con los ajustes (usa las clases del panel)', /class="colores-vivo"/.test(h) && /class="card colores-vivo-card"/.test(h) && /btn btn-primary/.test(h));
  t('"Volver a como estaba", apagado si no se cambió nada', /class="btn btn-secondary btn-sm colores-volver" onclick="volverColores\(\)" disabled/.test(h));
  t('sin el contenedor no rompe', (() => { pagina({ sinContenedor: true }).api.pintarOpcionesColores(); return true; })());
}

console.log('\n-- las opciones rápidas --');
{
  const p = pagina();
  p.api.elegirColores('alto');
  t('Alto contraste: sus cinco ajustes en el momento', p.col() === ALTO_ATTRS);
  t('  guardado en esta computadora', JSON.stringify(JSON.parse(p.guardado.brotesColores)) === JSON.stringify(ALTO));
  t('  marcado, y sus ajustes marcados en Personalizar', /class="colores-op activa"[^>]*elegirColores\('alto'\)/.test(p.cont.innerHTML) &&
    /class="colores-chip activa"[^>]*cambiarColor\('fondo','negro'\)/.test(p.cont.innerHTML));
  t('  avisa', p.avisos.join() === 'success: Listo: colores de alto contraste.');
  p.api.elegirColores('alto');
  t('tocar la que ya está no hace nada', p.avisos.length === 1);
  p.api.elegirColores('normal');
  t('Normal: ningún data-col y nada guardado', p.col() === '' && !('brotesColores' in p.guardado));
  t('  avisa', p.avisos[1] === 'success: Listo: colores normales, como siempre.');
  p.api.elegirColores('violeta');
  t('una opción que no existe no hace nada', p.col() === '' && p.avisos.length === 2);
}

console.log('\n-- personalizar --');
{
  const p = pagina();
  p.api.cambiarColor('acento', 'azul');
  t('un ajuste: solo ese cambia, en el momento', p.col() === 'acento=azul');
  t('  sin aviso (se ve en el momento)', p.avisos.length === 0);
  t('  guardado', JSON.parse(p.guardado.brotesColores).acento === 'azul');
  t('  ya no es ninguna de las rápidas: lo dice', !/class="colores-op activa"/.test(p.cont.innerHTML) && /Ahora: colores personalizados\./.test(p.cont.innerHTML));
  t('  "Volver a como estaba" se prende', /colores-volver" onclick="volverColores\(\)">/.test(p.cont.innerHTML));
  p.api.cambiarColor('bordes', 'muy');
  p.api.cambiarColor('fondo', 'oscuro');
  t('se suman', p.col() === 'acento=azul bordes=muy fondo=oscuro');
  p.api.cambiarColor('acento', 'fucsia');
  p.api.cambiarColor('brillo', 'alto');
  t('un ajuste o una opción que no existe no hace nada', p.col() === 'acento=azul bordes=muy fondo=oscuro');
  p.api.cambiarColor('acento', 'verde');
  t('volver un ajuste a "como siempre" saca su atributo', p.col() === 'bordes=muy fondo=oscuro');
  p.api.volverColores();
  t('"Volver a como estaba": como al abrir el panel (acá, como siempre)', p.col() === '' && !('brotesColores' in p.guardado));
  t('  avisa', p.avisos.join() === 'success: Listo: los colores volvieron a como estaban.');
}
{
  const p = pagina({ guardado: { brotesColores: JSON.stringify(ALTO) } });
  p.api.cambiarColor('acento', 'naranja');
  p.api.cambiarColor('fila', 'suave');
  p.api.volverColores();
  t('"Volver a como estaba" con Alto contraste al abrir: vuelve a Alto contraste', p.col() === ALTO_ATTRS);
}
{
  const p = pagina({ sinGuardar: true });
  p.api.cambiarColor('fondo', 'negro');
  p.api.elegirColores('alto');
  t('el navegador no deja guardar: avisa en rojo y no cambia', p.col() === '' &&
    p.avisos.length === 2 && p.avisos.every(a => /^error: No se pudo guardar/.test(a)));
}

console.log('\n-- otra pestaña del panel --');
{
  const p = pagina();
  p.guardado.brotesColores = JSON.stringify({ acento: 'amarillo' });
  p.disparar('win', 'storage', { key: 'brotesColores' });
  t('si se cambia en otra pestaña, esta se pone igual', p.col() === 'acento=amarillo');
  p.disparar('win', 'storage', { key: 'otraCosa' });
  t('  otra clave no la toca', p.col() === 'acento=amarillo');
  delete p.guardado.brotesColores;
  p.disparar('win', 'storage', { key: null });
  t('  si se borran los datos del sitio, vuelve a como siempre', p.col() === '');
}

console.log('\n-- admin.html --');
{
  const head = HTML.slice(0, HTML.indexOf('</head>'));
  const iLetra = head.indexOf('<script src="admin-letra.js"></script>');
  const iCol = head.indexOf('<script src="admin-colores.js"></script>');
  t('admin-colores.js se carga en el <head>, antes de los estilos', iCol > iLetra && iLetra > 0 && iCol < head.indexOf('<style>'));
  t('el recuadro "Colores del sistema" en Configuración, debajo de la letra',
    /Colores del sistema/.test(HTML) && HTML.indexOf('id="letraOpciones"') < HTML.indexOf('id="coloresOpciones"') &&
    HTML.indexOf('id="coloresOpciones"') < HTML.indexOf('Configuraci&oacute;n de pedidos'));
  /* Todo lo de los ajustes va bajo html[data-col-...]: con todo como siempre no aplica nada. */
  const css = HTML.split(/\r?\n/).filter(l => /data-col-/.test(l) && !/^\s*\/\*/.test(l) && !/^\s{2,}\S/.test(l));
  t('las reglas de los ajustes van todas bajo html[data-col-...]',
    css.length >= 15 && css.every(l => l.split(',').every(s => /^\s*html\[data-col-/.test(s) || !/\{/.test(s) || /^\s*html\[data-col-/.test(s.split('{')[0]))), css.map(l => l.slice(0, 50)));
  /* Cada opción del módulo que no es "como siempre" tiene su regla. */
  const opciones = [['fondo', 'oscuro'], ['fondo', 'negro'], ['bordes', 'marcados'], ['bordes', 'muy'], ['texto', 'clara'], ['texto', 'blanca'],
    ['acento', 'verde-fuerte'], ['acento', 'azul'], ['acento', 'amarillo'], ['acento', 'naranja'], ['fila', 'marcada']];
  const sinRegla = opciones.filter(o => !HTML.includes('html[data-col-' + o[0] + '="' + o[1] + '"]'));
  t('cada opción tiene su regla', sinRegla.length === 0, sinRegla);

  /* Contraste (WCAG) con los colores de verdad. */
  const vars = sel => { const m = HTML.match(new RegExp(sel.replace(/[[\]"]/g, c => '\\' + c) + '\\{([^}]*)\\}')); return m ? m[1] : ''; };
  const v = (bloque, k) => ((bloque.match(new RegExp('--' + k + ':(#[0-9a-fA-F]{6})')) || [])[1] || '');
  const lum = hex => { const c = hex.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contraste = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const raiz = (HTML.match(/:root\{([^}]*)\}/) || [])[1] || '';
  const negro = vars('html[data-col-fondo="negro"]'), blanca = vars('html[data-col-texto="blanca"]'), clara = vars('html[data-col-texto="clara"]');
  const marc = vars('html[data-col-bordes="marcados"]');
  t('letra gris blanca sobre las tarjetas: más de 10 a 1 (como siempre, ~5)',
    contraste(v(blanca, 'text-dim'), v(negro, 'bg-card')) > 10 && contraste(v(raiz, 'text-dim'), v(raiz, 'bg-card')) < 6);
  t('  más clara: más de 7 a 1, también con el fondo de siempre', contraste(v(clara, 'text-dim'), v(raiz, 'bg-card')) > 7);
  t('bordes marcados: más de 4 a 1 con tarjetas y casilleros, con cualquier fondo (como siempre, ~1,3)',
    ['bg-card', 'bg-input'].every(k => [raiz, negro, vars('html[data-col-fondo="oscuro"]')].every(b => contraste(v(marc, 'border'), v(b, k)) > 4)) &&
    contraste(v(raiz, 'border'), v(raiz, 'bg-card')) < 1.5);
  ['verde-fuerte', 'azul', 'amarillo', 'naranja'].forEach(a => {
    const b = vars('html[data-col-acento="' + a + '"]');
    t('color ' + a + ': letra blanca sobre el botón (más de 4 a 1) y la letra de color sobre las tarjetas (más de 7 a 1)',
      contraste('#ffffff', v(b, 'accent')) > 4 && contraste(v(b, 'accent-light'), v(raiz, 'bg-card')) > 7,
      [contraste('#ffffff', v(b, 'accent')).toFixed(1), contraste(v(b, 'accent-light'), v(raiz, 'bg-card')).toFixed(1)]);
  });
  t('como siempre no cambió: los colores de siempre', v(raiz, 'bg') === '#0f1117' && v(raiz, 'bg-card') === '#1a1d27' &&
    v(raiz, 'text-dim') === '#8b8d97' && v(raiz, 'border') === '#2e3140' && /--accent:#5FA87A/.test(raiz));
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
