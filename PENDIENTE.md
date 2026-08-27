# Brotes Dietética — estado y pendientes

> Actualizado: 27/08/2026. Reemplaza la versión anterior de este archivo.
> No se publica: `.vercelignore` excluye todos los `*.md`.

**El software está terminado.** Lo que falta para entregar no es programar: es cargar
el negocio adentro y probarlo una vez de punta a punta.

| | |
|---|---|
| Código | terminado, desplegado, producción al día |
| Pruebas | 752 en 29 suites (`npm test`) + 55 contra las reglas de verdad (`npm run test:reglas`, que ahora **sí corre acá**) |
| Panel | 20 secciones cargando sin un solo error de consola |
| Infraestructura | reglas de Firestore y Storage, índices, 10 Cloud Functions, bot de Telegram |
| **Datos** | **prácticamente vacíos — ver abajo** |
| Último deploy | 27/08/2026: Vercel, `firestore:rules` y las functions `descontarStockPedido` + `notifyTelegramOnNewOrder`. **Las tandas 4 y 5 están commiteadas y SIN desplegar**: es sólo `git push origin main` (§3). |

---

## 1. Lo que bloquea la entrega

### a) ~~Probar un pedido web desde una cuenta que NO sea admin~~ · **HECHO** (27/08/2026)

> **El pedido #00001 entró en producción**, desde `elhacker0920@gmail.com`, que no es admin.
> Era el bloqueante más importante de todo el proyecto: el camino del cliente nunca se
> había ejecutado de verdad, ni una vez.
>
> | verificación | resultado |
> |---|---|
> | número | **#00001** — el primero de verdad (el contador fósil se había limpiado antes) |
> | `origen` · `clienteAuthUid` | `web` · puesto (la regla de la tanda 3 lo exige) |
> | entrega | `retiro`, `envio: 0`, `direccion: null` — exactamente lo que predice `t-sin-envios.js` con `haceEnvios:false` |
> | total | $80.500 = 35 × $2.300 |
> | `stockDescontado` | **true** — `descontarStockPedido` corrió |
> | `subtotalCatalogo` | 80.500 con `diferenciaCatalogo: 0` y **sin** chapa de "revisar precio" |
> | `stockFaltante` · `itemsDesconocidos` | null · null |
> | stock | **206 → 171**, exactamente −35 |
> | aviso de Telegram | llegó |
>
> Lo que este pedido **no** ejerció, por tenerlo apagado: dirección, envío y cupón. Los tres
> están cubiertos por pruebas y se verificaron contra el emulador (tandas 4 y 5).

#### Lo que costó, y la lección



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
en ninguna pantalla—. La tanda 5 encontró ocho más, del mismo lado. Todas arregladas y
probadas, pero **falta desplegarlas**.

**Lo que YA se verificó de punta a punta (contra el emulador, no contra producción).**
Se levantaron Firestore + Auth + las 10 functions reales con las reglas de verdad, se
compró desde la tienda con una cuenta que **no** es admin, y después se abrió el panel
con la cuenta del dueño. Medido:

| | |
|---|---|
| pedido | **#2** correlativo (no 1), con `clienteAuthUid` puesto |
| granel en el resumen del checkout | `300 g … $5.400` (antes: `x300 … $5.400.000`) |
| dirección y notas | guardadas, **y visibles en el modal del panel** |
| envío $2.000 → total | $34.800 |
| `stockDescontado` | `true`; stock 5.000 → **4.700 g** (−300 g, no −300.000) |
| `subtotalCatalogo` | 32.800 con `diferenciaCatalogo: 0` (no lo marcó sospechoso) |
| candado del doble login | `clientesAuthCount` subió **exactamente 1** (6 → 7) |
| ticket térmico · factura A4 · listado | `300 g` y `$18.000/kg`, subtotal $5.400 en los tres |
| conversión a venta | envío **$2.000** aunque la tarifa del día fuera $3.000 |
| `repetirPedido` con la forma de venta cambiada | *"Omitidos: Nueces mariposa (cambió la forma de venta)"* |

**Lo que falta y no se puede hacer desde acá:** el pedido real **en producción**, que
necesita iniciar sesión con una cuenta de Google de verdad. Antes de hacerlo, acordate de
que hoy `haceEnvios` está en **false** (§1b): si querés probar la dirección en el panel,
prendelo desde **Editor Web → Pedidos y envío**.

Cómo cerrarlo: anotá el stock de un producto, compralo desde la tienda con otra
cuenta de Google, y confirmá que el pedido queda con número correlativo (**va a ser el #2**,
§1b), que el stock baja, y —si es con envío— que en el panel se ve la dirección. Si podés,
metele un producto **a granel** al pedido: es lo que menos kilometraje tiene.

```bash
firebase functions:log --only descontarStockPedido
```

**El contador de clientes se rompió por creerle a este archivo en vez de medir.** Esta tabla
decía `clientesAuth: 0`, y sobre eso se puso `clientesAuthCount` en 0. **Había 4 documentos**,
con `clienteId` 1, 4, 5 y 6: el próximo cliente habría recibido el 2, después el 3, y el
siguiente **habría chocado con el 4**. Se corrigió dejando el contador en **6**, que es el más
alto que existe, así el próximo es el 7.

