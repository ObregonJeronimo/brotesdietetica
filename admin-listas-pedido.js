/* =============================================================================
   LISTAS DE PEDIDOS  —  Brotes Dietética
   =============================================================================
   Pedido de Thiago (08/10/2026): en un proveedor, el botón "Lista de pedidos" para armar
   listas con nombre (productos de ESE proveedor y cuánto pedir de cada uno), guardarlas, y
   abajo de cada una "Copiar mensaje" y "Mandar mensaje". Mandar pide primero el WhatsApp y el
   nombre de la persona, que quedan guardados en la lista ("El mensaje se enviará a: …"), y
   abre WhatsApp Web o la app de escritorio con el mensaje ya escrito.

   POR PROVEEDOR (Thiago, después de verlo): el botón está en la ficha del proveedor, no arriba
   de todo; la ventana dice "Lista de pedidos para el proveedor FRUTICOR", muestra solo sus
   listas y el buscador solo sus productos (los que en el catálogo son de esa lista).

   CUÁNTO SE PIDE, con las mismas reglas que Cargar compra (_cpGramosBolsa, admin-compras.js):
   - la bolsa de un producto con varias bolsas ("Mani RC x 1 kg"): en bolsas;
   - uno por peso con una sola bolsa conocida (la anotada aparte, bolsaGramos, o la del
     nombre, "Lenteja x 5 kg"): en bolsas, y el mensaje dice de cuánto si el nombre no lo
     dice ("Almendra: 2 bolsas de 5 kg");
   - uno por peso sin bolsa conocida: en kilos, con coma ("2,5 kg");
   - uno por unidad, con presentaciones o no ("Alfajor x6"): en unidades.
   La cantidad arranca vacía y puede quedar vacía: al guardar se avisa, y en el mensaje ese
   producto va sin cantidad (Thiago, 08/10).

   DÓNDE SE GUARDA: la colección `listasPedido`, solo para admins (firestore.rules), una por
   lista: { proveedorId, nombre, items: [{ id, nombre, tipo, gramos, cantidad|null }],
   contacto: { nombre, whatsapp, escrito } | null, creadaEn, actualizadaEn }. El nombre de cada
   producto queda guardado por si después se borra del catálogo; si sigue, va el de ahora.
   ============================================================================= */

let _lpListas = [];
let _lpProveedor = null;    /* { id, nombre } del proveedor de la ventana abierta */
let _lpEdit = null;         /* la lista que se arma o se edita: { id, nombre, items, contacto } */
let _lpEditInicial = '';    /* cómo estaba al abrirla, para avisar si se sale sin guardar */

const _lpEsc = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s));
const _lpAttr = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
const _lpProds = () => (typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : []);
const _lpProd = id => _lpProds().find(p => p && p.id === id) || null;
const _lpNum = (n, dec) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: dec == null ? 3 : dec });
const _lpMs = f => (f && typeof f.toMillis === 'function') ? f.toMillis() : (f ? (new Date(f).getTime() || 0) : 0);
const _lpHay = it => Number(it && it.cantidad) > 0;

/* El tamaño de una bolsa para leer: "5 kg", "2,5 kg", "500 g". */
function _lpTam(g) { return g >= 1000 ? _lpNum(g / 1000) + ' kg' : _lpNum(g, 0) + ' g'; }

/* Los gramos de la bolsa que se le pide al proveedor, como en Cargar compra; null si no se sabe. */
function _lpGramosBolsa(p) {
  if (typeof _cpGramosBolsa === 'function') return _cpGramosBolsa(p);
  if (!p || p.tipoVenta !== 'peso' || p.depurado === true) return null;
  const g = typeof gramosDeBolsa === 'function' ? gramosDeBolsa(p) : null;
  if (g) return g;
  if (Number(p.bolsaGramos) > 0) return Math.round(Number(p.bolsaGramos));
  return typeof bolsaDelNombre === 'function' ? bolsaDelNombre(p.nombre) : null;
}

/* Cómo se pide un producto: por bolsa (con sus gramos), por kilo o por unidad. */
function lpComoSePide(p) {
  if (p && p.tipoVenta === 'peso') {
    const g = _lpGramosBolsa(p);
    return g > 0 ? { tipo: 'bolsa', gramos: g } : { tipo: 'kilo' };
  }
  return { tipo: 'unidad' };
}

/* El nombre, como en Cargar compra: con su tamaño si el producto tiene otros ("Mani RC x 1 kg"). */
function _lpNombreDe(p) {
  if (typeof _cpNombre === 'function') return _cpNombre(p);
  const n = (p && (p.nombreMostrado || p.nombre)) || '';
  return typeof _nombreConPresentacion === 'function' ? _nombreConPresentacion(p, n) : n;
}
function lpNombreItem(it) {
  const p = _lpProd(it && it.id);
  return p ? _lpNombreDe(p) : String((it && it.nombre) || '');
}

