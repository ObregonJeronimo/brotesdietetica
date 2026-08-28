/**
 * EL BOTON DE CORREGIR LA NUMERACION NO PUEDE REPETIR NUMEROS.
 *
 * Los numeros de pedido, de venta y de cliente salen de tres contadores en /config que
 * nunca bajan solos. Eso es a proposito: bajar uno repite numeros que ya existen. Pero
 * despues de cada prueba que se borra quedan adelantados, y el primer pedido de verdad
 * sale con el numero equivocado.
 *
 * Y hay un estado peor, que YA PASO en este proyecto: un contador POR DEBAJO de lo que
 * hay. Se puso `clientesAuthCount` en 0 creyendo que la coleccion estaba vacia -lo decia
 * PENDIENTE.md- cuando tenia 4 documentos con clienteId 1, 4, 5 y 6. Los proximos
 * clientes habrian sacado 2, 3 y despues **4, que ya existia**. En silencio.
 *
 * Por eso el boton NO pone 0: cuenta los documentos y deja cada contador en el numero
 * mas alto que existe DE VERDAD. Baja si estaba adelantado, SUBE si estaba atrasado, y
 * no toca nada si no puede averiguar el maximo.
 *
 * Se ejecutan las funciones reales de admin.html contra una base de mentira que ademas
 * cuenta las lecturas: traer la coleccion entera para mirar un numero se paga, y con
 * tres años de ventas seria una lectura por venta.
 */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');

function cuerpo(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre);
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1);
}
function objeto(nombre) {
  const i = src.indexOf('const ' + nombre + '=[');
  if (i < 0) throw new Error('no encontre el objeto ' + nombre);
  const fin = src.indexOf('];', i);
  return src.slice(i, fin + 2);
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

function armar({ pedidos = [], ventas = [], clientes = [], contadores = {}, confirma = true }) {
  const reg = { lecturas: [], escrituras: [], toasts: [], logs: [], confirmaciones: [] };
  const cols = { pedidos, ventas, clientesAuth: clientes };
  const DOM = {};

  function coleccion(col) {
    const traer = (campo, n) => async () => {
      reg.lecturas.push(col + (campo ? ':orderBy(' + campo + ')' : ':limit'));
      let ds = (cols[col] || []).slice();
      if (campo) {
        /* Firestore SALTEA los documentos que no tienen el campo del orderBy. */
        ds = ds.filter(d => d[campo] !== undefined).sort((a, b) => b[campo] - a[campo]);
      }
      const docs = ds.slice(0, n).map(d => ({ data: () => d }));
      return { empty: docs.length === 0, docs: docs };
    };
    return {
      doc: id => ({
        get: async () => {
          reg.lecturas.push('config/' + id);
          const v = contadores[id];
          return { exists: v !== undefined, data: () => ({ count: v }) };
        },
        set: async o => { reg.escrituras.push({ doc: id, count: o.count, tipo: typeof o.count }); },
      }),
      limit: n => ({ get: traer(null, n) }),
      orderBy: (campo) => ({ limit: n => ({ get: traer(campo, n) }) }),
    };
  }

  const ent = {
    db: { collection: coleccion },
    document: { getElementById: id => (DOM[id] = DOM[id] || { textContent: '', innerHTML: '', disabled: false }) },
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    showAdminToast: m => reg.toasts.push(m),
    logAction: (a, b, c) => reg.logs.push(c),
    pedirConfirmacion: async (msg) => { reg.confirmaciones.push(msg); return confirma; },
  };
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    objeto('CONTADORES') + '\n' +
    ['_estadoContador', '_lineaContador', 'verContadores', 'reiniciarContadores'].map(cuerpo).join('\n') +
    '\nreturn {ver:verContadores,corregir:reiniciarContadores};'
  )(...nombres.map(n => ent[n]));
  return { api, reg, DOM };
}

const escrito = (reg, doc) => (reg.escrituras.find(e => e.doc === doc) || {});

