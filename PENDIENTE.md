# Brotes Dietética — estado y pendientes

> Actualizado: 27/08/2026. Reemplaza la versión anterior de este archivo.
> No se publica: `.vercelignore` excluye todos los `*.md`.

**El software está terminado.** Lo que falta para entregar no es programar: es cargar
el negocio adentro y probarlo una vez de punta a punta.

| | |
|---|---|
| Código | terminado, desplegado, producción al día |
| Pruebas | 278 en 12 suites, todas verdes (`npm test`) |
| Panel | 20 secciones cargando sin un solo error de consola |
| Infraestructura | reglas de Firestore y Storage, índices, 10 Cloud Functions, bot de Telegram |
| **Datos** | **prácticamente vacíos — ver abajo** |

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

Un cliente que entre hoy a la tienda ve **un producto**. Para cargar en tanda está
**Productos → Importar Nuevos** (Excel).

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

## 3. Cómo verificar que no rompiste nada

```bash
npm test          # 278 pruebas, 12 suites
npm run build     # corre check-admin.js y luego minifica
```

`npm run build` **falla y corta el deploy** si el JS de `admin.html` revienta al
cargar **o si el HTML queda desbalanceado** en cualquiera de las seis páginas. Eso es
a propósito: Vercel lo ejecuta al desplegar, así que algo roto hace fallar el deploy
en vez de salir al aire.

Del HTML controla dos cosas: cierres que no cierran nada y aperturas que nunca
cierran (con archivo y línea), y que ninguna sección del panel quede adentro de otra
—que es cómo se manifiesta un cierre de más y lo que rompe `switchSection`.

**Lo que las pruebas NO pueden ver.** Cada suite saca la función del archivo y la
corre aislada, así que no se entera si en el navegador **otro módulo la reemplaza**.
Pasó: `admin-pagination.js` no envuelve a `renderStockList`, la **reimplementa entera**
y nunca llama a la original — la selección múltiple de Stock no andaba aunque las 33
pruebas pasaban. **Lo visual y lo que depende del orden de carga hay que verificarlo
abriendo la página.**

---

## 4. Trampas de este código (todas costaron un bug)

**`admin.html` tiene su JavaScript adentro, en un bloque de ~4.700 líneas.** Si una
sola línea tira un error al cargar, el navegador abandona el bloque entero ahí mismo.
Las funciones sobreviven porque las declaraciones `function` se hoistean —así que la
página parece sana— pero todas las declaraciones `let`/`const` posteriores quedan sin
inicializar. Un error en la línea 1750 rompe las 2.900 que siguen.

**`node --check` no alcanza.** Un `async` que quedó colgado al sacar una función es
sintaxis válida (`async` es un identificador) y explota recién al ejecutar. Para eso
está `check-admin.js`.

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

---

## 5. Referencia rápida

| | |
|---|---|
| Proyecto Firebase | `brotesdietetica-2f78e` |
| Producción | https://brotesdietetica.vercel.app |
| Repo | https://github.com/ObregonJeronimo/brotesdietetica |
| Dueño | `jeroobregon03@gmail.com` — en `config-negocio.js` (`NEGOCIO.mailDuenio`) **y** en `firestore.rules` y `storage.rules`. Las reglas no pueden leer ese archivo: ese literal es la salida de emergencia si `/admins` quedara vacía. **Si cambia el dueño hay que tocar los tres.** |
| Quién entra al panel | colección `/admins` — se maneja desde Configuración → Quién puede entrar |
| Tope de Storage | 5 GB, con el medidor en la barra lateral |

**Cloud Functions (10):** `notifyTelegramOnNewOrder`, `procesarUsoCupon`,
`rateLimitPedidos`, `sanitizarPedido`, `sincronizarClaimAdmin`,
`aplicarClaimAlIngresar`, `descontarStockPedido`, `sumarUsoStorage`,
`restarUsoStorage`, `recalcularUsoStorage`.

Las tres de pedidos corren en `southamerica-east1`; las dos de Storage en `us-east1`,
que es donde vive el bucket (en otra región el deploy las rechaza).

---

## 6. Lo que se hizo (referencia — no hay que repetirlo)

**Bugs graves cerrados:** el checkout que fallaba en silencio · la ganancia por
cliente que mostraba facturación como margen y aplicaba el descuento dos veces · un
pedido borrado por rate-limit que se llevaba el stock sin dejar rastro · escribir
`20.000` guardaba `20` · la venta mayorista era imposible · un producto con apóstrofo
no se podía borrar · guardar el Editor Web rompía la portada de un click · volver un
pedido a pendiente borraba la venta sin devolver stock · XSS almacenado · Vercel
publicaba el repo entero con los mails de los admins.

**Funcionalidad nueva:** caja y arqueo · estadísticas con calendario · lector de
códigos de barras · atajos de teclado · formatos de papel · administración de admins
desde el panel · carga de stock en tanda · medidor de almacenamiento con tope ·
validación de precios bajo costo del lado del servidor.

**Costos de Firestore:** la tienda y el panel leían colecciones enteras en cada
visita; guardar un producto releía los 3.000. Todo acotado.

El detalle de cada uno está en los mensajes de commit, que explican el problema antes
que la solución. `git log` es la mejor documentación de este proyecto.
