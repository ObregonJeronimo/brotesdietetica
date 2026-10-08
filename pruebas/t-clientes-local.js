/**
 * CLIENTES DEL LOCAL EN LA VENTA (pedido del comercio, 26/09/2026).
 *
 * "Que te deje agregar un cliente sin que el cliente tenga que iniciar sesión en la
 * página, para captar más clientela". El buscador de cliente de la venta mostraba SOLO
 * los clientes de la web (los que entraron con Google): el que se cargaba en el local no
 * se podía elegir, y no había forma de crear uno desde la venta. Ahora muestra los dos,
 * con su etiqueta, y "Agregar cliente nuevo" arriba de todo.
 *
 * Corre admin-clientes.js de verdad con clientes y una lista de mentira, y revisa cómo
 * quedó enganchado en admin.html.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const html = leer('admin.html');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); }
};

function cuerpo(src, n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) return '';
  let b = src.indexOf('{', i), prof = 0, k;
  for (k = b; k < src.length; k++) { if (src[k] === '{') prof++; else if (src[k] === '}') { prof--; if (!prof) break; } }
  return src.slice(i, k + 1);
}

/* Un elemento de mentira: lo justo para la lista. */
function elemento() {
  return {
    className: '', innerHTML: '', textContent: '', hijos: [], escuchas: {},
    appendChild(h) { this.hijos.push(h); },
    addEventListener(tp, fn) { this.escuchas[tp] = fn; },
    set innerHTMLVacio(v) {},
  };
}