La colección no se puede leer sin sesión de admin —por eso el chequeo por API pública decía
`PERMISSION_DENIED` y se completó con lo que decía el documento— pero el token de admin
estaba a mano. **Antes de tocar un contador hay que contar los documentos, no leer el
contador ni este archivo.**

### b) Cargar el catálogo

Estado real de la base, verificado por API:

| colección | cuántos |
|---|---|
| productos | **1** — *Semillas Chía*, ya con `codigo: P-0002` y `tipoVenta: unidad`. El *"Producto de ejemplo"* del setup se borró el 27/08/2026 (respaldo del documento en el scratchpad de esa sesión, por si hiciera falta) |
| categorías | **0** |
| pedidos · ventas · cupones · clientesAuth | 0 |
| listas | 1 (FRUTICOR) |

Y los documentos de `config`, que no son colecciones pero deciden lo que ve el cliente:

| documento | valor | por qué importa |
|---|---|---|
| `config/pedidos` | **`haceEnvios: false`** | **decisión tomada: Brotes no hace envíos** (§2.5). No está hardcodeado: se prende desde **Editor Web → Pedidos y envío** el día que quieran. Mientras esté apagado, ningún pedido trae dirección ni cobra flete |
| `config/pedidosCount` | `{count: 0}` | puesto en 0 el 27/08/2026, con 0 pedidos en la base. Traía un `1` fósil de los intentos que fallaban en silencio antes de la tanda 2, que habría hecho que el primer pedido real fuera el #2. **Ahora el primero es el #1** |
| `config/ventasCount` | `{count: 0}` | mismo fósil (traía 2), misma limpieza |
| `config/clientesAuthCount` | `{count: 0}` | mismo fósil (traía 6) |

> **Los contadores ya no se tocan a mano.** Hay un botón en **Configuración → Numeración**
> que los corrige solo: cuenta los documentos y deja cada contador en el número **más alto
> que existe de verdad**. Baja si quedó adelantado (pruebas borradas) y **sube** si quedó por
> debajo —que es el caso grave, porque los próximos documentos chocarían con los viejos—, y
> no toca nada si no puede averiguar el máximo. Escribe siempre **número**, nunca texto: un
> `count` de texto deja a **todos** los clientes sin poder comprar (el cliente lo tolera con
> `parseInt`, la regla no).
>
> Cuesta 3 lecturas por contador, no una por documento: con 880 documentos hace 9 lecturas.
> Por eso no se ejecuta solo al entrar a Configuración, se pide a mano.
> Cubierto por `pruebas/t-contadores.js` (23 asertos).

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

### c) ~~Borrar el producto de ejemplo y lo que quedó del setup inicial~~ · HECHO

Borrado el 27/08/2026, junto con los tres contadores fósiles (§1b). Queda **un solo
producto** en la base.

> **Ojo con esto para la prueba de fuego (§1a):** con un único producto de $2.300 y stock 6,
> el carrito más grande posible son **$13.800**, y `minimoPedido` es **$30.000**. Hasta que
> no entre el catálogo **no se puede hacer el pedido de prueba** — o hay que bajar el mínimo
> un rato desde Editor Web.

### d) La pantalla de permisos de Google dice `brotesdietetica.vercel.app`

Cuando alguien inicia sesión por primera vez, Google le muestra *"Accede a
**brotesdietetica.vercel.app**"* y después le manda un mail avisando que le compartió datos
a esa app. **El mail es inevitable**: lo manda Google cada vez que una cuenta autoriza una
app nueva, y YERCO manda exactamente el mismo. Lo que sí se puede cambiar es **el nombre**.

Google muestra el dominio pelado porque la pantalla de consentimiento de OAuth no tiene
nombre de app cargado. Con el nombre puesto, el cliente lee *"Accede a Brotes Dietética"* —
que es lo que uno quiere que vea— en lugar de una URL, que es lo que uno esperaría de una
estafa.

