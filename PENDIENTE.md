# Brotes Dietética — estado y pendientes

> Actualizado: 27/08/2026. Reemplaza la versión anterior de este archivo.
> No se publica: `.vercelignore` excluye todos los `*.md`.

**El software está terminado.** Lo que falta para entregar no es programar: es cargar
el negocio adentro y probarlo una vez de punta a punta.

| | |
|---|---|
| Código | terminado, desplegado, producción al día |
| Pruebas | 481 en 19 suites (`npm test`) + 55 contra las reglas de verdad (`npm run test:reglas`, que ahora **sí corre acá**) |
| Panel | 20 secciones cargando sin un solo error de consola |
| Infraestructura | reglas de Firestore y Storage, índices, 10 Cloud Functions, bot de Telegram |
| **Datos** | **prácticamente vacíos — ver abajo** |
| Último deploy | 27/08/2026: Vercel, `firestore:rules` y las functions `descontarStockPedido` + `notifyTelegramOnNewOrder`. **La tanda 4 está sin commitear y sin desplegar** (§3). |

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

La tanda 4 (§3) agregó la otra mitad: **con 0 pedidos, el lado del comercio tampoco
corrió nunca**. Cuando entre el primero, el panel lo va a dibujar por primera vez en su
vida, y ahí había cuatro cosas rotas —entre ellas que la dirección del envío no se veía
en ninguna pantalla—. Ya están arregladas y probadas, pero **falta desplegarlas**.

Cómo cerrarlo: anotá el stock de un producto, compralo desde la tienda con otra
cuenta de Google, y confirmá que el pedido queda con número correlativo (no 1), que el
stock baja, y —si es con envío— que en el panel se ve la dirección. Si podés, metele un
producto **a granel** al pedido: es lo que menos kilometraje tiene.

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

## 3. Las tandas de arreglos

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

### Tanda 2 — el pedido (`app.js`) · HECHA Y DESPLEGADA (27/08/2026, con la tanda 3)

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

### Tanda 4 — lo que el merge de la venta por peso dejó a medias

> **Estado: hecha y probada, SIN COMMITEAR y SIN DESPLEGAR.** Está en el working tree.
> Toca sólo `admin.html` y `app.js`: no cambian ni las reglas ni las functions, así que
> el deploy es un `git push origin main` y listo — Vercel corre `npm run build`, que
> falla y corta el deploy si algo está roto.
>
> ```bash
> git push origin main
> ```

Salió de mirar el camino que nunca se ejecutó. Con **0 pedidos**, el lado del comercio
tampoco corrió nunca: cuando entre el primer pedido web, el panel lo va a dibujar por
primera vez en su vida.

#### a) La familia del x1000

**El merge quedó bien SÓLO en el camino que se probó.** `addVentaItem()` —el alta de una
venta desde el mostrador, que es lo que escribió Thiago— sí guarda `tipoVenta`. Todo el
resto se había escrito antes de que existiera el granel y no se volvió a mirar: cada vez
que un item **guardado** volvía a la pantalla, el campo se caía por el camino.

Y `subtotalItem()` decide el `/1000` mirando justamente `i.tipoVenta`. Medido corriendo
las funciones reales del archivo, con 250 g de nueces a $18.000 el kilo:

| | con `tipoVenta` | sin él |
|---|---|---|
| el renglón | **$4.500** | **$4.500.000** |
| el costo del renglón | $3.000 | $3.000.000 |
| la ganancia | $1.500 | $1.500.000 |
| la cantidad en pantalla | `250 g` | `250` |

Y no se quedaba en la pantalla. `saveVenta()` guarda `tipoVenta: i.tipoVenta || 'unidad'`:
ese `|| 'unidad'` **convierte la pérdida en corrupción**. Abrir una venta a granel para
cambiarle el medio de pago y guardarla la reescribía como venta por unidad, con el total
mil veces más alto, y ya no quedaba forma de saber que había sido a granel.

Ojo con esto: **no hacía falta ningún pedido web para dispararlo.** Editar una venta de
mostrador ya cargada bien alcanzaba.

En el panel (`admin.html`), ahora todos toman el `tipoVenta` con el helper nuevo
`tipoVentaDe()`, que lo saca del item y, si el documento es viejo y no lo trae, del
catálogo:

- `openEditVentaModal()` — abrir una venta guardada para editarla
- `openVentaMayModal()` — lo mismo en mayorista
- `openPedidoModal()` — abrir un pedido
- `convertirPedidoEnVentaDesdeModal()` — pasar un pedido web a venta
- `addPedItem()` — agregar un producto a un pedido desde el panel
- `savePedidoDesdeModal()` — lo que queda escrito en el documento del pedido
- `gananciaDe()` — la ficha del cliente y las estadísticas
- `setVentaItemDsc()`, `setPedItemDsc()`, `setVentaMayItemDsc()` — tocar el `%` de
  descuento de un renglón lo disparaba a x1000 en el acto
- el costo total del pedido en el modal (ahora `costoItem()`)
- `buildFacturaA4Items()` y `buildEtiquetaItems()` — la columna *Cant* y el ticket
  térmico decían `x250` al lado de un producto a granel, que es justo lo que lee el que
  arma el pedido
- `buildEtiquetaFooter()` — el respaldo del subtotal, que volvía a multiplicar derecho
- los dos listados de ventas — ahora `250 g x $18.000 el kilo`
- el texto de aviso al guardar un pedido

En la tienda (`app.js`):

- **el resumen del checkout** — la pantalla donde el cliente aprieta *Confirmar*. El
  carrito ya mostraba bien el granel, pero el resumen es **otro render** y quedó afuera:
  el renglón decía `x250 Nueces $4.500.000` justo arriba de un `TOTAL $4.500`. De todos,
  este es el peor: es el único que el cliente ve antes de decidir si compra.
- **el `subtotal` de cada item del pedido** — el total del pedido estaba bien, pero el
  subtotal por item que se guarda adentro del documento era x1000, y de ahí salen el
  ticket impreso y la factura A4.
- **`repetirPedido()`** — rearmaba el carrito sin `tipoVenta`. Ahora lo toma del catálogo,
  que es quien manda hoy sobre qué significa `cantidad`, y si el comercio le cambió la
  forma de venta al producto desde que se hizo el pedido, **omite el item con aviso** en
  vez de cobrar mil veces de más o de menos.
- **Mis Pedidos** — decía `x250` en vez de `250 g`.

De paso, el nombre del producto en el resumen del checkout ahora se escapa con `esc()`,
como ya hacía el carrito. No es paranoia: los nombres del catálogo entran por el **Excel
del proveedor**, que no lo escribe el comercio.

Cubierto por `pruebas/t-granel-panel.js` (38 asertos) y los casos nuevos de
`pruebas/t-ganancia.js`. Contra el código anterior la suite **falla en 8 asertos**.

#### b) Volver un pedido a pendiente no devolvía el stock

Este bug ya se había arreglado una vez (está en §8). La corrección busca la venta y le
suma el stock de vuelta… pero la buscaba **sólo en `ventasData`**, que es la caché de la
sección Ventas.

Esa caché la llena únicamente `loadVentas()`, o sea *entrar a la sección Ventas*, y
encima acotada al mes del filtro. Abrir el panel e ir derecho a Pedidos —que es lo que
hace cualquiera a la mañana— la deja **vacía**. Con la caché vacía:

- `vAsoc` quedaba `undefined` y no se devolvía una sola unidad;
- la venta se borraba igual, porque ese `.delete()` estaba **afuera** del `if`;
- y el historial anotaba *"stock devuelto"*. Esa es la peor parte: confirma algo que no
  pasó, así que nadie sale a buscar la mercadería.

Después, al volver a facturar el pedido, se descontaba por segunda vez: 4 unidades
vendidas dejaban 8 menos en góndola.

Ahora, si la venta no está en la caché, se lee **de la base**, que es la fuente de verdad.
Y si el documento ya no existe, el historial lo dice: *"la venta ya no existía: NO se
devolvió stock"*.

Cubierto por `pruebas/t-pedido-revertir.js` (16 asertos), que **ejecuta `kanbanDrop` de
verdad** con dobles para el DOM y para Firestore y mide el stock devuelto. Contra el
código anterior falla en 5 asertos, el primero con `stockProd = null`.

#### c) Un aviso que describía otro problema

`descontarStockPedido` anota en `itemsDesconocidos` los items del pedido cuyo producto ya
no está en el catálogo —pasa cuando el comercio borra y recrea un producto y el cliente
tenía el id viejo en el carrito de `localStorage`—. A esos **no se les descuenta stock**.
El comentario de la function dice, textual, *"para que el panel lo pueda mostrar"*.