function armar(opts) {
  const o = opts || {};
  const lecturas = [], abiertos = [];
  const ctx = {
    console: { log: console.log, warn: () => {}, error: console.error },
    String, Object, Array, Number, Math, JSON, Promise, Set, Map,
    allClientes: o.local || [
      { id: 'c1', nombre: 'José Pérez', telefono: '351 555-1234', identificacion: '30.123.456' },
      { id: 'c2', nombre: 'Ana <b>Gómez</b>', email: 'ana@x.com' },
    ],
    clientesAuthData: o.web || [
      { uid: 'u1', nombre: 'Bruno', apellido: 'Díaz', email: 'bruno@gmail.com', clienteId: 7 },
    ],
    esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: { createElement: () => elemento() },
    openNuevoClienteDesde: (desde, nombre) => abiertos.push(desde + '|' + nombre),
    db: { collection: col => ({ orderBy: () => ({ get: async () => {
      lecturas.push(col);
      return { docs: (o.enBase || []).map(c => ({ id: c.id, data: () => c })) };
    } }) }) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('admin-clientes.js'), ctx);
  return { ctx, lecturas, abiertos };
}

(async () => {
console.log('\n-- a quién se puede elegir --');
{
  const { ctx } = armar();
  const todos = ctx.clientesParaElegir('');
  t('los del LOCAL y los de la WEB, juntos y en orden alfabético', todos.map(c => c.nombre).join('|') === 'Ana <b>Gómez</b>|Bruno Díaz|José Pérez',
    todos.map(c => c.nombre));
  t('  cada uno con su origen', todos.find(c => c.id === 'c1').tipo === 'local' && todos.find(c => c.nombre === 'Bruno Díaz').tipo === 'web');
  t('  el de la web con "auth:" en el id, que es como la venta separa los dos (clienteId / clienteAuthUid)',
    todos.find(c => c.tipo === 'web').id === 'auth:u1');
  t('"Consumidor Final" escrito muestra todos', ctx.clientesParaElegir('Consumidor Final').length === 3);
  t('se busca sin acentos ni mayúsculas: "jose" encuentra a José', ctx.clientesParaElegir('jose').map(c => c.id).join() === 'c1');
  t('  por teléfono, aunque esté escrito distinto: "5551234"', ctx.clientesParaElegir('5551234').map(c => c.id).join() === 'c1');
  t('  por DNI y por mail', ctx.clientesParaElegir('30123456').map(c => c.id).join() === 'c1' &&
    ctx.clientesParaElegir('bruno@').map(c => c.id).join() === 'auth:u1');
  t('en el pedido del panel, solo los del local', ctx.clientesParaElegir('', { soloLocal: true }).every(c => c.tipo === 'local'));
}

console.log('\n-- la lista --');
{
  const m = armar();
  const list = elemento();
  let elegido = null;
  m.ctx.pintarListaClientes(list, m.ctx.clientesParaElegir(''), 'Juan', c => { elegido = c; }, 'venta');
  const primero = list.hijos[0];
  t('arriba de todo: "Agregar cliente nuevo" con lo que se escribió', primero.className.indexOf('cli-nuevo') >= 0 &&
    primero.innerHTML.indexOf('Agregar cliente nuevo: <b>Juan</b>') >= 0 &&
    primero.innerHTML.indexOf('sin que tenga que entrar a la página') >= 0);
  primero.escuchas.mousedown();
  t('  y abre la ficha del cliente nuevo, desde la venta y con ese nombre', m.abiertos.join() === 'venta|Juan');
  const ana = list.hijos.find(h => h.innerHTML.indexOf('Gómez') >= 0);
  t('los nombres van escapados', ana && ana.innerHTML.indexOf('Ana &lt;b&gt;Gómez&lt;/b&gt;') >= 0 && ana.innerHTML.indexOf('<b>Gómez') < 0);
  t('cada uno dice si es del local o de la web', list.hijos.some(h => h.innerHTML.indexOf('cli-origen local') >= 0 && h.innerHTML.indexOf('Local') >= 0) &&
    list.hijos.some(h => h.innerHTML.indexOf('cli-origen web') >= 0 && h.innerHTML.indexOf('#7') >= 0));
  const jose = list.hijos.find(h => h.innerHTML.indexOf('José') >= 0);
  jose.escuchas.mousedown();
  t('tocar uno lo elige', elegido && elegido.id === 'c1');
  const vacia = elemento();
  m.ctx.pintarListaClientes(vacia, [], 'Zulma', () => {}, 'pedido');
  t('si nadie se llama así, lo dice (y "Agregar cliente nuevo" sigue arriba)', vacia.hijos.length === 2 &&
    vacia.hijos[1].textContent === 'Ningún cliente se llama así.');
  const sinNombre = elemento();
  m.ctx.pintarListaClientes(sinNombre, [], 'Consumidor Final', () => {}, 'venta');
  sinNombre.hijos[0].escuchas.mousedown();
  t('  con "Consumidor Final" escrito no lo propone como nombre', sinNombre.hijos[0].innerHTML.indexOf('Consumidor') < 0 &&
    m.abiertos[1] === 'venta|');
  const num = elemento();
  m.ctx.pintarListaClientes(num, [], '351 555-9999', () => {}, 'venta');
  num.hijos[0].escuchas.mousedown();
  t('si se buscó un número, "Agregar cliente nuevo" no lo pone como nombre', num.hijos[0].innerHTML.indexOf('351') < 0 &&
    m.abiertos[m.abiertos.length - 1] === 'venta|');
  const esp = armar({ local: [{ id: 'mj', nombre: 'María  José Ruiz' }], web: [] });
  t('los espacios de más no cuentan: "maria jose" encuentra a "María  José"', esp.ctx.clientesParaElegir('maria jose').map(c => c.id).join() === 'mj');
  const muchos = [];
  for (let i = 0; i < 70; i++) muchos.push({ id: 'x' + i, nombre: 'Cliente ' + i, tipo: 'local' });
  const larga = elemento();
  m.ctx.pintarListaClientes(larga, muchos, '', () => {}, 'venta');
  t('con muchos, dibuja 50 y avisa cuántos más hay', larga.hijos.length === 52 && larga.hijos[51].textContent === 'Hay 20 más: escribí para encontrarlos.');
}

console.log('\n-- repetidos --');
{
  const { ctx } = armar();
  t('mismo teléfono escrito distinto: es el mismo cliente', (ctx.clienteRepetido({ telefono: '(351) 5551234' }) || {}).id === 'c1');
  t('  mismo DNI con o sin puntos', (ctx.clienteRepetido({ identificacion: '30123456' }) || {}).id === 'c1');
  t('  un número corto no alcanza para decir que es el mismo', ctx.clienteRepetido({ telefono: '123' }) === null &&
    ctx.clienteRepetido({ telefono: '999 888-7777' }) === null);
}

console.log('\n-- lectura --');
{
  const m = armar({ local: [], enBase: [{ id: 'c9', nombre: 'Nuevo' }] });
  let avisado = 0;
  await m.ctx.cargarClientesDelLocal(() => { avisado++; });
  t('los del local se leen una vez, livianos (solo la colección)', m.lecturas.join() === 'clientes' && m.ctx.allClientes.length === 1 && avisado === 1);
  await m.ctx.cargarClientesDelLocal(() => { avisado++; });
  t('  y no se vuelven a leer', m.lecturas.length === 1 && avisado === 1);
  const n = armar({ enBase: [{ id: 'c1', nombre: 'José Pérez' }, { id: 'c2', nombre: 'Ana' }] });
  await n.ctx.cargarClientesDelLocal();
  t('si ya hay clientes en la lista, lo leído se SUMA sin repetir', n.ctx.allClientes.length === 2 && n.lecturas.join() === 'clientes');
  /* Revisión del 26/09: un cliente recién creado ya no tapa la lista. */
  const r = armar({ local: [{ id: 'nuevo', nombre: 'Recién creado' }], enBase: [{ id: 'c1', nombre: 'José' }, { id: 'c2', nombre: 'Ana' }] });
  await r.ctx.cargarClientesDelLocal();
  t('uno recién creado no hace creer que ya están todos: se leen y se suman', r.ctx.allClientes.map(c => c.id).sort().join() === 'c1,c2,nuevo');
}
{
  const w = armar({ web: [] });
  w.ctx.db.collection = col => ({ get: async () => { w.lecturas.push(col); return { docs: [] }; } });
  await Promise.all([w.ctx.cargarClientesWeb(), w.ctx.cargarClientesWeb()]);
  await w.ctx.cargarClientesWeb();
  t('los de la web se leen UNA vez aunque se pidan seguido, y vacíos no se releen', w.lecturas.join() === 'clientesAuth', w.lecturas);
}

console.log('\n-- el cliente elegido se ve elegido (08/10) --');
{
  const m = armar();
  const lista = { abiertas: new Set(['open']) };
  lista.classList = { remove: c => lista.abiertas.delete(c), contains: c => lista.abiertas.has(c) };
  const wrap = { querySelector: s => (s === '.cliente-select-list' ? lista : null) };
  const inp = { value: 'José Pérez', hidden: false, enfocado: 0, blurs: 0, blur() { this.blurs++; }, focus() { this.enfocado++; m.ctx.document.activeElement = this; } };
  const idEl = { value: 'c1' };
  const caja = { hidden: true, innerHTML: '', parentNode: wrap };
  const campos = { ventaCliente: inp, ventaClienteId: idEl, ventaClienteElegido: caja };
  m.ctx.document.getElementById = id => campos[id] || null;
  m.ctx.document.activeElement = inp;
  m.ctx.pintarClienteElegido('ventaCliente');
  t('con un cliente de la lista: el recuadro "Cliente seleccionado:" en el lugar del buscador', caja.hidden === false && inp.hidden === true &&
    caja.innerHTML.indexOf('<span class="cli-elegido-etq">Cliente seleccionado:</span>') > 0 && caja.innerHTML.indexOf('<strong>José Pérez</strong>') > 0, caja.innerHTML);
  t('  con su origen, su teléfono y "Cambiar"', caja.innerHTML.indexOf('<i class="bi bi-shop"></i> Local</span> 351 555-1234') > 0 &&
    caja.innerHTML.indexOf('onclick="cambiarClienteElegido(\'ventaCliente\')">Cambiar</button>') > 0, caja.innerHTML);
  t('  la lista se cierra y el campo suelta el foco', !lista.classList.contains('open') && inp.blurs === 1);
  m.ctx.cambiarClienteElegido('ventaCliente');
  t('"Cambiar": vuelve el buscador, con el foco (su onfocus marca el nombre y abre la lista)', caja.hidden === true && inp.hidden === false && inp.enfocado === 1);
  t('  y el cliente sigue elegido hasta que se escriba otro: ni el nombre ni el id se tocan', idEl.value === 'c1' && inp.value === 'José Pérez');
  idEl.value = 'auth:u1'; inp.value = 'Bruno Díaz'; m.ctx.document.activeElement = null;
  m.ctx.pintarClienteElegido('ventaCliente');
  t('uno de la web: su número, "Web" y su mail', caja.innerHTML.indexOf('<strong><span class="cli-num">#7</span> Bruno Díaz</strong>') > 0 &&
    caja.innerHTML.indexOf('<i class="bi bi-globe2"></i> Web</span> bruno@gmail.com') > 0, caja.innerHTML);
  idEl.value = 'c2'; inp.value = 'Ana <b>Gómez</b>';
  m.ctx.pintarClienteElegido('ventaCliente');
  t('  el nombre va escapado', caja.innerHTML.indexOf('Ana &lt;b&gt;Gómez&lt;/b&gt;') > 0 && caja.innerHTML.indexOf('<b>Gómez') < 0, caja.innerHTML);
  idEl.value = 'nuevoXYZ'; inp.value = 'Recién creado';
  m.ctx.pintarClienteElegido('ventaCliente');
  t('  uno que todavía no está en las listas: con el nombre del campo, del local', caja.innerHTML.indexOf('<strong>Recién creado</strong>') > 0 &&
    caja.innerHTML.indexOf('Local') > 0);
  idEl.value = ''; inp.value = 'Consumidor Final';
  m.ctx.pintarClienteElegido('ventaCliente');
  t('sin un cliente de la lista (Consumidor Final o un nombre escrito a mano): el buscador como siempre',
    caja.hidden === true && caja.innerHTML === '' && inp.hidden === false);
  t('  y en una pantalla sin el recuadro no hace nada', (() => { m.ctx.pintarClienteElegido('noExiste'); m.ctx.cambiarClienteElegido('noExiste'); return true; })());
}

console.log('\n-- el recuadro, enganchado en las dos ventas (08/10) --');
{
  t('está en el lugar del buscador, en la venta y en la mayorista',
    html.indexOf('<div class="cli-elegido" id="ventaClienteElegido" hidden></div><input type="text" class="form-input" id="ventaCliente"') > 0 &&
    html.indexOf('<div class="cli-elegido" id="ventaMayClienteElegido" hidden></div><input type="text" class="form-input" id="ventaMayCliente"') > 0);
  const p1 = cuerpo(html, 'pickCliente'), p2 = cuerpo(html, 'pickVentaMayCliente');
  t('  al elegir de la lista se pinta', p1.indexOf("pintarClienteElegido('ventaCliente')") > 0 && p2.indexOf("pintarClienteElegido('ventaMayCliente')") > 0);
  t('  lo que se guarda sale de los mismos campos que antes (el nombre, el id y "elegido")',
    p1.indexOf("document.getElementById('ventaCliente').value=nombre;document.getElementById('ventaClienteId').value=id;ventaClienteSelected=true;") > 0 &&
    p2.indexOf("document.getElementById('ventaMayCliente').value=nombre;document.getElementById('ventaMayClienteId').value=id;ventaMayClienteSelected=true;") > 0);
  t('  al abrir: la venta nueva, la que se edita, el pedido que pasa a venta y la mayorista',
    cuerpo(html, 'openVentaModal').indexOf("pintarClienteElegido('ventaCliente')") > 0 &&
    cuerpo(html, 'openEditVentaModal').indexOf("pintarClienteElegido('ventaCliente')") > 0 &&
    cuerpo(html, 'convertirPedidoEnVentaDesdeModal').indexOf("pintarClienteElegido('ventaCliente')") > 0 &&
    cuerpo(html, 'openVentaMayModal').indexOf("pintarClienteElegido('ventaMayCliente')") > 0);
  t('  y al salir del buscador sin elegir otro', cuerpo(html, 'onBlurClienteVenta').indexOf("pintarClienteElegido('ventaCliente')") > 0 &&
    /id="ventaMayCliente"[^>]*onblur="setTimeout\(function\(\)\{if\(typeof pintarClienteElegido==='function'\)pintarClienteElegido\('ventaMayCliente'\);\},150\)"/.test(html));
  t('  el buscador escondido se esconde de verdad (los .form-input tienen su propio display)', html.indexOf('.cliente-select-wrap>[hidden]{display:none!important}') > 0);
}

console.log('\n-- clientes del local: los botones dicen lo que hacen (08/10) --');
{
  const lista = { innerHTML: '' };
  const ctx = { allClientes: [{ id: 'c1', nombre: "O'Brien", telefono: '1', ventasCount: 2, ventasTotal: 100 }], clSortDir: null,
    document: { getElementById: id => (id === 'clientesList' ? lista : id === 'clienteSearch' ? { value: '' } : null) } };
  vm.createContext(ctx);
  vm.runInContext(cuerpo(html, 'filterClientes'), ctx);
  ctx.filterClientes();
  const h = lista.innerHTML;
  t('"Ver cobros", "Editar" y "Eliminar" con texto, sin íconos', h.indexOf('>Ver cobros</button>') > 0 && h.indexOf('>Editar</button>') > 0 &&
    h.indexOf('>Eliminar</button>') > 0 && h.indexOf('<i class="bi') < 0, h);
  t('  cada uno hace lo mismo que antes (la ficha, editar, eliminar), también con un apóstrofo en el nombre',
    h.indexOf("onclick=\"showClienteHist('c1','O\\'Brien')\">Ver cobros</button>") > 0 &&
    h.indexOf("onclick=\"openClienteModal('c1')\">Editar</button>") > 0 &&
    h.indexOf("onclick=\"deleteCliente('c1','O\\'Brien')\" style=\"color:var(--danger)\">Eliminar</button>") > 0, h);
  t('  en el celular van en su renglón, debajo del cliente', html.indexOf('@media(max-width:768px){.cliente-card{flex-wrap:wrap}.cliente-actions{width:100%}.cliente-actions button{flex:1;padding:6px 8px}}') > 0);
}

console.log('\n-- el panel --');
{
  const sel = cuerpo(html, 'showClienteSelect');
  t('la venta muestra los del local y los de la web', /pintarListaClientes\(list,clientesParaElegir\(escrito\),escrito,cl=>pickCliente\(cl\.id,cl\.nombre\),'venta'\)/.test(sel) &&
    sel.indexOf('cargarClientesDelLocal') > 0);
  const ped = cuerpo(html, 'showPedClienteSelect');
  t('el pedido, los del local (el pedido guarda ese cliente), con "Agregar cliente nuevo"',
    /clientesParaElegir\(escrito,\{soloLocal:true\}\),escrito,cl=>pickPedCliente\(cl\.id,cl\.nombre\),'pedido'\)/.test(ped));
  const may = cuerpo(html, 'showVentaMayClienteSelect');
  t('la mayorista, los dos', /clientesParaElegir\(escrito\),escrito,cl=>pickVentaMayCliente\(cl\.id,cl\.nombre\),'ventaMay'\)/.test(may));
  t('  y volver a tocar el campo ya no borra el cliente elegido (lo borra escribir)', may.indexOf('ventaMayClienteSelected=false') < 0 &&
    /id="ventaMayCliente"[^>]*oninput="ventaMayClienteSelected=false;document\.getElementById\('ventaMayClienteId'\)\.value='';/.test(html));
  t('la ficha nueva viene con el nombre escrito', /function openNuevoClienteDesde\(desde,nombre\)\{_clienteDesde=desde;openClienteModal\(\);[\s\S]{0,120}if\(nombre\)n\.value=nombre;/.test(html));
  const guardar = cuerpo(html, 'saveCliente');
  t('al guardar queda elegido también en la mayorista', /_clienteDesde==='ventaMay'\)\{\s*pickVentaMayCliente\(nuevoId,data\.nombre\);/.test(guardar));
  t('  con la fecha de alta y que es del local', guardar.indexOf("Object.assign({creadoEn:firebase.firestore.FieldValue.serverTimestamp(),origen:'local'},data)") > 0);
  t('  sin la casilla de promociones (pedido del dueño, 26/09)', guardar.indexOf('aceptaPromos') < 0 && html.indexOf('id="cPromos"') < 0);
  t('  y si ya hay uno con ese teléfono o DNI, pregunta antes de cargarlo otra vez', guardar.indexOf('clienteRepetido(data)') > 0 &&
    guardar.indexOf("titulo:'Cliente repetido',aceptar:'Guardar igual'") > 0);
  const abrir = cuerpo(html, 'openClienteModal');
  t('la ficha queda arriba de la venta pero abajo de los diálogos (si no, el aviso quedaba escondido)',
    abrir.indexOf("modal.style.zIndex='300'") > 0 && abrir.indexOf("'2000'") < 0 && abrir.indexOf("_clienteDesde==='ventaMay'") > 0);
  t('la ficha abierta desde una venta va al final de la página (Escape cierra el último modal del orden de la página)',
    abrir.indexOf('document.body.appendChild(modal);') > 0);
  t('el pedido y la mayorista repintan solo con la lista abierta', ped.indexOf("&&list.classList.contains('open'))showPedClienteSelect()") > 0 &&
    may.indexOf("const enfocado=()=>document.activeElement===document.getElementById('ventaMayCliente')&&list.classList.contains('open');") > 0);
  t('  y los de la web se piden con cargarClientesWeb (una sola lectura)', sel.indexOf('cargarClientesWeb(_repintar)') > 0 &&
    may.indexOf('cargarClientesWeb(') > 0 && sel.indexOf("db.collection('clientesAuth')") < 0 && may.indexOf("db.collection('clientesAuth')") < 0);
  const ficha = cuerpo(html, 'showClienteHist');
  t('la ficha del cliente trae también sus ventas mayoristas', ficha.indexOf("db.collection('ventasMayoristas').where('clienteId','==',id).get()") > 0 &&
    ficha.indexOf("_aVenta(d,'ventasMayoristas')") > 0);
  t('  el fiado se salda en su colección', cuerpo(html, 'confirmarCobroCC').indexOf("db.collection(v._col||'ventas').doc(v.docId)") > 0);
  t('  borrar el cliente las cuenta, y sincronizar las pasa', cuerpo(html, 'deleteCliente').indexOf("db.collection('ventasMayoristas').where('clienteId','==',id).get()") > 0 &&
    cuerpo(html, 'confirmarSincronizar').indexOf("db.collection('ventasMayoristas').where('clienteId','==',clienteId).get()") > 0);
  t('el aviso de repetido dice teléfono solo con la regla de 6 dígitos', guardar.indexOf("const _porTel=_dig(data.telefono).length>=6&&_dig(_rep.telefono)===_dig(data.telefono);") > 0);
  t('el módulo está enganchado y check-admin revisa sus clases', html.indexOf('<script src="admin-clientes.js"></script>') > 0 &&
    leer('check-admin.js').indexOf("'admin-clientes.js'") > 0);
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
