/* Prueba, sobre el FUENTE REAL, que un fallo al refrescar no se reporte como
   fallo al guardar, y que el lector no reviente con e.key indefinido. */
const fs = require('fs');
let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };
const grupo = (n) => console.log('\n' + n);

/* ---------------------------------------------------------------- el lector */
const lec = fs.readFileSync('admin-lector.js', 'utf8');
// se ejecuta el modulo capturando el listener de keydown
let handler = null;
const stubs = {
  document: {
    addEventListener: (ev, fn, cap) => { if (ev === 'keydown' && cap === true) handler = fn; },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => []
  },
  window: {}, console
};
try {
  new Function('document', 'window', 'console', 'showAdminToast', 'db', 'auth', 'allProducts',
    lec.replace(/export\s+/g, ''))(stubs.document, stubs.window, console, () => {}, {}, {}, []);
} catch (e) { /* el resto del modulo puede necesitar cosas del panel; alcanza con el listener */ }

grupo('El lector de codigos, con eventos raros');
t('el listener quedo registrado en captura', typeof handler === 'function');
const disparar = (e) => { try { handler(e); return 'ok'; } catch (err) { return 'EXPLOTO: ' + err.message; } };
t('e.key indefinido no explota', disparar({ timeStamp: 1 }) === 'ok');
t('e.key nulo tampoco', disparar({ timeStamp: 2, key: null }) === 'ok');
t('e.key numerico tampoco', disparar({ timeStamp: 3, key: 5 }) === 'ok');
t('una tecla normal sigue funcionando', disparar({ timeStamp: 4, key: 'a' }) === 'ok');
t('Enter sigue funcionando', disparar({ timeStamp: 5, key: 'Enter', preventDefault(){}, stopPropagation(){}, target: null }) === 'ok');
t('con Ctrl sale antes', disparar({ timeStamp: 6, ctrlKey: true }) === 'ok');

/* ------------------------------------------------------------------ la caja */
grupo('Cerrar caja: guardado y refresco son cosas distintas');
const caja = fs.readFileSync('admin-caja.js', 'utf8');

function cuerpo(nombre) {
  const i = caja.indexOf('async function ' + nombre);
  let b = caja.indexOf('{', i), prof = 0, k;
  for (k = b; k < caja.length; k++) { if (caja[k] === '{') prof++; else if (caja[k] === '}') { prof--; if (!prof) break; } }
  return caja.slice(i, k + 1);
}
const cerrar = cuerpo('confirmarCierre');
const abrir = cuerpo('abrirCaja');

/* El refresco tiene que estar en su propio try, DESPUES del aviso de exito. */
const refrescoAparte = /closeCierreModal\(\);[\s\S]{0,900}?try \{\s*await loadCaja\(\);\s*\} catch/;
t('al cerrar, loadCaja va en su propio try', refrescoAparte.test(cerrar));
t('al abrir, tambien', /closeAbrirCajaModal\(\);[\s\S]{0,700}?try \{\s*await loadCaja\(\);\s*\} catch/.test(abrir));

/* Y el mensaje de ese catch NO puede decir que fallo el cierre. */
const msgCerrar = (cerrar.match(/La caja se cerró[^']*/) || [''])[0];
t('el aviso dice que la caja SI se cerro', /se cerró/.test(msgCerrar));
t('y que lo que fallo fue la pantalla', /actualizar la pantalla|recarg/i.test(msgCerrar));
t('no dice "Error al cerrar" en ese camino', !/Error al cerrar/.test(msgCerrar));

const msgAbrir = (abrir.match(/La caja se abrió[^']*/) || [''])[0];
t('lo mismo al abrir', /se abrió/.test(msgAbrir) && /recarg/i.test(msgAbrir));

/* El catch de afuera sigue existiendo para los fallos REALES de guardado. */
t('sigue avisando si falla el guardado de verdad', /Error al cerrar: /.test(cerrar));
t('idem al abrir', /Error al abrir: /.test(abrir));

/* Y el estado se escribe, que es lo que hace que la pantalla pueda mostrarlo. */
t("el cierre escribe estado 'cerrada'", /estado: 'cerrada'/.test(cerrar));
t('y limpia el puntero de caja abierta', /cajaAbiertaId: null/.test(cerrar));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