**Dónde:** [Google Cloud Console → APIs y servicios → Pantalla de consentimiento de OAuth](https://console.cloud.google.com/apis/credentials/consent?project=brotesdietetica-2f78e)
→ campo **Nombre de la aplicación** → `Brotes Dietética` → Guardar.

**Cómo está hoy** (visto en la consola, 27/08/2026):

| campo | valor |
|---|---|
| Nombre de la aplicación | `project-365050888270` ← el número del proyecto, sin tocar |
| Correo de asistencia | `deftinternal@gmail.com` ← **es de Deft, y esto lo ve el cliente** |
| Logo, página principal, privacidad, condiciones | vacíos |
| Dominios autorizados | `brotesdietetica.vercel.app`, `brotesdietetica-2f78e.firebaseapp.com` |

**Qué poner:** nombre `Brotes Dietética`; página principal
`https://brotesdietetica.vercel.app`; privacidad y condiciones
`https://brotesdietetica.vercel.app/politicas` (esa página existe y responde 200). **El
logotipo no se sube.**

El correo de asistencia es **decisión del dueño**: aparece en la pantalla de permisos para
que el cliente escriba si tiene dudas. Hoy es el interno de Deft; el del comercio es
`brotesdietetica@gmail.com`, que es el que ya sale en sus comprobantes.

> **CORRECCIÓN.** Antes acá decía que cambiar el nombre era inmediato porque los scopes son
> no sensibles. **Es falso**, y la propia consola lo desmiente: *"La información de tu marca
> debe verificarse antes de que se pueda mostrar a los usuarios"*. Los datos se cargan igual
> —hacen falta para poder verificar algún día— pero **hasta que la marca no se verifique, la
> pantalla de permisos va a seguir mostrando el dominio**.

**Y la verificación choca con el dominio.** Google pide que los dominios autorizados estén
verificados en Search Console, y hoy el sitio **no tiene ninguna verificación** (no hay
`google*.html` ni el `<meta name="google-site-verification">`). Peor: `brotesdietetica.vercel.app`
no es un dominio propio, es un subdominio de Vercel. **El camino limpio es el dominio propio**
(`brotesdietetica.com.ar`), y ahí sí se verifica y la marca queda con el nombre del negocio.

Cuando llegue ese dominio hay que tocarlo en tres lugares a la vez —están anotados en el
comentario de `firebase-config.js`—: `DOMINIOS_PROPIOS`, los dominios autorizados de Firebase
Auth, y el `frame-src` del CSP en `vercel.json`.

Nada de esto se puede hacer desde acá: es una pantalla de la consola.

### e) La foto del hero

En `config/siteContent`, `heroImg` y `ctaImg` siguen guardados como
`https://brotesdietetica.vercel.app/admin` — la página del panel, no una imagen.
Es basura de un bug viejo ya arreglado.

**Se limpia solo**: entrá a **Editor Web**, subí la foto del hero y apretá **Guardar**.
El panel detecta los valores inválidos, no los muestra en la vista previa y los borra
del documento al guardar. No hay que tocar la base a mano.

### f) ~~Rotar el token del bot de Telegram~~ · DECIDIDO NO ROTARLO (27/08/2026)

El token estuvo un rato legible sin login por una regla de Firestore. La regla **ya está
cerrada**. Jero decidió **no rotarlo**.

Queda anotado qué alcanza ese token, para que la decisión se pueda revisar con el dato y
no de memoria. Quien lo tenga puede, **sólo sobre el bot** —no toca Firestore, ni la
tienda, ni el panel—:

- mandar mensajes **como el bot** al chat del comercio (avisos de pedido falsos);
- y leerse los avisos que el bot recibe. Eso es lo único con peso: el aviso de pedido
  lleva **nombre, teléfono y dirección del cliente**, más lo que compró.

O sea que el riesgo no es para el negocio sino para **los datos de los clientes**. Si
alguna vez entra un pedido real y el bot sigue con el token viejo, conviene revisarlo.

**El bot SÍ está configurado y funcionando.** Verificado el 27/08/2026: `config/telegram`
tiene `token` (46 caracteres, con la forma `<id>:<secreto>` de un token de bot) y `chatId`,
así que `notifyTelegramOnNewOrder` **manda el aviso**. Jero ya lo probó haciendo un pedido
desde la página y el mensaje llegó.

> Ojo con esto al leer este archivo: en una vuelta anterior quedó escrito que el bot no
> estaba configurado. Era un supuesto, no una medición — `config/telegram` no se puede leer
> sin sesión de admin (`allow read: if doc != 'telegram' || isAdmin()`) y se dio por hecho
> lo que no se pudo ver. Está corregido.

Como el bot está vivo, el aviso de cada pedido real va a viajar con el nombre, el teléfono y
—si algún día se prenden los envíos— la dirección del cliente. Eso es lo que hay que tener en
la cabeza si alguna vez se revisa la decisión de no rotar el token.

Si en algún momento se quisiera apagar el bot, alcanza con vaciar `token` o `chatId`: la
function escribe *"Telegram no está configurado, omito notificación"* en el log y **corta sin
error**. El pedido se guarda igual y el stock se descuenta igual.

---

### g) El popup de Google se colgaba · PORTADO DE YERCO (27/08/2026)

Al ir a hacer el pedido de prueba, el popup de login quedaba **en blanco y cargando para
siempre** en `brotesdietetica.vercel.app/__/auth/handler?state=...`. En YERCO el mismo login
funciona, así que se comparó todo — y **la infraestructura resultó ser idéntica**:

| | |
|---|---|
| `vercel.json` | los dos tienen los **dos** rewrites: `/__/auth/:path*` y `/__/firebase/:path*` |
| Headers | mismo COOP (`same-origin-allow-popups`), mismo `X-Frame-Options`, misma CSP salvo los dominios |
| Dominio autorizado | `brotesdietetica.vercel.app` **sí** está en Firebase Auth |
| SDK | 10.12.0 en los dos |
| App Check | `UNENFORCED` en identitytoolkit, firestore y storage |
| `/__/auth/handler` | mismo status, mismos bytes y **mismo cuerpo**, en GET y en POST |
| La ida a Google | funciona: cargando el handler a mano, la pestaña termina en `accounts.google.com` |

Lo único distinto era **el código de la aplicación**, en tres cosas:

- **`_onUserLogin` lo llamaban CUATRO lugares** —el `DOMContentLoaded`, el `.then` de
  `getRedirectResult`, el `.then` de `signInWithPopup` y `onAuthStateChanged`— contra **uno**
  en YERCO. Firebase avisa la misma sesión por varios de esos caminos a la vez. El candado
  por uid de la tanda 2 se deja, pero pasa a ser red de seguridad en vez de la única defensa.
- **En móvil se arrancaba con `signInWithRedirect`.** El redirect depende de cookies de
  terceros, que Safari, Firefox y Chrome bloquean: es **menos** confiable que el popup, no
  más. YERCO es popup-first en todos los dispositivos, con redirect sólo como fallback.
- **No había guarda de reentrada, ni de "mismo uid ya procesado", ni `try/catch`.** Sin el
  `finally`, una excepción de Firestore dejaba `_authProcesando` en true para siempre y
  ningún login posterior se volvía a procesar.

Se portó la estructura de YERCO tal cual: `setPersistence` primero, `onAuthStateChanged`
como única fuente de verdad con los dos guardas y `try/catch/finally`, y `getRedirectResult`
reducido a reabrir el carrito. Cubierto por `pruebas/t-login.js` (23 asertos), que además
deja fijo **por contrato** que `_onUserLogin` tenga un solo llamador. Contra el código
anterior la suite ni termina.

#### La causa, encontrada al reintentar

El port de arriba no alcanzó, y el segundo intento mostró el problema **en pantalla**: la
pestaña de la tienda en el selector de cuentas de Google **y, al lado, un popup en la
pantalla de permisos**. Dos flujos a la vez.

La secuencia:

1. Clic → se abre el popup → va a Google.
2. Algo rechaza esa promesa con **`auth/cancelled-popup-request`** — lo típico es un segundo
   clic, que es exactamente lo que hace cualquiera con un botón que parece colgado.
3. El `catch` lo tomaba como *"el popup no es viable"* y disparaba `signInWithRedirect`.
4. **La pestaña de la tienda se va a Google.** Y ahí muere todo: el popup sigue abierto pero
   su `opener` ya no existe, así que **no tiene a quién devolverle el resultado**. Queda en
   blanco para siempre.

`auth/cancelled-popup-request` significa literalmente *"otra petición de popup dejó sin
efecto a esta"*: **hay otro popup vivo**. Redirigir ahí es romperlo, garantizado. Y
`auth/popup-closed-by-user` en escritorio es la persona cerrándolo a propósito: tampoco hay
que secuestrarle la página.

Los dos salen de la lista de `necesitaRedirect`. En móvil `popup-closed-by-user` sigue
cayendo a redirect por `esCierreEnMovil`, que es donde casi siempre es el navegador
bloqueando el popup. Y se agregó un candado `_authLoginEnCurso`: **un login a la vez**, para
que el segundo clic no genere el `cancelled-popup-request` de entrada. Se suelta en los tres
finales posibles, así que se puede reintentar.

> **Esto NO está en YERCO**: su lista tiene los dos códigos. El defecto vive en los dos
> repos; acá está corregido y en §6 queda anotado para portarlo.

---

## 2. Decisiones tuyas

**Ya decididas:**

5. **Brotes no hace envíos** (27/08/2026) — *"no tendrá envíos, pero hay que tenerlo como
   opción para un futuro"*. Por eso `haceEnvios` queda en **false** en `config/pedidos` y **no
   se sacó una línea de código**: el envío está apagado por configuración y se prende desde
   Editor Web → Pedidos y envío.
   Eso volvió permanente un contrato que no tenía prueba del lado de la **tienda** —las
   cuatro suites que nombraban `haceEnvios` eran todas del panel—, así que se agregó
   `pruebas/t-sin-envios.js` (22 asertos). Prueba las dos mitades: que apagado **sólo exista
   el retiro** (ni llamando a `setCheckoutEntrega('envio')` a mano se puede cobrar flete, y
   el `tipoEntrega` que se guarda en el pedido sale `retiro`), y que **prendido vuelva a
   andar todo** —selector visible, flete cobrado, envío gratis por encima del mínimo—, que
   es justamente para lo que se deja el código puesto.
   Si esto se rompiera, el cliente elegiría envío, pagaría flete y dejaría una dirección
   para un pedido que el comercio no puede cumplir.

**Abiertas:**

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

> **Estado: hecha, probada, commiteada (`e40aaee`) y verificada de punta a punta contra el
> emulador. Falta desplegarla.**
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

Los siete puntos que este archivo listaba como *"reportado por la auditoría y NO verificado
a mano"* **ya están verificados y arreglados**: son la tanda 5, acá abajo. Uno de los siete
(`clienteWeb`) resultó inofensivo y se dejó como está.

### Tanda 5 — lo que sólo se ve cuando el panel abre un pedido web

> **Estado: hecha, probada y verificada contra el emulador con un pedido web real.**
> Toca sólo `admin.html` y `admin-stats.js`: **no cambian ni las reglas ni las functions**,
> así que el deploy vuelve a ser `git push origin main` y Vercel corre `npm run build`.

Cada uno se midió dos veces: con una prueba que **ejecuta la función real** del archivo, y
después abriendo el panel contra un pedido hecho desde la tienda con una cuenta que no es
admin. Contra el código anterior (`e40aaee`) las suites nuevas **fallan en 43 asertos**, y
dos de ellas ni siquiera arrancan.

#### a) Se podía entregar un pedido web sin registrar la venta ← la peor

El tablero tiene **dos** caminos para cambiar de estado: arrastrar la tarjeta (`kanbanDrop`)
y el modal de estado (`aplicarEstadoPedido`). **En celular no hay drag&drop: el modal es el
único que existe.** Todas las guardas estaban escritas una sola vez, adentro de `kanbanDrop`;
el modal hacía un `update` pelado que no miraba `ventaId` en ninguna línea.

Y la guarda del tablero tampoco alcanzaba: exigía que el destino fuera **exactamente**
`'confirmado'`, así que arrastrar de pendiente **directo a entregado** —que es lo normal
cuando el cliente retira en el momento— salteaba la facturación igual.

Lo que se perdía es **la plata, no el stock**: el stock lo descuenta la Cloud Function al
crearse el pedido, así que la góndola queda bien y no se nota nada. Pero la venta no entra
a caja ni a estadísticas, el cliente queda con 0 compras en su ficha, y el botón *"Convertir
a venta"* **desaparecía** justo cuando el estado pasaba a `entregado` (se escondía con
`p.estado!=='entregado'`), o sea que el pedido quedaba sin ninguna forma de facturarse.

