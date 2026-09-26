/* =============================================================================
   CLIENTES DEL LOCAL EN LA VENTA  —  Brotes Dietética
   =============================================================================
   Pedido del comercio (26/09/2026): "que te deje agregar un cliente sin que el cliente
   tenga que iniciar sesión en la página, para captar más clientela".

   CÓMO ERA: hay dos listas de clientes que no se conocen.
   - Clientes del local (colección `clientes`): los carga el panel, sin login. Ya se
     podían crear en Clientes -> "Nuevo Cliente".
   - Clientes de la web (colección `clientesAuth`): se crean solos cuando alguien entra
     con Google a la tienda.
   El buscador de cliente de la VENTA (minorista y mayorista) mostraba SOLO los de la web:
   el que se cargaba en el local no se podía elegir al venderle, y no había forma de
   crear uno desde la venta. En la práctica, para tener un cliente había que pedirle
   que entrara a la página.

   AHORA: los buscadores de la venta muestran los dos, cada uno con su etiqueta (Local o
   Web), y arriba de todo "Agregar cliente nuevo" con lo que se escribió, que abre la
   ficha del cliente y al guardar lo deja elegido. El del pedido del panel sigue con los
   del local (el pedido guarda el cliente de esa colección), y también con "Agregar
   cliente nuevo".

   LECTURAS: los clientes del local se leen UNA vez, livianos (solo la colección, sin las
   ventas de 12 meses que suma la sección Clientes).
   ============================================================================= */

const CLIENTES_EN_LISTA = 50;   /* los que se dibujan; escribiendo se achica */
let _cliLocalLeidos = false;
let _cliLocalLeyendo = null;

const _cliEsc = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s));
/* Sin acentos ni mayúsculas: "jose" encuentra a "José". */
const _cliClave = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const _cliDigitos = s => String(s == null ? '' : s).replace(/\D/g, '');

/* Los clientes del local, livianos y una sola vez. Si la sección Clientes ya los cargó
   (con sus números), se usan esos. `alTerminar` corre cuando llegan. */
function cargarClientesDelLocal(alTerminar) {
  if (_cliLocalLeidos || (typeof allClientes !== 'undefined' && allClientes.length)) { _cliLocalLeidos = true; return null; }
  if (_cliLocalLeyendo) return _cliLocalLeyendo;
  _cliLocalLeyendo = db.collection('clientes').orderBy('nombre').get()
    .then(snap => {
      /* Si mientras tanto la sección Clientes los cargó completos, no se pisan. */
      if (!allClientes.length) allClientes = snap.docs.map(d => Object.assign({ id: d.id, ventasCount: 0, ventasTotal: 0 }, d.data()));
      _cliLocalLeidos = true;
      if (typeof alTerminar === 'function') alTerminar();
    })
    .catch(e => console.warn('clientes del local:', e))
    .then(() => { _cliLocalLeyendo = null; });
  return _cliLocalLeyendo;
}

/* Los clientes para elegir, del local y de la web, filtrados por lo escrito (nombre,
   teléfono, mail o DNI) y en orden alfabético. `o.soloLocal`: sin los de la web. */
function clientesParaElegir(q, o) {
  const op = o || {};
  const out = [];
  ((typeof allClientes !== 'undefined' && allClientes) || []).forEach(cl => {
    if (!cl || !cl.nombre) return;
    out.push({ id: cl.id, nombre: cl.nombre, tipo: 'local', sub: cl.telefono || cl.email || '',
      buscar: [cl.nombre, cl.telefono, cl.email, cl.identificacion] });
  });
  if (!op.soloLocal) {
    ((typeof clientesAuthData !== 'undefined' && clientesAuthData) || []).forEach(cl => {
      const n = ((cl.nombre || '') + ' ' + (cl.apellido || '')).trim();
      if (!n) return;
      out.push({ id: 'auth:' + cl.uid, nombre: n, tipo: 'web', sub: cl.email || cl.telefono || '', clienteId: cl.clienteId || null,
        buscar: [n, cl.telefono, cl.email] });
    });
  }
  const clave = _cliClave(q);
  const dig = _cliDigitos(q);
  const filtrados = (!clave || clave === 'consumidor final') ? out : out.filter(cl =>
    cl.buscar.some(b => _cliClave(b).indexOf(clave) >= 0) ||
    (dig.length >= 3 && cl.buscar.some(b => _cliDigitos(b).indexOf(dig) >= 0)));
  return filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}

