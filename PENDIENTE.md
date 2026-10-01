# Brotes Dietética — estado y pendientes

> Actualizado: 18/09/2026.
> No se publica: `.vercelignore` excluye todos los `*.md`.

**El software está terminado.** Lo que falta para entregar no es programar: es cargar
el negocio adentro y probarlo una vez de punta a punta.

| | |
|---|---|
| Código | terminado, desplegado, producción al día |
| Pruebas | 1875 en 55 suites (`npm test`) + 55 contra las reglas de verdad (`npm run test:reglas`) |
| Panel | 20 secciones cargando sin un solo error de consola |
| Infraestructura | reglas de Firestore y Storage, índices, 10 Cloud Functions, bot de Telegram |
| **Datos** | **1488 productos, 28 listas, 30 categorías.** Los 615 del catálogo original + los 873 de FRUTICOR-TODOS, migrados de YERCO el 07/09 (§1-bis A). **Ninguno en $0**: los 373 que faltaban se cargaron el 08/09 (§1-bis I) |
| Último deploy | al día. Vercel despliega solo con `git push origin main`; las functions y las reglas no cambiaron desde el 27/08 |

**Del 28/08 al 04/09 entraron 27 commits**, casi todos de Thiago: compras con lector de
código de barras, remitos, la pantalla de proveedores con lista a la izquierda y detalle a
la derecha, límite de stock bajo separado para envasado y suelto, exportaciones, dos
arreglos de seguridad en el borrado de archivos, y el Brandbook 2025 (paleta, tipografías y
logos). De acá salieron el rediseño de la barra de listas de proveedores y el arreglo de
sus contadores (§3, tanda 7).


## 0. LO QUE SIGUE, EN ORDEN (al 21/09/2026)

Sistema **entregado y en uso diario**. Esta lista es por donde seguir.

1. **Lectores de otras marcas** (§1-bis H) — ya no está bloqueado. Llegó la captura del
   lector de otra PC (22/09) y **no era la velocidad**: 13 dígitos a 16 ms —el umbral son
   40— y **ningún Enter**. Esa pistola no tiene sufijo configurado, y el panel solo
   procesaba el código dentro del `if (e.key === 'Enter')`, así que en esa PC no andaba
   nada, en silencio. Resuelto el 22/09: **cierre por silencio**, **Tab también como
   terminador** y **`e.code` en vez de `e.key`** para los dígitos. Lo que sigue acá es
   medir un lector más lento que 40 ms, si alguna vez aparece uno: hoy las dos pistolas
   medidas dan 16 ms, así que bajar el umbral sería programar contra algo que no se vio.
2. **Cargar los códigos de barras.** Hoy `codigoBarras` está cargado en **1 solo producto
   de 1.312**: el único escaneo que funciona es el de las etiquetas que imprime el local,
   que llevan el código interno. El lector ya busca en los dos campos y la validación
   cruzada ya está puesta (21/09), así que se pueden cargar sin miedo a choques.
3. **Ticket térmico después de la venta** (`SPEC-ROLES-TICKET.md` §B) — ✅ **HECHO** (21/09).
   - ✅ **El papel** (`admin-ticket.js`): `ticketDocumento(venta, cfg)` arma el
     comprobante con lo que quedó **guardado** en la venta -reimprimir una de marzo da el
     mismo papel que salió en marzo-, a granel muestra kg y `/kg`, el vuelto sale solo en
     efectivo, y el ancho 58/80 mm cambia el cuerpo de la letra.
     `pruebas/t-ticket.js`, 27 asertos.
   - ✅ **El diálogo** "¿Imprimir ticket?": sale al cerrar el modal de venta, con
     `Imprimir` enfocado -la venta se cierra con un Enter y el ticket sale con otro-,
     ←→ para elegir, `Esc` = no imprimir, y el foco no se escapa con Tab.
     **El Enter de la pistola NO lo contesta**: `admin-lector.js` ahora marca el evento
     cuando el Enter lo mandó una ráfaga (`enterDeRafaga()`) y `admin-dialogo.js` se
     niega a resolver con ése. Vale para **todos** los diálogos del panel, no solo el
     ticket: un lector apoyado sobre el gatillo tampoco puede contestar "¿Eliminar?".
     Y con un diálogo abierto, escanear ya no sigue de largo por debajo.
   - ✅ **Configuración → Impresión**: ancho (58/80), tipo de rollo, pie y qué hacer
     después de cada venta (preguntar / directo / no). Con el aviso de frente y con esas
     palabras: el navegador **no elige la impresora**, eso lo hace el cuadro de Windows;
     para que no aparezca en cada venta hay que dejar la térmica como predeterminada y
     abrir Chrome con `--kiosk-printing`, que es un paso de instalación en el local.
   - ✅ **Reimprimir** desde la lista de ventas (botón *Ticket* en cada venta), con los
     precios de **esa** venta y `logAction('imprimir', ...)`.
   - Pruebas: `pruebas/t-ticket-dialogo.js`, 39 asertos (17 de ellos fallan contra el
     commit anterior). Banco para verlo a mano: `pruebas/ticket-banco.html`.
   - **Pendiente chico**: el ticket no muestra vuelto en las ventas nuevas porque la
     venta no guarda **con cuánto paga** el cliente; el papel ya lo sabe imprimir si el
     campo aparece. Y el ticket sale en la venta minorista, no en la mayorista.
4. **Roles por empleado** (`SPEC-ROLES-TICKET.md` §A): tocan reglas, una Cloud Function y
   las 17 secciones. Después del ticket.
5. **Decidir qué pasa con la sección Etiquetas** (queda abierto desde el 21/09). La
   ficha del producto ya NO usa el código interno como código de barras, pero la
   sección **Etiquetas** sigue imprimiendo la etiqueta del local, que es un EAN-13
   derivado del código interno con prefijo `2`. No es lo mismo: es para ponerle una
   etiqueta escaneable a lo que **no trae ninguna** -lo que el local envasa-. Si se
   saca, hay dos consecuencias y conviene decidirlas a mano:
   - los **1.311 productos sin código de barras** se quedan sin etiqueta imprimible;
   - las etiquetas **ya pegadas en las bolsas** dejan de escanear, porque el lector las
     decodifica con `etiquetaProductoDe()`.
6. **Limpiar los 4 nombres repetidos que quedan en producción** (medido el 21/09).
   Dentro de la MISMA lista, o sea que casi seguro sobra uno: `PRODUCTO PRUEBA`
   (002022 y 002023, los de la prueba del dueño), y en FRUTICOR-TODOS
   `CACAO AMARGO CALIDAD EXTRA X 1 KG` (000093 y 001224),
   `CHIPS DE CHOCOLATE SEMIAMARGO X 500 GR` (001168 y 000112) y
   `AVENA INSTANTANEA X 5 KG` (000764 y 000059). Hay que mirar cuál tiene stock y
   ventas antes de borrar. El de dos listas distintas -`CANELONES`- se deja: es
   legítimo. El informe de repetidos del panel los muestra.
7. **34 productos del reporte viejo que Brotes no tiene** (§1-bis I).
8. **Poner una alerta de presupuesto de USD 5** en Google Cloud → Facturación. Firebase
   está en Blaze, **sin tope y sin ninguna alerta**.
9. **Revisar en qué plan está Vercel.** Hobby es *non-commercial only* y Brotes vende.
10. **Que el agrupamiento de gramajes ande** (§1-bis C): los datos están, el código no.
11. **Portar a YERCO** lo de §6. **YERCO se toca desde su propia sesión, no desde acá.**

### Para el chat DEFT (repo base y alta de clientes con banderas)

- **El panel no guarda quién carga cada producto.** No existe `creadoPor` ni `usuario` en
  los 1.312 documentos de `productos`; se buscó uno por uno. Por eso, para separar lo que
  cargó el comercio de lo que cargamos nosotros, hubo que deducirlo por el rango de
  código. El `historial` sí registra el mail de cada acción, pero eso obliga a un cruce.
  En el repo base, `creadoPor` en el producto tiene que venir de fábrica.
- **Ningún archivo compartido con YERCO es idéntico**, ni siquiera los de mismo tamaño.
  El análisis completo (qué módulo va a bandera, qué es dato del cliente, y por qué
  conviene que la base sea Brotes) está en la conversación del 18/09.
- **Un puerto por cliente en `dev-server.js`.** Brotes y YERCO usan los dos el 5173 por
  defecto: el 18/09 el banco terminó midiendo el panel equivocado sin avisar.

### Hecho el 22/09

- **La pistola de otra PC no hacía funcionar nada** y el motivo no era el esperado: no
  manda **Enter**. Medido con `pruebas/lector-diagnostico.html`. Tres cambios en
  `admin-lector.js`, los tres aditivos —con una pistola que sí manda Enter no cambia
  absolutamente nada—:
  - **Cierre por silencio**: si venían teclas en ráfaga y después pasan 60 ms sin nada,
    eso ya fue una máquina. Sin terminador se exige más —**6 dígitos y solo dígitos**—
    porque no hay Enter que confirme.
  - **Tab también cierra la lectura**, que es el otro sufijo común. Solo si hay ráfaga
    en curso: un Tab suelto sigue navegando el formulario.
  - **`e.code` en vez de `e.key`** para los dígitos: es la tecla **física**, no depende de
    la distribución de teclado de Windows. Con Shift no se usa, porque ahí el símbolo es
    a propósito.
  Trampa cubierta: una **tecla mantenida** apretada se repite cada ~30 ms —una ráfaga
  metronómica perfecta— y entraría como escaneo; se descarta con `e.repeat`.
  `pruebas/t-lector-sin-enter.js`, 22 asertos, con la captura real tecla por tecla.
  Verificado además con eventos de teclado **reales** en el navegador.
- El **diagnóstico** ahora registra las teclas con Ctrl/Alt en vez de tirarlas (una
  pistola en otra distribución era invisible para él, igual que para el panel), muestra
  **con qué termina** la lectura y entiende el cierre por silencio.

### Pendiente para Deft

- **Calibración del lector en el panel** (Configuración → Lector): escanear una vez y que
  el panel **mida y guarde** el perfil de esa pistola —velocidad, terminador, prefijo— en
  `config/lector`. Es lo que ya hace `lector-diagnostico.html`, movido adentro y
  guardado. Deja de ser heurística y pasa a ser un paso de instalación de 20 segundos
  por cliente, con resultado visible. Conviene guardar **también el prefijo**: es el
  mismo trabajo y abre el modo exacto para quien configure la pistola bien.
- **Los códigos de sufijo Enter de los modelos comunes**, en el manual de puesta en
  marcha. Aunque el panel tolere que no venga, configurar la pistola sigue siendo lo más
  confiable y es gratis.

### Hecho el 21/09

- **Dos productos podían tener el mismo nombre interno** y el panel no decía nada
  (lo encontró el dueño cargando uno desde una venta). Quedaban dos fichas para lo
  mismo -dos precios, dos stocks, dos lugares donde tocar cuando cambia el costo- y el
  buscador del modal de venta busca **por nombre**, así que en el mostrador salen dos
  renglones idénticos y se elige a ciegas.
  **No se bloquea a secas**, porque medido en producción (solo lectura, 1.313 productos)
  hay 5 grupos repetidos: 4 en la misma lista y 1 entre listas distintas -CANELONES-,
  que es legítimo, porque al mismo producto se le puede comprar a dos proveedores.
  Entonces: **misma lista** no se guarda y se dice con cuál choca; **otra lista** se
  pregunta y se puede seguir; y el que **ya venía repetido** se guarda avisando, porque
  si no los tres que hoy están repetidos (CACAO AMARGO, CHIPS DE CHOCOLATE, AVENA
  INSTANTANEA) no se podrían ni editar para corregirles el precio. Renombrar uno
  *sobre* otro que ya existe sí se bloquea.
  Además avisa **en vivo** debajo del campo, como ya hacía el código. Mismo criterio
  que el informe de repetidos (`claveProducto`), así los dos dicen lo mismo.
  `pruebas/t-nombre-repetido.js`, 39 asertos.
  **Quedan 4 repetidos en producción para limpiar a mano** (ver punto 6).
- **Crear un producto en el medio de una venta abre la ficha DETRÁS de la venta**
  (lo probó el dueño escaneando de verdad). Todos los `.modal-overlay` comparten
  `z-index: 200`, así que desempata el orden del HTML, y ahí `productModal` está
  **antes** que `ventaModal`: la venta pinta encima y parecía que el botón no hacía
  nada. Ahora la ficha se **levanta** cuando se abre sobre una venta, una venta
  mayorista o una compra; **no se cambia de sección** -al cerrarla se vuelve a la venta,
  que sigue ahí-; y al guardar, **el producto entra solo** a lo que estaba abierto, sin
  el paso de volver a escanear. `closeModal()` devuelve la ficha a su nivel y olvida el
  destino, por si se canceló.
  `pruebas/t-crear-desde-venta.js`, 27 asertos (18 fallan contra el commit anterior).
  Banco: `pruebas/capas-banco.html`, que le pregunta al navegador cuál de los dos
  modales está adelante -antes: la venta; ahora: la ficha-.
- **El preview de la ficha mostraba el código interno como si fuera el código de
  barras.** Un producto con código `002022` y el campo de barras vacío dibujaba el
  símbolo `2000000020228` -el EAN que el sistema deriva del interno-, así que los 1.311
  productos sin código de barras aparentaban tener uno; y al cargar el de verdad el
  dibujo **no cambiaba**, porque dependía del otro campo. Ahora el símbolo sale de
  `codigoBarras` y de nada más (`codigoBarrasDe()`): sin él se ven **trece ceros** y no
  se puede imprimir. Se redibuja al escribirlo, al escanear el envase con la ficha
  abierta y al abrir la ficha. Un código cuyo verificador no cierra se ve pero tampoco
  se deja imprimir, porque ninguna pistola lo lee.
  **No hubo que tocar ningún dato**: el preview se calcula, no se guarda, así que el
  arreglo vale para los 1.312 productos de una vez.
  `pruebas/t-codigo-barras-ficha.js`, 38 asertos (30 fallan contra el commit anterior).
  Banco: `pruebas/codigo-barras-banco.html`.
- **Ticket térmico, completo** (`admin-ticket.js`): el papel, la pregunta después de
  cobrar, Configuración → Impresión y el reimprimir desde la lista de ventas. Ver el
  punto 3 de arriba. De paso quedó arreglado algo que era del panel entero y no del
  ticket: **la pistola podía contestar cualquier diálogo**. El Enter de una ráfaga llega
  a la página igual que el de una persona, y `stopPropagation()` no frena a los otros
  handlers del mismo `document`; ahora el lector marca el evento y el diálogo se niega.
- **Datos, en producción** (solo lista `FRUTICOR-TODOS`, 720 documentos, con respaldo):
  656 productos al **65% de ganancia** mínima -578 con precio recalculado, y **78 con
  costo $0 a los que NO se les tocó el precio**, porque el reporte viejo traía precio de
  venta y no costo-, y **468 ocultados** por tener código mayor a `000684`, que es donde
  termina el reporte de Zoo Logic. Los **168 códigos propios** que viven en esa lista y
  los **35 que cargó el comercio** quedaron intactos.
- **La Arveja duplicada**: `57` y `000057` eran el mismo producto; el stock pasó al
  `000057` y el otro se borró.
- **Merge con origin**: las dos ramas venían de `de24553` (07/09). Se tomó origin como
  base y se re-aplicaron encima los cambios locales.

---

**Costos, medido el 14/09:** hoy **$0**. El gasto escala con las visitas a la tienda, porque
cada visita baja el catálogo entero (~1.500 lecturas, con caché de 3 minutos). Límite gratis:
50.000 lecturas/día; el peor día del mes fueron 50.505. Estimado: ~80 visitas/día ≈ USD 1/mes,
~300 ≈ USD 6, ~1.000 ≈ USD 20. Si alguna vez pasa las ~100 visitas diarias, el arreglo barato
es servir el catálogo desde **un solo documento** en vez de 1.491.

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

### b) ~~Cargar el catálogo~~ · **HECHO**

Entró entre el 28/08 y el 04/09: **611 productos, 27 listas de proveedor, 30 categorías**.
Era el último bloqueante de la entrega. La tabla de abajo quedó de cuando había un solo
producto; se deja como referencia de cómo se verifica el estado por API.

Estado de la base **cuando se escribió esa tabla** (27/08), no el de hoy:

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
> Cubierto por `pruebas/t-contadores.js` (27 asertos).

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

## 1-bis. LO QUE SIGUE (pedido el 04/09/2026)

### A) Traer los productos de FRUTICOR de YERCO a Brotes · **HECHO** (07/09/2026)

**Lo pedido:** copiar **todos** los productos de la lista `FRUTICOR` de YERCO a Brotes,
dentro de una lista **nueva** llamada `FRUTICOR-TODOS`. **No se borra ni se toca nada de las
listas que ya existen.** Todo completo —imágenes, descripciones, precios— **y las
asociaciones padre-hijo**.

**Entró el 07/09/2026.** El script vive en `migracion/` (ver su `README.md`): `dump.js`
baja los dos catálogos, `migrar.js --dry` deja el informe sin escribir, `--escribir` lo
aplica. Se corrió en seco cinco veces antes de escribir.

| | antes | después |
|---|---|---|
| productos | 611 | **1484** |
| listas | 27 | 28 (`FRUTICOR-TODOS` = `WFVxjmicGagEqSRAM117`) |
| archivos en Storage | 2 (~0 GB) | **895 (19,3 MB, 0,4% del tope de 5 GB)** |