/* " de 5 kg", si el nombre no dice ya de cuánto es la bolsa. */
function _lpDeBolsa(nombre, g) {
  if (!(g > 0)) return '';
  const c = typeof contenidoDeVariante === 'function' ? contenidoDeVariante({ nombre: nombre }) : null;
  return c && c.unidad === 'g' && c.valor === g ? '' : ' de ' + _lpTam(g);
}

/* En qué se pide, para leer al lado del campo y en el aviso: "bolsas de 5 kg", "kilos". */
function lpUnidadTxt(it) {
  if (it.tipo === 'kilo') return 'kilos';
  if (it.tipo === 'bolsa') return 'bolsas' + _lpDeBolsa(lpNombreItem(it), Number(it.gramos));
  return 'unidades';
}

/* Cuánto se pide, para leer: "3 bolsas", "2 bolsas de 5 kg", "2,5 kg", "1 unidad". Vacío si no
   tiene cantidad. */
function lpCantidadTxt(it) {
  if (!_lpHay(it)) return '';
  const n = Number(it.cantidad);
  if (it.tipo === 'kilo') return _lpNum(n) + ' kg';
  if (it.tipo === 'bolsa') return _lpNum(n) + (n === 1 ? ' bolsa' : ' bolsas') + _lpDeBolsa(lpNombreItem(it), Number(it.gramos));
  return _lpNum(n) + (n === 1 ? ' unidad' : ' unidades');
}

/* El mensaje: el saludo (con el nombre de la persona, si está guardado), un renglón por
   producto y "Gracias!". El que no tiene cantidad va solo con el nombre. */
function lpMensaje(lista) {
  const c = lista && lista.contacto;
  const renglones = ((lista && lista.items) || [])
    .map(i => '- ' + lpNombreItem(i) + (_lpHay(i) ? ': ' + lpCantidadTxt(i) : ''));
  return 'Hola' + (c && c.nombre ? ' ' + c.nombre : '') + '! Te paso el pedido:\n\n' + renglones.join('\n') + '\n\nGracias!';
}

/* Lo escrito en una cantidad: los kilos con coma o con punto ("2,5"); bolsas y unidades,
   enteras. null si está vacío; 0 si lo escrito no sirve. */
function lpLeerCantidad(s, tipo) {
  const t = String(s == null ? '' : s).trim().replace(',', '.');
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return 0;
  const n = Number(t);
  if (tipo === 'kilo') return Math.round(n * 1000) / 1000;
  return Math.floor(n) === n ? n : 0;
}

/* El número para WhatsApp, con el código de Argentina: 549, la característica y el número,
   sin el 0 ni el 15 ("0351 15 555-1234" -> 5493515551234). Uno de otro país, escrito con +
   o 00 adelante, queda como está (el campo del número ya no deja escribirlo: le llega
   acomodado por lpFormatoWhatsapp). null si no parece un celular. */
function lpNormalizarWhatsapp(s) {
  const txt = String(s == null ? '' : s).trim();
  let d = txt.replace(/\D/g, '');
  if (!d) return null;
  const internacional = /^(\+|00)/.test(txt);
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (internacional && d.indexOf('54') !== 0) return d.length >= 8 && d.length <= 15 ? d : null;
  if (d.indexOf('54') === 0 && d.length >= 12) { d = d.slice(2); if (d.charAt(0) === '9') d = d.slice(1); }
  if (d.charAt(0) === '0') d = d.slice(1);
  /* El 15 va después de la característica, que tiene de 2 a 4 números: con él son 12. */
  if (d.length === 12) {
    for (const k of [2, 3, 4]) { if (d.substr(k, 2) === '15') { d = d.slice(0, k) + d.slice(k + 2); break; } }
  }
  return d.length === 10 ? '549' + d : null;
}

/* EL NÚMERO SE ESCRIBE SOLO CON NÚMEROS (Thiago, 08/10): sin letras ni espacios, y se acomoda
   mientras se escribe: la característica separada del resto, "351 999 9999" (en Buenos Aires,
   "11 2345 6789"). Diez números, sin el 0 ni el 15. Pegado con +54 9 o con el 0, se lo saca. */
