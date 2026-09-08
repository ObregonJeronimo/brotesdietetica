# Barrida de clics

Aprieta todo lo que se puede apretar en el panel y anota **los clics que no hacen
nada**.

## Por qué

El detalle de items de una venta no se abría al hacer clic, y estuvo así mucho
tiempo. El código estaba bien escrito, el handler existía, no había ningún error
en consola: un `style="display:none"` en línea le ganaba a la regla de CSS. No
había prueba automática que lo encontrara, porque no había nada roto que probar.

Lo encontró una persona abriendo el panel y tocando lo primero que vio. Esto no
reemplaza a esa persona: cubre **una sola** clase de error, la más tonta y la más
difícil de ver leyendo el código.

## Cómo se usa

Necesita el sandbox levantado y un navegador. No corre con `npm test`.

1. `npm run sandbox`
2. Entrar a <http://localhost:5173/sandbox> e iniciar sesión.
3. En la consola del navegador (F12):

```js
const s = document.createElement('script');
s.src = '/pruebas/barrida.js';
document.head.appendChild(s);
```

4. Y después, por sección:

```js
switchSection('ventas');
await barrerPanel({ seccion: 'ventas' });
```

O todas de una:

```js
for (const s of ['products','stock','ventas','pedidos','clientes','cupones',
                 'proveedores','caja','estadisticas','historial']) {
  switchSection(s);
  await new Promise(r => setTimeout(r, 1500));
  console.log(await barrerPanel({ seccion: s }));
}
```

## Qué devuelve

```
{ seccion, mirados, apretados, salteados, sinEfecto, conError, mudos, rotos }
```

`mudos` es la lista para mirar: cada uno con su texto, su `onclick` y su clase,
para poder encontrarlo después.

## Lo que hay que tener en cuenta

- **No todo lo mudo es un bug.** Un "copiar al portapapeles" no cambia nada
  visible y va a aparecer en la lista. La salida es una lista para revisar, no un
  veredicto.
- **No aprieta nada que borre, guarde, imprima o cierre sesión.** En el sandbox
  borrar no cuesta nada, pero si la barrida borra los datos en el elemento 20,
  los otros 100 clics se hacen contra un panel vacío y no prueban nada.
- **Tapa `confirm`, `alert` y `prompt` mientras dura**, contestando siempre que
  no. Un `confirm` nativo bloquea el hilo entero y deja la barrida colgada sin
  que se entienda por qué. Los devuelve a su lugar al terminar.
- **Solo mira lo que se ve.** Un botón adentro de un modal cerrado no se puede
  apretar de verdad, y contarlo como "no hace nada" sería mentir.