**Auditado después de escribir, con un script aparte que no confía en el que migró:
reconstruye todo desde YERCO y compara. 47 controles, 0 fallaron.** Lo que probó:

- **Que no se tocó nada de lo que ya estaba.** Los 611 viejos, campo por campo (16 campos)
  contra el respaldo tomado *antes* de escribir: **ni uno cambió**, ninguno se borró.
- **Las asociaciones padre-hijo, reconstruidas desde YERCO por NOMBRE.** Los 153 vínculos,
  y **cada hijo apunta al mismo padre que en YERCO**; ninguno de más, ninguno roto, ninguno
  fuera de la lista, sin ciclos, y `padreNombre` diciendo el nombre real del padre. Es la
  única forma de probar que el remapeo de ids no cruzó padres.
- Los 2 `gramajePadreId` igual, y los **221 grupos** de gramajes con exactamente los mismos
  integrantes (`grupoId` es un id sintético `grp_...`, no un id de documento: no se remapea).
- **Los 873 uno por uno contra YERCO**: precio, costo, stock, categoría, descripción,
  valores nutricionales, gramaje, código de barras, porcentajes, descuento y popular.
- Códigos: los 1484 con código, **ninguno repetido en todo el catálogo**, ninguno pisó uno
  viejo.
- Imágenes: **ninguna apunta ya al bucket de YERCO**, mismos productos con imagen que allá,
  y 15 al azar abren con **HTTP 200**.

**Verificado también abriendo las páginas**, que es lo que las pruebas no ven:

- En la **tienda**: `PERA WILLIAM'S MEDIANAS x 5 Kg` se dibuja como **"$13.960 el kilo"**, y
  `subtotalCarrito` da **$6.980 por 500 g** y $13.960 por 1 kg — sin el x1000 de §5. Por
  unidad, 2 × $2.800 = $5.600.
- En el **panel**: 1484 productos, 30 categorías, **0 sin categoría**, 47 duplicados. El
  modal de envasado propio de `LASFOR ARITOS DE MIEL x 1 kg` muestra *"Padre actual: LASFOR
  ARITOS DE MIEL x 2 kg"*, y los precios cierran: el hijo de 1 kg a **$7.700/kg** y el padre
  de 2 kg a **$6.950/kg**, más barato por kilo por ser bulto más grande.

**Lo único que hubo que arreglar después de escribir:** 6 productos tenían `padreNombre` con
la grafía vieja del padre (`x 5 KG` cuando hoy se llama `x 5 Kg`, `-BLANCA-` por `-Blanca-`).
**Venía así desde YERCO** —renombraron al padre después de crear el vínculo— y se copiaba
tal cual. Como es el campo que muestra el panel, se corrigieron los 6 y el script ahora toma
el nombre del padre de verdad, no el que traía guardado.

#### Las tres decisiones, tomadas el 05/09

1. **Imágenes → se copian al bucket de Brotes.** El miedo era el tope de 5 GB; **medido, son
   18,9 MB** (893 archivos, los 893 encontrados en el bucket de YERCO). Brotes hoy tiene 2
   archivos y ocupa ~0 GB: después de copiar queda en **0,4 % del tope**. La copia es
   servidor-a-servidor y cada archivo estrena su token de descarga, así que las URLs quedan
   apuntando a Brotes y no dependen más del Storage de otro cliente.
2. **`codigo` y `tipoVenta` se generan.** Códigos de **6 dígitos con ceros adelante**
   siguiendo la serie real (607 de los 611 productos usan `######`, el máximo es `000684`):
   los nuevos van de `000685` a `001557`. **No** se usó `P-####`, que es lo que sugiere
   `sugerirCodigoProducto()` — manda lo que hay cargado, no lo que dice el código.
3. **`grupoId`, `grupoMascara`, `grupoOrden`, `grupoPrincipal` y `slug` se copian igual**,
   aunque hoy tengan 0 usos en Brotes. Es lo que pidió el dueño: *"que tenga las mismas
   asociaciones que YERCO tiene ahora"*. Copiarlos no cambia nada del funcionamiento y deja
   la puerta abierta; no copiarlos perdía el agrupamiento de gramajes de 658 productos.
   **Que esa función ande en Brotes es otra tarea** (§1-bis C).

#### Cómo se decidió el `tipoVenta` (el que podía costar plata)

En Brotes, **a granel el precio es POR KILO y el stock va en GRAMOS**. Marcar mal un
producto no da error de consola: da un precio mil veces corrido. Por eso se midió antes:

| medición | resultado | qué implica |
|---|---|---|
| stock de los 873 en YERCO | va de **1 a 100** (872 entre 1 y 99) | cuenta **bultos**, no gramos |
| granel que Brotes ya tiene | `ARROZ LARGO FINO x 1kg` stock **3760**, `BICARBONATO x 1 Kg` **6890** | la convención de la casa: **gramos** |
| cruce de precios | YERCO `MIJO PELADO x 2,5 Kg $7000` = **$2.800/kg**; Brotes vende `Mijo Pelado` a **$3.517/kg** | mismo orden, con margen: dividir por los kilos del bulto da el número correcto |

La regla que quedó: **el envase en KILOS es un bulto que el comercio abre y vende suelto
(`peso`); en gramos, cc, litros o unidades se vende como viene (`unidad`)**. Y un `peso`
**no se copia tal cual**: se divide `costo`, `precio` y `precioMayorista` por los kilos del
bulto, y se multiplica el stock por los gramos.

**Dos correcciones que salieron de medir, no de suponer:**

- **El dueño manda sobre la regla.** 47 de los 873 **ya están cargados en Brotes** (lista
  `FRUTICOR 1`) con su `tipoVenta` elegido a mano. Contrastada contra esos 47, la regla del
  envase **acierta 40 de 47**. Las 7 que falla son **de 500 gr que él sí vende sueltas**
  (canela en rama, anís estrellado, clavo de olor, chips de chocolate, almendra bañada) más
  una fécula de 1 kg que vende envasada. O sea: **el corte no es la unidad del nombre, es el
  producto**. Donde hay dato suyo se usa el dato; donde no, la regla del envase.
- **Un producto al que el proveedor le comió la unidad.** `MIX FRUT. SECOS CLASICO x 2,5`,
  sin "kg". No se adivinó por el nombre: se miró el `grupoId`, y sus hermanos (`x 1 kg`
  $16.000, `x 5 kg` $75.900) confirman que ese $39.300 son 2,5 kg. La regla exige además que
  el precio por kilo quede en el mismo orden que el de los hermanos. **Alcanza a 1 producto.**

**Resultado: 517 a granel, 356 por unidad.**

#### El ensayo en seco (05/09, no se escribió nada)

| | antes | después |
|---|---|---|
| productos en Brotes | 611 | **1484** (+873) |
| listas | 27 | 28 (+1) |
| código más alto | `000684` | `001557` |

| asociación | cuántas | huérfanas |
|---|---|---|
| `padreId` a remapear | 153 | **0** |
| `gramajePadreId` a remapear | 2 | **0** |
| `grupoId` | 658 | — es id sintético (`grp_...`), **no se remapea** |

Ejemplos de la conversión, que es donde está la plata:

```
PERA WILLIAM'S MEDIANAS x 5 Kg     5 kg    $69800 -> $13960/kg     11 ->  55000 g
SALVADO DE AVENA x 25 kg          25 kg    $53500 ->  $2140/kg     10 -> 250000 g
ARVEJA ENTERA x 1 Kg               1 kg     $1400 ->  $1400/kg      9 ->   9000 g
CANELA EN RAMA x 500 gr          0,5 kg    $37500 -> $75000/kg     10 ->   5000 g   (a granel porque él ya lo cargó así)
GALLETA ARROZ BAÑADA CHOC. x 88 gr   —      $2700 ->  $2700        10 ->     10     (unidad, sin conversión)
```

**Los 10 controles dan 0:** precio inválido, stock inválido o no entero, sin nombre, código
repetido entre los nuevos, código que choque con Brotes, formato de código, granel sin kilos
parseados, precio incoherente con el bulto (`precio/kg × kg` tiene que devolver el precio del
bulto), stock incoherente, y padres huérfanos.

#### Las dos decisiones que faltaban, resueltas el 07/09

1. **Los 47 duplicados entran OCULTOS.** Los 47 nombres que ya existían están **todos en
   `FRUTICOR 1`**, la carga parcial hecha a mano. `FRUTICOR-TODOS` entra completa con los
   873 —es lo que dice el nombre de la lista— pero esos 47 con `oculto: true`: si entraran
   visibles, el cliente vería la misma ficha dos veces y con **dos precios distintos**, el
   cargado a mano y el de YERCO. **No se tocó ninguno de los que ya estaban.** Quedaron
   **751 visibles y 122 ocultos** (85 que ya venían ocultos de YERCO + estos 47), y
   **0 duplicados visibles**.
   Para verlos hay una tarjeta **Duplicados** en Productos, al lado de "Sin Categoría", que
   los lista agrupados y separa *misma lista* (casi siempre sobra uno) de *listas distintas*
   (puede ser el mismo producto comprado a dos proveedores). El día que se limpie
   `FRUTICOR 1`, se destildan desde ahí.

2. **Las categorías de YERCO NO se copiaron: se tradujeron a las 30 del negocio.** Las 30 de
   Brotes son las que el comercio ya usaba; las 17 de YERCO son de otro comercio. Copiarlas
   dejaba al cliente con **47 categorías** en el filtro de la tienda y conceptos pisados
   (`FRUTAS SECAS` al lado de `Frutas secas y desecadas`).
   El mapeo (`migracion/categorias.js`) no se inventó: se midió contra los **47 productos que
   el dueño ya había categorizado a mano**, que son la única verdad disponible sobre cómo
   clasifica él.

   | método | acierto |
   |---|---|
   | por categoría sola | 68% |
   | por (categoría, **subcategoría**) | 74% |
   | + capa de palabras sobre el nombre | **94%** |
   | *(por nombre con tf-idf contra los 611 ya categorizados)* | *49% — peor; descartado* |

   Por categoría sola no alcanza porque él parte `CEREALES` entre *Cereales y copos* y
   *Golosinas*, y `REPOSTERIA` en cuatro. Las subcategorías de YERCO son justo lo que
   desambigua: `BARRITAS` es Golosinas, `INFLADOS` y `AVENAS` son Cereales y copos, y
   `REGIONALES Y OTROS` —que parecía un cajón de sastre— adentro trae `ENDULZANTES`,
   `MERMELADAS`, `LECHES VEGETALES`, `MIEL` y `PASTA DE MANI`, cada una con su categoría en
   Brotes. Resultado: **0 categorías nuevas**, los 873 entran en 21 de las 30 que ya
   existían, y sólo **6** caen en *General*.

   **La trampa del azúcar, que casi se escapa.** La primera versión de la capa de palabras
   marcaba como endulzante cualquier nombre con "azúcar" o "stevia": **94% sobre la muestra
   de 47**, pero mirando qué movía en los **873** se llevaba puestas ~40 fichas. Las
   `MERMELADAS C/STEVIA` se iban a Endulzantes en vez de Conservas y dulces, las
   `LECHES VEGETALES sin azúcar` también, y las `TABLETAS S/AZUCAR` igual. En esos nombres la
   palabra es un **descriptor** —dice que NO lleva—, no el producto. Ahora se exige que no
   venga precedida de `sin` / `s/` / `c/` / `con` / `bajo`, y "stevia" y "miel" quedaron fuera de
   la regla. **Eso no se ve en la muestra: sólo mirando el efecto sobre los 873.**

   La **subcategoría va en `null`**, igual que los 611 que ya tenía Brotes: **ninguno** usa
   subcategoría, y las 31 de YERCO son jerga de proveedor (`CEREALES LINEA LASFOR`,
   `PRODUCTOS CACHAFAZ`). No se pierde nada: quedan en YERCO y en `clasificacion.csv`.

#### Lo que queda abierto

- **Los de 500 gr que no estaban entre los 47.** La regla los dejó en `unidad`, que es lo
  conservador (no puede dar un precio x1000 mal). Si hay más que van sueltos, salen de
  `clasificacion.csv` filtrando por `envase de 500 g`, y se cambian desde el panel.
- **Limpiar `FRUTICOR 1`**, que quedó con sus 126 productos y 47 nombres pisados por la
  lista nueva. La tarjeta **Duplicados** es la herramienta.
- **Que el agrupamiento de gramajes ande** (§1-bis C): los datos están, el código no.

#### Para revertir

`migracion/mapa-ids.json` guarda el id de la lista y el mapa `idYerco → idBrotes`. Todo lo
creado vive en `FRUTICOR-TODOS` (`WFVxjmicGagEqSRAM117`), así que alcanza con borrar los
productos de esa lista y la lista. Las imágenes copiadas quedan en el bucket (19,3 MB) y se
borran aparte si molestan. El script se planta solo si la lista ya existe, para no duplicar.

### B) El botón PDF Semanal: una sola lista, elegida en su propio modal · **HECHO** (05/09/2026)

Salió en `7fef2f0`. El botón no se tocó: sigue siendo el de YERCO. Cambió sobre qué lista
trabaja y cuándo aparece.

**Lo que estaba mal, medido:**

- El modal traía un desplegable con **"Todas las listas"** y había que elegir proveedor cada
  vez. Con "Todas" elegido, `processWeeklyPdf` comparaba el PDF de **un** proveedor contra el
  catálogo **entero**: todo lo que no estuviera en ese PDF —o sea, los otros 26 proveedores—
  caía en *"ocultar del catálogo"*.
- `listaUsaPdfSemanal` trataba el campo **ausente** como `true`. **Corrección del 05/09:**
  en un primer informe dije que por eso el botón se veía en las 27 listas. **Es falso, y el
  error fue mío**: lo verifiqué en el navegador con listas que inventé yo, sin el campo, y
  leí ese resultado como si fuera producción. Medido contra la base: **las 27 tienen el
  campo escrito — 3 en `true`, 24 en `false`, 0 ausentes**, así que el botón se veía en 3,
  que es lo que este archivo decía desde el principio.
  Donde ese default **sí** hacía daño era en una **instalación nueva**: `setup-inicial.html`
  sembraba la primera lista **sin** el campo, y el botón aparecía sin que nadie lo pidiera.
  Se le agregó `pdfSemanal:false` para que ningún camino cree listas sin la bandera.

**Cómo quedó:** la elección vive en la misma bandera `pdfSemanal` de siempre, pero ahora es
**excluyente**: al guardar una se apagan las demás, en un solo `batch` y tocando sólo las que
cambian. El campo ausente cuenta como **no**. Se sacó la casilla del modal de crear/editar
lista (dos controles para lo mismo dejaban prender una segunda a mano), y `guardarLista` ya
no escribe la bandera al renombrar — **renombrar una lista le apagaba el PDF Semanal**.

**Diferencia deliberada con YERCO.** Allá `openWeeklyPdfModal` busca la lista **por nombre**,
clavada a `'FRUTICOR'`. Acá sale de la base, así el comercio puede renombrarla o cambiar de
proveedor sin tocar código — que es exactamente lo que el comentario de `filterTable()` dice
que se buscó al pasar a bandera por lista. El modal se ve igual: rótulo fijo con el nombre,
más un **Cambiar** discreto. Se portó también la guarda `wpListaElegida()`: sin lista no se
procesa nada, ni por click, ni por drop, ni por el input de archivo.

**Medido abriendo el panel** (no sólo con pruebas). Ojo: se ejercitó con listas **armadas a
mano** para cubrir los tres estados, no con la base — es lo que confundí más arriba:

| estado | qué pasa |
|---|---|
| una sola elegida | el botón sale **únicamente** en ella; las demás, incluidas las que no tienen el campo, ocultas |
| tres prendidas de antes | el modal **pide elegir** en vez de adivinar cuál |
| ninguna elegida | avisa *"Primero elegí la lista del PDF Semanal"* y **bloquea** el drop |

Ahí apareció un defecto que las pruebas no ven: `wpOcultarSelector` devolvía el rótulo con
`style.display=''`, que **no** lo devuelve a `flex` sino que **borra** el `display` del style
inline, y el div caía a `block` perdiendo el `gap` y el centrado. Sin un solo error de
consola — la misma familia que las once clases CSS de §5. Va con prueba propia.

`t-pdfsem.js` pasó de 7 a **47 asertos**, de los cuales **38 fallan contra `72762d6`**.
Suite completa: **1301 pruebas, 0 fallaron**. `check-admin` limpio.

**Queda pendiente y es de él:** hoy siguen prendidas `FRUTICOR`, `FRUTICOR 1` y `OTRO`, así
que el botón se ve en esas tres. **En cuanto entre al modal y guarde una, las otras dos se
apagan solas.** No se tocó la base.

### C) Que el agrupamiento de gramajes ande en Brotes · NO EMPEZADO

> **Lo reemplaza K** (variantes, 25/09/2026): los tamaños del mismo producto ya se muestran
> juntos, en la tienda y en la venta. Lo que queda de C es la migración de los grupos de
> YERCO, que es la etapa 4 de K y no se hace hasta que el dueño lo pida.

La migración copia `grupoId`, `grupoMascara`, `grupoOrden` y `grupoPrincipal` de los 658
productos que los tienen, pero **en Brotes esos campos no los lee nadie** (0 usos en
`admin.html`, `app.js` y los 8 módulos). En YERCO sí: 11 usos en el panel, 19 en la tienda y
uno en `admin-alertas.js`, y son los que hacen que los distintos gramajes del mismo producto
se muestren juntos con un selector en vez de como productos sueltos.