/* La lista desplegable: "Agregar cliente nuevo" arriba de todo (con lo escrito) y
   después los clientes, cada uno con su etiqueta. `alElegir(cliente)` al tocar uno;
   `desde` ('venta' | 'ventaMay' | 'pedido') para volver a esa pantalla con el nuevo. */
function pintarListaClientes(list, items, escrito, alElegir, desde) {
  const nombre = String(escrito || '').trim();
  const conNombre = !!nombre && _cliClave(nombre) !== 'consumidor final';
  list.innerHTML = '';
  const nuevo = document.createElement('div');
  nuevo.className = 'cliente-select-item cli-nuevo';
  nuevo.innerHTML = '<span><i class="bi bi-person-plus"></i> Agregar cliente nuevo' +
    (conNombre ? ': <b>' + _cliEsc(nombre) + '</b>' : '') + '</span>' +
    '<small>Queda guardado en Clientes, sin que tenga que entrar a la página</small>';
  nuevo.addEventListener('mousedown', () => {
    if (typeof openNuevoClienteDesde === 'function') openNuevoClienteDesde(desde, conNombre ? nombre : '');
  });
  list.appendChild(nuevo);
  items.slice(0, CLIENTES_EN_LISTA).forEach(cl => {
    const d = document.createElement('div');
    d.className = 'cliente-select-item';
    d.innerHTML = '<span>' + (cl.clienteId ? '<span class="cli-num">#' + _cliEsc(cl.clienteId) + '</span> ' : '') + _cliEsc(cl.nombre) + '</span>' +
      '<small><span class="cli-origen ' + cl.tipo + '">' +
        (cl.tipo === 'web' ? '<i class="bi bi-globe2"></i> Web' : '<i class="bi bi-shop"></i> Local') + '</span>' +
        (cl.sub ? ' ' + _cliEsc(cl.sub) : '') + '</small>';
    d.addEventListener('mousedown', () => alElegir(cl));
    list.appendChild(d);
  });
  if (items.length > CLIENTES_EN_LISTA) {
    const mas = document.createElement('div');
    mas.className = 'cli-vacio';
    mas.textContent = 'Hay ' + (items.length - CLIENTES_EN_LISTA) + ' más: escribí para encontrarlos.';
    list.appendChild(mas);
  } else if (!items.length && conNombre) {
    const v = document.createElement('div');
    v.className = 'cli-vacio';
    v.textContent = 'Ningún cliente se llama así.';
    list.appendChild(v);
  }
}

/* Antes de crear uno: ¿ya hay un cliente del local con ese teléfono o ese DNI? En el
   mostrador es fácil cargar dos veces al mismo. Devuelve el que coincide, o null. */
function clienteRepetido(data) {
  const tel = _cliDigitos(data && data.telefono);
  const dni = _cliDigitos(data && data.identificacion);
  return ((typeof allClientes !== 'undefined' && allClientes) || []).find(cl => cl &&
    ((tel.length >= 6 && _cliDigitos(cl.telefono) === tel) || (dni.length >= 6 && _cliDigitos(cl.identificacion) === dni))) || null;
}

if (typeof window !== 'undefined') {
  window.cargarClientesDelLocal = cargarClientesDelLocal;
  window.clientesParaElegir = clientesParaElegir;
  window.pintarListaClientes = pintarListaClientes;
  window.clienteRepetido = clienteRepetido;
}