function lpFormatoWhatsapp(s) {
  let d = String(s == null ? '' : s).replace(/\D/g, '');
  if (d.length > 10 && d.indexOf('549') === 0) d = d.slice(3);
  else if (d.length > 10 && d.indexOf('54') === 0) d = d.slice(2);
  d = d.replace(/^0+/, '');
  /* Con más de 10, el 15 de después de la característica (351 o 11) se saca: escrito a mano
     ("351 15 555...") o pegado. */
  const k = d.indexOf('11') === 0 ? 2 : 3;
  if (d.length > 10 && d.substr(k, 2) === '15') d = d.slice(0, k) + d.slice(k + 2);
  d = d.slice(0, 10);
  const corte = d.indexOf('11') === 0 ? [2, 6] : [3, 6];
  return [d.slice(0, corte[0]), d.slice(corte[0], corte[1]), d.slice(corte[1])].filter(Boolean).join(' ');
}
/* En el campo del número: solo números y las teclas para moverse o borrar. El teclado del
   celular no dice qué tecla es ("Unidentified"): ahí se deja pasar y lo limpia lpFormatearNumero. */
function lpTeclaNumero(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.keyCode === 229 || e.key === 'Unidentified' || e.key === 'Process') return true;
  if (/^\d$/.test(e.key) || ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', 'Escape'].indexOf(e.key) >= 0) return true;
  if (e.preventDefault) e.preventDefault();
  return false;
}
function lpFormatearNumero(el) {
  if (!el) return;
  const f = lpFormatoWhatsapp(el.value);
  if (el.value === f) return;
  /* El cursor queda después de los mismos números que antes: así se puede corregir uno del
     medio sin que salte al final. */
  const cursor = typeof el.selectionStart === 'number' ? el.value.slice(0, el.selectionStart).replace(/\D/g, '').length : -1;
  el.value = f;
  if (cursor < 0 || typeof el.setSelectionRange !== 'function') return;
  let i = 0;
  for (let n = 0; i < f.length && n < cursor; i++) if (/\d/.test(f[i])) n++;
  el.setSelectionRange(i, i);
}

/* El enlace que abre el chat con el mensaje escrito: WhatsApp Web o la app de escritorio. */
function lpLinkWhatsapp(numero, texto, modo) {
  const t = encodeURIComponent(texto);
  return modo === 'app'
    ? 'whatsapp://send?phone=' + numero + '&text=' + t
    : 'https://web.whatsapp.com/send?phone=' + numero + '&text=' + t;
}

/* Lo que no deja guardar la lista, o '' si se puede. Una cantidad vacía sí se puede (se
   avisa aparte); una escrita que no sirve ("abc", o 2,5 bolsas), no. */
function lpValidar(l) {
  if (!String((l && l.nombre) || '').trim()) return 'Ponele un nombre a la lista.';
  const items = (l && l.items) || [];
  if (!items.length) return 'Agregá al menos un producto.';
  const mal = items.find(i => i.cantidad === 0 || (i._txt != null && String(i._txt).trim() !== '' && !_lpHay(i)));
  if (mal) return 'Revisá la cantidad de ' + lpNombreItem(mal) + (mal.tipo === 'kilo' ? ': en kilos, por ejemplo 2,5.' : ': un número entero, por ejemplo 2.');
  return '';
}

/* Los que van sin cantidad. */
function lpSinCantidad(l) { return ((l && l.items) || []).filter(i => !_lpHay(i)); }

/* El aviso antes de guardar con productos sin cantidad (Thiago, 08/10). */
function lpAvisoSinCantidad(sin) {
  if (sin.length === 1) {
    return lpNombreItem(sin[0]) + ' no tiene cantidad (se pide en ' + lpUnidadTxt(sin[0]) + ').\n\n' +
      'Si guardás así, en el mensaje va a ir sin cantidad: el proveedor va a ver solo el nombre.\n\n¿Guardar igual?';
  }
  return 'Estos productos no tienen cantidad:\n' + sin.map(i => '- ' + lpNombreItem(i) + ' (se pide en ' + lpUnidadTxt(i) + ')').join('\n') +
    '\n\nSi guardás así, en el mensaje van a ir sin cantidad: el proveedor va a ver solo el nombre.\n\n¿Guardar igual?';
}

/* Lo que se guarda de la lista (sin el contacto, que se guarda aparte). */
function lpDatosParaGuardar(l) {
  return {
    nombre: String(l.nombre || '').trim(),
    items: (l.items || []).map(i => ({
      id: i.id, nombre: lpNombreItem(i), tipo: i.tipo,
      gramos: i.tipo === 'bolsa' ? Number(i.gramos) || null : null,
      cantidad: _lpHay(i) ? Number(i.cantidad) : null,
    })),
    actualizadaEn: firebase.firestore.FieldValue.serverTimestamp(),
  };
}

/* ============================ PANTALLA ============================ */

/* Una ventana del panel (las tres están vacías al final de admin.html; si no están, se crean). */
function _lpOverlay(id, z) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = id;
    document.body.appendChild(m);
  }
  if (z) m.style.zIndex = String(z);
  return m;
}

async function _lpCargar() {
  const snap = await db.collection('listasPedido').where('proveedorId', '==', _lpProveedor.id).get();
  _lpListas = snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
    .sort((a, b) => _lpMs(b.actualizadaEn) - _lpMs(a.actualizadaEn));
}