Sin portarlo, después de la migración la tienda va a mostrar —por ejemplo— las cinco
presentaciones de `YERBA MATE TUCANGUA` (1, 2, 5, 10 y 20 kg) como cinco productos
separados, todos a granel y con distinto precio por kilo. Los datos quedan listos; falta el
código.

### D) El PDF Semanal cotizaba el bulto y Brotes guarda el costo por kilo · **ARREGLADO** (07/09/2026)

Lo encontró el dueño preguntando lo correcto: *"en Brotes funcionará igual que en YERCO ese
botón?"*. **No funcionaba**, y la culpa era de la migración.

El PDF del proveedor cotiza **el bulto**. En Brotes un producto a granel guarda el costo
**POR KILO** (§5). La planilla venía de YERCO, donde no existe `tipoVenta` y todo se vende
como viene, así que tomaba el número del PDF y lo escribía derecho en `costo`.

**Medido sobre los 873, con un PDF que no cambiaba ni un precio:**

| | antes | después |
|---|---|---|
| marcaría como "cambio de precio" | **290** | **0** |
| coinciden exacto | 323 | **613** |
| no se pueden convertir | — | **0** |

Y aplicarlo multiplicaba el precio de venta **hasta x30**: `AVENA INSTANTANEA x 30 Kg` pasaba
de $2.003/kg a **$60.098/kg**, `FLOR DE HIBISCUS x 25 kg` de $16.568 a **$414.198**. **281
productos quedaban a más del doble**, sin un solo error de consola. Es la familia del x1000.

**El arreglo:** el costo que sale del PDF pasa siempre por `costoDesdePdf()`, que divide por
lo que pesa el bulto cuando el producto va a granel. El peso sale del nombre
(`bultoEnKilos()`, la misma lectura que usó la migración) o del campo `bultoKg` cuando el
proveedor se comió la unidad. **Si no se puede saber, no se toca nada y se avisa en el
modal** — quedarse callado sería escribir el costo del bulto como si fuera el del kilo.
Hoy hay **un solo** producto así, `MIX FRUT. SECOS CLASICO x 2,5`, y ya tiene su `bultoKg`.

**Lo que quedó bien de la migración, y era lo que preocupaba:**

- El botón empareja **sólo por `nombre`**, y de los 873 del PDF **0 no encuentran su ficha**.
- Los **110 productos con nombre externo distinto del interno** (`ALMIDON DE MAIZ x 5 Kg` →
  *"FECULA DE MAIZ (envasado) x 5 Kg"*) se copiaron todos: **0 perdidos**.
- **Las categorías no lo afectan**: sólo se muestran en pantalla y se piden para los
  productos nuevos. Traducirlas no cambió nada del emparejamiento.

**De paso, dos cosas que ya estaban rotas y no se veían** (venían de YERCO, donde esos campos
no existen): los productos nuevos que crea la planilla se guardaban **sin `codigo`** —que en
Brotes es obligatorio y único, y sin él el producto **no se puede editar** (§3, tanda 5g)— y
**sin `tipoVenta`**. Ahora se crean con los dos, con el costo y el stock ya convertidos si
van a granel, y `sugerirCodigoProducto()` acepta los códigos reservados en la misma tanda
(sin eso, dar de alta varios de una vez les ponía **el mismo código a todos**).

`t-pdfsem-granel.js`: 58 asertos, de los cuales **53 fallan contra `0dc821f`**.

### F) El botón PDF Semanal, revisado contra YERCO función por función · **ALINEADO** (07/09/2026)

El dueño pidió revisar *"muy bien y con atención cómo funciona el botón en YERCO"* y dejarlo
igual en Brotes. Se compararon **las 19 funciones** del bloque, normalizando sangría y
comentarios.

**17 son idénticas**, incluidos los cuatro ayudantes del parser (`normName`, `extractQty`,
`similarName`, `parsePdfPrice`) y `wpApplyPrices`. Las que difieren son `wpAddNewProds` y
`renderNoCatList`, por los arreglos de §1-bis D y E.

**Y apareció una diferencia que no era nuestra y rompía el botón entero:**

```
YERCO   const COL_SPLIT = page.getViewport({scale:1}).width * (280/595);
Brotes  const COL_SPLIT = 280;
```

Es el corte entre las dos columnas del PDF. **En 07/2026 el proveedor pasó el PDF de A4
(595pt de ancho) a A5 (420pt).** Con el 280 fijo, el nombre de la columna derecha (x=212 en
A5) caía del lado izquierdo, se rompía el apareo nombre/precio y **se leían 10 productos de
661**. YERCO ya lo tenía arreglado; Brotes había quedado con la constante vieja. Portado, y
movido adentro del bucle de páginas, que es donde tiene que calcularse.

**El callejón sin salida que había dejado la tanda anterior.** La lista se elige **adentro**
del modal, y al modal se entra **por el botón**; si el botón sólo salía con una lista ya
elegida, sin ninguna elegida no había forma de entrar. Pasó de verdad: la migración creó
`FRUTICOR-TODOS` con `pdfSemanal:false` y el botón no aparecía ni seleccionándola. Ahora el
botón también sale mientras no haya ninguna elegida, y el modal abre pidiéndola.
**`FRUTICOR-TODOS` quedó como la lista predeterminada** (las otras tres se apagaron).

**"Volvieron al PDF" no filtraba por lista.** Las otras tres secciones sí. Recorría el
catálogo entero y podía ofrecer desocultar productos de otros proveedores que se llamaran
igual — y en Brotes hay 47 nombres repetidos entre listas. Acotado. **Falta portarlo a
YERCO** (§6): allá casi no se nota porque tiene una sola lista real, pero el defecto está.

**Verificado contra el hecho de que en YERCO anda.** El dueño confirmo que un amigo suyo
sube el PDF todas las semanas hace mas de un mes sin errores. Eso vuelve a YERCO la
referencia buena, asi que se comprobo lo unico que importa: que el camino de LECTURA de
Brotes sea el mismo.

| control | resultado |
|---|---|
| version de pdf.js | **3.11.174 en los dos** |
| `processWeeklyPdf`, diff estricto y en orden | las **85 primeras sentencias, identicas** |
| donde empieza a diferir | sentencia 86, ya con `uniquePdf` armado: **toda la lectura termino antes** |
| las 4 ayudantes del parser | identicas |
| funciones que llama la lectura | **25 de 25** existen en Brotes |
| ids del DOM que toca | **5 de 5** existen |

Y se probo de verdad, fabricando PDFs de dos columnas y dandoselos al lector real:

| | A4 (595pt) | A5 (420pt) |
|---|---|---|
| codigo anterior | 200/200 | **0 de 200** |
| ahora | 200/200 | **200 de 200** |

Queda `pruebas/pdfsem-local.html`, un banco que **saca el lector de `admin.html`** (no es una
copia) y no toca Firebase: fabrica PDFs en cuatro tamanos de papel, y acepta el PDF de verdad
arrastrandolo para decir cuantos productos reconocio. Se abre con `node dev-server.js 5174` y
`http://localhost:5174/pruebas/pdfsem-local.html`.

**Sobre las categorías, que era la otra duda.** Dentro del bloque del PDF Semanal `categoria`
aparece 25 veces y **ninguna decide nada**: sólo se muestra en los listados de "ocultar" y
"volvieron", y arma el desplegable de subcategoría para los productos **nuevos**. El
emparejamiento es `bddByName[pp.nombre]` y el filtro es `p.lista===wpListaId`. **Nunca por
categoría.** Que se hayan traducido a las 30 del negocio no le afecta en nada.

### E) El stock a granel se mostraba sin unidad · **ARREGLADO** (07/09/2026)

También lo vio el dueño: *"hay productos que tienen un número altísimo de stock, ¿por qué es
eso?"*. Eran correctos —`3 ARROYOS COPO AZUCARADO x 4 Kg` con **40000** son 40 kg, o sea los
10 bultos de 4 kg que había en YERCO— pero **la tabla de Productos mostraba el número pelado,
sin decir que eran gramos**. Además de confuso es peligroso: invita a "corregir" 40000 a 40 y
dejar el producto con **40 gramos**.

Ahora lo escribe `stockTexto()`, en un solo lugar, y por arriba del kilo lo dice en kg, que es
como lo piensa el comercio: **40 kg**, **37,5 kg**, **800 g**, **10 u**. Lo usan las cuatro
pantallas que dibujaban el stock —la tabla, el tooltip de stock bajo, el modal de "sin
categoría" y el informe de duplicados—, que es lo que pide §5: cuando la misma cosa se dibuja
en varios lados, se arregla en uno solo.


---

### G) Los productos sin precio se podian llevar GRATIS · **ARREGLADO** (09/09/2026)

Salio del barrido previo a la entrega. `addToCart` miraba **solo el stock**:

```js
const p=productos.find(x=>x.id===id); if(!p||(p.stock||0)<=0)return;
```

Un producto en **$0 con stock se podia agregar al carrito**, y como el minimo de pedido se
controla sobre el **total**, alcanzaba con sumar $30.000 de productos de verdad para llevarse
los de $0 **gratis** — y el stock se descontaba igual.

**Medido en produccion:** 197 productos visibles en $0, y **141 con stock cargado**, entre
ellos 6,9 kg de bicarbonato, 4,2 kg de mani y 2,7 kg de mix. **Ninguno viene de la migracion**
(los 873 de FRUTICOR-TODOS tienen todos precio): son del **catalogo original**, que tiene 378
productos en $0 — el **62%** —, al que le falta cargar precios.

La regla de `/pedidos` exige `total > 0`, asi que un carrito de puros $0 fallaba igual, pero
recien al confirmar y sin explicar por que.

**El arreglo.** Un producto sin precio no esta a la venta: `sinPrecio()` en un solo lugar, la
guarda dura en `addToCart` —que es el unico camino comun a todos los botones: la tarjeta, el
modal de detalle y los de gramaje— y el aviso visual en los **cuatro** renders que dibujan
precio y boton (§5: la misma cosa se dibuja en varias pantallas). En vez de "$0" dice
**"Consultar precio"** y el boton queda deshabilitado.

Verificado abriendo la tienda con los datos reales y una sesion de cliente: el de $0 **no
entra** al carrito y avisa por que; el que tiene precio **sigue entrando**.

`t-sin-precio.js`: 27 asertos, 13 fallan contra `ddc1dfe`.

**Los precios que faltaban se cargaron el 08/09** desde las fotos del reporte del sistema
viejo: ver §1-bis I. Hoy **no queda ningún producto en $0**, así que el aviso "Consultar
precio" no se dibuja en ninguna pantalla — pero la guarda queda, que es lo que importa: si
mañana alguien carga un producto sin precio, no se puede llevar.

---

### H) La pistola en la venta: escanear agrega x1 sin pasar por el buscador · **HECHO** (09/09/2026)

**Lo pedido:** que al abrir la venta con **V**, escanear agregue **x1** del producto, con el
código coincidiendo **exacto**, sin tener que hacer click en la barra de búsqueda. Y que al
cargar un código de barras no se pueda repetir.

**Por qué no andaba.** El lector ya ruteaba al modal de venta y llamaba a `addVentaItem` —eso
estaba bien—, pero `buscarPorCodigo` miraba **sólo `codigoBarras`**, y en producción hay
**1 producto de 1484** con código de barras cargado. Los **1484 sí tienen `codigo`**, que es
el que sale en las etiquetas que imprime el comercio. Por eso en la práctica no encontraba
nada y había que escanear **dentro** de la barra del modal, que sí mira el `codigo`.

Ahora reconoce los dos campos, y los dos **exactos**:

| se escanea | antes | ahora |
|---|---|---|
| `000685` (código interno) | no encuentra | **GALLETA x1** |
| `000686` (interno, sin cód. de barras) | no encuentra | **YERBA x1** |
| `7790009999999` (código de barras) | YERBA | YERBA |
| `685` (parcial de `000685`) | no encuentra | **no encuentra** |

**Exacto, y no por coincidencia parcial**, que es lo que pidió el dueño y además es
necesario: el buscador del modal usa `includes()` —`'000320'.includes('320')`—, que está bien
para elegir a mano, pero para agregar **solo** no sirve: `320` entraría en media docena de
productos y se cargaría cualquiera.

**Y si el código lo tienen dos productos, no se elige ninguno**: avisa cuáles son y no agrega.
Agregar el equivocado a una venta es plata mal cobrada y stock mal descontado.

**La otra mitad: el código de barras no se puede repetir.** Había tres caminos que lo escriben
y sólo dos validaban: escanearlo dentro de la ficha (avisaba) y asignarlo desde el mostrador
(consultaba la base). **Escrito a mano y guardado no lo miraba nadie.** Se agregó
`validarCodigoBarras()`, con el mismo criterio que el código interno: primero en memoria,
después contra la base —que es la que manda, porque otro admin pudo cargar uno hace un
minuto—, excluyéndose a sí mismo al editar. Vacío sigue siendo válido: casi ningún producto
tiene código de barras.

Verificado abriendo el panel: con el foco en `BODY` —sin tocar nada— escanear el código
interno agrega x1, el de barras también, repetirlo suma x2, y `320` no agarra `000320`.
`t-lector-codigo.js`: **41 asertos**. Las cuatro funciones nuevas no existían en `92492ec`.

---

### I) Depuración de productos · **PUBLICADO, CON LA PARTE DE FIREBASE** (14/09/2026)

**Lo pedido:** una sección nueva, **Depuración de productos**, que junte los productos que ya no
se mueven para esconderlos sin borrarlos: 30/60/90 días a elección, una tabla con qué criterio
cumple cada uno, **Depurar**, la lista de **Productos depurados** con **Restaurar**, y
**Productos excluidos** para los que no se tienen que sugerir nunca (lo estacional).

**Cómo decide.** Es candidato si cumple 2 de 3 en los últimos X días, y uno de los 2 es **Sin ventas**
(obligatorio desde el segundo chequeo del 14/09: algo vendido ayer y sin stock salía para depurar):

| criterio | de dónde sale |
|---|---|
| Sin ventas | ventas y ventas mayoristas. Los pedidos web entran: no pasan a confirmado ni a entregado sin generar la venta |
| Sin stock | stock en 0 o negativo |
| Sin reposición | `stockSubioEn`, que escribe la función `registrarReposicion` cuando sube el stock. Mientras `config/depuracion.registroStockDesde` no cubra los días elegidos, dice "sin datos" y no cuenta |

No se ofrece aunque cumpla si se dio de alta hace menos de X días (`creadoEn`), si tiene un pedido
abierto (cualquier estado que no sea entregado o cancelado), o si sus presentaciones
(`gramajePadreId`) o sus envasados propios (`padreId`) se siguen vendiendo. La pantalla dice
cuántos quedaron afuera por cada motivo.

**La regla que no se puede romper: el depurado sigue en `allProducts`.** Se saca solo de las
pantallas donde se elige un producto —tablas, buscadores, exportaciones, alertas— y de la tienda.
Hay 22 funciones que usan esa lista para buscar datos, y si faltara: Importar Nuevos lo crearía
duplicado y le repetiría el código, el lector del mostrador no lo encontraría, y
`borrarImagenesQueSobran` le **borraría las fotos**. `t-depuracion.js` falla si alguna lo filtra.

**Chequeo profundo del 14/09: cinco errores, arreglados y probados en el sandbox.**

1. Depurar releía el stock pero no las ventas: algo vendido con la lista abierta se depuraba igual.
2. Un granel cuyos envasados se venden —o un principal cuyas presentaciones se venden— se
   ofrecía para depurar.
3. Vender un depurado por peso pedía los gramos dos veces: el control estaba en `addVentaItem`,
   que se reemplaza por `_agregarItemVenta`.
4. Convertir un pedido web en venta no avisaba si traía un depurado.
5. Con el panel abierto desde temprano, la lista usaba ventas viejas.

Y dos menores: la ficha de proveedor contaba los depurados, y la barrida de clics podía apretar
Restaurar.

**Lo de Firebase, hecho el 14/09/2026 (con la clienta sin usar el sistema):**

- **`registrarReposicion`** (functions/index.js), Gen 2 en `southamerica-east1`, escucha
  `productos/{productoId}` y escribe `stockSubioEn` cuando el stock **sube**, también en un alta
  con stock y aunque siga en 0 o negativo: una compra de -3 a -1 es mercadería que entró, y hay
  36 productos con stock negativo. (La primera versión pedía que quedara positivo; se corrigió y
  se redesplegó el mismo 14/09.) Sin reintento automático: activarlo exige `--force` al
  desplegar porque los reintentos se cobran, así que queda para decidir. Se
  desplegó sola (`firebase deploy --only functions:registrarReposicion`): las otras funciones no
  se tocaron.
- **`config/depuracion.registroStockDesde` = 14/09/2026 21:57 (Córdoba)**, escrito una sola vez,
  con la función ya activa y con la condición de que el documento no existiera.
- **`creadoEn` completado en los 1346 productos** con el `createTime` de cada documento. Se hizo
  antes de desplegar la función, para no dispararla 1346 veces; solo en los que no lo tenían, y
  exigiendo que el producto no hubiera cambiado desde que se leyó. No falló ninguno.

Las escrituras en producción se hicieron con la sesión del CLI de Firebase (su cliente
autenticado), sin claves en archivos.

**Qué va a ver la clienta, y desde cuándo.** El catálogo se cargó en dos tandas (442 productos el
28/08 y 874 el 07/09) y la primera venta es del 31/08. Con `creadoEn` completado, un producto no se
ofrece hasta que cumple en el sistema los días elegidos: con 30 días, los primeros candidatos
aparecen desde el **27/09**, y los productos del 07/09 desde el 07/10. Es a propósito: antes no hay
historial para decir "no se vendió en 30 días". "Sin reposición" dice "sin datos" hasta que el
registro cubra el período: desde el **14/10** con 30 días, el 13/11 con 60 y el 13/12 con 90.

