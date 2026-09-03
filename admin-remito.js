/* ==========================================================================
   LEER UN REMITO EN PDF Y PRECARGAR LOS ITEMS DE LA COMPRA

   Solo PDFs con CAPA DE TEXTO. No hay OCR y no lo va a haber por ahora: sobre
   una foto, los modelos actuales aciertan cerca de la mitad de los renglones y
   -peor- ajustan el precio de un renglon para que la suma cierre contra el
   total impreso, lo que anula el unico control que no depende del catalogo.
   Un PDF digital es lo contrario: los digitos son exactos porque nadie los
   esta interpretando, solo copiados.

   QUE HACE Y QUE NO

   Reconoce un producto SOLO por el codigo de proveedor. No adivina por nombre:
   hoy nadie midio cuanto acierta el parecido de texto contra este catalogo, y
   un producto equivocado con su costo entra derecho al margen. El modo de falla
   es "no encontre nada", que se ve y no hace dano.

   Las cantidades y los costos SI se leen, pero solo si la cuenta del renglon
   cierra: cantidad x unitario = importe. Es el control que sobrevive porque no
   hay ningun modelo eligiendo numeros. Si no cierra, el producto entra igual
   pero con cantidad 0 y marcado, y guardarCompra ya descarta lo que tenga
   cantidad 0. O sea que un renglon dudoso no se guarda salvo que una persona
   escriba la cantidad a mano.
   ========================================================================== */

/* ------------------------------------------------------------ NUMEROS
   Formato argentino: 14.000,50 son catorce mil con cincuenta. El punto es
   separador de miles y la coma es decimal, o sea al reves que en JS. */
function _remNumero(txt) {
  if (txt == null) return null;
  let t = String(txt).replace(/\$/g, '').replace(/\s/g, '');
  if (!t || !/\d/.test(t)) return null;
  /* Si tiene coma, la coma manda: lo de la izquierda son miles. */
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  /* Sin coma, un punto con exactamente 3 digitos detras es separador de miles
     -1.650 son mil seiscientos cincuenta, no uno con sesenta y cinco-. */
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return isFinite(n) ? n : null;
}

/* ------------------------------------------------------------- CODIGO
   El codigo del proveedor son 6 digitos con ceros adelante, pero en el papel
   puede venir como "ART. 320", "320" o "#000320". Se normaliza a 6. */
function _remCodigo(token) {
  const m = String(token || '').match(/(\d{1,6})$/);
  if (!m) return null;
  return m[1].padStart(6, '0');
}

/* Los numeros que hay al final del renglon, en orden. Se toman DESDE LA
   DERECHA porque la descripcion puede tener numeros adentro -"Pan De
   Hamburguesa 2U."- y esos no son columnas. */
function _remNumerosFinales(linea) {
  const toks = String(linea || '').trim().split(/\s+/);
  const nums = [];
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i];
    if (t === '$' || /^(kg|kgs|un|u|uni|unid)\.?$/i.test(t)) continue;   /* etiquetas */
    const n = _remNumero(t);
    if (n === null) break;                 /* se acabo la zona de numeros */
    nums.unshift({ valor: n, texto: t, i: i });
    if (nums.length >= 4) break;
  }
  return nums;
}

/* ------------------------------------------------------- UN RENGLON
   Devuelve lo que se pudo leer, sin decidir todavia si sirve. */
