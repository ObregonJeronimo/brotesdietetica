/**
 * SIEMBRA DEL SANDBOX
 * =============================================================================
 *   npm run sandbox:sembrar        (o se corre solo con `npm run sandbox`)
 *
 * Llena el emulador con datos INVENTADOS: 100 productos, 20 proveedores, ventas,
 * pedidos y compras -algunas a deber-. Ningún dato real de la clienta.
 *
 * Escribe por la API REST del emulador, con la cabecera `Bearer owner`, que es
 * como el emulador reconoce a un administrador. Sin dependencias: no hace falta
 * instalar firebase-admin ni nada.
 *
 * NO PUEDE ESCRIBIR EN PRODUCCIÓN: la URL apunta a 127.0.0.1 y el proyecto se
 * llama `demo-brotes`, que no existe en la nube.
 *
 * Los datos son SIEMPRE LOS MISMOS: nada de aleatorio. Si una pantalla se ve
 * rara, se vuelve a sembrar y se ve igual de rara, que es lo que permite
 * arreglarla.
 */
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const PROYECTO = 'demo-brotes';
const BASE = 'http://' + HOST + '/v1/projects/' + PROYECTO + '/databases/(default)/documents';

if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(HOST)) {
  console.error('  El emulador tiene que estar en 127.0.0.1. Recibí: ' + HOST);
  process.exit(1);
}

/* --------------------------------------------------- de JS a lo que pide la API */
function valor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'object') {
    const f = {};
    Object.keys(v).forEach(k => { f[k] = valor(v[k]); });
    return { mapValue: { fields: f } };
  }
  return { stringValue: String(v) };
}