**Chequeado el 14/09:**

- Todos los caminos que suben stock escriben el campo `stock` del producto (compra y remito, Stock,
  carga en tanda, edición, Excel e Importar Nuevos, devolución de un pedido y de una venta
  borrada), así que la función los ve a todos. Probado en el sandbox con las funciones reales del
  panel: la sección Stock anota, una venta no, la devolución vuelve a anotar y un alta con stock
  anota.
- Sin bucle: `npm run test:reposicion` corre la función de verdad en el emulador (9 asertos, con el caso de -3 a -1). Cada
  reposición la dispara dos veces: la que anota y la de su propia escritura, que sale sin escribir.
- "Sin reposición" según el período: `t-depuracion.js` (119 asertos).
- `t-reposicion.js` (20 asertos, con simulaciones), la suite entera y la barrida sobre la sección:
  38 elementos, 31 apretados, sin errores. Los "sin efecto" eran el menú lateral y los botones de
  período, que sí cambian: se comprobó a mano.

Verificado en el sandbox: depurar con el aviso de stock y de presentaciones, restaurar, sacar de la
lista y volver, vender un depurado (también por peso), escanearlo en una compra, Importar Nuevos con
un depurado adentro, la tienda sin depurados, 30/60/90 días, paginado y celular.
`t-depuracion.js`: **119 asertos**. Suite: **2237 / 0**.

**Segundo chequeo profundo del 14/09 (después de publicar):** arreglado, probado y verificado en el sandbox.

- **Depuración:** sin ventas es obligatorio; las ventas se leen sin tope arriba (una venta mayorista
  de hoy se guarda a las 12:00 y, cargada a la mañana, no contaba); la familia mira `gramajePadreId` y
  `padreId` en todos los niveles; Recalcular relee también los productos; dice "sin ventas en 90 días"
  en vez de "hace más de 90 días", y sin candidatos dice desde cuándo puede haber.
- **Con el producto en la mano:** en la venta, con uno oculto y depurado pregunta primero lo de oculto
  (si no, quedaba restaurado sin venderse); en la compra mira el proveedor antes de ofrecer restaurar;
  el lector avisa que está depurado al abrir la ficha; el PDF semanal marca y restaura los depurados
  que vuelven; Importar Nuevos avisa cuando lo que "ya existe" está depurado; la etiqueta de un
  depurado lo trae en el buscador de la venta, marcado.
- **Ventas y formulario:** "Ver" ocultos vale solo para el texto exacto (con "empieza con", un Ver
  tocado con "a" dejaba agregar ocultos de "avena" sin preguntar); el aviso cuenta todos los ocultos
  y la lista dibuja 25; abrir o editar una venta limpia el buscador; sin categoría no se ofrecen
  subcategorías; un panel escondido ya no frena el Escape.
- **Tienda:** al confirmar, lo ocultado o depurado con la página abierta sale del carrito.
- **Queda para decidir:** si el buscador de *pedidos* tiene que esconder los ocultos como el de la
  venta, y si `registrarReposicion` reintenta sola ante un error (se cobra).

---

### J) El lector de remitos cargaba bolsas como kilos · **ARREGLADO** (19/09/2026)

Lo encontró el dueño revisando un mensaje viejo. Un renglón en bolsas:

```
000123 MANI TOSTADO X 5 KG   2   4900   9800
```

son **2 bolsas de 5 kg**: 10.000 g a $980 el kilo. El lector cargaba **2.000 g a $4.900 el
kilo** —cinco veces menos stock, el costo al quíntuple— y **con el tilde de verificado**, que
es lo peor, porque invita a no revisarlo.

La causa: el control de "KG" miraba el renglón entero, así que el "X 5 KG" del **nombre**
contaba como si la cantidad viniera en kilos, y la cuenta de control cerraba igual
(2 × 4.900 = 9.800). Falló en las cuatro variantes probadas: `X5KG` pegado, `$4.900,00` y con
una sola bolsa. Los renglones en kilos de verdad los leía bien.

Las pruebas no lo agarraban porque los 5 remitos reales de `pruebas/remitos/` tienen 48
renglones y **ninguno viene en bolsas**.

**La decisión, del comercio (19/09):** desde el papel no se puede saber si el número son kilos
o bultos —cada proveedor escribe distinto—, así que **los productos por peso no cargan cantidad
ni costo**. El renglón carga el producto y queda en "revisar", igual que cuando la cuenta no
cierra; la cantidad y el costo los pone la persona mirando el remito. Es menos cómodo y no se
equivoca. Los productos por unidad no cambian: ahí el número no es ambiguo.

De paso se sacó `enKilos` de la lectura del renglón: era una bandera que decía una verdad a
medias, y es la que provocó el error. Si alguien la vuelve a necesitar, que la saque de la zona
de los números y no del renglón entero.

`t-remito.js`: **87 asertos** (antes 80). Verificado en el sandbox con un PDF armado para eso:
los dos renglones por peso quedan sin cantidad y con el costo que ya tenían, los dos por unidad
cargan normal, y el cartel los agrupa: *"2 productos por peso: el remito no dice si el número
son kilos o bultos, así que la cantidad y el costo van a mano"*.

**Queda por mirar:** si en producción ya entró alguna compra así. Se revisa comparando las
compras de productos a granel cargadas desde un remito contra el papel.

### I) Los 373 productos que quedaron en $0 ya tienen precio · **HECHO** (08/09/2026)

El arreglo de §G tapó el agujero —un producto sin precio no se puede llevar— pero dejaba
**373 productos del catálogo original invisibles como "Consultar precio"**. El dueño pasó
las **16 páginas** del reporte *Stock valorizado* del sistema viejo (Zoo Logic Dragonfish)
**en fotos**, y de ahí salieron los precios.

**Por qué se pudo emparejar por código, y no a ojo.** Los códigos del reporte
(`000001`–`000684`) son los **mismos** que los de Brotes. Donde Brotes **ya** tenía precio
cargado se pudo cotejar: de **231 cotejables, 165 dan exacto**. Los 66 que difieren **no son
errores de lectura sino subas de precio**, y se nota porque son *sistemáticas* —las 6
Milanesas Sojitas todas en +28 %, las chalitas en +9 %—, cosa que un error de transcripción
no hace. Esa es la prueba de que la transcripción de las fotos sirve.

**El costo no está en el reporte y se deduce.** El margen de la casa es **65 % sobre el
costo**, así que `costo = precio / 1,65`. Tampoco es una creencia: de los **82 productos que
ya tenían costo y precio cargados, 79 están exactamente en 1,65** —la mediana, el p25 y el
p75 son los tres 1,65—.

**El granel no se convierte.** A granel Brotes guarda el precio **POR KILO** y el reporte ya
viene así: de **70 productos a granel cotejables, 63 dan exacto**. Por eso el script no
divide por nada y **no aplica la trampa del x1000 de §5**. De los 373 cargados, **129 son a
granel**.

**Las filas a $1,05 se descartan**: es el relleno que usa el sistema viejo para las filas sin
precio real, no un precio de un peso.

| | antes | después |
|---|---|---|
| catálogo original en $0 | **373** | **0** |
| visibles en la tienda en $0 | 190 | **0** |

**Medido releyendo los documentos de la base, no contando lo que se mandó:** los **373 de 373**
quedaron con `precio`, `costo` y `porcentaje 65` correctos, **0 fallaron**. Antes de escribir,
el script guardó los valores previos de los 373 documentos en `respaldo-precios.json`.

Los cinco controles que corren antes de escribir —y que abortan si alguno da distinto de 0—:
precio inválido, costo inválido o mayor o igual al precio, **pisar un precio ya cargado**,
margen que no dé 1,65, y precio fuera de $100–$200.000. Los cinco dieron **0**.

Dónde estaban: **206 en `OTRO`**, 93 en `FRUTICOR 1`, 32 en `MARTIN F.S`, 13 en `NATURA` y el
resto repartido en 10 listas más.

El script es `migracion/precios.js` (`--dry` no escribe nada y deja `informe-precios.txt`;
`--escribir` aplica). Los precios transcritos viven en `migracion/lista1.txt` como
`codigo|precio`, **644 filas con precio real**.

**Lo que queda decidir (es del dueño).** El reporte trae **37 códigos que no existen en
ninguna lista de Brotes** —contados contra el catálogo entero y **normalizando los ceros de
adelante**, porque hay productos cargados como `272` y `00295`—. Tres no son productos
—`000001`, `000148 Envios` y `000407 Saldo`—, así que son **34 productos reales del negocio
que no están cargados**. No se pueden crear solos: en Brotes **categoría y lista son
obligatorias** y el reporte no las trae. Hay que decidir a qué categoría y a qué lista van
antes de subirlos.

---

### J) FRUTICOR 1 fundida contra FRUTICOR-TODOS · **HECHO** (09/09/2026)

**Lo pedido:** que `FRUTICOR 1` desaparezca, que **no quede ningún producto repetido**, y
que **no se pierdan los códigos** —es con lo que buscan en el mostrador en vez de tipear el
nombre—. `FRUTICOR-TODOS` es la lista de Fruticor completa y **no cambia**.

**Por qué sobrevive el de FRUTICOR-TODOS pero con los datos del de FRUTICOR 1.** Medido
sobre los 52 nombres repetidos, el patrón era siempre el mismo: el de FRUTICOR-TODOS estaba
**oculto**, con el stock redondo que traía de YERCO (8 kg, 10 kg, 25 kg) y **con el precio de
YERCO**; el de FRUTICOR 1 estaba **visible**, con el stock real y el precio de este negocio.
Borrar el de FRUTICOR 1 sin más habría dejado el bicarbonato a **$2.600 en vez de $4.100** y
con 8 kg que no existen. Así que el documento que queda es el de FRUTICOR-TODOS —nombre, foto
y lista de Fruticor— y **recibe del otro el código, el precio, el costo, el stock, la
visibilidad y la categoría**.

| | antes | después |
|---|---|---|
| FRUTICOR 1 | 188 productos | **0, lista borrada** |
| FRUTICOR-TODOS | 883 | **883** (no entra ni sale ninguno) |
| OTRO | 208 | 236 |
| productos | 1491 | **1331** |

**160 fusiones y 28 mudanzas a `OTRO`.** Los 28 **no son de Fruticor** —tés Tucangua,
tostadas Molinos del Bosque, mieles Paneles del Mistol, goma xántica, espirulina— y por eso
no entran a FRUTICOR-TODOS; se mudan enteros, con su código.

**Medido releyendo la base:** 160 de 160 fusiones correctas (código y precio pasados, el
viejo borrado), 0 fallaron, 28 de 28 mudados, **0 códigos repetidos**, **0 códigos que
choquen ignorando los ceros de adelante**, 0 sin código, 0 en $0.

**Verificado abriendo la tienda:** `OREGANO EXTRA x 1 Kg` quedó en $9.150 con 420 g —los
datos del `000336 Oregano`—, `PAPRIKA x 1Kg` en $17.900 con 660 g, y `Lenteja turca` con
**7,5 kg** (5 kg + 2,5 kg sumados, porque el negocio la había recreado a mano). **0 nombres
repetidos** en las 952 que dibuja la tienda.

#### Las tres trampas del emparejamiento de nombres

YERCO escribe `MIJO PELADO x 5 kg` y el negocio `Mijo Pelado`. Cada versión del comparador
falló distinto, y las tres se vieron sólo mirando qué movía:

1. **Pedir 2 palabras en común** decía que `Oregano` no estaba en FRUTICOR-TODOS. Es una
   sola palabra: nunca podía llegar a dos. Daba **148 productos perdidos** que sí estaban.
2. **Sacar la medida sólo cuando viene con x delante** dejaba fuera `Mermelada De Higo
   C/Stevia **330Gr**`, que allá es `MERMELADA DE HIGO C/STEVIA x 330 gr` —el mismo
   producto—. Y exigir marcas que del otro lado no existen (`CACHAFAZ`) rompía el resto.
3. **Una sola palabra en común no alcanza** si enfrente el nombre dice tres cosas más:
   `Fibras` caía en `SALUTARIS FIBRA VEGETAL incaico x 250g` —granel a $7.420 el kilo contra
   un envase de 250 g a $23.400—, `Miel Paneles Del Mistol` en `GALLETA -ORGANICA- CACAO Y
   MIEL` y `Mango Trozado Congelado` en `MERMELADA DE MANGO`.

Y el desempate entre varios candidatos **no puede ser el precio solo**: `Lentejas` ($4.724)
se iba a `LENTEJA TURCA x 1 kg` ($5.200) en vez de a la lenteja común, y encima la turca ya
tenía su propio producto. Gana el que **agrega menos palabras**, y recién después el precio.

#### Lo que apareció de paso

El personal estaba **recreando a mano productos que ya existían**, con el código mal tipeado
—`272` por `000272`, `00295` por `000295`—, porque al buscar el código correcto no
aparecía. El catálogo usa **6 dígitos con ceros adelante**. Se normalizaron los 4 que
quedaban fuera de formato. **Falta que el buscador del panel encuentre `000272` cuando se
tipea `272`**, que es lo que evita que vuelva a pasar.


---

### K) La pantalla de Productos, como la queria el duenio · **HECHO** (17/09/2026)

Cuatro pedidos sobre `Productos`, más uno de la ficha:

1. **Al entrar no queda ninguna lista seleccionada.** Antes se restauraba la última usada y
   el catálogo aparecía recortado a un proveedor sin que nadie lo pidiera: el total de
   arriba no coincidía con lo de abajo y parecía que faltaban productos.
2. **La lista que se clickea ya no se va al primer lugar.** Saltaba al principio y las
   demás se corrían, así que la que uno acababa de mirar no estaba donde la había dejado.
   Ahora el orden es **alfabético fijo**.
3. **Se ven todas las listas de una.** El "Ver todas" pedía dos clics para llegar a una del
   fondo, y el primero no filtraba nada. Se sacó el colapso entero.
4. **Casilla "No mostrar ocultos", tildada por defecto**, en lugar del desplegable de
   visibilidad. Destildarla muestra también los ocultos, en el mismo orden alfabético.
   **Se perdió el filtro "solo ocultos"** que tenía el desplegable; nadie lo pidió.
5. **Los campos de la ficha del producto** vienen con el borde pintado del color del foco
   al **45%**, para que se vea dónde se escribe sin hacer clic antes. Un cliente no
   encontraba los campos. Acotado a `#productForm`: el resto del panel no cambia.

Verificado abriendo la página y ejecutando las funciones reales con datos de prueba: 4 de 4
pastillas sin recorte ni botón, orden idéntico después de clickear, la casilla filtra y
deja de filtrar, `#pNombre` en `rgba(95,168,122,0.45)` y `#searchInput` sin tocar, sin
errores de consola. Commit `b8bd5ff`.

---

### L) Entrar a Caja después de vender tardaba · **ARREGLADO Y MEDIDO** (18/09/2026)

**Lo reportado:** con la caja abierta, venden tocando **V** parados en Productos, y *"tarda
en cargar la venta en la caja"*.

#### Lo medido ANTES de tocar nada

Contra la base real, leyendo y sin escribir. Tres vueltas seguidas, en ms:

| etapa | v1 | v2 | v3 | lo que trae |
|---|---|---|---|---|
| `config/cajaConfig` | 90 | 65 | 91 | **no existe el documento** |
| `config/cajaEstado` | 68 | 75 | 67 | el puntero a la caja abierta |
| `cajas/<id>` | 83 | 66 | 89 | la caja |
| `cargarDatosCaja()` (3 en paralelo) | 117 | 116 | 90 | 22 ventas + 0 may. + 3 movimientos |
| `cargarVentasSueltas()` (2 en paralelo) | 93 | 112 | 92 | las 22 del día |
| historial (`limit 120`) | 75 | 88 | 75 | 11 cajas |
| **total** | **527** | **521** | **504** | |

**El tamaño no era el problema.** En toda la base hay 159 ventas, 11 cajas y 0 mayoristas;
el día más cargado fueron 22 ventas. Cada consulta tarda entre 65 y 117 ms **porque es una
ida y vuelta**, no por lo que trae. El problema era que salían **en seis tandas, una atrás
de la otra**, y que `switchSection('caja')` rehacía las seis **en cada visita**.

Para medirlo en el navegador -y para poder repetirlo- quedó `pruebas/caja-banco.html`:
carga `admin-caja.js` tal cual, trae la sección de `/admin` en vivo, y le pone a cada
consulta la demora medida arriba. Se abre con `npm run dev`.

#### Lo que se cambió

1. **Las nueve consultas, en tres tandas.** De las seis, solo tres dependían de la anterior:
   la config, el puntero y el historial no se necesitan entre sí; la caja necesita el
   puntero; y las cinco del final necesitan la caja. `cargarDatosCaja()` y
   `cargarVentasSueltas()` se esperaban una a la otra sin motivo.
2. **Volver a entrar no consulta nada.** `switchSection('caja')` ahora llama a
   `entrarACaja()`: si ya hay datos cargados de hace menos de 5 minutos, dibuja con lo que
   hay en memoria y **relee por detrás**; si son más viejos, espera la lectura como antes,
   porque dibujar plata de hace cuatro horas es mentirle a alguien que está contando. Una
   sola relectura a la vez, aunque se entre y salga diez veces.
3. **`saveVenta` le avisa a la Caja** (`cajaRegistrarVenta()`): la venta recién escrita se
   suma a `cajaVentas` y se redibuja, sin consultar. No se cuenta dos veces -se chequea el
   `docId`-, no entra si es de otra caja, y la mayorista hace lo mismo.

