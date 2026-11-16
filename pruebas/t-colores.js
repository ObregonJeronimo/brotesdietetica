/**
 * COLORES DEL PANEL: NORMAL O ALTO CONTRASTE (16/11/2026).
 *
 * Pedido de la clienta: "opciones de contraste de colores, porque la escala de grises confunde".
 * En Configuración, "Colores del sistema": Normal (como siempre) o Alto contraste. Se guarda en
 * esta computadora (localStorage), se aplica en el <head> antes de dibujar y se cambia en el
 * momento, sin recargar. Con Normal no hay data-colores: el panel queda exactamente como antes.
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
  };
  ctx.window = { addEventListener: (ev, fn) => { (oyentes['win:' + ev] = oyentes['win:' + ev] || []).push(fn); } };
  vm.createContext(ctx);
  vm.runInContext(CODIGO + '\n;this.__api={elegirColores,coloresGuardados,pintarOpcionesColores,actual:()=>_coloresActual};', ctx);
  const api = ctx.__api;
  const disparar = (k, ev, arg) => (oyentes[k + ':' + ev] || []).forEach(fn => fn(arg));
  return { api, attrs, cont, guardado, avisos, disparar };
}

console.log('\n-- al abrir el panel --');
{
  const p = pagina();
  t('sin nada guardado: Normal, sin data-colores (el panel como siempre)', p.attrs['data-colores'] === undefined && p.api.actual() === 'normal');
  const a = pagina({ guardado: { brotesColores: 'alto' } });
  t('con Alto contraste guardado: data-colores="alto" antes de dibujar', a.attrs['data-colores'] === 'alto');
  t('algo raro guardado: Normal', pagina({ guardado: { brotesColores: 'violeta' } }).attrs['data-colores'] === undefined);
  t('el navegador no deja leer: Normal, sin romper', pagina({ sinLeer: true }).attrs['data-colores'] === undefined);
}

console.log('\n-- las opciones de Configuración --');
{
  const p = pagina();
  p.disparar('doc', 'DOMContentLoaded');
  const h = p.cont.innerHTML;
  t('dos opciones: Normal y Alto contraste', (h.match(/<button[^>]*class="colores-op/g) || []).length === 2 && /Normal/.test(h) && /Alto contraste/.test(h));
  t('  la que está en uso, marcada', /class="colores-op activa"[^>]*elegirColores\('normal'\)/.test(h) && /En uso/.test(h));
  t('  la otra dice para qué sirve', /Más fácil de distinguir/.test(h));
  t('  cada una con su muestra de colores', (h.match(/class="colores-muestra"/g) || []).length === 2 && /background:#000000/.test(h) && /background:#0f1117/.test(h));
  t('sin el contenedor no rompe', (() => { const q = pagina({ sinContenedor: true }); q.api.pintarOpcionesColores(); return true; })());
}

console.log('\n-- elegir --');
{
  const p = pagina();
  p.api.elegirColores('alto');
  t('Alto contraste: se aplica en el momento', p.attrs['data-colores'] === 'alto');
  t('  queda guardado en esta computadora', p.guardado.brotesColores === 'alto');
  t('  se marca en las opciones', /class="colores-op activa"[^>]*elegirColores\('alto'\)/.test(p.cont.innerHTML));
  t('  avisa', p.avisos.join() === 'success: Listo: colores de alto contraste.');
  p.api.elegirColores('alto');
  t('tocar la que ya está no hace nada', p.avisos.length === 1);
  p.api.elegirColores('normal');
  t('Normal: saca data-colores y no deja nada guardado', p.attrs['data-colores'] === undefined && !('brotesColores' in p.guardado));
  t('  avisa', p.avisos[1] === 'success: Listo: colores normales, como siempre.');
  p.api.elegirColores('violeta');
  t('una opción que no existe no hace nada', p.attrs['data-colores'] === undefined && p.avisos.length === 2);
}
{
  const p = pagina({ sinGuardar: true });
  p.api.elegirColores('alto');
  t('el navegador no deja guardar: avisa en rojo y no cambia', p.attrs['data-colores'] === undefined && /^error: No se pudo guardar/.test(p.avisos[0] || ''));
}

console.log('\n-- otra pestaña del panel --');
{
  const p = pagina();
  p.guardado.brotesColores = 'alto';
  p.disparar('win', 'storage', { key: 'brotesColores' });
  t('si se elige en otra pestaña, esta se pone igual', p.attrs['data-colores'] === 'alto' && p.api.actual() === 'alto');
  p.disparar('win', 'storage', { key: 'otraCosa' });
  t('  otra clave no la toca', p.attrs['data-colores'] === 'alto');
  delete p.guardado.brotesColores;
  p.disparar('win', 'storage', { key: null });
  t('  si se borran los datos del sitio, vuelve a Normal', p.attrs['data-colores'] === undefined);
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
  /* Todo lo del alto contraste va bajo html[data-colores="alto"]: con Normal no aplica nada. */
  const css = HTML.split(/\r?\n/).filter(l => /data-colores/.test(l) && !/^\s*\/\*/.test(l));
  t('las reglas del alto contraste van todas bajo html[data-colores="alto"]',
    css.length >= 6 && css.every(l => /^html\[data-colores="alto"\]/.test(l.trim())), css.map(l => l.slice(0, 60)));
  const vars = (HTML.match(/html\[data-colores="alto"\]\{([^}]*)\}/) || [])[1] || '';
  const v = k => ((vars.match(new RegExp('--' + k + ':([^;]+);')) || [])[1] || '').trim();
  t('cambia los colores de base', ['bg', 'bg-card', 'bg-input', 'bg-hover', 'border', 'text', 'text-main', 'text-dim', 'accent', 'accent-light', 'accent-bg']
    .every(k => v(k)), vars.slice(0, 200));
  /* Contraste (WCAG) de lo que confundía, con los colores de verdad. */
  const lum = hex => { const c = hex.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contraste = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const raiz = (HTML.match(/:root\{([^}]*)\}/) || [])[1] || '';
  const r = k => ((raiz.match(new RegExp('--' + k + ':(#[0-9a-fA-F]{6})')) || [])[1] || '');
  t('el texto secundario sobre las tarjetas se lee mucho mejor (más de 10 a 1; antes ~5)',
    contraste(v('text-dim'), v('bg-card')) > 10 && contraste(r('text-dim'), r('bg-card')) < 6,
    [contraste(v('text-dim'), v('bg-card')).toFixed(1), contraste(r('text-dim'), r('bg-card')).toFixed(1)]);
  t('el borde de las tarjetas y casilleros se ve (más de 4 a 1; antes ~1,3)',
    contraste(v('border'), v('bg-card')) > 4 && contraste(v('border'), v('bg-input')) > 4 && contraste(r('border'), r('bg-card')) < 1.5);
  t('la letra blanca sobre el botón verde se lee (más de 4 a 1; antes ~2,9)', contraste('#ffffff', v('accent')) > 4 && contraste('#ffffff', r('accent')) < 3);
  t('Normal no cambió: los colores de siempre', r('bg') === '#0f1117' && r('bg-card') === '#1a1d27' && r('text-dim') === '#8b8d97' && /--accent:#5FA87A/.test(raiz));
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