const _lpTituloLista = () => 'Lista de pedidos para el proveedor ' + _lpEsc(_lpProveedor ? _lpProveedor.nombre : '');

/* El botón "Lista de pedidos" de la ficha de un proveedor. */
async function abrirListasPedido(proveedorId) {
  const prov = ((typeof listasData !== 'undefined' && listasData) || []).find(l => l && l.id === proveedorId);
  if (!prov) { if (typeof showAdminToast === 'function') showAdminToast('Elegí un proveedor primero.', 'error'); return; }
  _lpProveedor = { id: prov.id, nombre: prov.nombre || '' };
  _lpEdit = null;
  const m = _lpOverlay('listasPedidoModal');
  m.innerHTML = '<div class="modal-box lp-box">' +
    '<div class="modal-header"><h3 id="lpTitulo"></h3><button class="modal-close" onclick="cerrarListasPedido()">&times;</button></div>' +
    '<div id="lpCuerpo"><p class="lp-nota">Cargando...</p></div></div>';
  m.classList.add('show');
  document.getElementById('lpTitulo').innerHTML = '<i class="bi bi-clipboard-check"></i> ' + _lpTituloLista();
  try {
    await _lpCargar();
    _lpRenderListas();
  } catch (e) {
    document.getElementById('lpCuerpo').innerHTML = '<p class="lp-nota">No se pudieron leer las listas: ' + _lpEsc(e.message) + '</p>';
  }
}

async function cerrarListasPedido() {
  if (_lpEdit && _lpCambio() && typeof pedirConfirmacion === 'function' &&
      !(await pedirConfirmacion('Los cambios de esta lista no se guardaron. ¿Salir igual?', { titulo: 'Salir sin guardar', aceptar: 'Salir sin guardar', focoEnNo: true }))) return;
  _lpEdit = null;
  const m = document.getElementById('listasPedidoModal');
  if (m) m.classList.remove('show');
}

/* Lo que importa de la lista para saber si cambió (no lo escrito a medias en un campo). */
const _lpFoto = l => JSON.stringify({ n: l.nombre, i: (l.items || []).map(i => [i.id, i.tipo, i.gramos || null, _lpHay(i) ? Number(i.cantidad) : null]) });
const _lpCambio = () => !!_lpEdit && _lpFoto(_lpEdit) !== _lpEditInicial;

function _lpRenderListas() {
  _lpEdit = null;
  const tit = document.getElementById('lpTitulo');
  if (tit) tit.innerHTML = '<i class="bi bi-clipboard-check"></i> ' + _lpTituloLista();
  const cuerpo = document.getElementById('lpCuerpo');
  if (!cuerpo) return;
  const barra = '<div class="lp-barra"><p class="lp-ayuda">Armá la lista de lo que le querés pedir a ' + _lpEsc(_lpProveedor.nombre) +
    ', guardala y mandásela por WhatsApp.</p>' +
    '<button class="btn btn-primary" style="width:auto" onclick="lpNuevaLista()"><i class="bi bi-plus-lg"></i> Nueva lista</button></div>';
  cuerpo.innerHTML = barra + (_lpListas.length
    ? _lpListas.map(_lpTarjeta).join('')
    : '<div class="lp-vacio">Todavía no hay listas para este proveedor. Tocá "Nueva lista" para armar la primera.</div>');
}