function _remLeerLinea(linea) {
  const txt = String(linea || '').trim();
  if (!txt || txt.length < 6) return null;
  /* Rayas de separacion, encabezados y pies. */
  if (/^[-=_.\s]+$/.test(txt)) return null;
  if (/^(total|subtotal|son pesos|iva|cae|neto|descuento)\b/i.test(txt)) return null;

  const toks = txt.split(/\s+/);
  /* El codigo esta al principio. Se acepta de dos formas y NADA MAS:
       - seis digitos, que es como los guarda el catalogo ("000320");
       - menos digitos SI vienen con una etiqueta que los anuncia ("ART. 320").

     Un numero suelto al principio NO alcanza, y esto no es purismo. Un remito
     con la cantidad primero -"10 Cucharitas De Madera 3.000,00"- hacia que el
     10 se leyera como el codigo 000010, que existe en el catalogo: entraba un
     producto que no estaba en el papel, en silencio. Preferimos no reconocer
     un formato raro antes que cargar mercaderia equivocada. */
  let codigo = null, desde = 0, etiquetado = false;
  for (let i = 0; i < Math.min(3, toks.length); i++) {
    if (/^(art|arts|cod|codigo|c[oó]d|ref|item)\.?:?$/i.test(toks[i])) { etiquetado = true; continue; }
    const limpio = toks[i].replace(/^[#.]/, '');
    if (!/^\d+$/.test(limpio)) break;
    if (!etiquetado && limpio.length !== 6) break;   /* un numero suelto no es un codigo */
    const c = _remCodigo(limpio);
    if (c) { codigo = c; desde = i + 1; }
    break;
  }
  if (!codigo) return null;

  const nums = _remNumerosFinales(txt);
  /* La descripcion es lo que queda entre el codigo y la zona de numeros. */
  const hasta = nums.length ? nums[0].i : toks.length;
  const desc = toks.slice(desde, hasta).join(' ').trim();

  /* Se busca la unidad -KG- en el texto crudo, no en los tokens numericos. */
  const enKilos = /\d[\d.,]*\s*(kg|kgs|kilos?)\b/i.test(txt);

  return { linea: txt, codigo: codigo, descripcion: desc, numeros: nums.map(n => n.valor), enKilos: enKilos };
}

/* ------------------------------------------- CANTIDAD, UNITARIO E IMPORTE
   La forma tipica es [cantidad] [unitario] [importe]. Con dos numeros no se
   puede saber cual falta, asi que no se adivina: se deja sin cantidad.

   `esPeso` cambia la cuenta: el sistema guarda GRAMOS y el costo es POR KILO,
   asi que el importe es cantidad/1000 x unitario. */
function _remCantidades(lectura, esPeso) {
  const n = lectura.numeros || [];
  const fuera = { cantidad: 0, costoUnitario: null, verificado: false, motivo: '' };

  if (n.length < 3) {
    fuera.motivo = n.length ? 'no se pudieron separar cantidad, precio e importe' : 'sin numeros en el renglon';
    return fuera;
  }
  /* Los tres ultimos: si hay mas, los de la izquierda son de la descripcion. */
  const [cant, unit, imp] = n.slice(-3);
  if (!(cant > 0) || !(unit > 0)) { fuera.motivo = 'cantidad o precio en cero'; return fuera; }

  if (esPeso) {
    /* Sin la marca KG no se sabe si "3" son 3 kilos o 3 gramos. No se adivina. */
    if (!lectura.enKilos) { fuera.motivo = 'es un producto por peso y el renglon no dice KG'; return fuera; }
    const gramos = Math.round(cant * 1000);
    const esperado = gramos / 1000 * unit;
    if (!_remCierra(esperado, imp)) {
      fuera.costoUnitario = unit;
      fuera.motivo = 'la cuenta del renglon no cierra (' + cant + ' kg x ' + unit + ' deberia dar ' +
                     Math.round(esperado) + ' y dice ' + Math.round(imp) + ')';
      return fuera;
    }
    return { cantidad: gramos, costoUnitario: unit, verificado: true, motivo: '' };
  }

  const esperado = cant * unit;
  if (!_remCierra(esperado, imp)) {
    fuera.costoUnitario = unit;
    fuera.motivo = 'la cuenta del renglon no cierra (' + cant + ' x ' + unit + ' deberia dar ' +
                   Math.round(esperado) + ' y dice ' + Math.round(imp) + ')';
    return fuera;
  }
  if (cant !== Math.round(cant)) { fuera.motivo = 'cantidad con decimales en un producto por unidad'; return fuera; }
  return { cantidad: cant, costoUnitario: unit, verificado: true, motivo: '' };
}

/* Tolerancia de redondeo: un peso, o una milesima del importe si es grande. */
function _remCierra(esperado, impreso) {
  const tol = Math.max(1, Math.abs(impreso) * 0.001);
  return Math.abs(esperado - impreso) <= tol;
}

/* ==================================================== EL REMITO COMPLETO
   Devuelve items listos para la compra, mas lo que NO se pudo usar, que es
   tan importante como lo otro: sin eso, un remito de 20 renglones del que se
   reconocieron 6 se ve igual que uno de 6 renglones. */
function remitoAItems(lineas, productos, proveedorId) {
  const delProveedor = (productos || []).filter(p => !proveedorId || p.lista === proveedorId);
  const porCodigo = new Map();
  delProveedor.forEach(p => { if (p.codigo) porCodigo.set(String(p.codigo).padStart(6, '0'), p); });

  const items = [], dudosos = [], ignoradas = [];
  const yaEsta = new Set();

  (lineas || []).forEach(linea => {
    const l = _remLeerLinea(linea);
    if (!l) return;                                  /* no parece un renglon */
    const p = porCodigo.get(l.codigo);
    if (!p) {
      /* Puede ser de otro proveedor: eso hay que decirlo, no callarlo. */
      const otro = (productos || []).find(x => String(x.codigo || '').padStart(6, '0') === l.codigo);
      ignoradas.push({
        linea: l.linea, codigo: l.codigo,
        motivo: otro ? 'el codigo ' + l.codigo + ' es de otro proveedor' : 'el codigo ' + l.codigo + ' no esta en el catalogo',
      });
      return;
    }
    if (yaEsta.has(p.id)) { ignoradas.push({ linea: l.linea, codigo: l.codigo, motivo: 'repetido en el remito' }); return; }
    yaEsta.add(p.id);

    const esPeso = p.tipoVenta === 'peso';
    const c = _remCantidades(l, esPeso);
    const item = {
      id: p.id,
      nombre: p.nombreMostrado || p.nombre,
      tipoVenta: esPeso ? 'peso' : 'unidad',
      cantidad: c.cantidad,
      /* Si la cuenta no cerro, se usa el costo del catalogo y NO el del papel. */
      costoUnitario: c.verificado ? c.costoUnitario : Number(p.costo || 0),
      costoAnterior: Number(p.costo || 0),
      deRemito: true,
      verificado: c.verificado,
    };
    items.push(item);
    if (!c.verificado) dudosos.push({ nombre: item.nombre, codigo: l.codigo, motivo: c.motivo });
  });

  return {
    items: items,
    dudosos: dudosos,
    ignoradas: ignoradas,
    /* Para el resumen que se le muestra a la persona. */
    resumen: {
      lineas: (lineas || []).length,
      reconocidos: items.length,
      conCantidad: items.filter(i => i.verificado).length,
      sinUsar: ignoradas.length,
    },
  };
}

/* ==================================================== EXTRAER DEL PDF
   Necesita pdf.js, que admin.html ya carga por CDN para el PDF Semanal.

   Los fragmentos se agrupan en renglones por su coordenada Y con tolerancia
   FIJA. Escalar esa tolerancia con el alto de la fuente parece mas prolijo y
   esta mal: dos textos de distinto tamano caen en escalas distintas y el orden
   de los renglones sale mezclado -el pie del comprobante aparecia en el medio
   de la tabla-.

   El hueco entre fragmentos se mira con la x y el ancho de cada uno. Sin eso
   pdf.js los pega y la cantidad queda soldada al precio: "...algarroba29.620,00"
   en vez de "...algarroba 2 9.620,00", y ahi ya no hay forma de separarlos. */
async function remitoLeerPdf(file) {
  if (typeof pdfjsLib === 'undefined') throw new Error('la librería de PDF no cargó');
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const out = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const tc = await (await pdf.getPage(n)).getTextContent();
    const filas = new Map();
    tc.items.forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const y = it.transform[5];
      const k = Math.round(y / 3);
      if (!filas.has(k)) filas.set(k, { y: y, frags: [] });
      filas.get(k).frags.push({ x: it.transform[4], w: it.width || 0, s: it.str });
    });
    [...filas.values()].sort((a, b) => b.y - a.y).forEach(f => {
      const fs = f.frags.sort((a, b) => a.x - b.x);
      let t = '';
      fs.forEach((frag, i) => {
        if (i > 0 && frag.x - (fs[i - 1].x + fs[i - 1].w) > 1) t += ' ';
        t += frag.s;
      });
      t = t.replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    });
  }
  return out;
}

window.remitoAItems = remitoAItems;
window.remitoLeerPdf = remitoLeerPdf;