async function escribir(coleccion, id, datos) {
  const fields = {};
  Object.keys(datos).forEach(k => { fields[k] = valor(datos[k]); });
  const r = await fetch(BASE + '/' + coleccion + '/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(coleccion + '/' + id + ': ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function borrarTodo(coleccion) {
  const r = await fetch(BASE + '/' + coleccion + '?pageSize=300',
    { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) return;
  const j = await r.json();
  for (const d of (j.documents || [])) {
    await fetch('http://' + HOST + '/v1/' + d.name.split('/v1/').pop().replace(/^.*?(projects\/)/, '$1'),
      { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
      .catch(() => {});
  }
}

/* ================================ LOS DATOS ================================ */

const ADMINS = ['jeroobregon03@gmail.com', 'thiagowendler53@gmail.com', 'admin@local'];

const PROVEEDORES = [
  'FRUTICOR', 'ANDNUTS', 'LA HERBOLERIA', 'EL KIOSQUITO', 'MARTIN F.S',
  'NATURA', 'SOJITAS', 'EXQUISITECES', 'DELGON', 'GALLETAS VEGANAS',
  'MONARCA GRANOLAS', 'VERDEDIET', 'PANIER', 'ILARINA', 'REAL ESSENZE',
  'HESAI', 'JADE', 'SINA', 'YOGUURT', 'CASA TAZA',
];

const CATEGORIAS = {
  'Frutos secos': ['Almendras', 'Nueces', 'Mixes'],
  'Semillas': ['Chia', 'Lino', 'Girasol'],
  'Harinas': ['Integrales', 'Sin gluten'],
  'Infusiones': ['Yerbas', 'Te', 'Hierbas'],
  'Snacks': ['Barritas', 'Galletas'],
  'Aceites': [],
  'Endulzantes': [],
  'Legumbres': [],
  'Cereales': [],
  'Cosmetica natural': [],
};

/* Nombres armados por combinación: siempre los mismos, y suenan a dietética. */
const BASES = [
  'Almendra', 'Nuez', 'Castaña De Caju', 'Mani', 'Pistacho', 'Avellana',
  'Semilla De Chia', 'Semilla De Lino', 'Semilla De Girasol', 'Semilla De Zapallo',
  'Harina De Almendra', 'Harina Integral', 'Harina De Garbanzo', 'Harina De Arroz',
  'Yerba Mate', 'Te Verde', 'Manzanilla', 'Boldo', 'Tilo',
  'Barrita De Cereal', 'Galleta De Arroz', 'Tostada Integral',
  'Aceite De Coco', 'Aceite De Oliva', 'Aceite De Girasol',
  'Stevia', 'Azucar Mascabo', 'Miel', 'Azucar De Coco',
  'Lenteja', 'Garbanzo', 'Poroto Negro', 'Arveja Partida',
  'Avena Arrollada', 'Quinoa', 'Amaranto', 'Trigo Sarraceno', 'Mijo',
  'Crema Corporal', 'Jabon De Glicerina', 'Aceite De Almendras',
];
const VARIANTES = ['', ' Tostado', ' Organico', ' Premium', ' Sin Sal', ' 500 Gr', ' 1 Kg', ' Natural'];

function armarProductos() {
  const cats = Object.keys(CATEGORIAS);
  const out = [];
  for (let i = 0; i < 100; i++) {
    const base = BASES[i % BASES.length];
    const varia = VARIANTES[Math.floor(i / BASES.length) % VARIANTES.length];
    const cat = cats[i % cats.length];
    const subs = CATEGORIAS[cat];
    const porPeso = i % 3 === 0;
    const costo = 1500 + (i * 137) % 18000;
    const pct = 60 + (i % 5) * 10;
    const precio = Math.round(costo * (1 + pct / 100) / 10) * 10;
    /* Un poco de todo, para que las pantallas tengan casos de verdad:
       sin stock, stock bajo, ocultos, con descuento. */
    let stock;
    if (i % 11 === 0) stock = 0;                       /* sin stock */
    else if (i % 7 === 0) stock = porPeso ? 220 : 3;   /* stock bajo */
    else stock = porPeso ? 2000 + i * 90 : 12 + i;
    out.push({
      id: 'prod' + String(i + 1).padStart(3, '0'),
      datos: {
        codigo: String(i + 1).padStart(6, '0'),
        nombre: base + varia,
        categoria: cat,
        subcategoria: subs.length ? subs[i % subs.length] : '',
        lista: 'lista' + String((i % PROVEEDORES.length) + 1).padStart(2, '0'),
        tipoVenta: porPeso ? 'peso' : 'unidad',
        costo: costo,
        porcentaje: pct,
        precio: precio,
        porcentajeMayorista: 30,
        precioMayorista: Math.round(costo * 1.3 / 10) * 10,
        descuento: i % 13 === 0 ? 15 : 0,
        stock: stock,
        oculto: i % 17 === 0,
        popular: i % 9 === 0,
        descripcion: 'Producto de prueba del sandbox.',
        imagen: '',
        imagenesExtra: [],
        codigoBarras: i % 4 === 0 ? '779' + String(1000000 + i * 7919).slice(0, 10) : null,
      },
    });
  }
  return out;
}

/* Fechas fijas relativas a hoy: el panel filtra por período, así que si fueran
   fijas de calendario, en dos meses el sandbox se vería vacío. */
const HOY = new Date();
const diasAtras = (n) => new Date(HOY.getTime() - n * 86400000);

function armarVentas(productos) {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const cuantos = 1 + (i % 3);
    const items = [];
    let total = 0;
    for (let k = 0; k < cuantos; k++) {
      const p = productos[(i * 7 + k * 13) % productos.length];
      const esPeso = p.datos.tipoVenta === 'peso';
      const cant = esPeso ? 250 * (1 + (k % 4)) : 1 + (k % 3);
      const sub = esPeso ? Math.round(p.datos.precio * cant / 1000) : p.datos.precio * cant;
      total += sub;
      items.push({ id: p.id, nombre: p.datos.nombre, tipoVenta: p.datos.tipoVenta,
                   cantidad: cant, precio: p.datos.precio, subtotal: sub });
    }
    out.push({
      id: 'venta' + String(i + 1).padStart(3, '0'),
      datos: {
        numero: i + 1, fecha: diasAtras(i * 2), items: items, total: total,
        metodoPago: ['Efectivo', 'Transferencia', 'Debito'][i % 3],
        tipoEntrega: 'mostrador', canal: 'caja',
        usuario: 'sandbox@local',
      },
    });
  }
  return out;
}

function armarCompras(productos) {
  const out = [];
  const casos = [
    { pagado: 'todo', dias: 5 },
    { pagado: 'todo', dias: 20 },
    { pagado: 'nada', dias: 12 },      /* deuda entera */
    { pagado: 'mitad', dias: 35 },     /* deuda parcial */
    { pagado: 'nada', dias: 70 },      /* deuda vieja: fuera del período de 30 días */
    { pagado: 'vieja', dias: 120 },    /* sin los campos: NO es deuda */
  ];
  casos.forEach((c, i) => {
    const lista = 'lista' + String((i % 4) + 1).padStart(2, '0');
    const items = productos.filter(p => p.datos.lista === lista).slice(0, 3).map(p => {
      const esPeso = p.datos.tipoVenta === 'peso';
      const cant = esPeso ? 3000 : 6;
      const sub = esPeso ? Math.round(p.datos.costo * cant / 1000) : p.datos.costo * cant;
      return { id: p.id, nombre: p.datos.nombre, tipoVenta: p.datos.tipoVenta,
               cantidad: cant, costoUnitario: p.datos.costo, subtotal: sub };
    });
    const total = items.reduce((s, x) => s + x.subtotal, 0);
    const d = {
      numero: i + 1, proveedorId: lista,
      proveedorNombre: PROVEEDORES[(i % 4)],
      fecha: diasAtras(c.dias), comprobante: 'R 0001-' + String(90000 + i),
      items: items, total: total, sumoStock: true,
      facturaUrl: '', facturaNombre: '', notas: '', usuario: 'sandbox@local',
    };
    if (c.pagado === 'todo') {
      d.pagado = total; d.saldada = true;
      d.pagos = [{ fecha: '01/01/26', monto: total, medio: 'Transferencia',
                   nota: 'Marcada como pagada al cargar la compra', usuario: 'sandbox@local' }];
    } else if (c.pagado === 'nada') {
      d.pagado = 0; d.saldada = false; d.pagos = [];
    } else if (c.pagado === 'mitad') {
      d.pagado = Math.round(total / 2); d.saldada = false;
      d.pagos = [{ fecha: '15/01/26', monto: Math.round(total / 2), medio: 'Efectivo',
                   nota: 'a cuenta', usuario: 'sandbox@local' }];
    }
    /* 'vieja' no lleva ninguno de los tres campos, a proposito. */
    out.push({ id: 'compra' + String(i + 1).padStart(3, '0'), datos: d });
  });
  return out;
}

function armarPedidos(productos) {
  const estados = ['nuevo', 'preparando', 'listo', 'entregado', 'cancelado'];
  return estados.map((e, i) => {
    const p = productos[i * 11];
    const cant = 2;
    const sub = p.datos.precio * cant;
    return {
      id: 'pedido' + String(i + 1).padStart(3, '0'),
      datos: {
        numero: i + 1, estado: e, fecha: diasAtras(i + 1),
        cliente: { nombre: 'Cliente Prueba ' + (i + 1), telefono: '351400000' + i,
                   email: 'cliente' + i + '@local', direccion: 'Calle Falsa ' + (100 + i) },
        items: [{ id: p.id, nombre: p.datos.nombre, cantidad: cant,
                  precio: p.datos.precio, subtotal: sub }],
        total: sub, tipoEntrega: i % 2 ? 'envio' : 'retiro', costoEnvio: i % 2 ? 2500 : 0,
        metodoPago: 'Efectivo',
      },
    };
  });
}

/* ================================ SEMBRAR ================================ */

async function main() {
  console.log('  Sembrando ' + BASE);

  /* Se limpia primero: sembrar dos veces no puede dejar el doble de todo. */
  for (const c of ['productos', 'listas', '_categorias', 'admins', 'ventas',
                   'compras', 'pedidos', 'config', 'cajas', 'cupones']) {
    await borrarTodo(c);
  }

  for (const m of ADMINS) {
    await escribir('admins', m.toLowerCase(), { mail: m.toLowerCase(), rol: 'admin' });
  }

  for (let i = 0; i < PROVEEDORES.length; i++) {
    await escribir('listas', 'lista' + String(i + 1).padStart(2, '0'),
      { nombre: PROVEEDORES[i], pdfSemanal: i < 3 });
  }

  for (const c of Object.keys(CATEGORIAS)) {
    await escribir('_categorias', c, { nombre: c, subcategorias: CATEGORIAS[c] });
  }

  const productos = armarProductos();
  for (const p of productos) await escribir('productos', p.id, p.datos);

  const ventas = armarVentas(productos);
  for (const v of ventas) await escribir('ventas', v.id, v.datos);

  const compras = armarCompras(productos);
  for (const c of compras) await escribir('compras', c.id, c.datos);

  const pedidos = armarPedidos(productos);
  for (const p of pedidos) await escribir('pedidos', p.id, p.datos);

  /* Promos para probar la entrega de cupones desde la caja. */
  const PROMOS = [
    { id: 'VOLVE2000', nombre: 'Volvé y llevate $2.000', monto: 2000, limiteCompra: 12000,
      maxUsos: 100, entregados: 0, activo: true, diasVigencia: 30 },
    /* La que se entrega por dejar una reseña: la elige la Cloud Function
       premiarResena buscando paraResenas == true. */
    { id: 'RESENA1500', nombre: 'Gracias por tu opinión', monto: 1500, limiteCompra: 8000,
      maxUsos: 500, entregados: 0, activo: true, diasVigencia: 45, paraResenas: true },
    { id: 'PRIMERA5000', nombre: 'Primera compra $5.000', monto: 5000, limiteCompra: 25000,
      maxUsos: 50, entregados: 0, activo: true, diasVigencia: 60 },
    { id: 'AGOTADA', nombre: 'Promo agotada', monto: 1000, limiteCompra: 0,
      maxUsos: 10, entregados: 10, activo: true },
    { id: 'APAGADA', nombre: 'Promo apagada', monto: 1500, limiteCompra: 0, activo: false },
  ];
  /* creadoEn es obligatorio de hecho: la lista del panel ordena por ese campo
     y Firestore excluye los documentos que no lo tienen. */
  for (let i = 0; i < PROMOS.length; i++) {
    await escribir('cupones', PROMOS[i].id,
      Object.assign({ creadoEn: diasAtras(10 + i) }, PROMOS[i]));
  }

  await escribir('config', 'comprasCount', { count: compras.length });
  await escribir('config', 'ventasCount', { count: ventas.length });
  await escribir('config', 'pedidosCount', { count: pedidos.length });

  const deudas = compras.filter(c => c.datos.saldada === false);
  const debe = deudas.reduce((s, c) => s + (c.datos.total - c.datos.pagado), 0);

  console.log('');
  console.log('  ' + PROVEEDORES.length + ' proveedores');
  console.log('  ' + productos.length + ' productos  (' +
    productos.filter(p => p.datos.tipoVenta === 'peso').length + ' por peso, ' +
    productos.filter(p => p.datos.stock === 0).length + ' sin stock, ' +
    productos.filter(p => p.datos.oculto).length + ' ocultos)');
  console.log('  ' + ventas.length + ' ventas, ' + pedidos.length + ' pedidos');
  console.log('  ' + compras.length + ' compras, ' + deudas.length + ' a deber por $' +
    debe.toLocaleString('es-AR'));
  console.log('  5 promos de cupon (2 usables, 1 para resenas, 1 agotada, 1 apagada)');
  console.log('  admins: ' + ADMINS.join(', '));
}

main().catch(e => { console.error('  Falló la siembra: ' + e.message); process.exit(1); });
