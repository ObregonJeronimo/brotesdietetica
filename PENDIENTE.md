# Brotes Dietética — estado y pendientes

> Actualizado: 27/08/2026. Reemplaza la versión anterior de este archivo.
> No se publica: `.vercelignore` excluye todos los `*.md`.

**El software está terminado.** Lo que falta para entregar no es programar: es cargar
el negocio adentro y probarlo una vez de punta a punta.

| | |
|---|---|
| Código | terminado, desplegado, producción al día |
| Pruebas | 381 en 16 suites (`npm test`) + 55 contra las reglas de verdad (`npm run test:reglas`) |
| Panel | 20 secciones cargando sin un solo error de consola |
| Infraestructura | reglas de Firestore y Storage, índices, 10 Cloud Functions, bot de Telegram |
| **Datos** | **prácticamente vacíos — ver abajo** |
| Último deploy | 27/08/2026: Vercel, `firestore:rules` y las functions `descontarStockPedido` + `notifyTelegramOnNewOrder` |

---

## 1. Lo que bloquea la entrega

### a) Probar un pedido web desde una cuenta que NO sea admin ← lo más importante

Hay **0 pedidos** en la base: el camino más crítico de toda la app —que un cliente
compre— nunca se ejecutó de verdad, ni una vez.

Importa más de lo que parece. El bug más grave que encontramos en toda la revisión
era justamente ahí: el checkout escribía en `/productos`, que las reglas sólo
permiten a admins, así que **todo pedido web fallaba en silencio** — todos numerados
1, sin descontar stock, y marcados como si hubiera salido bien. Se había escapado
porque el checkout siempre se probó con una cuenta de admin, que tiene permisos que
un cliente no tiene.

**Lo que ya se puede dar por verificado sin hacer el pedido.** `npm run test:reglas`
levanta el emulador de Firestore con las reglas reales y ejecuta cada operación del
camino de compra con la identidad de un cliente común: el primer pedido de la base
con `pedidosCount` inexistente, el objeto exacto que arma `app.js`, envío, cupón,
Mis Pedidos, reseñas. 55 asertos, todos verdes. Lo que **no** puede verificar es lo
que pasa del lado de las Cloud Functions y de Google Auth.

Cómo cerrarlo: anotá el stock de un producto, compralo desde la tienda con otra
cuenta de Google, y confirmá que el pedido queda con número correlativo (no 1) y que
el stock baja.

```bash
firebase functions:log --only descontarStockPedido
```

### b) Cargar el catálogo

Estado real de la base, verificado por API:

| colección | cuántos |
|---|---|
| productos | **2** — uno es *"Producto de ejemplo (ocultalo o borralo)"* del setup |
| categorías | **0** |
| pedidos · ventas · cupones · clientesAuth | 0 |
| listas | 1 (FRUTICOR) |

Un cliente que entre hoy a la tienda ve **dos productos**. Para cargar en tanda está
**Productos → Importar Nuevos** (Excel).

**El importador estaba roto de la peor manera y ya se arregló** (§3, tanda 1). Leía
los números con `parseInt` directo: `20.000` se guardaba como **20**, `$ 1.500` como
**0**, y un `STOCK` de `1.500` como **1**. Un catálogo entero entraba con los precios
divididos por mil, sin un solo error de consola.

Antes de importar, la pantalla ahora muestra un resumen y pide confirmación cuando
hay algo que mirar: filas repetidas dentro del mismo archivo, filas sin `CATEGORIA`,
y —lo más importante— cuántos productos quedarían en **$0**. Un producto en $0 no se
puede comprar: la regla de `/pedidos` exige `total > 0`.

### c) Borrar el producto de ejemplo y lo que quedó del setup inicial

### d) La foto del hero

En `config/siteContent`, `heroImg` y `ctaImg` siguen guardados como
`https://brotesdietetica.vercel.app/admin` — la página del panel, no una imagen.
Es basura de un bug viejo ya arreglado.

**Se limpia solo**: entrá a **Editor Web**, subí la foto del hero y apretá **Guardar**.
El panel detecta los valores inválidos, no los muestra en la vista previa y los borra
del documento al guardar. No hay que tocar la base a mano.

