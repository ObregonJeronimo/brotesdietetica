/**
 * EL CARTEL "AGREGADO" NO PUEDE SALIR SI NO SE AGREGO NADA.
 *
 * Escanear en una venta avisaba en la MISMA linea en que agregaba:
 *
 *     addVentaItem(prod.id); _avisarAgregado(prod);
 *
 * y eso era mentira en un caso concreto. Un producto que se vende por peso no
 * entra de a uno: addVentaItem esta reasignada en runtime a una funcion async
 * que abre un dialogo preguntando cuantos gramos. Si la persona lo cancela, no
 * se agrega nada -pero el cartel verde ya habia salido-.
 *
 * En el mostrador eso es peor que no avisar: se sigue con la venta creyendo
 * que el producto esta cargado, y se cobra de menos.
 *
 * Y no alcanza con esperar la promesa: agregar y cancelar terminan las dos sin
 * devolver nada. Hay que mirar si la cantidad de ese producto en la venta
 * subio.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'admin-lector.js'), 'utf8');

function cuerpo(n) {
  let i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n);
  if (src.slice(i - 6, i) === 'async ') i -= 6;
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* Se arma con el mismo comportamiento que tiene el panel de verdad:
   - un producto por unidad entra de una;
   - uno por peso abre un dialogo y solo entra si lo responden. */
function correr({ porPeso = false, cancela = false, yaTenia = 0, explota = false } = {}) {
  const avisos = [];
  const venta = yaTenia ? [{ id: 'p1', cantidad: yaTenia }] : [];

  const agregar = async (id) => {
    if (explota) throw new Error('se cayo la red');
    if (porPeso) {
      /* el dialogo: tarda, y puede volver sin nada */
      await new Promise(r => setTimeout(r, 5));
      if (cancela) return;
      const it = venta.find(x => x.id === id);
      if (it) it.cantidad += 500; else venta.push({ id: id, cantidad: 500 });
      return;
    }
    const it = venta.find(x => x.id === id);
    if (it) it.cantidad++; else venta.push({ id: id, cantidad: 1 });
  };

  const fakes = {
    showAdminToast: (m, tipo) => avisos.push((tipo || '') + ': ' + m),
    console: { warn: () => avisos.push('warn') },
  };
  const nombres = Object.keys(fakes);
  const fn = new Function(...nombres,
    cuerpo('_avisarAgregado') + cuerpo('_agregarYAvisar') + ';return _agregarYAvisar;');
  const verCant = () => { const it = venta.find(x => x.id === 'p1'); return it ? it.cantidad : 0; };
  return fn(...nombres.map(n => fakes[n]))({ id: 'p1', nombre: 'Mani' }, agregar, verCant)
    .then(() => ({ avisos, venta }));
}

(async () => {
  /* ------------------------------------------------- lo que ya funcionaba */
  const unidad = await correr();
  t('un producto por unidad se agrega', unidad.venta.length === 1);
  t('y avisa', unidad.avisos.some(a => a.indexOf('success: Agregado: Mani') === 0));

  const repetido = await correr({ yaTenia: 1 });
  t('sumar uno mas al que ya estaba tambien avisa',
    repetido.venta[0].cantidad === 2 && repetido.avisos.length === 1);

  /* ------------------------------------------------------- EL CASO DEL BUG */
  const pesoOk = await correr({ porPeso: true });
  t('por peso, respondiendo el dialogo: se agrega', pesoOk.venta[0].cantidad === 500);
  t('y avisa recien despues de responder',
    pesoOk.avisos.some(a => a.indexOf('success: Agregado') === 0));

  const pesoCancel = await correr({ porPeso: true, cancela: true });
  t('por peso, CANCELANDO: no se agrega nada', pesoCancel.venta.length === 0);
  t('y NO dice que lo agrego', pesoCancel.avisos.length === 0);

  /* Cancelar cuando el producto YA estaba en la venta: la cantidad no cambia,
     asi que tampoco corresponde avisar. */
  const pesoCancelConPrevio = await correr({ porPeso: true, cancela: true, yaTenia: 300 });
  t('cancelando sobre uno que ya estaba, la cantidad no cambia',
    pesoCancelConPrevio.venta[0].cantidad === 300);
  t('y tampoco avisa', pesoCancelConPrevio.avisos.length === 0);

  /* ----------------------------------------------------------- si se cae */
  const roto = await correr({ explota: true });
  t('si agregar falla, no dice que lo agrego',
    !roto.avisos.some(a => a.indexOf('success') === 0));
  t('y queda registro en la consola', roto.avisos.indexOf('warn') >= 0);

  /* --------------------------------------------------- que no vuelva atras */
  t('ya no se avisa en la misma linea que se agrega',
    src.indexOf('addVentaItem(prod.id); _avisarAgregado(prod)') < 0 &&
    src.indexOf('addVentaMayItem(prod.id); _avisarAgregado(prod)') < 0);
  /* Solo las LLAMADAS: la definicion tambien empieza con _agregarYAvisar(prod,
     y contarla daba 3 donde tiene que haber 2. */
  t('las dos ventas pasan por _agregarYAvisar',
    (src.match(/if \(prod\) _agregarYAvisar\(prod,/g) || []).length === 2);
  t('se espera a que termine antes de mirar', /await agregar\(prod\.id\)/.test(src));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