Ahora las dos entradas comparten `transicionEstadoPedido()`, la guarda pregunta por
`!p.ventaId` en vez de por el estado de origen, y el botón sólo se esconde si el pedido **ya
tiene** venta. De paso, volver a pendiente desde el modal ya no saltea la reversión —borrar
la venta y devolver el stock—, que antes sólo hacía el arrastre.

Medido en el panel, contra el pedido web real: `aplicarEstadoPedido('entregado')` sobre un
pedido sin venta devuelve `derivado`, **el estado en la base sigue en `pendiente`** y se abre
el modal para facturar. Con la venta ya hecha devuelve `hecho` y escribe `entregado`.

#### b) Borrar la venta dejaba el pedido sin poder facturarse nunca más

`deleteVenta` no le sacaba el `ventaId` al pedido. Como `openPedidoModal` esconde *"Convertir
a venta"* con `!!p.ventaId`, el pedido quedaba apuntando a un documento borrado y **sin
cartel ni error**: la única salida era arrastrarlo a pendiente y contestar que SÍ a un cartel
que invita a contestar que no.

Ahora `deleteVenta` lee `venta.pedidoId` **antes** de borrar —de la caché y, si no está ahí,
del documento, porque `ventasData` sólo se llena entrando a la sección Ventas— y después
libera el pedido y lo vuelve a `pendiente`. Medido: la venta se borra, el pedido vuelve a
`pendiente` con `ventaId` en null, el botón vuelve a estar habilitado, el stock se devuelve
**exacto** (5.000 g → 4.700 → 5.000, sin devolver de más) y el historial dice
*"pedido … vuelto a pendiente y liberado"*.

