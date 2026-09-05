/* Lee del NOMBRE el envase que declara el proveedor.
   Se usa para clasificar tipoVenta y para convertir precio y stock.
   Vive en un solo lugar a proposito: la clasificacion, el ensayo en seco y la
   migracion tienen que leer exactamente lo mismo. */

/* Un numero argentino en un nombre de producto: "2,5" es dos y medio, y
   "22.680" es veintidos con seiscientos ochenta (no veintidos mil): en esta
   lista NADA pesa 22 toneladas. Por eso el punto tambien es decimal.
   El unico caso de miles real seria un gramaje como "1.000 g", que se
   resuelve solo porque ahi la unidad es g y no kg. */
function _num(txt) {
  let s = String(txt).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

/* Marcas de envase sellado: si el nombre las trae, se vende como viene. */
const RE_SELLADO = /\b(caja|cajas|blister|blisters|sobre|sobres|sob|lata|latas|comp|comprimidos?|caps?|capsulas?|saq|saquitos?|vidr|vidrio|botella|frasco|doypack|pack)\b/i;

function envase(nombre) {
  const n = String(nombre || '').trim();
  const re = /([\d]+(?:[.,][\d]+)?)\s*(kgs?|kilos?|grs?|gramos?|g|cc|ml|lts?|litros?|u|un|unidades?)\b/gi;
  let m, last = null;
  while ((m = re.exec(n)) !== null) last = m;
  if (!last) return null;
  const val = _num(last[1]);
  if (val === null || val <= 0) return null;
  let u = last[2].toLowerCase();
  if (/^(kgs?|kilos?)$/.test(u)) u = 'kg';
  else if (/^(grs?|gramos?|g)$/.test(u)) u = 'g';
  else if (/^(cc|ml)$/.test(u)) u = 'cc';
  else if (/^(lts?|litros?)$/.test(u)) u = 'l';
  else u = 'u';
  return { val, u, txt: last[0], sellado: RE_SELLADO.test(n) };
}

module.exports = { envase, RE_SELLADO };