function _lpFecha(f) {
  const ms = _lpMs(f);
  if (!ms) return '';
  const d = new Date(ms);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

/* Una lista guardada: lo que tiene, y abajo "Copiar mensaje", "Mandar mensaje" y, si ya está
   guardado, a quién se le manda. */
function _lpTarjeta(l) {
  const id = _lpAttr(l.id);
  const items = l.items || [];
  const c = l.contacto;
  const fecha = _lpFecha(l.actualizadaEn);
  const hay = items.length ? '' : ' disabled';
  return '<div class="lp-lista">' +
    '<div class="lp-lista-cab"><div><strong>' + _lpEsc(l.nombre) + '</strong>' +
      '<small>' + items.length + (items.length === 1 ? ' producto' : ' productos') + (fecha ? ' · actualizada el ' + fecha : '') + '</small></div>' +
      '<div class="lp-lista-acc">' +
        '<button class="btn btn-sm btn-secondary" onclick="lpEditarLista(\'' + id + '\')">Editar</button>' +
        '<button class="btn btn-sm btn-secondary" style="color:var(--danger)" onclick="lpEliminarLista(\'' + id + '\')">Eliminar</button>' +
      '</div></div>' +
    '<ul class="lp-renglones">' + items.map(i =>
      '<li><span>' + _lpEsc(lpNombreItem(i)) + '</span>' +
        (_lpHay(i) ? '<b>' + _lpEsc(lpCantidadTxt(i)) + '</b>' : '<em class="lp-sin">sin cantidad</em>') + '</li>').join('') + '</ul>' +
    '<div class="lp-lista-pie">' +
      '<button class="btn btn-sm btn-secondary" onclick="lpCopiarMensaje(\'' + id + '\')"' + hay + '><i class="bi bi-clipboard"></i> Copiar mensaje</button>' +
      '<button class="btn btn-sm btn-primary" onclick="lpMandarMensaje(\'' + id + '\')"' + hay + '><i class="bi bi-whatsapp"></i> Mandar mensaje</button>' +
      (c && c.whatsapp
        ? '<span class="lp-destino">El mensaje se enviará a: <b>' + _lpEsc(c.nombre) + '</b> (' + _lpEsc(c.escrito || c.whatsapp) + ') ' +
          '<button type="button" class="lp-link" onclick="lpCambiarContacto(\'' + id + '\')">Cambiar</button></span>'
        : '') +
    '</div></div>';
}

/* ============================ ARMAR / EDITAR ============================ */

function lpNuevaLista() { _lpEditar({ id: null, nombre: '', items: [], contacto: null }); }

function lpEditarLista(id) {
  const l = _lpListas.find(x => x.id === id);
  if (!l) return;
  _lpEditar(JSON.parse(JSON.stringify({ id: l.id, nombre: l.nombre || '', items: l.items || [], contacto: l.contacto || null })));
}

function _lpEditar(l) {
  _lpEdit = l;
  _lpEditInicial = _lpFoto(l);
  document.getElementById('lpTitulo').innerHTML = '<i class="bi bi-clipboard-plus"></i> ' + (l.id ? 'Editar lista' : 'Nueva lista') +
    ' para el proveedor ' + _lpEsc(_lpProveedor.nombre);
  document.getElementById('lpCuerpo').innerHTML =
    '<div class="form-group"><label class="form-label">Nombre de la lista *</label>' +
      '<input type="text" class="form-input" id="lpNombre" maxlength="80" placeholder="Por ejemplo: pedido de los lunes" ' +
      'value="' + _lpAttr(l.nombre) + '" oninput="lpNombreCambio(this.value)"></div>' +
    '<div class="lp-edicion">' +
      '<div class="lp-col"><label class="form-label">Productos de ' + _lpEsc(_lpProveedor.nombre) + '</label>' +
        '<div class="search-box campo-destacado"><i class="bi bi-search"></i>' +
          '<input type="text" id="lpBuscar" placeholder="Buscar por nombre o código..." autocomplete="off" oninput="lpBuscar(this.value)"></div>' +
        '<div id="lpResultados" class="lp-resultados"></div></div>' +
      '<div class="lp-col"><label class="form-label">En la lista</label><div id="lpItems"></div></div>' +
    '</div>' +
    '<div class="lp-pie">' +
      '<button class="btn btn-secondary" style="width:auto" onclick="lpVolver()">Volver</button>' +
      '<button class="btn btn-primary" style="width:auto" id="lpGuardarBtn" onclick="lpGuardarLista()"><i class="bi bi-check-lg"></i> Guardar lista</button>' +
    '</div>';
  lpBuscar('');
  _lpRenderItems();
  setTimeout(() => { const n = document.getElementById(l.nombre ? 'lpBuscar' : 'lpNombre'); if (n) n.focus(); }, 50);
}

function lpNombreCambio(v) { if (_lpEdit) _lpEdit.nombre = v; }

/* El buscador: solo los productos de este proveedor (en uso), con las bolsas de un mismo
   producto juntas, como en Cargar compra. Sin escribir nada, están todos. Cada uno dice cuánto
   stock hay y cómo se pide. */
function lpBuscar(q) {
  const cont = document.getElementById('lpResultados');
  if (!cont || !_lpEdit || !_lpProveedor) return;
  const t = String(q || '').trim().toLowerCase();
  const ya = new Set(_lpEdit.items.map(i => i.id));
  const dice = s => String(s || '').toLowerCase().includes(t);
  const delProv = _lpProds().filter(p => p && p.depurado !== true && p.lista === _lpProveedor.id);
  const prods = delProv.filter(p => !ya.has(p.id) &&
    (!t || dice(p.nombreMostrado) || dice(p.nombre) || dice(p.codigo) || dice(_lpNombreDe(p))))
    .sort((a, b) => _lpNombreDe(a).localeCompare(_lpNombreDe(b), 'es')).slice(0, 80);
  if (!prods.length) {
    cont.innerHTML = '<p class="lp-nota">' + (!delProv.length ? 'Este proveedor no tiene productos en el catálogo.'
      : t ? 'Ningún producto de este proveedor coincide con la búsqueda.' : 'Ya están todos en la lista.') + '</p>';
    return;
  }
  const boton = p => {
    const como = lpComoSePide(p);
    const s = Number(p.stock || 0);
    const stock = p.tipoVenta === 'peso' ? (Math.abs(s) >= 1000 ? _lpNum(s / 1000) + ' kg' : _lpNum(s, 0) + ' g')
      : _lpNum(s, 0) + (Math.abs(s) === 1 ? ' unidad' : ' unidades');
    const det = 'Stock: ' + stock + ' · ' + (como.tipo === 'bolsa' ? 'se pide por bolsa' + _lpDeBolsa(_lpNombreDe(p), como.gramos)
      : como.tipo === 'kilo' ? 'se pide por kilo' : 'se pide por unidad');
    return '<button type="button" class="cp-prod" onclick="lpAgregar(\'' + _lpAttr(p.id) + '\')">' +
      '<span class="cp-prod-n">' + _lpEsc(_lpNombreDe(p)) + '</span><span class="cp-prod-d">' + _lpEsc(det) + '</span></button>';
  };
  const grupos = typeof agruparParaStock === 'function' ? agruparParaStock(prods) : prods;
  cont.innerHTML = grupos.map(x => {
    if (!x || !x.__stockGrupo) return boton(x);
    const miembros = x.__stockGrupo.miembros.filter(m => m.coincide).map(m => m.producto);
    return '<div class="cp-grupo"><div class="cp-grupo-cab"><i class="bi bi-stack"></i> ' + _lpEsc(x.__stockGrupo.nombre) + '</div>' +
      miembros.map(boton).join('') + '</div>';
  }).join('');
}

function lpAgregar(id) {
  const p = _lpProd(id);
  if (!p || !_lpEdit || _lpEdit.items.some(i => i.id === id)) return;
  const como = lpComoSePide(p);
  /* La cantidad arranca vacía (Thiago, 08/10): se escribe, o se deja sin cantidad. */
  _lpEdit.items.push({ id: p.id, nombre: _lpNombreDe(p), tipo: como.tipo, gramos: como.gramos || null, cantidad: null });
  _lpRenderItems();
  lpBuscar((document.getElementById('lpBuscar') || {}).value || '');
  const el = document.getElementById('lpCant' + (_lpEdit.items.length - 1));
  if (el) el.focus();
}

function lpQuitar(i) {
  if (!_lpEdit) return;
  _lpEdit.items.splice(i, 1);
  _lpRenderItems();
  lpBuscar((document.getElementById('lpBuscar') || {}).value || '');
}

function lpCantidad(i, v) {
  const it = _lpEdit && _lpEdit.items[i];
  if (!it) return;
  it._txt = v;
  it.cantidad = lpLeerCantidad(v, it.tipo);
  const el = document.getElementById('lpCant' + i);
  if (el && el.classList) el.classList.toggle('lp-mal', it.cantidad === 0);
}

/* Lo que ya está en la lista, cada uno con su cantidad y en qué se pide. */
function _lpRenderItems() {
  const cont = document.getElementById('lpItems');
  if (!cont || !_lpEdit) return;
  if (!_lpEdit.items.length) { cont.innerHTML = '<p class="lp-nota">Todavía no agregaste productos.</p>'; return; }
  cont.innerHTML = _lpEdit.items.map((it, i) => {
    const nombre = lpNombreItem(it);
    const val = it._txt != null ? it._txt : (_lpHay(it) ? String(it.cantidad).replace('.', ',') : '');
    return '<div class="lp-item"><span class="lp-item-n">' + _lpEsc(nombre) + '</span>' +
      '<input type="text" class="form-input lp-cant' + (it.cantidad === 0 ? ' lp-mal' : '') + '" id="lpCant' + i + '" ' +
        'inputmode="' + (it.tipo === 'kilo' ? 'decimal' : 'numeric') + '" ' +
        'value="' + _lpAttr(val) + '" oninput="lpCantidad(' + i + ',this.value)" aria-label="Cantidad de ' + _lpAttr(nombre) + '">' +
      '<span class="lp-item-u">' + _lpEsc(lpUnidadTxt(it)) + '</span>' +
      '<button type="button" class="lp-quitar" onclick="lpQuitar(' + i + ')" title="Sacar de la lista" aria-label="Sacar ' + _lpAttr(nombre) + '">&times;</button></div>';
  }).join('');
}

async function lpVolver() {
  if (_lpCambio() && typeof pedirConfirmacion === 'function' &&
      !(await pedirConfirmacion('Los cambios de esta lista no se guardaron. ¿Volver igual?', { titulo: 'Salir sin guardar', aceptar: 'Volver sin guardar', focoEnNo: true }))) return;
  _lpRenderListas();
}

async function lpGuardarLista() {
  if (!_lpEdit) return;
  const err = lpValidar(_lpEdit);
  if (err) { showAdminToast(err, 'error'); return; }
  /* Con productos sin cantidad, se avisa antes (Thiago, 08/10): en el mensaje van solo con el nombre. */
  const sin = lpSinCantidad(_lpEdit);
  if (sin.length && !(await pedirConfirmacion(lpAvisoSinCantidad(sin),
      { titulo: sin.length === 1 ? 'Un producto sin cantidad' : 'Productos sin cantidad', aceptar: 'Guardar igual', cancelar: 'Completar cantidades', cuidado: true, icono: 'bi-exclamation-triangle' }))) {
    const el = document.getElementById('lpCant' + _lpEdit.items.indexOf(sin[0]));
    if (el) el.focus();
    return;
  }
  const btn = document.getElementById('lpGuardarBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Guardando...'; }
  const datos = lpDatosParaGuardar(_lpEdit);
  const nueva = !_lpEdit.id;
  try {
    if (nueva) await db.collection('listasPedido').add(Object.assign({ proveedorId: _lpProveedor.id, creadaEn: firebase.firestore.FieldValue.serverTimestamp(), contacto: null }, datos));
    else await db.collection('listasPedido').doc(_lpEdit.id).update(datos);
    if (typeof logAction === 'function') logAction(nueva ? 'crear' : 'editar', 'Lista de pedidos ' + (nueva ? 'creada' : 'editada') + ': ' + datos.nombre,
      _lpProveedor.nombre + ' · ' + datos.items.length + (datos.items.length === 1 ? ' producto' : ' productos'));
    showAdminToast('Lista guardada', 'success');
    _lpEdit = null;
    await _lpCargar();
    _lpRenderListas();
  } catch (e) {
    showAdminToast('No se pudo guardar la lista: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar lista'; }
  }
}

async function lpEliminarLista(id) {
  const l = _lpListas.find(x => x.id === id);
  if (!l) return;
  if (!(await pedirConfirmacion('¿Eliminar la lista "' + (l.nombre || '') + '"? No se puede deshacer.', { titulo: 'Eliminar lista', peligro: true }))) return;
  try {
    await db.collection('listasPedido').doc(id).delete();
    if (typeof logAction === 'function') logAction('eliminar', 'Lista de pedidos eliminada: ' + (l.nombre || ''), _lpProveedor ? _lpProveedor.nombre : '');
    showAdminToast('Lista eliminada', 'success');
    await _lpCargar();
    _lpRenderListas();
  } catch (e) { showAdminToast('No se pudo eliminar: ' + e.message, 'error'); }
}

/* ============================ COPIAR Y MANDAR ============================ */

async function lpCopiarMensaje(id) {
  const l = _lpListas.find(x => x.id === id);
  if (!l) return;
  const texto = lpMensaje(l);
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texto); ok = true; } } catch (e) { ok = false; }
  if (!ok) {
    /* Sin permiso para el portapapeles: el camino viejo, con un campo escondido. */
    const ta = document.createElement('textarea');
    ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
  }
  showAdminToast(ok ? 'Mensaje copiado: pegalo donde quieras.' : 'No se pudo copiar el mensaje.', ok ? 'success' : 'error');
}