#### c) La ganancia de todo pedido web era la facturación entera

Un pedido nacido en la web **nunca trae costo**: `app.js` arma los items sólo con precio.
`openPedidoModal` hacía `costo:i.costo||0` y `savePedidoDesdeModal` escribía ese 0.

Y **0 no es lo mismo que null**: los dos rescates que existen —el de
`convertirPedidoEnVentaDesdeModal` y el de `gananciaDe`— preguntan por `costo!=null`, así que
un 0 los **apaga**. La venta nacía con costo 0 y el panel mostraba como ganancia toda la
facturación.

Ahora los dos rescatan del catálogo y dejan **null** cuando no se sabe: null significa *"no
se sabe"* y prende el rescate; 0 significa *"regalado"* y lo apaga. Medido en el pedido real
(3 productos, $32.800): ganancia **$5.200**, y con el `costo:0` de antes **$32.800** — **x6,3**,
y encima con `completa:false`, o sea que el panel ni siquiera sabía que no sabía. En pantalla,
la fila *"Costo total $27.600"* del modal antes ni se dibujaba.

#### d) El cupón del pedido web se dibujaba "(-undefined%)"

`app.js` guarda el cupón del pedido como `{codigo, monto}` y nada más: el `porcentaje` vive en
el documento de `/cupones` —donde `renderCupones` lo lee bien—, no adentro del pedido. El
panel imprimía `_pedidoCupon.porcentaje` y salía `(-undefined%)`; peor, al guardar escribía
`porcentaje:null`, así que la **segunda** apertura decía `(-null%)`. La plata siempre estuvo
bien: manda el monto. Se sacó del render y del guardado.

#### e) Convertir un pedido web recotizaba el envío con la tarifa de hoy

`convertirPedidoEnVentaDesdeModal` no leía `p.envio`: sólo arrastraba `p.tipoEntrega`, y
`calcularTotalesVenta` volvía a cotizar con `ENVIO_PRECIO` y `ENVIO_GRATIS_DESDE`, **los de
hoy**. La protección ya existía —es la que respeta el envío al editar una venta vieja— pero
estaba atada a `editingVentaId`, que en la conversión entra en null.