#### Lo medido DESPUÉS, con el mismo banco y la misma demora

| | antes | después |
|---|---|---|
| entrar por primera vez | 572 ms (6 tandas) | **282 ms (3 tandas)** |
| vender y entrar a la Caja | 565 ms | **1 ms** |
| entrar de nuevo sin cambiar nada | 564 ms | **2 ms** |

Las nueve consultas siguen siendo nueve: no se sacó ninguna lectura, se sacó la espera.
El dibujado tarda 1 ms.

**Verificado abriendo la página**: la sección dibujada por `renderCaja()` con la venta
recién hecha ya adentro (Ventas (23)), el arqueo cuadrando -efectivo + tarjeta = bruto, y
esperado = fondo + efectivo + ingresos − egresos-, las 10 cajas del historial en su tabla,
**cero errores de consola**, y el historial **sin parpadear** durante la relectura de atrás
(muestreado cada 20 ms: ninguna muestra en blanco).

`pruebas/t-caja-entrar.js` (39 asertos) afirma todo eso contra el fuente real: cuenta las
tandas **por el momento en que sale cada consulta**, no por milisegundos, así que no depende
de lo rápida que esté la máquina. **Contra el commit anterior fallan 25 de 39** (6 tandas:
1+1+1+3+2+1, y no existen ni `entrarACaja()` ni `cajaRegistrarVenta()`); los 14 que pasan son
los que cuidan que no se haya perdido nada: las mismas nueve consultas, la pantalla dibujada,
el resumen del historial.

**El precio de dibujar primero y leer después:** si alguien **edita o borra una venta**
desde la sección Ventas y entra a la Caja, el primer dibujado muestra el número viejo y la
relectura de atrás lo corrige medio segundo después. Se corrige solo, y no se tocó ninguno
de esos dos caminos para no meter mano en más lugares de un panel que está vendiendo. Si
alguna vez molesta, el arreglo es una línea: `_cajaCargadaEn = 0` al editar y al borrar.

**Lo que sigue abierto:** `config/cajaConfig` **no existe** en la base, así que la Caja usa
los valores por defecto (tolerancia $500, exige motivo si difiere, arqueo no ciego). Es una
ida y vuelta por carga para traer un documento que no está. No se tocó: crearlo es escribir
en producción, y eso se avisa antes.

---

### M) Variantes: presentaciones, escalas de granel y cajas cerradas · **SUBIDO A PRODUCCIÓN el 27/09/2026** (hecho el 25/09)

Pedido del comercio (24/09): un producto que viene en varios tamaños es UNO —una tarjeta en
la tienda, una fila en la venta— y cada tamaño tiene su costo, su ganancia y su stock.
- **Etapa 1, presentaciones:** maní x 80 g y x 160 g, alfajor x1 y x12. Si falta una, la
  venta ofrece la que la cubre (dos de 80 g en vez de una de 160 g).
- **Etapa 2, escalas de granel:** yerba en bolsas de 1, 3 y 5 kg; se cobra la escala más
  grande que no supera lo que se lleva, avisa si llevando más paga menos, y el stock sale de
  la bolsa de la escala, después de la siguiente y después de la anterior, avisando la mezcla.
- **Etapa 3, caja cerrada:** la caja se cobra a precio mayorista; los sueltos, a precio normal.
- **Etapa 4, migrar los grupos de YERCO:** **no se hace** hasta que el dueño lo pida.
- **El formulario:** con más de un tamaño, la tabla "Costo y precio de cada bolsa" es el
  único lugar de carga (lo de arriba se esconde).
- **Sin stock suficiente la venta NO se puede hacer** (26/09), para cualquier producto: ni
  agregar más de lo que hay (los gramos, una unidad más, la cantidad de la línea) ni
  registrarla. El aviso dice cuánto hay y que se cargue en Stock con "Agregar stock". El
  25/09 solo avisaba y dejaba "Registrar igual"; el dueño pidió que no deje.
- **El aviso de la mezcla de bolsas, con palabras simples** (26/09): "No alcanza la bolsa de
  2 kg", de qué bolsa sale cada parte y lo que costó, y cuánto se gana ("$1.300 en vez de
  $1.600") en un recuadro de color. Sin la palabra "escala" en la venta.
- **Stock: "Agregar stock"** en cada fila suma lo que llegó (el lápiz corrige el total).
- **Productos: un producto con presentaciones es una fila**, con un panel que muestra cada
  tamaño y "Editar presentaciones".

Está en commits locales, probado en el sandbox; **no se subió**. Pruebas: 2989 en 71 suites.

**Antes de subirlo, que la clienta cargue el stock.** Con el freno, lo que figura sin stock
no se puede vender. En producción (lectura del 26/09): de 344 productos visibles, 123 están
en 0 y 31 en negativo; de los 211 vendidos en los últimos 30 días, 35 hoy están en negativo
(97 renglones: se vendieron sin stock cargado) y 31 en 0. Esos, sin cargarles stock, van a
quedar frenados en el mostrador.

**Al subirlo** (solo cuando lo pida el dueño, y con la clienta sin usar el sistema):
- desplegar las functions `registrarCambioDeCosto` y `descontarStockPedido` (esta cambió: compara
  contra la escala que se cobró y la caja cerrada contra el mayorista);
- backfill de `costoActualizadoEn` para el momento de la subida;
- si se decide el pendiente 1 de abajo, desplegar también las reglas.

**Subido el 27/09/2026**, con la clienta sin usar el sistema (lo pidió el dueño):
- push a `main` hasta `1ddf88e` (M, N y los arreglos de la revisión del 27/09). Vercel publicó y se
  comprobó que sirve los mismos archivos que el repo (panel, módulos, `app.min.js`, estilos);
- functions: `descontarStockPedido` actualizada y `registrarCambioDeCosto` creada (southamerica-east1),
  sin errores en sus logs;
- `costoActualizadoEn` cargado en los 1316 productos (27/09, 18:46; solo ese campo, probado primero
  en uno). Los avisos de costo viejo empiezan a salir desde el 27/10 en los que no cambien de costo;
- la tienda y la pantalla de ingreso del panel cargan sin errores (sin iniciar sesión en el panel);
- las reglas no cambiaron: el pendiente 1 de abajo sigue sin decidir.

**Lo que falta después de subir:**
- **avisarle a la clienta del freno de stock**: el 27/09 había 154 de los 344 productos a la venta sin
  stock (123 en 0 y 31 en negativo). Esos no se pueden vender en el mostrador hasta cargarles stock con
  "Agregar stock";
- probar el ticket del pedido en la impresora térmica;
- las ventas viejas guardadas como envío sin cargo (el default de antes) siguen diciendo "Envío" en la
  lista y en el ticket hasta que se editan: si se quieren pasar todas a retiro, es un cambio de datos
  para decidir con la clienta;
- **la migración (etapa 4)**: antes, hablar con la clienta. Hasta entonces el sistema anda con los
  productos como están (no se agrupan solos).

**Pendientes (anotados el 25/09/2026):**

1. **Los pedidos telefónicos no se pueden crear desde el panel.** `firestore.rules` solo deja
   crear pedidos web (`origen == 'web'` y el `clienteAuthUid` de quien escribe); el admin tiene
   `update, delete` pero no `create`, así que "Nuevo pedido" da PERMISSION_DENIED. Está así desde el
   primer commit (11/08); en producción había 0 pedidos, así que no afectó a nadie. Arreglo
   propuesto: `allow create: if isAdmin();` en `/pedidos` y desplegar las reglas. **Decisión tuya.**
2. **Convertir un pedido web cambiando cantidades no mueve el stock.** Si el pedido ya
   descontó (la tienda y el servidor), la venta no descuenta nada: la diferencia entre lo
   pedido y lo vendido no se suma ni se resta. Viene de antes de las variantes.
3. **Un granel que sale de dos bolsas puede diferir en $1 del total.** Cada renglón se
   redondea por separado (precio × gramos de su bolsa), y la suma puede diferir en $1 del
   total que vio el cliente o el diálogo de gramos.
4. **El ticket térmico (de Jero) imprime una línea por bolsa** (anotado el 26/09/2026, a
   pedido del dueño; no hay impresora térmica a mano para probarlo). Un granel que salió de
   dos bolsas sale como "Maní Pelado 500 g $800" y "Maní Pelado 1,5 kg $2.400": el total
   está bien, pero el cliente ve dos renglones del mismo producto. Arreglo propuesto: que
   `ticketDocumento` (admin-ticket.js) junte los renglones de un mismo granel con escalas en
   uno, como `vistaItemsVenta` en la venta ("Maní Pelado 2 kg $3.200"), sumando los
   subtotales de cada renglón para que el total no cambie. Probarlo con la impresora.

### N) Pedidos del 26/09 en el panel, e "Inicio del día" (experimental) · **SUBIDO A PRODUCCIÓN el 27/09/2026** (hecho el 26-27/09)

- **Productos:** las listas de proveedores detrás del botón "Ver listas de proveedores"
  (abierto de entrada), en un recuadro y con buscador. La elegida ya no salta al principio:
  siempre en orden alfabético, solo marcada.
- **Etiquetas:** el botón de la ficha imprime la HOJA A4 llena (24, 14, 40 o 65 por hoja,
  hasta 5 hojas, con o sin precio). Antes era una sola etiqueta y el resto de la hoja se perdía.
- **Caja:** un ingreso o egreso se puede **deshacer** mientras la caja está abierta. No se
  borra: queda tachado con "DESHECHO", quién y cuándo, y deja de contar (cierre, planilla y PDF).
- **Centro de avisos (era "Inicio del día"; EXPERIMENTAL, a pedido del dueño para ver qué sale):** una sección nueva,
  la primera al entrar, pensada para la dueña (`admin-inicio.js`). Muestra cómo fue ayer
  (neto, ventas, ganancia, contra el mismo día de la semana anterior, lo más vendido), lo que
  **se vende y está sin stock** (con "Agregar stock" ahí mismo; una bolsa vacía de un granel
  que tiene otra va aparte), los **costos viejos de lo que se vende**, de a 10 y con el mismo
  editor que sale al vender, lo que **se está por terminar** al ritmo del último mes y la caja
  abierta de otro día. Lee las ventas de 30 días una vez por día (~250 lecturas en producción).
  **El aviso de costos depende del backfill de `costoActualizadoEn`** (hecho al subir, el 27/09): sin fechas dice que no
  se sabe (no dice "al día"). El dueño la vio y le gustó; pidió dos ajustes, ya hechos: **el
  stock negativo no aparece** (ojo: el mostrador ya no vende sin stock, pero un pedido web todavía puede
  dejarlo en negativo; esos no se ven. **Decidido por el dueño el 26/09: quedan ocultos**), y en "Revisar costos" **solo
  sale de la lista el costo que se cambia** (o el que se tilda "Sigue igual"); al vender el
  editor sigue confirmando todo.
- **Ticket del pedido:** "Imprimir ticket del pedido" en la ventana del pedido
  (`admin-ticket-pedido.js`), para darle al cliente cuando retira. Misma impresora y formato que el
  ticket de la venta. Si el pedido ya se cobró, salen los renglones de la venta y el medio de
  pago. **Falta probarlo con la impresora térmica.**
- **Clientes del local en la venta:** el buscador de cliente de la venta (minorista y
  mayorista) muestra también los clientes cargados en el panel, no solo los que entraron con
  Google, y trae "Agregar cliente nuevo" (`admin-clientes.js`). La ficha avisa si ya hay uno
  con ese teléfono o DNI (la casilla de promociones se sacó). En el menú: "Clientes del local"
  y "Clientes de la web". Comprar en la TIENDA sin entrar con Google es otra cosa (reglas,
  functions y protección contra abuso): no se hizo.
- **Ventas con otra cara (experimental):** encabezado, números con íconos, la lista agrupada
  por día con lo cobrado en el día, filas con etiquetas de color, y la ventana de la venta más
  clara. Mismos ids y funciones.

- **La venta arranca en Retiro** (minorista y mayorista). En producción los envíos están
  apagados y el botón se esconde, pero cada venta nueva arrancaba igual en "envío": decía
  "Envío GRATIS" y se guardaba como envío. Venía de antes.

- **Los buscadores, bien a la vista** (opción A, elegida por el dueño): más altos, con borde
  verde y la lupa más grande, en Ventas (minoristas y mayoristas), Pedidos, Clientes del local
  y de la web, Cupones, Productos (también el de las listas de proveedores), Stock, Insumos,
  Proveedores e Historial. Es solo CSS (`.search-box.campo-destacado`); el de Proveedores
  además pasó a tener lupa, como los demás.

- **Costos viejos: las bolsas y presentaciones de un producto van juntas** (Centro de
  avisos). Cada una tiene su costo y su fecha; aparecen una abajo de la otra, y también
  la que no se vendió sola en el mes si el producto sí se vende (antes la bolsa de 2 kg
  del maní no salía nunca).
- **El tamaño en el nombre, en todos los avisos del Centro**: "Maní Pelado x 1 kg", con la
  misma forma que la otra bolsa ("Maní Pelado x 2 kg"). También en la ventana de revisar
  costos y en los avisos de stock al vender, que decían "Maní Pelado (1 kg)".
- **Formulario del producto, bien a la vista** (27/09): al crear o editar un producto, los
  campos, los desplegables y los botones resaltan (la misma receta que los buscadores). Es
  solo CSS; los precios que se calculan solos quedan apagados, porque ahí no se escribe.
- **El costo de una bolsa, por bolsa** (27/09): la ventana de costos (al vender, desde el
  Centro de avisos o desde Productos) pide lo que costó la bolsa entera, como el
  formulario, y al lado muestra el kilo, el precio y el mayorista que quedan. En la lista
  de productos, el panel de las bolsas tiene la columna Costo: tocarla abre esa ventana con
  todas las bolsas del producto. Ojo: la bolsa de 3 kg cargada a $2.000 se ve como $2.001,
  porque el kilo se guarda en pesos enteros ($667). Se decidió dejarlo así (27/09): un "?"
  lo explica donde aparece el costo de una bolsa, y dice primero que NO se pierde dinero.

- **Arreglos de la revisión del 27/09** (15 puntos, todos con su prueba):
  - la ventana de costos ya no cambia sola el costo de una bolsa de menos de 1 kg que no se
    tocó (el redondeo de ida y vuelta entre la bolsa y el kilo); lo escrito que da el mismo
    kilo se confirma con la fecha y se dice ("quedó igual por el redondeo del kilo");
  - el aviso al vender y el Centro de avisos muestran el costo de la bolsa, como lo pide la
    ventana ("$2.001 la bolsa ($667 el kilo)");
  - los nombres no repiten el tamaño ("x 25 Kg x 25kg"), no agregan el nombre público como
    tamaño, y las bolsas de un producto usan todas el nombre interno;
  - el "?" dice "unos pesos" (hasta $12 en una bolsa de 25 kg) y en la ventana va abajo;
  - guardar dos veces seguidas no escribe dos veces, y un guardado no cierra otra ventana;
  - los atajos de teclado no actúan detrás de una ventana abierta;
  - con los envíos apagados, editar una venta vieja guardada como envío sin cargo la pasa a
    retiro (las que cobraron envío quedan como están);
  - la vista previa muestra la caja cerrada, la oferta y el precio real (el redondeado);
  - la columna Costo y la ventana hacen la misma cuenta; una venta que sacó de dos bolsas
    cuenta una vez al ordenar;
  - el sandbox desde la vista previa no se corre de puerto: si el 5173 está ocupado, no arranca.

Pruebas: 3580 en 85 suites.

### O) Stock: un producto con bolsas o presentaciones es un bloque · **SUBIDO A PRODUCCIÓN el 28/09/2026**

Pedido del dueño: en Productos, un producto con varias bolsas ya era una fila, pero en Stock,
buscando "Mani", salían separadas la de 1 kg y la de 3 kg, y la de 1 kg (la principal) sin el
tamaño en el nombre.
- **Stock:** ahora es un bloque, como en Productos. Arriba van la foto, el nombre, "2 bolsas" (o
  "3 presentaciones") y la categoría. Abajo, **siempre a la vista** (lo eligió el dueño), una fila
  por tamaño ("1 kg", "3 kg"), cada una con su casilla, su stock, "Agregar stock" y el lápiz.
  `agruparParaStock` (admin-variantes.js) arma la lista y `renderStockList` (admin.html) la dibuja.
  - Se agrupa antes de paginar: una página son 20 productos, no 20 tamaños.
  - El bloque va donde aparece el primero de sus tamaños: con "Menor stock", a la altura de su
    bolsa más vacía.
  - Buscando "3 kg" sale el bloque entero, con esa bolsa resaltada. "Seleccionar los visibles"
    alcanza solo a las que coinciden: la de 1 kg se ve, pero no entra en la carga en tanda. (Lo
    encontró la revisión de código: antes del arreglo, le sumaba también a la de 1 kg.)
  - El nombre del bloque va sin el tamaño y sin paréntesis vacíos ("Yerba Mate (500 Gr)" ->
    "Yerba Mate"). `baseDeNombre` no se tocó, porque también arma el nombre que se guarda.
  - Si un tamaño es otro producto (enganchado con "Asociar uno existente"), su nombre va abajo
    del tamaño, chico: en el sandbox, "1 Kg" dice abajo "Te Verde Tostado". (Lo encontró la
    segunda revisión, antes de subir: la fila decía solo "1 Kg".)
- **El nombre con su tamaño** (`_stkNombre`, admin-stock.js): las ventanas de "Agregar stock" y
  de corregir, el aviso, el historial y la carga en tanda dicen "Mani prueba x 1 kg". Es solo lo
  que se muestra: el nombre guardado del producto no cambia.