### e) Rotar el token del bot de Telegram

Estuvo un rato legible sin login por una regla de Firestore. La regla ya está cerrada,
pero el token viejo hay que darlo de baja igual: `/revoke` a
[@BotFather](https://t.me/BotFather), pedí uno nuevo, y pegalo en `config/telegram`
desde la consola de Firebase.

---

## 2. Decisiones tuyas que quedaron abiertas

1. **El QR de reseña exige iniciar sesión con Google.** Es deliberado: la colección de
   reseñas es de lectura pública porque la tienda las muestra, así que los tokens
   pendientes se pueden listar. Sin sesión, cualquiera podría completar la reseña de
   otro o llenar todas las pendientes con una estrella. Sacar esa fricción se puede,
   pero requiere separar en dos colecciones (tokens pendientes sin permiso de listar,
   reseñas publicadas sí). Es una migración, no un cambio de una línea.

2. **El contacto de Deft** quedó con el nombre *Deft Software Solutions* y el teléfono
   de **Joaco Brarda Melchionna** (+54 9 3512 33-3009). Falta decidir si el nombre
   también cambia.

3. **El registro del texto.** El panel quedó formal (usted / impersonal). La tienda y
   el ticket impreso siguen en tono cercano — *"Dejá tu opinión"*, *"Volvé a pedir"* —
   porque no es la misma audiencia. Falta decidir si eso también cambia.

4. **Token de GitHub en `Autoleads`.** Está en texto plano en
   `C:\Users\Usuario\Desktop\Autoleads\.git\config` y en el historial de PowerShell.
   Decidiste no revocarlo. Queda anotado: un `ghp_` clásico con scope `repo` alcanza a
   **todos** los repos, no sólo a ese.

---

## 3. Las tres tandas — todas hechas y desplegadas

### Tanda 1 — el catálogo (`admin.html`) · HECHA, salió con el deploy de Vercel

- Los importes del Excel se leen con `montoExcel()` / `porcentajeExcel()` en vez de
  `parseInt` / `parseFloat`. `20.000` son veinte mil, `1.234,56` tiene decimales,
  `$ 1.500` y `ARS 3.450` se entienden, y una celda numérica de Excel no se rompe
  (ojo: `montoAR()` **no** sirve para una celda, `montoAR(1234.56)` daría `123456`).
- Los duplicados se buscan también **dentro del propio archivo**, no sólo contra la
  base, y comparando sin acentos ni espacios de más: `Semillas  Chía` y
  `semillas chia` son el mismo producto.
- Se acepta una columna **PRECIO** cuando no hay `COSTO`. Antes una lista con precios
  de venta cargaba todo el catálogo en $0.
- Se acepta una columna **LISTA**, y arriba de la zona de carga hay un selector de
  lista de proveedor para todo el lote. Sin `lista`, el formulario de producto la
  pedía al editar a mano cualquier importado.
- **Las dos pantallas de importación comparten el mismo código** (`armarProductosDesdeFilas`).
  Antes "Importar Costos", cuando el archivo no parecía de costos, daba de alta **sin
  comparar contra nada**: soltar ahí el Excel del catálogo lo duplicaba entero, y las
  dos pantallas se ven idénticas. Ahora avisa que ese archivo va en Importar Nuevos.
- El default de categoría se escribe igual en las dos (`Sin categoría`). Con dos
  ortografías distintas la tienda mostraba **dos filtros** para la misma cosa.
- **Asigna `codigo` y `tipoVenta`**, que son de la venta por peso de Thiago. El
  `codigo` es obligatorio y único: sin esto un catálogo de 800 filas entra sin ese
  campo y el formulario lo pide **de a uno** al editar cualquiera. Se respeta una
  columna `CODIGO`/`COD`/`SKU` si viene y es válida (`A-Z 0-9 . _ -`, hasta 40); si no,
  se genera `P-0001`, `P-0002`… único contra la base **y** contra el propio lote. Sólo
  avisa cuando venía un código y hubo que reemplazarlo.
- `TIPOVENTA` en *peso* deja el producto a granel: el precio es **por kilo** y el
  **`STOCK` va en gramos**. Se escribe siempre, nunca ausente: un granel importado como
  `unidad` se cobraría mil veces de menos.

Cubierto por `pruebas/t-importar.js` (54 asertos).

### Tanda 2 — el pedido (`app.js`) · HECHA, sale con el próximo deploy de Vercel

- **`_onUserLogin` ya no corre dos veces.** Firebase avisa la misma sesión por dos
  caminos (`onAuthStateChanged` y el `.then` de `signInWithPopup`; en móvil,
  `getRedirectResult`) y los dos estaban enganchados sin candado: las dos corridas
  veían que el documento no existía y las dos hacían `ref.set()`. El segundo cae sobre
  un documento que ya existe, las reglas lo leen como **update** —que sólo deja tocar
  cuatro campos— y devuelven `permission-denied`. Medido en el emulador. Como ese
  `set` no estaba en `try/catch`, esa corrida moría ahí: no llegaba al modal de datos
  ni a `_refreshCheckoutAuth`, y se consumían **dos** `clienteId` para el mismo
  cliente. Ahora hay un candado por uid y una red de seguridad que, si el documento
  ya existe, se queda con lo guardado.
- **Los topes del checkout son los mismos que los de la regla**: nombre recortado a
  120, corte por `total ≥ 10.000.000` y por más de 100 productos distintos (ya estaba
  el de `total > 0`). Importa porque si la regla rechaza el create, el `catch` **no
  frena**: el número de pedido ya se consumió, el cupón se registra igual contra un
  pedido que no existe, el carrito se vacía, y el único rastro es el WhatsApp.
  `pruebas/t-topes-pedido.js` lee los números de `firestore.rules` y falla si los dos
  archivos se separan.
- **`clienteAuthUid` sale de `firebase.auth().currentUser`**, no de `clienteAuth`, que
  puede quedar en null si la lectura de `/clientesAuth` falla.

### Tanda 3 — el servidor · HECHA Y DESPLEGADA (27/08/2026)

```bash
# El orden que se usó, por si hay que repetirlo:
git push origin main                    # 1º Vercel (app.js + admin.html)
firebase deploy --only firestore:rules  # 2º las reglas
firebase deploy --only functions:descontarStockPedido,functions:notifyTelegramOnNewOrder
```

- **`descontarStockPedido` decidía con la carga del evento de creación, que está
  congelada.** `stockDescontado` nace siempre en `false` y `bloqueadoPorLimite` ni
  existe ahí, porque lo agrega `rateLimitPedidos` con un update posterior. Las dos
  guardas eran **inalcanzables**: la idempotencia declarada no existía, y al pedido
  frenado por rate-limit se le descontaba el stock igual mientras el panel decía lo
  contrario. Ahora las dos se deciden adentro de la transacción, leyendo el documento
  vivo. Probado midiendo: los casos 9b, 9c y 9e de `test-funcion-precios.js` **fallan**
  contra el código viejo.
- **Un item cuyo producto ya no existe** se salteaba sin dejar rastro y el pedido se
  marcaba como descontado igual. Ahora queda en `itemsDesconocidos` y pide revisar el
  pedido a mano.
- **`firestore.rules` exige `clienteAuthUid == request.auth.uid`** al crear un pedido.
  Antes se podía mandar en null —y entonces `rateLimitPedidos` corta con
  `if (!uid) return`, o sea que el límite de 5 por hora se salteaba omitiendo un
  campo— o con el uid de otra persona, y el pedido le aparecía a ella en Mis Pedidos
  con nombre, teléfono y dirección del que lo hizo.
- **El aviso de Telegram tiene tope de largo.** Telegram rechaza con 400 cualquier
  mensaje de más de 4096 caracteres, y las reglas no acotan `notas` ni la cantidad de
  items: un pedido grande dejaba al comercio sin el aviso, que muchas veces es lo
  único que ve. Se recorta por items enteros y el corte final es en un salto de línea,
  porque cortar al ras parte una etiqueta `<b>` y Telegram lo rechaza igual.
- **Todo pedido con un producto a granel salía marcado como sospechoso.** La venta por
  peso y `descontarStockPedido` se escribieron por separado y nadie las cruzó: a
  granel el precio es **por kilo** y la cantidad viaja en **gramos**, pero el total de
  catálogo multiplicaba derecho. 250 g de nueces a $18.000 el kilo daban **$4.500.000**
  en vez de $4.500, y como `revisarPrecio` se marca cuando lo cobrado es menos de la
  mitad del catálogo, la chapa de "revisar precio" iba a aparecer en casi todos los
  pedidos — que es la peor forma de perder un aviso. Con 0 pedidos en la base no lo
  habría visto nadie hasta empezar a vender. Los casos 9f y 9g de
  `test-funcion-precios.js` fallan contra el código previo.

### Lo que queda de la auditoría y NO se tocó

- `rateLimitPedidos` sigue usando `creadoEn`, que lo elige el cliente. Cerrarlo pide
  `request.resource.data.creadoEn == request.time` en la regla, y eso no se puede
  probar con el arnés actual (manda un timestamp concreto, no un transform), así que
  no se agregó a ciegas.
- `config/pedidosCount` con un `count` guardado como texto deja a todos los clientes
  sin poder comprar: el cliente lo tolera con `parseInt`, la regla no. Sólo pasa si
  alguien lo edita a mano desde la consola de Firebase.

---

## 4. Cómo verificar que no rompiste nada

```bash
npm test          # 381 pruebas, 16 suites — no necesita nada instalado
npm run build     # corre check-admin.js y luego minifica
npm run test:reglas   # 55 asertos contra firestore.rules, con el emulador
```

`npm run build` **falla y corta el deploy** si el JS de `admin.html` revienta al
cargar **o si el HTML queda desbalanceado** en cualquiera de las seis páginas. Eso es
a propósito: Vercel lo ejecuta al desplegar, así que algo roto hace fallar el deploy
en vez de salir al aire.

Del HTML controla dos cosas: cierres que no cierran nada y aperturas que nunca
cierran (con archivo y línea), y que ninguna sección del panel quede adentro de otra
—que es cómo se manifiesta un cierre de más y lo que rompe `switchSection`.

**`npm run test:reglas` necesita un JDK 21 y hoy no hay uno instalado.** El sistema
tiene un JRE 1.8 y firebase-tools rechaza todo lo anterior a 21 con
*"no longer supports Java version before 21"*. Está aparte de `npm test` a propósito:
así `npm test` sigue andando en cualquier máquina. La suite no toca producción — el
emulador es un proceso local en memoria sobre un proyecto `demo-brotes` que no existe
en Firebase.

**Lo que las pruebas NO pueden ver.** Cada suite saca la función del archivo y la
corre aislada, así que no se entera si en el navegador **otro módulo la reemplaza**.
Pasó: `admin-pagination.js` no envuelve a `renderStockList`, la **reimplementa entera**
y nunca llama a la original — la selección múltiple de Stock no andaba aunque las 33
pruebas pasaban. **Lo visual y lo que depende del orden de carga hay que verificarlo
abriendo la página.**

---

## 5. Trampas de este código (todas costaron un bug)

**`admin.html` tiene su JavaScript adentro, en un bloque de ~4.900 líneas.** Si una
sola línea tira un error al cargar, el navegador abandona el bloque entero ahí mismo.
Las funciones sobreviven porque las declaraciones `function` se hoistean —así que la
página parece sana— pero todas las declaraciones `let`/`const` posteriores quedan sin
inicializar. Un error en la línea 1750 rompe las 3.100 que siguen.

**`node --check` no alcanza.** Un `async` que quedó colgado al sacar una función es
sintaxis válida (`async` es un identificador) y explota recién al ejecutar. Para eso
está `check-admin.js`.

**En una Cloud Function, `event.data.data()` está congelado.** Es la foto del
documento en el instante del disparo, no el documento. Cualquier guarda que mire un
campo que otra función escribe después es código muerto, y cualquier guarda sobre un
campo que el documento trae fijo de fábrica no protege de una reentrega. Si la
decisión y la escritura tienen que ser coherentes, van adentro de una transacción que
relea el documento (y **todas** las lecturas antes de la primera escritura).

**Firebase avisa el mismo login por dos caminos.** `onAuthStateChanged` y el `.then`
de `signInWithPopup` (en móvil `getRedirectResult`) disparan los dos para la misma
sesión. Sin candado, cualquier alta que haga "leer, si no existe crear" se ejecuta dos
veces y la segunda choca contra las reglas.

**Un `.set()` sobre un documento que ya existe lo evalúan las reglas como `update`,
no como `create`.** Es la diferencia entre pasar y `permission-denied` cada vez que el
`update` es más estricto que el `create`, que es el caso de `/clientesAuth`.

**`parseInt` no sirve para leer plata.** `parseInt('20.000')` es `20`. Para un input
del panel está `montoAR()`; para una celda de Excel está `montoExcel()`, que además
soporta la celda numérica (`montoAR(1234.56)` daría `123456`).

**En un producto a granel (`tipoVenta === 'peso'`) el precio es POR KILO y la cantidad
—y el stock— van en GRAMOS.** Cualquier `precio * cantidad` escrito sin pensarlo da mil
veces de más. En la tienda eso lo resuelve `subtotalCarrito()`, en el panel
`subtotalItem()`, y en las functions hay que dividir a mano. Ya costó un bug: el total
de catálogo salía x1000 y marcaba como sospechoso todo pedido con un producto suelto.
Si escribís una cuenta nueva sobre items, preguntá primero por `tipoVenta`.

**Al agregar CSS, mirá dónde está parada la regla vecina.** Muchas viven dentro de
`@media(max-width:768px)`. Anclar ahí hace que el estilo nuevo **sólo aplique en
pantallas chicas**, y en escritorio no se nota que falta hasta que algo se ve mal.

**`.btn{flex:1}` y `.btn{width:100%}`** existen en esas media queries. Cualquier botón
en una barra necesita `width:auto; flex:0 0 auto` o se estira a todo el ancho.

**El HTML ya está balanceado y `npm run build` lo exige.** Tenía un cierre de más de
fábrica en la zona del Editor Web; se quitó. Si el build se queja del HTML, es algo
que acabás de romper.

**Finales de línea.** El repo tiene LF y la copia local CRLF. Comparar hashes contra
producción da distinto aunque el contenido sea idéntico: normalizá `\r\n` → `\n` antes.

**Thiago trabaja en paralelo** (`thiagojoel17@hotmail.com`). Hacé `git fetch` antes de
empezar: ya pasó que el remoto estuviera 6 commits adelante.

**El panel del navegador oculto no dibuja frames**, así que las transiciones CSS quedan
congeladas en su valor inicial y las capturas fallan. Si vas a medir un color animado,
comprobá antes con `requestAnimationFrame`.

**El puerto 5173 lo usa también el server de YERCO.** Por eso `.claude/launch.json`
tiene una segunda entrada, `brotes-dev-5174`.

---

## 6. Brotes y YERCO: qué falta portar, y en qué dirección

Brotes es un clon de YERCO, así que los bugs viven en los dos. Lo que quedó
desalineado después de esta tanda:

**De YERCO a Brotes (hecho):** la etiqueta de ejemplo del editor de comprobantes que
decía "Envío GRATIS" con los envíos apagados (`renderFcePreview` cortaba los
argumentos antes de `tipoEntrega`), y el alta de `clientesAuth` que guardaba el nombre
en blanco teniendo el `displayName` de Google en el mismo objeto.

**De Brotes a YERCO (falta):**

1. **El tope de 80 al partir el `displayName`.** `firestore.rules` exige
   `validString(nombre, 80)` y `validString(apellido, 80)` en el create de
   `clientesAuth`. En YERCO el corte quedó sin tope: un `displayName` largo hace que
   se rechace el alta **entera** y el cliente se queda sin documento.
2. **Que la tienda respete `haceEnvios`.** En Brotes ya está: `app.js` lee
   `config/pedidos` y con `haceEnvios:false` el selector de entrega queda en
   `display:none` y `setCheckoutEntrega('envio')` devuelve `retiro` aunque lo llamen a
   mano. Verificado ejecutando. En YERCO sigue hardcodeado.
3. **Todo lo de las tandas 1 y 3.** En particular las dos que no dan error de consola
   y sólo se ven cuando ya es tarde: el importador dividiendo los precios por mil, y
   las guardas de `descontarStockPedido` decidiendo sobre la carga congelada del
   evento.
4. **Si YERCO también tiene venta por peso**, revisá el total de catálogo de
   `descontarStockPedido`: es el mismo bug del x1000.
5. **La suite de reglas** (`pruebas/reglas-cliente.js` + `npm run test:reglas`). Es
   genérica salvo el mail del dueño y los nombres de colección; es la única forma de
   probar el camino del cliente sin una segunda cuenta de Google.

Una diferencia deliberada: en Brotes el corte del nombre de Google es una función
aparte (`_nombreDesdeGoogle` en `app.js`) y en YERCO quedó en línea. Se hizo para
poder ejecutarla desde las pruebas.

---

## 7. Referencia rápida

| | |
|---|---|
| Proyecto Firebase | `brotesdietetica-2f78e` |
| Producción | https://brotesdietetica.vercel.app |
| Repo | https://github.com/ObregonJeronimo/brotesdietetica |
| Dueño | `jeroobregon03@gmail.com` — en `config-negocio.js` (`NEGOCIO.mailDuenio`) **y** en `firestore.rules` y `storage.rules`. Las reglas no pueden leer ese archivo: ese literal es la salida de emergencia si `/admins` quedara vacía. **Si cambia el dueño hay que tocar los tres.** |
| Quién entra al panel | colección `/admins` — se maneja desde Configuración → Quién puede entrar |
| Config de envíos y mínimo | `config/pedidos` — lo escribe el panel y lo lee la tienda (`PEDIDOS` en `app.js`) |
| Tope de Storage | 5 GB, con el medidor en la barra lateral |

**Cloud Functions (10):** `notifyTelegramOnNewOrder`, `procesarUsoCupon`,
`rateLimitPedidos`, `sanitizarPedido`, `sincronizarClaimAdmin`,
`aplicarClaimAlIngresar`, `descontarStockPedido`, `sumarUsoStorage`,
`restarUsoStorage`, `recalcularUsoStorage`.

Las tres de pedidos corren en `southamerica-east1`; las dos de Storage en `us-east1`,
que es donde vive el bucket (en otra región el deploy las rechaza).

---

## 8. Lo que se hizo (referencia — no hay que repetirlo)

**Bugs graves cerrados:** el checkout que fallaba en silencio · la ganancia por
cliente que mostraba facturación como margen y aplicaba el descuento dos veces · un
pedido borrado por rate-limit que se llevaba el stock sin dejar rastro · escribir
`20.000` guardaba `20` (en el formulario, en Importar Costos **y ahora en Importar
Nuevos**) · la venta mayorista era imposible · un producto con apóstrofo no se podía
borrar · guardar el Editor Web rompía la portada de un click · volver un pedido a
pendiente borraba la venta sin devolver stock · XSS almacenado · Vercel publicaba el
repo entero con los mails de los admins · la etiqueta de ejemplo prometía envío gratis
con los envíos apagados · los clientes de Google entraban todos sin nombre · el doble
login chocaba contra las reglas · las guardas de `descontarStockPedido` eran
inalcanzables.

**Funcionalidad nueva:** caja y arqueo · estadísticas con calendario · lector de
códigos de barras · atajos de teclado · formatos de papel · administración de admins
desde el panel · carga de stock en tanda · medidor de almacenamiento con tope ·
validación de precios bajo costo del lado del servidor · importación de catálogo con
resumen previo y control de duplicados.

**Costos de Firestore:** la tienda y el panel leían colecciones enteras en cada
visita; guardar un producto releía los 3.000. Todo acotado.

El detalle de cada uno está en los mensajes de commit, que explican el problema antes
que la solución. `git log` es la mejor documentación de este proyecto.