function lpMandarMensaje(id) {
  const l = _lpListas.find(x => x.id === id);
  if (!l) return;
  if (!l.contacto || !l.contacto.whatsapp) _lpPedirContacto(l, true);
  else _lpElegirComo(l);
}

function lpCambiarContacto(id) {
  const l = _lpListas.find(x => x.id === id);
  if (l) _lpPedirContacto(l, false);
}

/* A quién se le manda: el nombre y el WhatsApp de la persona, guardados en la lista. */
function _lpPedirContacto(l, desdeMandar) {
  const c = l.contacto || {};
  const m = _lpOverlay('lpContactoModal', 260);
  m.innerHTML = '<div class="modal-box" style="max-width:440px">' +
    '<div class="modal-header"><h3><i class="bi bi-whatsapp"></i> ¿A quién se lo mandás?</h3>' +
      '<button class="modal-close" onclick="lpCerrarContacto()">&times;</button></div>' +
    (desdeMandar ? '<p class="lp-aviso">Primero tenés que guardar el número de WhatsApp de la persona y el nombre.</p>' : '') +
    '<div class="form-group"><label class="form-label">Nombre *</label>' +
      '<input type="text" class="form-input" id="lpContNombre" maxlength="60" placeholder="Por ejemplo: Juan" value="' + _lpAttr(c.nombre || '') + '"></div>' +
    '<div class="form-group"><label class="form-label">WhatsApp *</label>' +
      '<input type="tel" class="form-input" id="lpContNum" inputmode="numeric" autocomplete="off" placeholder="351 999 9999" ' +
        'value="' + _lpAttr(lpFormatoWhatsapp(c.escrito || '')) + '" onkeydown="return lpTeclaNumero(event)" oninput="lpFormatearNumero(this)">' +
      '<small class="lp-nota" style="display:block;padding-top:0.3rem">Solo números, con la característica y sin el 0 ni el 15.</small></div>' +
    '<div class="lp-pie" style="border-top:none;padding-top:0">' +
      '<button class="btn btn-secondary" style="width:auto" onclick="lpCerrarContacto()">Cancelar</button>' +
      '<button class="btn btn-primary" style="width:auto" id="lpContGuardar" onclick="lpGuardarContacto(\'' + _lpAttr(l.id) + '\')">Guardar</button>' +
    '</div></div>';
  m.classList.add('show');
  setTimeout(() => { const n = document.getElementById(c.nombre ? 'lpContNum' : 'lpContNombre'); if (n) n.focus(); }, 50);
}