- **Visto en el celular (viene de antes, no se tocó):** las filas de Stock no entran en una
  pantalla angosta. El nombre queda tapado y el lápiz cortado, tanto en las filas sueltas como en
  el bloque (ahí no se ve el "1 kg"). Si se quiere, se acomoda aparte.

**Revisión antes de subir (28/09):** además del arreglo de arriba, quedaron anotados sin hacer
(menores):
- un nombre con fracción ("1/2 KG") queda raro en el bloque ("YERBA PLAYADITO 1/"). Es lo de las
  fracciones de CONTEXTO §7.3, y no hay grupos así;
- buscando "3 kg", el texto dice "Seleccionar los 1 visibles" con dos filas a la vista. Es a
  propósito: la de 1 kg no entra en la carga en tanda;
- con muchos grupos, agrupar tarda más en cada tecla del buscador: 0,7 ms hoy (1 grupo) y 12,7 ms
  con 400 (medido con 1316 productos). Mirarlo después de la migración;
- en Compras la bolsa principal sigue sin el tamaño ("Mani prueba"): el nombre con el tamaño se
  agregó solo en Stock (**arreglado el 29/09**, §R);
- código: `agruparParaStock` repite el recorrido de `agruparParaTabla`, la carga en tanda repite
  la regla de `_stkNombre`, y queda un `if` que nunca se cumple;
- si un tamaño se cargó con el mismo nombre pero con un punto de más ("Mani pelado."), la fila
  repite el nombre abajo, chico. No molesta.

En producción hoy hay un solo grupo, AJI MOLIDO EXTRA (1 kg por peso; 250 g y 500 g por unidad):
en Stock va a ser un bloque "AJI MOLIDO EXTRA · 3 presentaciones" con las tres filas.

Pruebas: `pruebas/t-stock-agrupado.js`, 54 asertos (fallan contra el commit anterior). Total:
3634 en 86 suites. Probado en el sandbox con clics de verdad (agregar y corregir el stock de un
tamaño del bloque, y dejarlo como estaba).

### P) Etiquetas en papel térmico adhesivo · **SUBIDO A PRODUCCIÓN el 28/09/2026**

Pregunta del dueño: si "Imprimir etiquetas" sirve para una térmica con papel adhesivo. **Ya
servía**: en Formato están los rollos térmicos (58 × 40, 50 × 30 y 40 × 30 mm, y "Personalizado"
con la casilla "Térmica"), y con un rollo térmico aparece "Rollo continuo":
- **tildado** (viene así): papel de ticket adhesivo, en tira. Salen todas juntas y se cortan con
  tijera;
- **destildado**: rollo de etiquetas ya cortadas (troquelado), el de las impresoras de etiquetas.
  Cada etiqueta es su propia página, del tamaño exacto de la etiqueta.

Lo que se cambió (`admin-etiquetas.js` y la ayuda en `admin.html`):
- **El rollo de 50 × 25 mm**, la etiqueta adhesiva térmica más común. El código sale al 123% y
  entra de sobra; en el sandbox, con "Aceite De Almendras Tostado" y el precio, no se sale nada.
