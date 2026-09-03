/**
 * ESCANEAR UN PRODUCTO MIENTRAS SE CARGA UNA COMPRA.
 *
 * Una compra son veinte productos seguidos. Tipear veinte nombres es justo lo
 * que la pistola viene a evitar, asi que escanear tiene que hacer lo mismo que
 * buscar el producto y hacerle click: entra a la lista y queda listo para
 * ponerle cuanto y a cuanto.
 *
 * LO QUE HAY QUE SOSTENER, Y NO ES OBVIO:
 *
 * El buscador del modal ya filtra por proveedor y esconde los que ya estan en
 * la compra. Por eso compraAgregar() no valida NADA: confia en esa lista. El
 * escaneo la saltea por completo, asi que las dos validaciones tienen que
 * estar en el camino del escaneo o no estan en ningun lado.
 *
 *   1. PROVEEDOR. Una compra es de UN proveedor. Escanear algo de otro y que
 *      entre igual significa registrar mercaderia de uno como comprada al
 *      otro, y eso despues sale mal en Proveedores sin que nadie entienda por
 *      que.
 *
 *   2. DUPLICADO. Con una pistola, apretar el gatillo dos veces pasa todo el
 *      tiempo. Dos filas del mismo producto en una compra es un error de
 *      carga que se nota tarde.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const compras = fs.readFileSync(path.join(RAIZ, 'admin-compras.js'), 'utf8');
const lector = fs.readFileSync(path.join(RAIZ, 'admin-lector.js'), 'utf8');

function cuerpo(src, n) {
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

const PRODS = [
  { id: 'a', nombre: 'Mani Con Cascara', lista: 'L1', codigoBarras: '779123', costo: 4000, tipoVenta: 'peso' },
  { id: 'b', nombre: 'Galletas De Arroz', lista: 'L1', codigoBarras: '779456', costo: 1500, tipoVenta: 'unidad' },
  { id: 'z', nombre: 'Yerba De Otro Proveedor', lista: 'L9', codigoBarras: '779999', costo: 900, tipoVenta: 'unidad' },
];

/* Se arma el escenario con el DOM falseado, anotando que paso. */
function correr(prod, { proveedor = 'L1', yaCargados = [] } = {}) {
  const avisos = [];
  const foco = [];
  const items = yaCargados.map(id => {
    const p = PRODS.find(x => x.id === id);
    return { id: p.id, nombre: p.nombre, tipoVenta: p.tipoVenta, cantidad: 0,
             costoUnitario: p.costo, costoAnterior: p.costo };
  });

  const fakes = {
    allProducts: PRODS,
    _compraItems: items,
    _compraProveedor: proveedor,
    document: {
      getElementById: (id) => {
        if (id === 'compraProveedor') return { value: proveedor };
        if (id === 'compraBuscar') return { value: '' };
        if (String(id).indexOf('cpCant') === 0) {
          return { focus: () => foco.push(id), select: () => {} };
        }
        return null;
      },
    },
    showAdminToast: (m, tipo) => avisos.push(tipo + ': ' + m),
    renderCompraItems: () => {},
    compraBuscarProd: () => {},
    _cpEsPeso: (p) => !!(p && p.tipoVenta === 'peso'),
  };
  const nombres = Object.keys(fakes);
  const fn = new Function(...nombres,
    cuerpo(compras, '_cpFocoCantidad') + cuerpo(compras, 'compraAgregar') +
    cuerpo(compras, 'compraEscanear') + ';return compraEscanear;');
  fn(...nombres.map(n => fakes[n]))(prod);
  return { items, avisos, foco };
}