El panel no lo nombraba en ninguna línea: `itemsDesconocidos` tenía **cero apariciones**
en `admin.html`. Y como la misma función prende `revisarPrecio` en ese caso, el pedido
salía con la chapa **"Revisar precio"** y un tooltip que hablaba de inflación. El comercio
revisaba los precios, no encontraba nada raro, y entregaba mercadería que el sistema
seguía contando como disponible.

Ahora hay una rama propia, antes que la del total: **"Producto borrado"**, diciendo cuáles
y que a esos no se les descontó stock.

Cubierto por `pruebas/t-avisos-pedido.js` (17 asertos). Es una prueba de **contrato entre
dos archivos**, como `t-topes-pedido.js`: lee del fuente de `functions/index.js` todos los
campos que las functions le escriben al pedido y exige que cada uno esté leído en el
panel, o clasificado a mano como "de auditoría" con su razón. Si alguien agrega un campo
nuevo al `patch`, la prueba falla hasta que lo muestre o lo justifique.

### Lo que queda de la auditoría y NO se tocó

- `rateLimitPedidos` sigue usando `creadoEn`, que lo elige el cliente. Cerrarlo pide
  `request.resource.data.creadoEn == request.time` en la regla, y eso no se puede
  probar con el arnés actual (manda un timestamp concreto, no un transform), así que
  no se agregó a ciegas.
- `config/pedidosCount` con un `count` guardado como texto deja a todos los clientes
  sin poder comprar: el cliente lo tolera con `parseInt`, la regla no. Sólo pasa si
  alguien lo edita a mano desde la consola de Firebase.

- **`devolverStockPedido` decide con la copia en memoria, no adentro de la transacción.**
  La guarda `if(!pedido||!pedido.stockDescontado)return false;` mira el objeto que le
  pasan (de `pedidosData`), y recién después abre la transacción que devuelve el stock.
  Es la misma forma del bug de las Cloud Functions que ya está en §5: la decisión y la
  escritura tienen que ser coherentes. La ventana es angosta —el panel escucha los
  pedidos con `onSnapshot`, así que la copia está fresca— pero un doble click alcanza.
  La receta ya está escrita en este archivo: leer el pedido **adentro** del
  `runTransaction`, con todas las lecturas antes de la primera escritura.
- **`stockFaltante` no guarda `tipoVenta`.** El aviso "Faltó stock" muestra
  *"Nueces (pidió 250, había 100)"* para un producto a granel: los números están bien,
  la unidad no se dice. Son dos líneas —`tipoVenta: p.tipoVenta || 'unidad'` en el
  `falt.push()` de `functions/index.js`, y `fmtPeso()` en el panel— pero **obliga a
  redesplegar `descontarStockPedido`**, así que queda para cuando se toquen las
  functions.
- **El ranking de productos de estadísticas suma gramos y unidades en la misma columna**
  (`admin-stats.js`, `p.unidades += Number(i.cantidad||0)`). El monto está bien —sale de
  `i.subtotal`, que ahora es correcto—, pero *"más vendidos por unidades"* pone a
  cualquier producto a granel arriba de todo con números de cuatro cifras. No se tocó
  porque no es mecánico: hay que decidir **cómo se presenta** (dos columnas, o rankear
  por monto). El dato para hacerlo ya está: los items guardan `tipoVenta`.

**Reportado por la auditoría y NO verificado a mano — tratar como "hay que mirarlo", no
como "es así".** Salió de una pasada de agentes sobre el camino del pedido; cada hallazgo
pasó por un refutador, pero estos no los comprobé yo:

- el modal de cambiar estado dejaría confirmar y entregar un pedido web sin registrar la
  venta;
- borrar la venta desde la sección Ventas no le saca el `ventaId` al pedido, que quedaría
  sin poder facturarse;
- guardar un pedido web desde el modal graba `costo:0` en los items (el pedido web no
  trae costo; `convertirPedidoEnVentaDesdeModal` sí lo completa desde el catálogo, este
  camino no);
- el cupón del pedido web se dibujaría como `(-undefined%)`;
- convertir un pedido web recotiza el envío con la tarifa de hoy en vez de usar el
  `envio` guardado;
- `clienteWeb` lo lee el panel en cuatro lugares y no lo escribe nadie (siempre cae al
  `|| p.cliente`);
- las estadísticas cuentan pedidos en estado `cancelado`, que ningún flujo escribe.

---

## 4. Cómo verificar que no rompiste nada