- **En la térmica el texto va en negro puro.** El gramaje (#333) y el código interno (#666) iban en
  gris, y la térmica no imprime grises: los imita salteando puntos, y en letra chica sale
  desflecado. En A4 siguen en gris.
- **Se acuerda de lo último que se usó** (lo encontró la revisión antes de subir): el formato,
  "Rollo continuo" y la separación se guardan al imprimir y vuelven la próxima vez que se abre la
  ventana, en ese navegador. Antes volvía siempre a "Hoja A4" y con "Rollo continuo" tildado: con
  un rollo de etiquetas ya cortadas, olvidarse de destildarlo un día imprimía una tira corrida y se
  perdía esa tanda.
- **La ayuda de "Rollo continuo", en palabras simples**: decía "troquelado"; ahora dice "si el
  rollo trae las etiquetas ya cortadas, separadas una de otra" y que se recuerda.

Para tener en cuenta (no se tocó; falta probarlo con la impresora, como el ticket):
- en rollo continuo el largo de la tira lo decide la impresora: Chrome descarta
  `@page{size:58mm auto}` (no es una medida válida; lo mismo pasa en el ticket). Si la tira sale
  partida en varias páginas, en la configuración de la impresora hay que elegir el papel de rollo
  más largo;
- el botón de la ficha del producto sigue imprimiendo solo hojas A4 (pedido del comercio del
  26/09); las térmicas se imprimen desde "Imprimir etiquetas".

Pruebas: 6 asertos nuevos en `pruebas/t-etiquetas.js` (148) y `pruebas/t-etiquetas-recuerda.js`
(17, que fallan contra el commit anterior). Total: 3660 en 87 suites. Probado en el sandbox: se
eligió el rollo de 50 × 25 sin "Rollo continuo", se recargó la página y volvió así.

**Subido el 28/09/2026** (O y P juntos, pedido por el dueño después de la revisión de código): push a
`main` hasta `86d51dd`. Vercel sirve los mismos archivos que el repo (`admin.html`,
`admin-etiquetas.js`, `admin-variantes.js`, `admin-stock.js`, `app.min.js`, `styles.min.css`) y los
`.md` no se publican. La tienda y la pantalla de ingreso del panel cargan sin errores (sin iniciar
sesión) y el panel ya trae lo nuevo. Las functions y las reglas no cambiaron. Falta probar las
etiquetas con la impresora térmica, junto con el ticket.

### Q) Vender sin stock suficiente: se avisa y se deja · **SUBIDO A PRODUCCIÓN el 29/09/2026**

Pedido del dueño: el freno del 26/09 no dejaba vender, por ejemplo, 3 bolsas de maní de 80 g con 2
en stock. Ahora se puede, con un aviso claro. Y el Centro de avisos muestra lo que está en negativo.
- **Un solo interruptor:** `FRENAR_VENTA_SIN_STOCK` (admin-variantes.js), en `false`. Ya cambió dos
  veces (el 25/09 avisaba, el 26/09 frenaba, el 29/09 avisa): para volver a frenar alcanza con poner
  `true`, porque todo lo que frenaba pregunta ahí (`stockFrena`). Las pruebas del freno siguen
  corriendo con el interruptor prendido.
- **Al vender** (mostrador y mayorista), se agrega y se cambia la cantidad sin freno. La línea dice
  en amarillo "Solo hay 2 unidades en stock: va a quedar en negativo" (o "Sin stock: ..."). El
  diálogo de gramos deja agregar y avisa ("Ojo: quedan 220 g en stock. Se puede vender igual, y el
  stock va a quedar en negativo."). La otra presentación vuelve a ofrecer "Agregar la de 160 g
  igual". El granel con bolsas se agrega aunque no alcance, con el aviso de la mezcla ("faltan 7,5
  kg... queda con el stock en negativo").
- **Al registrar**, si algo no alcanza sale "Stock insuficiente", con el ícono amarillo: "Estás por
  vender más de lo que tenés en stock", cada producto con cuánto hay, cuánto se vende y en cuánto
  queda ("Va a quedar en -1 unidad."), que se puede vender igual y que después se carga en Stock con
  "Agregar stock". Botones: "Vender igual" y "Revisar la venta".
- **Centro de avisos:** la tarjeta de lo que se vende sin stock ahora incluye el negativo ("3
  productos que se venden están sin stock o en negativo"), cada uno con "se vendió más de lo que
  había cargado", y el texto ya no dice que el sistema no deja vender.

Probado en el sandbox con clics de verdad: 3 castañas con 2 en stock y 1 harina que estaba en -2
(el aviso con los dos, "Vender igual", y quedaron en -1 y -3), el Centro con los negativos, y el
diálogo de gramos con 500 g de un producto que tiene 220 g.

**Revisión de código (29/09), anotado sin hacer:**
- el negativo que no se vendió en el último mes solo se cuenta ("Además hay N productos..."), no se
  lista: **decisión del dueño**, si lo quiere en la lista también;
- el granel con bolsas avisa dos veces (la mezcla al agregar y "Stock insuficiente" al registrar), y
  la otra presentación también;
- una bolsa en negativo, con otra bolsa que tiene stock, sale en "Bolsas vacías" sin decir que está
  en negativo;
- Enter confirma "Vender igual" (el foco arranca ahí, como en los otros avisos);
- el freno queda en el código detrás del interruptor: son dos modos para mantener.

Pruebas: `t-escalas.js` (242: las del freno con el interruptor prendido, y 25 nuevas del aviso),
`t-variantes.js` (238) y `t-inicio.js` (89). Total: 3688 en 87 suites.

**Subido el 29/09/2026** (pedido por el dueño, con la clienta usando el sistema: se vio antes que era
seguro, porque solo cambia el panel, la pestaña abierta sigue con lo viejo hasta recargar, y Vercel
sirve el panel con `no-store`): push a `main` hasta `a2f3f77`. Vercel sirve los mismos archivos que
el repo, la tienda y la pantalla de ingreso del panel cargan sin errores (sin iniciar sesión), y el
panel ya trae el aviso. La clienta lo ve al recargar (F5). Functions y reglas, sin cambios.

### R) Cargar compra: las bolsas de un producto van juntas y se cargan por bolsa · **SUBIDO A PRODUCCIÓN el 29/09/2026**

Pedido del dueño: en Proveedores > Cargar compra, "Mani RC" de 1 kg y de 3 kg salían separados,
como dos productos distintos, y el costo se pedía por kilo. Ahora va como en Productos y Stock
(`admin-compras.js` y el CSS en `admin.html`):
- **En la lista para agregar**, las bolsas (o presentaciones) de un producto van en un recuadro,
  "Mani RC · 2 bolsas", cada una con su tamaño, también la principal ("Mani RC x 1 kg"). Una bolsa
  dice lo que cuesta la bolsa, con el kilo entre paréntesis ("$999 la bolsa ($333 el kilo)"); la de
  1 kg, solo la bolsa. El buscador encuentra por el nombre de la tienda, el interno, el que se ve
  con el tamaño o el código. Buscando "Mani RC" no salía la de 1 kg, que en la tienda se llama
  "Mani Recubierto de Chocolate".
- **En "Lo que entró"**, las bolsas de un producto van juntas en un recuadro, de menor a mayor,
  donde entró la primera. Una bolsa pide "Costo de la bolsa", y al lado dice cómo queda el kilo
  ("$400 el kilo"), como en el formulario del producto, con el "?" del redondeo. La cantidad sigue
  en gramos, porque el stock va en gramos.
- **Las cuentas:** el subtotal de una bolsa sale de lo que costó la bolsa: 3 kg a $1.000 son
  $1.000, no $999 del kilo redondeado. El costo se sigue guardando por kilo, con la cuenta del
  formulario (`kiloDeBolsa`). Si se vuelve a escribir la misma bolsa que ya tenía, queda el kilo
  que tenía: la ida y vuelta no es exacta y salía como un cambio de costo. Cada bolsa de la compra
  guarda además `costoBolsa` y `gramosBolsa`.
- **Al guardar:** el resumen dice "6 kg a $1.200 la bolsa". El aviso de costos dice "Mani RC x 3
  kg: $999 → $1.200 la bolsa ($333 → $400 el kilo)". Al ver o exportar la compra sale
  "$1.200/bolsa". Las compras viejas se ven como antes.
- Si admin-variantes.js no carga, todo sigue como antes: por kilo y sin recuadros.

Probado en el sandbox con clics de verdad (ANDNUTS, Mani RC de 1 y 3 kg). Los recuadros salen en
las dos listas. Se cargaron 6000 g de la de 3 kg a $1.200 la bolsa ($400 el kilo, $2.400), 2000 g
de la de 1 kg a $500 y 1 kg de Tostada Integral por kilo: total $9.500. La compra #0007 se guardó
con el stock sumado en gramos y el costo actualizado a $400 el kilo, y "Ver" muestra
"$1.200/bolsa".

Anotado sin hacer: en la ficha del proveedor, "No se vendieron en 90 días" sigue mostrando cada
bolsa por separado, y la principal con el nombre de la tienda (**hecho el 29/09**, §T).

Pruebas: `pruebas/t-compras-bolsas.js` (56, fallan contra el commit anterior), y se ajustaron
`t-exportar.js` (58) y `t-lector-compra.js` (24). Total: 3745 en 88 suites.

**Revisión independiente (29/09), después del commit:** no encontró errores en las cuentas. Se
agregó un aviso: si una bolsa queda con menos gramos que una bolsa (se escribió 2 pensando en 2
bolsas de 3 kg), al guardar sale "Revisá la cantidad", con "Volver y corregir" o "Guardar igual".
Sin eso se cargaban 2 g y la cuenta daba $8 en vez de $24.000, sin que nada lo marcara. Además, el
buscador arma el nombre con el tamaño solo si no encontró por los otros nombres (más liviano con
los proveedores grandes). `t-compras-bolsas.js` quedó en 63 (3 fallan sin el aviso). Probado en el
sandbox: 2 g de la bolsa de 3 kg, sale el aviso, "Volver y corregir" no guarda nada. Anotado sin
hacer: al ver una compra guardada, las bolsas siguen una por renglón, con el tamaño en el nombre
(**hecho el 29/09**, §U).

### S) Proveedores: al borrar la búsqueda vuelven todos · **SUBIDO A PRODUCCIÓN el 29/09/2026**

Pedido del dueño: en Proveedores, buscando un proveedor y borrando después, la lista se quedaba
con lo que había encontrado. Pasaba después de tocar un proveedor, o de cambiar el período, con
algo escrito: la lista se volvía a dibujar solo con los que coincidían, y el buscador, que filtra
escondiendo y mostrando (`provBuscar`), no tenía de dónde sacar a los otros. Ahora
`renderProveedores` (`admin-proveedores.js`) dibuja todos y esconde los que no coinciden. Si no
coincide ninguno, el cartel "Ningún proveedor coincide" va después de las filas, como lo pone
`provBuscar`, que lo saca cuando vuelve a haber resultados. El buscador de proveedores de
Productos no tenía el problema, porque se dibuja entero en cada tecla.

Probado en el sandbox con clics y teclas de verdad. Primero: "andnuts", tocar ANDNUTS y borrar;
vuelven los 20 y ANDNUTS sigue abierto a la derecha. Después: "zzz" y cambiar a 30 días (sale el
cartel) y borrar; vuelven los 20, sin cartel.

Pruebas: 6 nuevas en `pruebas/t-prov-lista.js` (35; 4 fallan contra el commit anterior). Total:
3751 en 88 suites.

### T) La ficha del proveedor: los tamaños de un producto van juntos · **SUBIDO A PRODUCCIÓN el 29/09/2026**

Pedido del dueño, después de §R: en la ficha de ANDNUTS, "No se vendieron en 90 días" mostraba "Mani
Recubierto de Chocolate" (la bolsa de 1 kg, con el nombre de la tienda) y "Mani RC x 3 kg" por
separado. Ahora, en toda la ficha (`admin-proveedores.js` y el CSS en `admin.html`), los tamaños de
un producto van en un recuadro, "Mani RC · 2 bolsas", cada uno con su tamaño ("Mani RC x 1 kg"):
- **No se vendieron:** el recuadro con los tamaños que no se vendieron. Si una bolsa se vendió,
  queda la otra, y la cabecera sigue diciendo cuántas tiene el producto.
- **Los 10 más vendidos y el resto:** el producto entero es un puesto, con lo que facturaron sus
  tamaños juntos. En el recuadro va arriba el total y abajo lo de cada tamaño. La cantidad total va
  solo en las bolsas: sumar unidades de presentaciones distintas (x1 con x12) no dice nada. Un
  producto que ya no está en el catálogo va suelto, como siempre.
- **La lista de proveedores:** "Lo que más deja" sale del mismo ranking agrupado, así dice lo mismo
  que el primer puesto de la ficha.
- **La exportación (PDF y Excel):** igual que en pantalla, con el producto ("Mani RC (2 bolsas)") y
  abajo cada tamaño ("· Mani RC x 1 kg"). En "No se vendieron", que va por categoría, el producto va
  entero en la categoría de su principal: cada tamaño guarda la suya, y si eran distintas salía
  partido en dos bloques (lo encontró la revisión).
- **Los números de la ficha** (productos en el catálogo, cuántos se vendieron, "No se vendieron
  (N)") siguen contando cada tamaño, como la pantalla de Productos.
- Si admin-variantes.js no carga, todo sale como antes.

Probado en el sandbox con clics de verdad. En "No se vendieron" de ANDNUTS, el recuadro del Mani RC
muestra las dos bolsas. Después se hicieron dos ventas de prueba (4 kg, que se cobra como la bolsa de
3 kg, y 500 g, que sale de la de 1 kg), y la ficha muestra el puesto 4 "Mani RC · 2 bolsas", con 4,5
kg y $2.358, y abajo cada bolsa. En la tarjeta angosta, la cabecera baja de línea en vez de cortarse.
Quedaron en el sandbox las ventas #41 y #42 y las compras #7 y #8 de prueba.

Pruebas: `pruebas/t-prov-bolsas.js` (30; 21 fallan contra el commit anterior), y se ajustaron
`t-exportar.js` y `t-prov-lista.js`. Total: 3788 en 89 suites.

**Revisión independiente (29/09):** no encontró errores en las cuentas ni en lo que se muestra
(probó además 800 catálogos al azar, con y sin admin-variantes.js). Lo que encontró y se arregló:
"Lo que más deja" y la exportación partida por categoría (arriba). Anotado sin hacer, menores:
- un tamaño que se vendió y después se depuró sale suelto en lo vendido, porque los depurados no
  entran en los grupos (tampoco en Productos ni en Stock);
- la cabecera dice cuántos tamaños tiene el producto ("2 bolsas") aunque en el recuadro se vea uno
  solo: el otro es de otro proveedor, está oculto o ya se vendió (**se sacó el "2 bolsas" el 29/09**,
  §V);
- "El resto de lo vendido (N)" cuenta productos, y los otros números de la ficha cuentan tamaños;
- los recuadros se reconocen por un campo `grupo` (en Compras y acá). Ningún producto tiene un
  campo con ese nombre; si algún día se agregara, habría que cambiarlo.

### U) Una compra guardada: las bolsas de un producto van juntas · **SUBIDO A PRODUCCIÓN el 29/09/2026**

Pedido del dueño: al abrir una compra ya guardada, cada bolsa salía en su propio renglón. Ahora van
juntas en los tres lugares donde se ve una compra guardada (`admin-compras.js`, `admin-deudas.js` y
el CSS en `admin.html`):
- **Ver**, en las compras de la ficha del proveedor: las bolsas de un producto van en un recuadro,
  con el nombre del producto y lo que se pagó por todas ("Mani RC $3.400"). Abajo va cada bolsa con
  cuántas entraron ("Mani RC x 3 kg · 6 kg (2 bolsas) · $1.200/bolsa · $2.400").
- **Exportar**, en PDF y Excel: el producto va en su fila, sin monto, porque en la columna de
  subtotales se sumaría dos veces. Abajo va cada bolsa ("· Mani RC x 3 kg (2 bolsas)").
- **Deudas**, al desplegar una compra: una fila con el producto y el total, y abajo cada bolsa con
  una raya verde a la izquierda.
- La cabecera no dice "2 bolsas", que son los tamaños que tiene el producto: en una compra se
  leería como las bolsas que entraron.
- Una compra de antes de §R también se agrupa, según el catálogo de hoy. Sus bolsas se ven por
  kilo, como se cargaron.

Probado en el sandbox con clics de verdad: "Ver" de la compra #7, y una compra de prueba (#9) que
quedó como deuda, desplegada en Deudas. Pruebas: 9 nuevas en `pruebas/t-compras-bolsas.js` (72), y
se ajustó `t-exportar.js`. Total: 3797 en 89 suites.

### V) Los recuadros, sin "2 bolsas" · **SUBIDO A PRODUCCIÓN el 29/09/2026**

Pedido del dueño: la cabecera de los recuadros de Cargar compra y de la ficha del proveedor decía
"Mani RC · 2 bolsas" (o "· 2 presentaciones"), que son los tamaños que tiene el producto. Se leía
como las bolsas que entraron o que se vendieron, y a veces el recuadro mostraba una sola. Ahora
dice solo el nombre del producto, "Mani RC". Vale para la lista para agregar, "Lo que entró", lo
vendido y lo que no se vendió de la ficha, y su exportación (sin "(2 bolsas)"). Stock y Productos
siguen como estaban: ahí se ven siempre todos los tamaños.

Probado en el sandbox. Pruebas: `t-compras-bolsas.js` (73) y `t-prov-bolsas.js` (32), con una que
verifica que ninguna cabecera diga cuántas bolsas o presentaciones. Total: 3800 en 89 suites.

**R a V, subidos el 29/09/2026** (pedido por el dueño, con la clienta usando el sistema, después de
ver que era seguro: solo cambia el panel, que se carga entero al abrir la página y se sirve con
`no-store`; la pestaña abierta sigue con lo viejo hasta recargar; los datos nuevos de las compras,
`costoBolsa` y `gramosBolsa`, los lee bien el código viejo, y las reglas de `compras` no revisan
campos). Push a `main` hasta `f75f08d`, después de una revisión rápida del último cambio. Vercel
sirve los mismos archivos que el repo. La clienta lo ve al recargar (F5). Functions y reglas, sin
cambios.

### W) Cargar compra: un producto por peso sin otras bolsas también va por bolsa · **SUBIDO A PRODUCCIÓN el 01/10/2026** (30/09/2026)

**Ojo (01/10, ver §AA):** el tamaño de la bolsa del proveedor ya no se guarda en Gramaje /
Presentación, sino aparte (`bolsaGramos`), y Gramaje volvió a ser como siempre.

Pedido del dueño: en Cargar compra, un producto por peso sin otras bolsas (por ejemplo "Harina De
Almendra Tostado") pedía el costo por kilo, y los que tienen bolsas pedían el de la bolsa. Ahora
también va por bolsa si el producto dice de cuánto es la bolsa: en el nombre ("LENTEJA TURCA x 1
kg") o en el campo "Gramaje / presentación" de su ficha. La fila pide "Costo de la bolsa" y al lado
dice cómo queda el kilo, como los productos con bolsas. Con eso vienen las cuentas por bolsa, el
aviso de "menos de una bolsa", y la compra guardada y el aviso de costos por bolsa
(`_cpGramosBolsa` en `admin-compras.js`). El costo se sigue guardando por kilo.

En producción, de 588 productos por peso sin otras bolsas, 470 dicen de cuánto es la bolsa (467 en
el nombre y 3 en el tamaño) y 118 no lo dicen, por ejemplo "Avellana" o "Quinoa Inflada".

**Si el producto no dice de cuánto es la bolsa, la compra lo pregunta** (lo eligió el dueño; la
primera versión, con la aclaración "sin tamaño de bolsa" y el costo por kilo, no se entendía):
- la fila muestra "¿De cuánto es la bolsa?". Se escribe "5", "5 kg", "500 g" o "2,5": un número
  solo son kilos, y de 100 para arriba gramos ("500" es una bolsa de 500 g);
- al escribirlo, dice "Bolsa de 5 kg", se habilita "Costo de la bolsa" (arranca con el del kilo que
  tenía el producto) y al lado sale el kilo. Mientras falta, el costo está apagado, al lado dice
  "falta la bolsa" en amarillo y la fila cuenta $0;
- sin el tamaño no se guarda ("Falta de cuánto es la bolsa de: ..."). Si se compró suelto, "1 kg";
- al guardar, el tamaño queda anotado en "Gramaje / presentación" del producto (solo si sigue sin
  decirlo), y el resumen lo avisa: "(bolsa de 5 kg, queda anotada en el producto)". La próxima
  compra ya lo pide por bolsa. Ese campo, en un producto sin otras bolsas, no se ve en la tienda
  ni cambia precios (las escalas necesitan dos bolsas o más);
- solo para productos sin otras bolsas: con otras bolsas, el tamaño de cada una se pone en el
  producto, como siempre.

Probado en el sandbox con clics de verdad: a "Harina De Almendra Tostado" se le puso "5 kg" en la
ficha, y en Cargar compra de VERDEDIET dice "costo $51.000 la bolsa ($10.200 el kilo)"; dos bolsas
(10.000 g) a $55.000 dan "$11.000 el kilo" y $110.000. El "Mani RC" que creó el dueño (sin tamaño)
pregunta la bolsa: con "5" queda "Bolsa de 5 kg", $500 la bolsa y $100 el kilo, y a $600, $120 el
kilo (sin guardar, para no tocarle el producto). Con "Tostada Integral" (ANDNUTS, sin tamaño):
sin el tamaño avisa que falta y no guarda; con "1", se guardó la compra y el producto quedó con
"1 kg"; la compra siguiente ya la pide por bolsa. Pruebas: `pruebas/t-compras-bolsas.js` (105) y
se ajustó `t-lector-compra.js`. Total: 3832 en 89 suites.

### X) El tamaño de la bolsa, solo en Cargar compra · **SUBIDO A PRODUCCIÓN el 01/10/2026** (30/09/2026)

**Ojo (01/10, ver §AA):** el tamaño de la bolsa del proveedor ya no se guarda en Gramaje /
Presentación, sino aparte (`bolsaGramos`), y Gramaje volvió a ser como siempre.

Pedido del dueño, después de §W: guardó una compra de "Mani RC" diciendo que la bolsa era de 2 kg, y
al volver a Cargar compra no se veía en ningún lado de cuánto era la bolsa. Además preguntó si
"Gramaje / presentación" es lo que ve el cliente.

**Qué es "Gramaje / presentación"** (lo que se le respondió): un solo tamaño por producto, no una
lista. Las opciones para el cliente son las presentaciones: cada una es su propio producto (se arma
con "Agregar otra presentación", en la sección Presentaciones de la ficha), y su tamaño es el botón
que elige el cliente. En un producto sin presentaciones la tienda no lo muestra. En uno por peso es
la bolsa que se le compra al proveedor; el cliente compra por gramos (y si hay varias bolsas, con
las escalas de precio).

Lo que quedó:
- **Cargar compra dice qué bolsa es**, cuando el nombre no lo dice (`_cpDeBolsa`): en la lista,
  "costo $1.000 la bolsa de 2 kg ($500 el kilo)"; en la fila, "Costo de la bolsa de 2 kg"; al ver la
  compra, en Deudas y en la exportación, "3 kg (1,5 bolsas de 2 kg)"; en el resumen al guardar y en
  el aviso de costos, "la bolsa de 2 kg". "Mani RC x 3 kg" o "Lenteja x 5 kg" no lo repiten.
- **En la ficha, solo el nombre:** en un producto por peso, "Gramaje / Presentación" se llama
  "Tamaño de la bolsa (opcional — la que le comprás al proveedor: 1 kg, 5 kg, 25 kg)"
  (`_etqTamanoBolsa`, admin-escalas.js); por unidad sigue como siempre. Ahí se ve el tamaño que
  anotó la compra. La ayuda de "Nueva variante" lo nombra igual (`_pintarVariantes`).

**Lo que se deshizo** (Thiago, 30/09: "nos la estamos complicando demasiado"; eligió dejarlo solo en
Cargar compra). En `ad364f2` lo de la bolsa se había llevado también a la ventana de costos y los
avisos (`gramosDeBolsa` contaba como bolsa un granel sin otras bolsas que dice su tamaño) y a la
ayuda de la ficha ("Costo de la bolsa de 2 kg", ya cargada). Se volvió atrás: `gramosDeBolsa`, la
ventana de costos, los avisos y la ayuda "¿Tenés lo que costó la bolsa?" quedan como en producción,
por kilo, y Cargar compra vuelve a su propia regla (`_cpGramosBolsa`, la de §W). Lo que se resigna:
en la ventana de costos esos productos se siguen cargando por kilo. Si a la clienta le molesta, se
agrega después.

Probado en el sandbox con clics de verdad: en Cargar compra de ANDNUTS, el Mani RC dice "costo
$1.000 la bolsa de 2 kg ($500 el kilo)" y "Costo de la bolsa de 2 kg"; su ficha dice "Tamaño de la
bolsa: 2 kg" y la ayuda de siempre ("¿Tenés lo que costó la bolsa?"). Pruebas: `t-compras-bolsas.js`
(110), `t-escalas.js` (244: el nombre del campo, por peso y por unidad), `t-variantes.js` (240: la
ayuda de "Nueva variante") y `t-exportar.js` (58). Total: 3841 en 89 suites.

### Y) Cargar compra: kg o g al lado del tamaño; el aviso de costos y la calculadora de la ficha, más claros · **SUBIDO A PRODUCCIÓN el 01/10/2026** (30/09/2026)

Pedido del dueño, probando en el sandbox:
- **El tamaño de la bolsa con selector** (`_cpGramosEscritos`, en lugar de `_cpLeerBolsa`): en "¿De
  cuánto es la bolsa?" va el número y al lado un selector kg / g, de entrada kg. Ya no se adivina la
  unidad por el número (antes "500" eran 500 g y "50" eran 50 kg; ahora "500" con kg son 500 kg).
  El campo toma solo números ("2,5" o "2.5"); la unidad va en el selector. Entra en la fila con el
  mismo ancho que antes (96 px).
- **El aviso de costos, más claro** (`ofrecerActualizarCostos`): el título pregunta ("¿Actualizar el
  costo?" o "¿Actualizar los costos?"); cada producto va con dos renglones, "Tenía cargado: $750 la
  bolsa de 3 kg ($250 el kilo)" y "En esta compra: $900 la bolsa de 3 kg ($300 el kilo)", sin
  flechas; abajo, "Si tocás "Actualizar", el producto queda con el costo de esta compra. El precio de
  venta no cambia: lo que cambia es cuánto ganás en cada venta." Los botones: "Dejar como estaba" y
  "Actualizar". Antes: "$1.000 → $500 la bolsa de 2 kg ($500 → $250 el kilo)" y "Si los actualizó,
  el precio de venta NO cambia: cambia el margen que muestra Ganancia", con "Cancelar".
- **La calculadora de la bolsa en la ficha, con texto claro** (el dueño preguntó para qué servía; se
  le explicó y eligió dejarla con texto claro): "¿La factura dice el precio de la bolsa de 3 kg?
  Escribilo acá y se calcula solo el costo por kilo."; abajo, sin escribir nada, "Hoy: $250 el kilo
  = $750 la bolsa de 3 kg."; escribiendo, "= $300 el kilo. Ya quedó puesto arriba, en Costo por
  kilo." Solo cambió el texto (antes: "¿Tenés lo que costó la bolsa? Bolsa de 3 kg:" y "Con $250 el
  kilo, la bolsa de 3 kg sale $750.").

Probado en el sandbox con clics de verdad: en Cargar compra de FRUTICOR, la Almendra (sin tamaño)
pide el número con "kg" al lado; con 5 queda "Bolsa de 5 kg", $7.500 y $1.500 el kilo; con "g" y
500, "Bolsa de 500 g" y $750; la fila entra en un renglón (con 114 px la × bajaba al otro). El aviso
se abrió con un Mani RC de prueba y se cerró con "Dejar como estaba": el costo no cambió. En la
ficha del Mani RC la calculadora dice el texto nuevo; escribiendo $900, el costo por kilo pasa a
$300. Nada se guardó. Pruebas: `t-compras-bolsas.js` (114) y `t-escalas.js` (245). Total: 3846 en
89 suites.

### Z) El tamaño de la bolsa en kilos, y el camino a "Agregar otra bolsa" · **SUBIDO A PRODUCCIÓN el 01/10/2026** (30/09 y 01/10/2026)

**Ojo (01/10, ver §AA):** el tamaño de la bolsa del proveedor ya no se guarda en Gramaje /
Presentación, sino aparte (`bolsaGramos`), y Gramaje volvió a ser como siempre.

Pedido del dueño (probando en el sandbox había escrito "2 kg, 3 kg" en el tamaño de un solo producto):
- **Cargar compra:** el número del tamaño de la bolsa acepta hasta 5 caracteres (`maxlength`).
- **La ficha de un producto por peso:** "Tamaño de la bolsa" se escribe en kilos, en un campo
  angosto con "kilos" al lado: solo el número (sin espacios ni letras; con coma para medio kilo,
  "0,5"), hasta 5 caracteres (`_campoKilos`, admin-escalas.js). Es el campo de la tabla de bolsas
  (`_tamPartes`, `_tamTexto`, `limpiarNumeroTam`); Gramaje / Presentación queda escondido y sigue
  guardando "5 kg", que es lo que lee todo lo demás. Por unidad, el campo de siempre.
- Abajo, **"¿Querés disponer de más tamaños?"** (`irAMasTamanos`): baja hasta "Bolsas y precios por
  cantidad" y resalta un segundo la sección y el botón "Agregar otra bolsa", sin tocarlo. Aparece
  solo si abajo está ese botón (no en una bolsa que no es la principal ni en una variante nueva).
- Por el campo nuevo: en "Nueva variante" de un producto por peso, la ayuda dice "de cuántos kilos
  es: 1, 3, 5...", el cursor va al campo de kilos y, si falta, el aviso dice "Poné de cuántos kilos
  es la bolsa (ej. 3)." (`_campoTamVisible`, admin-variantes.js).

Probado en el sandbox con clics de verdad: en Cargar compra de FRUTICOR, "1234567" en el tamaño
queda "12345"; en la ficha de Semilla De Chia (por peso), "5 kg" queda "5" con "kilos" al lado y se
guarda "5 kg"; "2,5" guarda "2,5 kg"; el link baja a "Bolsas y precios por cantidad" y resalta el
botón sin agregar ninguna fila; un producto nuevo por unidad muestra el campo de siempre, y por
peso el de kilos; en "Nueva variante" de un producto por peso el cursor va al campo de kilos. Nada
se guardó. Pruebas: `t-compras-bolsas.js` (114), `t-escalas.js` (255) y `t-variantes.js` (242).
Total: 3858 en 89 suites.

### AA) El tamaño de la bolsa, aparte de Gramaje; y la lista de precios dice "el kilo" · **SUBIDO A PRODUCCIÓN el 01/10/2026** (01/10/2026)

Thiago dudaba de usar "Gramaje / Presentación" para la bolsa (la clienta lo usa: había visto "250cc"
en un producto). Se investigó para qué sirve, probándolo en el sandbox:
- **Lista de precios en PDF** ("Exportar PDF" y "PDF M"): va pegado al nombre, "Aceite De Almendras
  250 cc $29.600". Es lo más visible: esa lista se les pasa a los clientes.
- **Etiquetas impresas**: debajo del nombre.
- **Venta de mostrador**: etiqueta gris al lado del stock, y se puede buscar por eso ("250 cc").
- **Exportar Costos (Excel)**: columna GRAMAJE.
- **Tienda**: solo en un producto con presentaciones, como texto de cada botón; en uno suelto no se
  ve, ni en la tarjeta ni en el detalle.
- En producción lo tienen 8 de 1.317 productos: 5 por unidad ("250 cc" en un aceite de oliva y
  "850" en unos canelones, visibles; "360cc" x2 y "350g", ocultos) y 3 por peso (Harina de almendras
  x 1, 5 y 25 kg, ocultas). Ninguno en un grupo.

El problema: con §W y §Z, la bolsa del proveedor de un producto por peso se guardaba en Gramaje, y
salía en la lista de precios ("Semilla De Chia 2 kg $21.590", con el precio del kilo), en la etiqueta
que se pega en la bolsa fraccionada ("2 kg" en una de 250 g) y en el mostrador. No llegó a producción.

Lo que se hizo (Thiago eligió esto):
- **El tamaño de la bolsa va aparte**, en el producto como `bolsaGramos` (gramos). En la ficha de un
  producto por peso sin otras bolsas, abajo del costo por kilo: "Tamaño de la bolsa que le comprás al
  proveedor (opcional)", en kilos (solo el número, hasta 5 caracteres), con "Para cargar las compras
  por bolsa. No lo ve el cliente." y debajo "¿Querés disponer de más tamaños?" (`_campoBolsa`,
  `_ponerBolsaDelProducto`, `datosBolsaProveedor`, admin-escalas.js; se guarda con un enganche en
  saveProduct, como la caja cerrada: si se borra, se borra; uno que nunca lo tuvo no gana el campo).
  No va por unidad ni en una bolsa de un grupo: ahí el tamaño es su Gramaje, como siempre.
- **Gramaje / Presentación vuelve a ser como estaba** para todos los productos: mismo nombre, texto
  libre, a la vista. Se deshizo el nombre "Tamaño de la bolsa" (§X) y el campo en kilos que lo
  reemplazaba (§Z); admin-variantes.js quedó como en producción, salvo un comentario.
- **Cargar compra** saca la bolsa de `bolsaGramos` o del nombre ("x 5 kg"), ya no de Gramaje, y al
  guardar anota `bolsaGramos` (`_cpGramosBolsa`, `_cpAnotarBolsas`). La calculadora de la ficha
  también (`_gramosBolsaForm`).
- **La lista de precios en PDF** (minorista y mayorista: exportCatalogoPDF) dice "el kilo" al lado
  del precio de los productos por peso ("$21.590 el kilo"), como la tienda; el nombre se corta antes
  contando eso.

Probado en el sandbox con clics de verdad: en la Semilla De Chia se borró el "2 kg" de Gramaje y se
puso 2 kilos en la bolsa; se guardó `bolsaGramos: 2000` con Gramaje vacío, la calculadora dice "la
bolsa de 2 kg", Cargar compra la carga por bolsa de 2 kg y la lista de precios dice "Semilla De Chia
$21.590 el kilo". Una compra de Almendra (FRUTICOR, sin tamaño) con bolsa de 5 kg dejó
`bolsaGramos: 5000` sin tocar Gramaje. El Aceite De Almendras sigue con "250 cc" en la lista, la
etiqueta y el mostrador. Pruebas: `t-escalas.js` (263), `t-compras-bolsas.js` (116), `t-variantes.js`
(238, como en producción) y `t-lista-pdf.js` (11, nuevo: corre la lista de precios de verdad con un
PDF de mentira). Total: 3875 en 90 suites.

### AB) Las exportaciones con bolsas; los grupos juntos en la lista de precios; "o la bolsa" en Revisar costos · **SUBIDO A PRODUCCIÓN el 01/10/2026** (01/10/2026)

Thiago pidió revisar cómo salen en las exportaciones los productos con varias bolsas o
presentaciones. Probado en el sandbox con un grupo armado con "Agregar otra bolsa" ("Mani" de 1 kg y
"Mani x 5 kg") y uno por unidad, interceptando las descargas:
- **Exportar PDF y Exportar PDF M** (exportCatalogoPDF; la mayorista usa la misma): cada bolsa o
  presentación en su renglón, con su precio, y "el kilo" en las de peso. Los ocultos no van. Bien.
- **Exportar Costos** (Excel/CSV): una fila por producto con su costo, %, precio y gramaje; se
  vuelve a importar bien (cada uno tiene su nombre). No dice qué costos son por kilo y las filas de
  un grupo pueden quedar lejos (se ofreció una columna "SE VENDE" y ordenarlas; no se eligió).
- **Exportar de la ficha del proveedor y de las compras** (exportarDoc): ya agrupan (§T, §U).

Lo que se hizo (eligió dos de cuatro):
- **La lista de precios en PDF, con cada grupo junto** (minorista y mayorista): en la categoría de su
  principal, donde iría el principal por nombre, y de menor a mayor, unidad antes que peso, como los
  botones de la tienda (`_ppal`, `_tamDe`). Antes se ordenaba por nombre: "Mani Salado" quedaba entre
  "Mani" y "Mani x 5 kg", y "x 10 kg" antes que "x 3 kg".
- **"o la bolsa de 5 kg" en la ventana de costos** ("Revisar costos" del Centro de avisos, "Cambiar
  costos" y el aviso al vender): en un granel sin otras bolsas que sabe de cuánto es su bolsa
  (`bolsaGramos` o el nombre), un renglón opcional abajo de la fila: "O el costo de la bolsa de 5
  kg:" con una flecha que sale del nombre, el campo justo abajo del costo por kilo (mismo ancho,
  "de la factura" de ayuda) y "Sigue igual" en el medio de los dos; en el celular, el texto arriba
  y el campo abajo. Lo que dice la factura, y el costo por kilo sale solo en el campo de siempre
  (`_costoBolsaSuelto`, `costoBolsaEnEditor`, admin-costos.js). Escribir el kilo a mano lo vacía. Se guarda el kilo, como siempre. No va con
  bolsa de 1 kg (es lo mismo), por unidad ni en una bolsa de un grupo (ahí ya se carga por bolsa).
- No elegidos: "Mani desde 5 kg" en el PDF y la columna "SE VENDE" en el Excel.

Probado en el sandbox con clics de verdad: en la lista de precios, "Mani 1 kg" y "Mani x 5 kg"
salen juntos; en "Revisar estos 8 costos", la Semilla De Lino Tostado (con bolsa de 5 kg puesta en
su ficha) muestra "o la bolsa de 5 kg" y las demás no; $25.000 pone $5.000 el kilo, con su precio
al lado; escribir el kilo a mano vacía la bolsa; "Ahora no" no guardó nada. Pruebas:
`t-lista-pdf.js` (14) y `t-costos-viejos.js` (107). Total: 3885 en 90 suites.

### AC) "Por peso" o "Unitario" en el Centro de avisos; "Costo por bolsa:", "por kilo:" o "por unidad:" en la ventana de costos · **SUBIDO A PRODUCCIÓN el 01/10/2026** (01/10/2026)

Thiago pidió dos grupos de prueba en el sandbox con el costo de hace 3 meses ("Nuez Mariposa" con
bolsas de 1, 3 y 5 kg, y "Miel Pura" con presentaciones de 250 g, 500 g y 1 kg) para ver cómo se
muestran los costos, y después dos cambios visuales para evitar confusiones:
- **En la tarjeta de costos viejos del Centro de avisos**, al lado del nombre, un cuadradito verde
  que dice "Por peso" o "Unitario" (`ini-tipo`, admin-inicio.js). Solo en esa tarjeta: las demás
  (sin stock, por terminarse) siguen como estaban.
- **En la ventana de costos**, arriba de cada campo, qué costo va: "Costo por bolsa:" en las bolsas
  de un grupo, "Costo por kilo:" en los granel y "Costo por unidad:" en el resto (`costos-campo`,
  admin-costos.js; primero fue solo el de bolsa, y Thiago pidió los otros dos al verlo). Es la misma
  ventana de "Revisar costos", "Cambiar costos" y el aviso al vender. El precio y "Sigue igual"
  quedan a la altura del campo; en el celular "Sigue igual" va en su renglón, como en las demás
  filas.

Probado en el sandbox en compu y celular. Pruebas: `t-inicio.js` (92) y `t-costos-viejos.js` (110).
Total: 3891 en 90 suites.

### AD) Revisión antes de subir · **SUBIDO A PRODUCCIÓN el 01/10/2026** (01/10/2026)

Thiago pidió revisar todo lo que falta subir (13 commits, solo panel: sin cambios en la tienda,
las funciones ni las reglas). Se revisó a mano y con dos revisores aparte (Cargar compra; ficha y
lista de precios), y cada hallazgo se comprobó antes de arreglarlo:
- **Borrar lo de la bolsa dejaba el kilo mal** (ventana de costos y calculadora de la ficha):
  borrando de a un número quedaba la cuenta del último ("3" de una bolsa de 5 kg dejaba $1 el kilo,
  y se podía guardar así). Ahora vuelve a lo que tenía antes de escribir la bolsa. En la ficha ya
  pasaba en producción, pero solo con Gramaje; con la bolsa aparte aparece en muchos más productos.
- **Ficha: si se corregía el tamaño de la bolsa, el kilo no se volvía a sacar** (quedaba el de la
  bolsa anterior). Ahora se recalcula.
- **Ficha: "5," o ",5" en el tamaño no se leían**, y al guardar se borraba el que tenía.
- **La bolsa que dice el nombre:** "1/2 kg" se leía como 2 kg y "1.500 g" como 2 g. Esos no se
  toman y la compra pregunta (`bolsaDelNombre`, admin-variantes.js: Cargar compra, la ventana de
  costos y la calculadora). En producción no hay ninguno así hoy: de los 471 que la toman del nombre,
  todos se leen bien ("38/42 x 25 kg" y "x 22.680 kg" también).
- **Cargar compra, en gramos: "1.500" eran 2 g** (el punto como decimal); ahora es de miles. Y "5,"
  o ",5" se leen.
- **El aviso "Falta de cuánto es la bolsa de: ..." no escapaba los nombres** (el aviso es HTML). El
  de "Falta el costo de: ..." ya estaba así en producción y no se tocó.
- **Lista de precios en PDF: una bolsa cuyo principal no sale (oculto o sin precio)** iba a la
  categoría del principal; ahora va sola, en la suya, como en la tienda.
- Sin admin-variantes.js, un granel con su bolsa anotada rompía Cargar compra; vuelve a ir por kilo.

Revisado y bien: las reglas de la base aceptan `bolsaGramos`; guardar un producto usa `update`, así
que una pestaña vieja (sin F5) no lo borra; las cuentas kg/g y bolsa/kilo, el stock en gramos, y el
PDF (orden, "el kilo", mayorista). Visto de paso, viejo y aparte: los productos se pueden leer sin
iniciar sesión (la tienda los necesita), y eso incluye el costo y el porcentaje.

Probado en el sandbox con teclas de verdad (ventana de costos y ficha). Pruebas: 13 nuevas, y cada
una falla con el código de antes. Total: 3904 en 90 suites.

### AE) La fecha del costo, al instante · **SUBIDO A PRODUCCIÓN el 01/10/2026** (01/10/2026)

Thiago pidió una prueba completa en el sandbox: vender un producto por kilo, uno con tamaño de bolsa
y una bolsa de un grupo; cambiar los costos (compra por bolsa, ficha, "Revisar costos" y "Modificar
costos" en plena venta, con "O el costo de la bolsa") y volver a vender. Todos los números dieron
bien: totales, el costo guardado en cada venta, el stock y la compra.

Apareció un detalle viejo (ya estaba en producción): después de cambiar un costo desde una compra
("Actualizar"), la ficha o la tabla de bolsas, el panel seguía viendo la fecha vieja hasta apretar F5.
La anota después `registrarCambioDeCosto`, y la ficha relee el producto antes. Entonces el Centro de
avisos lo seguía mostrando como viejo y al venderlo saltaba "Costos desactualizados". Ahora, si el
costo cambia, la fecha va en la misma escritura (y en memoria), como en la ventana de costos
(admin-costos.js); la función ve que ya viene y no la toca. **Pendiente:** Importar Costos (Excel) y
el PDF semanal siguen igual (ahí se corrige con F5); no tienen pruebas armadas y no se tocaron antes
de subir.

Visto en la prueba, de diseño (en producción ya es así): "Actualizar" en una compra cambia solo el
costo, no el precio. Si el proveedor aumentó, el margen se achica sin que cambie el precio (en la
prueba, el mayorista del Lino quedó igual al costo). Para recalcular el precio: "Revisar costos" o la
ficha. Resuelto el mismo día, a pedido de Thiago: ver §AF.

Probado en el sandbox con clics de verdad en los tres caminos (Castaña por compra, Aceite De Girasol
por la ficha y Nuez x 5 kg por la tabla de bolsas): el panel ve la fecha de hoy al instante y salen
del Centro de avisos. Pruebas: 4 nuevas, y cada una falla con el código de antes. Total: 3908 en 90
suites.

**W a AE, subidos el 01/10/2026** (pedido por Thiago, con la clienta usando el sistema, después de
la revisión y de la prueba completa en el sandbox: solo cambia el panel, que se carga entero al abrir
la página; la pestaña abierta sigue con lo viejo hasta recargar; el campo nuevo `bolsaGramos` lo
aceptan las reglas, y guardar un producto usa `update`, así que una pestaña vieja no lo borra). Push
a `main` de `f75f08d` a `6206081` (15 commits). Vercel sirve los mismos archivos que el repo; la
tienda y la pantalla de ingreso del panel cargan sin errores (sin iniciar sesión). La clienta lo ve
al recargar (F5). Functions y reglas, sin cambios.

### AF) Cargar compra: "Actualizar" también recalcula el precio; al lado del costo, el kilo, el precio y el mayorista · **HECHO, SIN SUBIR** (01/10/2026)

Thiago, al saber que "Actualizar" en una compra cambiaba solo el costo: "¿eso no es un error
gravísimo?". Para el negocio, sí. Si el proveedor aumentaba, se seguía vendiendo al precio viejo sin
aviso (en la prueba, el mayorista del Lino quedó igual al costo), y al abrir después la ficha el
precio saltaba al guardar. Venía así desde que se creó Cargar compra (29/08). En producción todavía
no había hecho daño: de 1219 productos activos, ninguno tenía el precio atrasado respecto de su
costo y su porcentaje (lectura del 01/10).
- "Actualizar" guarda el costo, el precio y el mayorista recalculados con el mismo porcentaje
  (`preciosDesdeCosto`, la misma cuenta que la ventana de costos y la ficha), con la fecha del costo.
  El aviso dice "Precio nuevo: $X (antes $Y)" y "Mayorista nuevo: ...". "Dejar como estaba" no toca
  nada.
- Al lado del costo de la bolsa, en vez de solo "$X el kilo", van el kilo, el precio y el
  mayorista, como en la ventana de costos (`_cpVistaHtml` usa `_costoVistaHtml`): con el costo de
  siempre, los precios que tiene; con otro, los que va a tener. Los renglones por unidad no lo tienen
  (no se pidió).
- La fila quedó más ancha: el nombre se angosta antes (110 px) y, si igual no entra, el subtotal
  baja a la derecha.
- Datos de producción a tener en cuenta: 64 productos tienen un mayorista cargado a mano que no
  coincide con su porcentaje (p. ej. ANIS ESTRELLADO x 10 Kg). Al actualizarles el costo desde una
  compra (o al guardar su ficha), el mayorista se recalcula con su porcentaje, y el aviso lo muestra
  antes. "HARINA DE SESAMO x 25 Kg" tiene mayorista $746 con costo $2.828: dato viejo, para corregir.

Probado en el sandbox con clics de verdad:
- una compra con una bolsa que preguntó el tamaño (Lino) y un unitario (Azúcar), con "Actualizar";
- otra con "Dejar como estaba" (Castaña);
- una bolsa de grupo (Nuez x 3 kg);
- y una venta con los precios nuevos, sin aviso de costo viejo.

Todos los números bien (ventas, costos, stock y compras), y en el celular la fila se acomoda bien.
Pruebas: 7 nuevas, y las que miraban "$X el kilo", actualizadas; con el código de antes fallan 17.
Total: 3915 en 90 suites.

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
npm test          # 756 pruebas, 29 suites — no necesita nada instalado
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

12. **El informe de productos repetidos** (tarjeta *Duplicados* en Productos). YERCO tiene
    el mismo agujero: dos productos con el mismo nombre son dos fichas para el cliente, con
    dos precios y dos stocks, y no hay forma de verlos. Se porta entero: `gruposDuplicados()`,
    el modal, y la prueba `t-duplicados.js`. Reusa `claveProducto()`, que YERCO también tiene.
13. **Que "Volvieron al PDF" filtre por lista.** Las otras tres secciones de la planilla
    filtran por `wpListaId`; esa se quedó afuera y recorre el catálogo entero, así que puede
    ofrecer desocultar productos de otro proveedor que se llamen igual. En YERCO casi no se
    nota porque tiene una sola lista real, pero el defecto está.
14. **El PDF Semanal con la lista elegida en su propio modal** (§1-bis B). En YERCO sigue
    clavado al nombre `'FRUTICOR'` en `openWeeklyPdfModal`, así que si el comercio renombra
    la lista el botón deja de encontrarla. Acá sale de la base.

Una diferencia deliberada: en Brotes el corte del nombre de Google es una función
aparte (`_nombreDesdeGoogle` en `app.js`) y en YERCO quedó en línea. Se hizo para
poder ejecutarla desde las pruebas.

---

## 7. Referencia rápida

| | |
|---|---|
| Proyecto Firebase | `brotesdietetica-2f78e` |
| Proyecto Firebase de YERCO | `yerco-bb620` — **el mismo `gcloud`/`firebase` de esta máquina tiene acceso a los dos**, así que se puede leer YERCO por API sin pedirle nada a nadie |
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