/* ------------------------------------------------------- el caso que se pidio */
const mani = PRODS[0];
const r1 = correr(mani);
t('escanear agrega el producto a la compra', r1.items.length === 1 && r1.items[0].id === 'a');
t('lo agrega con cantidad en 0, para que la escriba la persona', r1.items[0].cantidad === 0);
t('y con el costo que ya tenia cargado', r1.items[0].costoUnitario === 4000);
t('un producto por peso entra como peso', r1.items[0].tipoVenta === 'peso');
t('avisa cual agrego', r1.avisos.some(a => a.indexOf('success: Agregado: Mani') === 0));
/* El paso siguiente natural: escribir cuantos gramos entraron. */
t('deja el foco en la cantidad de la fila nueva', r1.foco.join() === 'cpCant0');

const gall = PRODS[1];
const r2 = correr(gall, { yaCargados: ['a'] });
t('el segundo escaneo se suma al primero', r2.items.length === 2);
t('un producto por unidad entra como unidad', r2.items[1].tipoVenta === 'unidad');
t('y el foco va a la fila que se acaba de agregar, no a la primera',
  r2.foco.join() === 'cpCant1');

/* ------------------------------------------------------------- PROVEEDOR */
const otro = PRODS[2];
const r3 = correr(otro);
t('NO agrega un producto de otro proveedor', r3.items.length === 0);
t('y lo dice, en vez de no hacer nada',
  r3.avisos.some(a => a.indexOf('error:') === 0 && a.indexOf('no es de este proveedor') > 0));
t('no le mueve el foco a nada', r3.foco.length === 0);
/* Con el proveedor de ESE producto seleccionado, si entra. */
const r4 = correr(otro, { proveedor: 'L9' });
t('el mismo producto entra si el proveedor es el suyo', r4.items.length === 1);

/* ------------------------------------------------------------- DUPLICADO */
const r5 = correr(mani, { yaCargados: ['a'] });
t('escanear dos veces NO duplica la fila', r5.items.length === 1);
t('avisa que ya estaba', r5.avisos.some(a => a.indexOf('ya estaba en la compra') > 0));
/* Lo util cuando uno vuelve a pasar el mismo producto es poder escribir la
   cantidad, no que no pase nada. */
t('le lleva el foco a la cantidad del que ya estaba', r5.foco.join() === 'cpCant0');
const r6 = correr(gall, { yaCargados: ['a', 'b'] });
t('encuentra la fila correcta aunque no sea la primera', r6.foco.join() === 'cpCant1');

/* --------------------------------------------------------------- bordes */
t('sin producto no hace nada', correr(null).items.length === 0);

/* ------------------------------------------------- el ruteo del lector
   El despachador elige por modal abierto. La rama de la compra TIENE que
   estar antes de la generica de "hay otro modal abierto, cerralo": si
   quedara despues, nunca se ejecutaria y escanear seguiria diciendo
   "cierre esta ventana". */
const iCompra = lector.indexOf("_modalAbierto('compraModal')");
const iGenerica = lector.indexOf("document.querySelector('.modal-overlay.show')");
t('el lector contempla el modal de compra', iCompra > 0);
t('y su rama va ANTES de la generica de "cerra esta ventana"',
  iCompra > 0 && iGenerica > 0 && iCompra < iGenerica);
t('si el codigo no se conoce, ofrece asignarlo como en las ventas',
  /openAsignarCodigo\(cod, 'compra'\)/.test(lector));
t('y al terminar de asignarlo lo agrega a la compra',
  /destino === 'compra'/.test(lector));
/* Se le pasa el producto entero, no el id: compraEscanear necesita su `lista`
   para poder comprobar el proveedor. */
t('a compraEscanear se le pasa el producto, no el id',
  /destino === 'compra'\)[\s\S]{0,80}compraEscanear\(p\)/.test(lector));

/* Que compraAgregar siga SIN validar es a proposito: la lista del buscador ya
   filtra. Si alguien le suma validaciones ahi, esta prueba no se entera, pero
   si alguien saca las del escaneo, las de arriba se ponen en rojo. */
t('el lector no llama a compraAgregar por su cuenta',
  lector.indexOf('compraAgregar(') < 0);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