function lpCerrarContacto() { const m = document.getElementById('lpContactoModal'); if (m) m.classList.remove('show'); }

async function lpGuardarContacto(id) {
  const nombre = String((document.getElementById('lpContNombre') || {}).value || '').trim();
  const escrito = lpFormatoWhatsapp((document.getElementById('lpContNum') || {}).value || '');
  if (!nombre) { showAdminToast('Escribí el nombre de la persona.', 'error'); return; }
  const whatsapp = escrito.replace(/\D/g, '').length === 10 ? lpNormalizarWhatsapp(escrito) : null;
  if (!whatsapp) { showAdminToast('Revisá el número: son 10 números con la característica, por ejemplo 351 999 9999.', 'error'); return; }
  const btn = document.getElementById('lpContGuardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  try {
    const contacto = { nombre: nombre, whatsapp: whatsapp, escrito: escrito };
    await db.collection('listasPedido').doc(id).update({ contacto: contacto });
    const l = _lpListas.find(x => x.id === id);
    if (l) l.contacto = contacto;
    lpCerrarContacto();
    _lpRenderListas();
    showAdminToast('Guardado. Ya podés mandar el mensaje.', 'success');
  } catch (e) {
    showAdminToast('No se pudo guardar: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

/* Cómo se manda: por WhatsApp Web (en el navegador) o por la app de escritorio. */
function _lpElegirComo(l) {
  const c = l.contacto;
  const m = _lpOverlay('lpMandarModal', 260);
  m.innerHTML = '<div class="modal-box" style="max-width:460px">' +
    '<div class="modal-header"><h3><i class="bi bi-whatsapp"></i> Mandar el pedido</h3>' +
      '<button class="modal-close" onclick="lpCerrarMandar()">&times;</button></div>' +
    '<p style="font-size:0.88rem;line-height:1.5;margin:0 0 0.4rem">Se va a abrir WhatsApp con el mensaje ya escrito para <b>' +
      _lpEsc(c.nombre) + '</b> (' + _lpEsc(c.escrito || c.whatsapp) + '). Revisalo y tocá enviar.</p>' +
    '<div class="lp-opciones">' +
      '<button class="btn btn-primary" style="width:auto;flex:1" onclick="lpAbrirWhatsapp(\'' + _lpAttr(l.id) + '\',\'web\')"><i class="bi bi-globe2"></i> WhatsApp Web</button>' +
      '<button class="btn btn-primary" style="width:auto;flex:1" onclick="lpAbrirWhatsapp(\'' + _lpAttr(l.id) + '\',\'app\')"><i class="bi bi-laptop"></i> App de escritorio</button>' +
    '</div>' +
    '<p class="lp-nota" style="margin-top:0.6rem">La app de escritorio tiene que estar instalada en esta computadora.</p>' +
    '<div class="lp-pie" style="border-top:none;padding-top:0;margin-top:0.4rem"><button class="btn btn-secondary" style="width:auto" onclick="lpCerrarMandar()">Cancelar</button></div>' +
    '</div>';
  m.classList.add('show');
}

function lpCerrarMandar() { const m = document.getElementById('lpMandarModal'); if (m) m.classList.remove('show'); }

function lpAbrirWhatsapp(id, modo) {
  const l = _lpListas.find(x => x.id === id);
  if (!l || !l.contacto || !l.contacto.whatsapp) return;
  const url = lpLinkWhatsapp(l.contacto.whatsapp, lpMensaje(l), modo);
  lpCerrarMandar();
  /* La web, en otra pestaña; la app, con su enlace (whatsapp://), que abre el programa. */
  if (modo === 'app') window.location.href = url;
  else window.open(url, '_blank', 'noopener');
}

if (typeof window !== 'undefined') {
  window.abrirListasPedido = abrirListasPedido;
  window.cerrarListasPedido = cerrarListasPedido;
}