(async () => {
  console.log('\nTODO VACIO: los tres arrancan de cero');
  let a = armar({ contadores: { pedidosCount: 7, ventasCount: 3, clientesAuthCount: 6 } });
  await a.api.corregir();
  t('pedidosCount va a 0', escrito(a.reg, 'pedidosCount').count === 0, JSON.stringify(a.reg.escrituras));
  t('ventasCount va a 0', escrito(a.reg, 'ventasCount').count === 0);
  t('clientesAuthCount va a 0', escrito(a.reg, 'clientesAuthCount').count === 0);
  t('se escriben como NUMERO, no como texto',
    a.reg.escrituras.every(e => e.tipo === 'number'), JSON.stringify(a.reg.escrituras.map(e => e.tipo)));
  t('   (un count de texto deja a TODOS los clientes sin poder comprar)',
    !a.reg.escrituras.some(e => e.tipo === 'string'));

  console.log('\nADELANTADO: baja hasta el mas alto que existe, no hasta 0');
  a = armar({ pedidos: [{ numero: 1 }, { numero: 2 }, { numero: 3 }],
              contadores: { pedidosCount: 9, ventasCount: 0, clientesAuthCount: 0 } });
  await a.api.corregir();
  t('con pedidos 1..3 y contador 9, queda en 3', escrito(a.reg, 'pedidosCount').count === 3,
    JSON.stringify(a.reg.escrituras));
  t('   (el proximo pedido va a ser el 4, no el 10)', escrito(a.reg, 'pedidosCount').count + 1 === 4);
  t('no toca los que ya estaban bien', a.reg.escrituras.length === 1, JSON.stringify(a.reg.escrituras));

  console.log('\nATRASADO: el caso grave, el que ya paso de verdad');
  /* Exactamente lo que quedo en produccion: contador en 1 con clienteId 1, 4, 5 y 6. */
  a = armar({ clientes: [{ clienteId: 1 }, { clienteId: 4 }, { clienteId: 5 }, { clienteId: 6 }],
              contadores: { pedidosCount: 0, ventasCount: 0, clientesAuthCount: 1 } });
  /* contador 1 -> el proximo seria el n° 2, y tiene que ser el n° 7 */
  await a.api.corregir();
  t('SUBE el contador a 6', escrito(a.reg, 'clientesAuthCount').count === 6,
    JSON.stringify(a.reg.escrituras));
  t('   (si no, los proximos sacarian 2, 3 y despues 4, que ya existe)',
    escrito(a.reg, 'clientesAuthCount').count > 1);
  t('la confirmacion dice de que numero a que numero pasa',
    /Cliente: el próximo pasa de n° 2 a n° 7/.test(a.reg.confirmaciones.join(' ')),
    a.reg.confirmaciones.join(' ').slice(0, 160));

  console.log('\nYA ESTA BIEN: no escribe nada');
  a = armar({ pedidos: [{ numero: 1 }, { numero: 2 }], ventas: [{ numero: 5 }],
              clientes: [{ clienteId: 3 }],
              contadores: { pedidosCount: 2, ventasCount: 5, clientesAuthCount: 3 } });
  await a.api.corregir();
  t('no escribe', a.reg.escrituras.length === 0, JSON.stringify(a.reg.escrituras));
  t('y lo dice', /ya estan en su numero/i.test(a.reg.toasts.join(' ')), a.reg.toasts.join(' | '));
  t('ni siquiera pide confirmacion', a.reg.confirmaciones.length === 0);

  console.log('\nSI NO SE PUEDE SABER EL MAXIMO, NO SE TOCA');
  /* Documentos sin el campo del numero: el orderBy los saltea y vuelve vacio. Si eso se
     leyera como "no hay nada", el contador iria a 0 y repetiria todo. */
  a = armar({ pedidos: [{ cliente: 'Ana' }, { cliente: 'Juan' }],
              contadores: { pedidosCount: 12, ventasCount: 0, clientesAuthCount: 0 } });
  await a.api.corregir();
  t('NO pone pedidosCount en 0', escrito(a.reg, 'pedidosCount').count === undefined,
    JSON.stringify(a.reg.escrituras));
  t('avisa que no pudo', /no se pudo averiguar/i.test(a.reg.toasts.join(' ')), a.reg.toasts.join(' | '));

  console.log('\nSI SE CANCELA, NO ESCRIBE');
  a = armar({ pedidos: [{ numero: 2 }], contadores: { pedidosCount: 9, ventasCount: 0, clientesAuthCount: 0 },
              confirma: false });
  await a.api.corregir();
  t('pidio confirmacion', a.reg.confirmaciones.length === 1);
  t('y al decir que no, no escribe nada', a.reg.escrituras.length === 0, JSON.stringify(a.reg.escrituras));

  console.log('\nEL COSTO EN LECTURAS');
  a = armar({ pedidos: Array.from({ length: 500 }, (_, i) => ({ numero: i + 1 })),
              ventas: Array.from({ length: 300 }, (_, i) => ({ numero: i + 1 })),
              clientes: Array.from({ length: 80 }, (_, i) => ({ clienteId: i + 1 })),
              contadores: { pedidosCount: 500, ventasCount: 300, clientesAuthCount: 80 } });
  await a.api.ver();
  t('con 880 documentos hace 9 lecturas, no 880',
    a.reg.lecturas.length === 9, a.reg.lecturas.length + ': ' + a.reg.lecturas.join(', '));
  t('   (3 por coleccion: el contador, si hay algo, y cual es el mayor)',
    a.reg.lecturas.filter(l => /^pedidos/.test(l)).length === 2);

  console.log('\nQUEDA EN EL HISTORIAL');
  a = armar({ pedidos: [{ numero: 2 }], contadores: { pedidosCount: 9, ventasCount: 0, clientesAuthCount: 0 } });
  await a.api.corregir();
  t('anota que contador cambio y de cuanto a cuanto',
    /pedidosCount: 9 -> 2/.test(a.reg.logs.join(' ')), a.reg.logs.join(' | '));

  /* La tarjeta dice UNA cosa: que numero sale la proxima vez. El detalle aparece solo
     cuando no coincide, que es cuando hay algo que hacer. */
  console.log('\nLO QUE MUESTRA EN PANTALLA');
  a = armar({ pedidos: [{ numero: 3 }], ventas: [{ numero: 8 }], clientes: [{ clienteId: 2 }],
              contadores: { pedidosCount: 9, ventasCount: 8, clientesAuthCount: 2 } });
  await a.api.ver();
  const txt = a.DOM.contadoresEstado.innerHTML;
  const plano = txt.replace(/<[^>]*>/g, ' | ').replace(/\s+/g, ' ');
  t('lo que esta bien es una sola linea corta', /Venta n° 9/.test(txt) && !/Venta[^|]*deber[ií]a/.test(plano),
    plano.slice(0, 220));
  t('   y no se resalta', !/color:#e6a23c[^<]*>[^<]*Venta/.test(txt));
  t('lo que esta mal dice el numero que deberia salir', /Pedido n° 10\s+→\s+deber[ií]a ser 4/.test(txt),
    plano.slice(0, 220));
  t('   y ese si se resalta en ambar', /color:#e6a23c/.test(txt));
  t('no aparece ninguna explicacion larga en la tarjeta',
    !/contador|mas alto real|al dia/.test(plano), plano.slice(0, 220));

  console.log('\nEL CASO GRAVE SI SE EXPLICA, porque no se entiende solo');
  a = armar({ clientes: [{ clienteId: 6 }], contadores: { pedidosCount: 0, ventasCount: 0, clientesAuthCount: 1 } });
  await a.api.ver();
  t('avisa que repetiria numeros', /repetir[ií]a n[uú]meros/.test(a.DOM.contadoresEstado.innerHTML),
    a.DOM.contadoresEstado.innerHTML.replace(/<[^>]*>/g, ' ').slice(0, 200));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