Así que subir el envío de $2.000 a $3.000 le cambiaba el precio **solo** a todos los pedidos
sin facturar, y el ticket salía con un total distinto del que el cliente confirmó y tiene por
escrito en el teléfono.

Medido de punta a punta: con el pedido guardado en $2.000 y la tarifa del día en $3.000, la
venta se registró con **envío $2.000 y total $34.800** —el mismo que vio la clienta— y el
comprobante A4 en pantalla lo imprime igual. Si se cambia el tipo de entrega a retiro, ahí sí
recotiza (envío $0), porque ahí el envío cambió de verdad.

De paso: las asignaciones `window._pedido*` estaban **después** de `renderVentaItems`, que es
quien dibuja el total, así que la primera pantalla salía sin el cupón tampoco. Se movieron
antes del render.

#### f) Las estadísticas se olvidaban de los pedidos entregados

`totalesMes` contaba `'confirmado'` y `'cancelado'`. `'cancelado'` **no lo escribe ningún
flujo** (rama muerta e inofensiva); el que sí se escribe —y es el estado final normal de un
pedido cumplido— es `'entregado'`, y estaba afuera de las dos ramas. Cada pedido entregado se
caía del contador de confirmados y aparecía en **"Sin resolver", en amarillo**. O sea: cuanto
mejor trabaja el negocio, peor se veía la conversión.

Medido en la pantalla de estadísticas: *Recibidos 1 · Confirmados 1 · Sin resolver 0 ·
100%*. Antes: Confirmados 0, Sin resolver 1, 0%.

#### g) Los productos sin código no se podían editar

El formulario hacía `c.value = p ? (p.codigo || '') : sugerirCodigoProducto()`: sugerir un
código era sólo para productos **nuevos**. Los **2 productos que hay hoy en producción** son
anteriores al merge de la venta por peso y no tienen `codigo`, así que abrían el campo
**vacío** y `saveProduct` los rechazaba con *"El código no puede quedar vacío"* — sobre un
input cuyo placeholder dice *"Se completa solo"*. La tienda los vende bien y el importador los
ve bien: lo único roto era editarlos a mano.

Medido en el panel: los dos abren con un código sugerido y guardan sin error; guardar el
primero como `P-0004` hace que el segundo pase a sugerir `P-0005`, sin choque. El producto que
sí tiene código (`P-0003`) no se toca.

**Thiago construyó encima** (`0de2df7`): el mismo campo ahora avisa **mientras se escribe**
—en rojo si el código ya lo usa otro producto, diciendo cuál; en amarillo si se va a cambiar—
y el buscador de la venta encuentra por código propio. Ese chequeo mira sólo `allProducts`,
que es instantáneo y no cuesta lecturas; la validación contra la base sigue estando al
guardar, que es la que manda. Cubierto por los casos nuevos de `t-codigo-editar.js`.

#### h) `clienteWeb` — el único de los siete que no era nada

Se lee en cuatro lugares del panel y no lo escribe nadie en todo el repo, pero siempre cae al
`|| p.cliente`, que trae lo que la persona tipeó. **No se pierde nada.** Se dejó como está:
sacarlo son cuatro ediciones sin ningún beneficio.

Cubierto por `pruebas/t-pedido-estado.js` (34 asertos), `t-pedido-modal.js` (29),
`t-venta-envio.js` (19), `t-stats-entregado.js` (15) y `t-codigo-editar.js` (15).

#### i) La segunda vuelta: lo que estos mismos arreglos rompieron

Los arreglos de arriba pasaron por una **pasada adversarial** que buscaba justamente lo que
hubieran roto, y por abrir la página. Entre las dos aparecieron **seis cosas más**. Cuatro
eran regresiones de esta misma tanda: el arreglo estaba a medio camino y había que
terminarlo. Están todas arregladas y cubiertas por `pruebas/t-pedido-regresiones.js`
(39 asertos), que **falla en 19** contra la primera versión de estos arreglos.

- **El destino se perdía al derivar a facturar.** La guarda nueva manda a facturar, pero
  `saveVenta` escribía `estado:'confirmado'` con un **literal**: pedir *Entregado* terminaba
  dejando la tarjeta en *Confirmado*. Había que repetir el gesto entero y nada lo avisaba, y
  el cliente veía "Confirmado" en Mis Pedidos —que escucha con `onSnapshot`— sobre algo que
  ya tenía en la mano. Ahora el destino viaja en `window._pedidoEstadoDestino`.
  **Ojo con este**: el primer intento de arreglarlo *no funcionó*, y las pruebas decían que
  sí. `convertirPedidoEnVentaDesdeModal` llama a `openVentaModal()`, que es justo donde se
  limpian los `window._pedido*`: el destino se borraba antes de que `saveVenta` lo leyera.
  La prueba no lo veía porque seteaba el destino a mano y salteaba ese paso. **Lo cazó abrir
  la página.** Es exactamente la clase de bug que este archivo ya documenta en §4.