```bash
npm test          # 481 pruebas, 19 suites — no necesita nada instalado
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

**El JDK 21 ya está instalado y la suite 20 corre en esta máquina.** Quedó un Temurin
portable —sin instalador y sin tocar el PATH del sistema— en:

```
C:\Users\Usuario\.jdks\jdk-21.0.12.1+1
```

El sistema sigue teniendo un JRE 1.8, y `java` a secas sigue siendo ese. Para correr las
reglas hay que ponerle el 21 adelante nada más para ese comando:

```bash
JAVA_HOME="C:\Users\Usuario\.jdks\jdk-21.0.12.1+1" PATH="/c/Users/Usuario/.jdks/jdk-21.0.12.1+1/bin:$PATH" npm run test:reglas
```

Ojo con el formato de la ruta: en git bash el `PATH` necesita `/c/Users/...`; con
`C:/Users/...` no la encuentra y vuelve a agarrar el JRE 1.8 sin decir nada (se ve
porque `java -version` sigue diciendo 1.8). `JAVA_HOME` sí va con la ruta de Windows.

Sigue aparte de `npm test` a propósito: así `npm test` anda en cualquier máquina, sin
nada instalado. La suite no toca producción — el emulador es un proceso local en
memoria sobre un proyecto `demo-brotes` que no existe en Firebase. **Verificado:
55 asertos, 0 fallaron.**

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

**Un campo que se cae al rehidratar no se queda en la pantalla: se escribe.** El patrón
`tipoVenta: i.tipoVenta || 'unidad'` en el guardado parece defensivo y es lo contrario:
si el campo no llegó hasta ahí, ese `||` lo reemplaza por el default y lo graba. Lo que
era un error de pantalla queda en el documento y ya no hay cómo saber qué era. Cada vez
que un item guardado vuelve a un formulario, el `map` que lo rehidrata tiene que traer
**todos** los campos que alguien va a leer después, no sólo los que se editan.

**Una caché en memoria no es fuente de verdad.** `ventasData` sólo se llena entrando a la
sección Ventas, y encima acotada al mes del filtro; `allProducts`, `insumosData` y
`clientesAuthData` se llenan al entrar a *su* sección. Cualquier decisión importante
—devolver stock, comparar contra el catálogo— que se tome con `X.find(...)` sobre una de
esas listas funciona mientras se prueba (porque el que prueba ya pasó por esa pantalla) y
falla en el uso normal, en silencio y sin error de consola. Si la decisión importa, leé el
documento.

**Cuando la misma cosa se dibuja en varias pantallas, arreglar una no arregla las otras.**
Un item de venta se muestra en el modal, en el listado, en el ticket térmico, en la
factura A4, en el resumen del checkout y en Mis Pedidos: seis renders distintos del mismo
dato. La venta por peso se arregló en el carrito y quedó mal en el resumen del checkout,
que está a dos pantallas de distancia. Antes de dar por cerrado un arreglo de este tipo,
buscá **todos** los lugares (`grep` por `cantidad`, por `precio*`, por `'x'+`).

**Al sacar una función del archivo para una prueba, llevate el `async`.** Los extractores
(`cuerpo()`, `extraer()`) buscan `'function ' + nombre` y arrancan ahí, así que de
`async function foo(){...}` se llevan `function foo(){...}`. Sigue siendo sintaxis válida
y revienta recién al ejecutar, con *"await is only valid in async functions"*. Es la misma
trampa que documenta `check-admin.js`, del otro lado.

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

6. **Toda la tanda 4.** Si YERCO tiene venta por peso, tiene los mismos veintipico de
   lugares: los `map` que rehidratan items sin `tipoVenta`, `gananciaDe`, los tres
   selectores de descuento por renglón, el ticket, la factura A4, los listados, el
   resumen del checkout, `repetirPedido` y Mis Pedidos. La forma rápida de saber si
   está: buscar `subtotalItem` y ver si `esPorPeso` recibe algo que tenga el campo.
7. **La devolución de stock al volver un pedido a pendiente** (`kanbanDrop`), que leía la
   venta de la caché en memoria.
8. **Que el panel muestre la dirección y las notas del pedido web.** En YERCO conviene
   revisarlo aunque no tenga granel: es independiente.
9. **Las dos pruebas de contrato entre archivos** (`t-avisos-pedido.js` y la parte de
   `t-granel-panel.js` que compara `functions/index.js` con `admin.html`). Son las que
   avisan cuando alguien agrega un campo de un lado y se olvida del otro.

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