- **`deleteVenta` bajaba a `pendiente` un pedido ya ENTREGADO.** Borrar la venta para
  rehacerla con otro medio de pago le retrocedía dos casilleros a mercadería que ya salió del
  local, y al cliente le cambiaba la etiqueta en vivo. Ahora sólo vuelve a pendiente si
  todavía no se entregó; si ya se entregó, se le saca el `ventaId` y se lo deja donde está
  —el botón *"Convertir a venta"* vuelve a aparecer igual, porque ahora sólo se esconde por
  tener venta—.
- **Y el historial afirmaba "liberado" aunque el update hubiera fallado**, o aunque el pedido
  ya no existiera. Es la misma forma de mentir que ya costó mercadería en `kanbanDrop`. Ahora
  el pedido se **lee** antes de escribirle —así tampoco se le manda un `update` a un documento
  borrado, que tiraba `NOT_FOUND`— y el detalle dice lo que pasó.
- **El envío congelado pisaba el ENVÍO GRATIS del propio negocio.** Si el admin agregaba
  mercadería en el mostrador y el pedido cruzaba el mínimo, se le seguía cobrando el flete.
  Congelar el envío está para no cobrarle **más** de lo que confirmó, nunca para cobrarle algo
  que según la regla del negocio hoy no se paga.
- **`openVentaModal` no soltaba `_pedidoOrigenVentaId`** (sólo lo hacía `closeVentaModal`), y
  **Escape** cierra el modal sacándole la clase `show` sin pasar por ahí (`admin-atajos.js`).
  Convertir un pedido, arrepentirse con Escape y después cargar una venta de mostrador la
  guardaba como origen `web` colgada de aquel pedido, y le marcaba el pedido como confirmado
  con la venta equivocada. Este ya estaba de antes; se arregló porque es una palabra en una
  línea que igual había que tocar.
- **La conversión también escribía `costo:0`** cuando el producto tiene costo 0 en el catálogo
  —un estado que el propio panel rastrea con la pantalla *"Productos sin costo"*—. Es el mismo
  0-que-apaga-los-rescates de (c), por la otra puerta. Ahora deja `null`.

### h10 — guardar un pedido web desde el modal recotizaba el envío

Lo encontré midiendo en el navegador, y **anulaba el arreglo del envío de (e)**.
`calcPedTotales` nunca miraba `p.envio`: guardar un pedido web desde el modal —aunque fuera
sólo para elegirle el cliente— lo recotizaba con la tarifa de **hoy** y lo escribía encima
del que el cliente confirmó. Y como la conversión a venta después lee `p.envio`, alcanzaba
con abrir y guardar el pedido **una sola vez** para perder la protección.

Medido: pedido guardado en $2.000, tarifa del día $3.000 → el documento quedaba en **$3.000**.
Ahora queda en $2.000, y si el admin agrega mercadería y cruza el mínimo, pasa a $0. Un
pedido nuevo cargado desde el panel sigue cotizando con la tarifa de hoy, como corresponde.

### h9 — /admin deslogueaba al cliente de la tienda · ARREGLADO

`admin.html` hacía `auth.signOut()` a cualquiera que no fuera admin, y **/admin y la tienda son
el mismo origen**. Firebase comparte la sesión entre pestañas, así que un cliente que abría
/admin por curiosidad **quedaba deslogueado de la tienda en todas sus pestañas**, en silencio,
con el carrito armado y sin entender qué pasó.

Medido en el navegador antes del arreglo: con `ana.cliente@gmail.com` logueada y con su pedido
hecho, abrir /admin dejó `currentUser` en `null`.

Impedirle **entrar al panel** es correcto; cerrarle la sesión de la tienda no. Ahora se muestra
el cartel y no se toca la sesión: el dashboard sigue oculto y las reglas no le dejan leer nada,
que es lo único que hay que impedir. El cartel lleva un **"Salir de esta cuenta"** para el caso
contrario —un admin que entró con la cuenta equivocada y necesita cambiarla—, que antes lo
resolvía el `signOut()` automático.

Cubierto por `pruebas/t-panel-cierres.js`.

### Tanda 6 — los tres que quedaban de la auditoría

> **Estado: hecha y probada.** Toca `admin.html`, `admin-stats.js` y `functions/index.js`.
> Esta sí **necesita redesplegar una function**:
>
> ```bash
> git push origin main
> firebase deploy --only functions:descontarStockPedido
> ```

- **`devolverStockPedido` decidía con la copia en memoria.** La guarda
  `if(!pedido||!pedido.stockDescontado)return false;` miraba el objeto que le pasaban (de
  `pedidosData`) y recién después abría la transacción. Dos agujeros: un doble click alcanzaba
  para devolver la mercadería **dos veces**, y con `pedidosData` vacía —entrar derecho a
  Pedidos la deja así— el pedido llegaba en `null`, devolvía `false`, y `deletePedido` borraba
  el pedido **sin devolver una sola unidad**. Ahora todo se decide adentro del
  `runTransaction` sobre el documento vivo, con todas las lecturas antes de la primera
  escritura.
- **`stockFaltante` ya dice la unidad.** El aviso decía *"Nueces (pidió 250, había 100)"* para
  un producto a granel: los números estaban bien, pero 250 gramos se leen como 250 paquetes.
  La function guarda `tipoVenta` y el panel lo dibuja con `fmtPeso()`.
- **El ranking ya no suma gramos con unidades.** El **orden** siempre fue por monto y estaba
  bien; lo único mal era cómo se decía la cantidad: 300 g figuraban como `300u`. Ahora dice
  `300 g`, `1,5 kg` o `2u` según cómo se venda, y los dos juntos si a un producto le cambiaron
  la forma de venta a mitad de mes.

Cubierto por `pruebas/t-panel-cierres.js` (26 asertos), los casos nuevos de
`t-stats-entregado.js` y los casos 9h/9i de `test-funcion-precios.js`. Contra el commit
anterior fallan 13 asertos y una suite no arranca.

---

### Lo que queda de la auditoría y NO se tocó

- `rateLimitPedidos` sigue usando `creadoEn`, que lo elige el cliente. Cerrarlo pide
  `request.resource.data.creadoEn == request.time` en la regla, y eso no se puede
  probar con el arnés actual (manda un timestamp concreto, no un transform), así que
  no se agregó a ciegas.
- `config/pedidosCount` con un `count` guardado como texto deja a todos los clientes
  sin poder comprar: el cliente lo tolera con `parseInt`, la regla no. Sólo pasa si
  alguien lo edita a mano desde la consola de Firebase.

Los otros tres que estaban acá —`devolverStockPedido` decidiendo con la caché,
`stockFaltante` sin `tipoVenta`, y el ranking sumando gramos con unidades— **ya están
hechos**: son la tanda 6.

## 4. Cómo verificar que no rompiste nada

```bash
npm test          # 752 pruebas, 29 suites — no necesita nada instalado
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

**Una clase o variable CSS que no existe no da ningún error.** El navegador ignora
la clase y el elemento se dibuja sin estilo; nadie se entera hasta que alguien mira
la pantalla. Aparecieron once así: `.card` (la sección Caja entera sin fondo),
`.modal-footer` y `.modal-body` (los botones de los nueve modales apilados),
`.insumo-usado-row`, las cinco de la tarjeta de venta mayorista, `.spin`,
`.cat-hidden` (el botón de filtros de la tienda no ocultaba nada) y `--accent-dark`.

Las **variables** son peores que las clases: `background: var(--no-existe)` no cae a
un valor por defecto, **invalida la declaración entera** y la propiedad toma su valor
inicial. Eso fue `--accent-dark`: el botón seleccionado de los toggles quedaba
transparente y el control parecía no existir.

`check-admin.js` ahora compara lo que se **usa** contra lo que se **define**, en el
panel, sus ocho módulos, la tienda y las cuatro páginas sueltas, y corta el build.
Si aparece una clase que de verdad no necesita estilo —un marcador que solo lee el
JS— va a `CLASES_SIN_ESTILO_PROPIO` con su motivo; las que el JS nombra en un
selector (`querySelector('.x')`, `:not(.x)`) las detecta solo.

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

**El emulador de functions rompe `admin.firestore.FieldValue`, y no es culpa de este código.**
`functionsEmulatorRuntime.js` intercepta `admin.firestore` y devuelve `value.bind(target)`, y
`bind()` se lleva puestas las propiedades estáticas: adentro del emulador `FieldValue` queda
`undefined`. En el runtime desplegado funciona perfecto. Para ensayar en local hay que
parchear `functions/index.js` con `const _FV = require('firebase-admin/firestore').FieldValue`
—la importación modular no pasa por ese proxy— y **acordarse de revertirlo antes de commitear**.

**`innerText` devuelve vacío en el panel del navegador.** Depende del layout, y el panel no
compone frames: `screenshot` y `read_page` fallan con viewport 0x0 y `innerText` da `''`
aunque el texto esté ahí. Usar `textContent` y `javascript_tool`. Y el popup del emulador de
Auth secuestra el tabId: trabajar con **una sola pestaña**.

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
10. **El redirect que le mata el `opener` al popup** ← el más urgente, porque rompe el
    login entero. En `authLogin`, sacar `auth/cancelled-popup-request` y
    `auth/popup-closed-by-user` de la lista de `necesitaRedirect` —el primero significa que
    hay otro popup vivo, el segundo en escritorio es la persona cerrándolo— y agregar un
    candado de "un login a la vez". Está explicado en §1g. Cubierto por
    `pruebas/t-login.js`, que también se puede portar entero.
11. **Toda la tanda 5.** Nada de eso depende del granel, así que aplica aunque YERCO no
    tenga venta por peso. Las tres que más plata cuestan:
    - el modal de estado dejando entregar un pedido web **sin registrar la venta** (buscá
      si `aplicarEstadoPedido` mira `ventaId`, y si la guarda del tablero pide el destino
      `'confirmado'` en vez de preguntar por la venta);
    - `costo:0` al abrir y guardar un pedido web, que convierte la ganancia en facturación
      (buscá `costo:i.costo||0`);
    - la conversión a venta recotizando el envío con la tarifa de hoy (buscá si
      `convertirPedidoEnVentaDesdeModal` lee `p.envio` en alguna línea).
    Y las tres baratas: `deleteVenta` sin liberar el pedido, el cupón `(-undefined%)`, y
    `'entregado'` afuera del contador de pedidos confirmados en las estadísticas.

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
