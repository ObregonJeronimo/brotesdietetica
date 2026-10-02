# Brotes Dietética — contexto completo para retomar el trabajo

> Escrito el 28/09/2026 para retomar después de un `/clear`. Complementa a `PENDIENTE.md`
> (el registro detallado de todo, con fechas) y a la memoria de Claude
> (`~/.claude/projects/C--Users-Thiago-Desktop-brotesdietetica/memory/`, índice en `MEMORY.md`).
> No se publica: `.vercelignore` excluye todos los `*.md`.

Si sos Claude y estás leyendo esto después de un clear: leelo entero, después mirá
`PENDIENTE.md` (secciones 0, M, N, 2 y 5) y tu memoria, y recién ahí seguí. La sección 9
tiene el mensaje que Thiago te pasa para retomar.

---

## 1. Qué es el sistema

**Brotes Dietética** es una dietética de Córdoba (retiro en Rivera Indarte). El sistema tiene
dos partes que comparten la misma base de datos:

- **La tienda online** (`index.html` + `app.js`, que se sirve comprimido como `app.min.js`):
  catálogo, carrito y pedidos web. Los clientes entran con Google.
- **El panel de administración** (`/admin` → `admin.html` + módulos `admin-*.js`): mostrador
  (ventas minoristas y mayoristas), caja, pedidos, clientes, cupones, productos, stock,
  insumos, compras, proveedores, estadísticas, historial, etiquetas, ticket térmico, editor de
  la web, configuración, y el Centro de avisos (la primera pantalla).

Brotes es un **clon de YERCO** (otro comercio del mismo equipo, proyecto Firebase
`yerco-bb620`). Los bugs suelen vivir en los dos; lo que falta portar está en
`PENDIENTE.md` §6. **YERCO se toca desde su propia sesión, no desde acá.**

**Infraestructura:**
- **Firebase** proyecto `brotesdietetica-2f78e`: Firestore, Auth (Google), Storage y Cloud
  Functions (región `southamerica-east1`; las dos de Storage en `us-east1`).
- **Hosting:** Vercel, en https://brotesdietetica.vercel.app. Se publica solo con
  `git push origin main`.
- **Repo:** https://github.com/ObregonJeronimo/brotesdietetica (rama `main`).
- **Cloud Functions desplegadas:**
  - `notifyTelegramOnNewOrder`, `procesarUsoCupon`, `rateLimitPedidos`, `sanitizarPedido`;
  - `descontarStockPedido`, que descuenta el stock de los pedidos web (puede dejarlo en negativo);
  - `sincronizarClaimAdmin`, `aplicarClaimAlIngresar` (v1, auth), `premiarResena`;
  - `sumarUsoStorage`, `restarUsoStorage`, `recalcularUsoStorage`;
  - `registrarReposicion`, que anota `stockSubioEn` cuando sube el stock;
  - `registrarCambioDeCosto` (nueva, 27/09), que anota `costoActualizadoEn` cuando cambia el costo.

## 2. Quiénes están

- **Thiago** (git `ThiagoJoelP`): es quien pide los cambios y decide. Trabaja con Claude en esta
  carpeta (`C:\Users\Thiago\Desktop\brotesdietetica`, Windows).
- **Jero** (`jeroobregon03@gmail.com`): el otro desarrollador. Es dueño del repo, y su mail es
  el "dueño" en `config-negocio.js` y en las reglas. Sus cambios se traen con merge (el último fue
  el 26/09).
- **La clienta:** la dueña del negocio, que usa el panel todos los días. Sabe poco de
  tecnología, así que los textos tienen que ser muy simples.
- **Deft** (Deft Software Solutions) es el equipo o empresa. Hay pendientes "para Deft" en
  `PENDIENTE.md` §0.

## 3. Arquitectura, en lo que importa para tocar código

**El panel:**
- `admin.html` tiene HTML, el CSS inline y mucho JS inline, en líneas muy largas.
- Los módulos `admin-*.js` son **scripts clásicos**, no ES modules. Comparten el scope global:
  un `let`/`const`/`function` de arriba de todo en uno se ve por su nombre en los otros.
  El orden de carga son los `<script>` al final de `admin.html`.
- Para enganchar comportamiento se envuelven funciones globales con
  `const orig = window.X; window.X = function(){ const r = orig.apply(this, arguments); ...; return r; }`
  (así lo hace `admin-inicio.js` con `aplicarStockProductos` y `actualizarBadgeAlertas`).

**Módulos del panel:**
- `admin-inicio.js`: Centro de avisos.
- `admin-costos.js`: fecha de costo, aviso al vender y ventana de costos.
- `admin-variantes.js`: presentaciones, tamaños en el formulario, panel de bolsas en la tabla y
  el stock al vender (frenar o avisar: `FRENAR_VENTA_SIN_STOCK`).
- `admin-escalas.js`: granel con bolsas. Precio por cantidad y de qué bolsa sale el stock.
- `admin-stock.js`: "Agregar stock".
- `admin-clientes.js`: clientes del local en la venta.
- `admin-ticket.js` y `admin-ticket-pedido.js`: tickets.
- `admin-atajos.js`: atajos de teclado y Escape.
- `admin-dialogo.js`: diálogos `pedirOpcion`, `confirmar` y pedido de gramos. Todos usan `.dlg-overlay`.
- `admin-proveedores.js`, `admin-etiquetas.js`, `admin-caja.js`, `admin-compras.js`,
  `admin-lector.js` (pistola de códigos), `admin-pagination.js` (tabla de productos) y
  `admin-selector.js` (desplegables).

**Datos principales (Firestore):**
- **`productos`**:
  - `nombre` (interno) y `nombreMostrado` (público);
  - `codigo` y `codigoBarras`;
  - `tipoVenta` (`'unidad'` o `'peso'`);
  - `costo`: **por kilo** en los de peso y por unidad en los otros. Puede tener centavos si
    viene de Compras;
  - `porcentaje` y `porcentajeMayorista`;
  - `precio` y `precioMayorista`. El mayorista se redondea **hacia arriba de a $50**
    (`_redondearMayorista`);
  - `descuento` (% de oferta);
  - `stock`: en gramos los de peso, en unidades los otros;
  - `gramaje` (el tamaño) y `gramajePadreId` (el enlace al producto principal);
  - `cajaCerrada`, `oculto` y `depurado`;
  - `costoActualizadoEn`, `stockSubioEn` y `creadoEn`.
- **`ventas`** (minoristas) y **`ventasMayoristas`**:
  - `tipoEntrega` y `envio`;
  - `clienteId` si es un cliente del local, `clienteAuthUid` si es de la web;
  - los renglones de granel llevan `escalaId`;
  - en la mayorista, `fecha` se guarda a las 12:00.
- **`pedidos`**: pedidos web. Hoy las reglas no dejan que el panel los cree (ver pendientes).
- **`clientes`** (del local, cargados en el panel) y **`clientesAuth`** (de la web, con Google).
- **`config/pedidos`**: en producción `haceEnvios:false`, `descontarStock:true`,
  `minimoPedido:30000`, `envioPrecio:2000`, `envioGratisActivo:false`, `envioGratisDesde:100000`.
  Lo lee la tienda (`PEDIDOS` en `app.js`) y el panel (`HACE_ENVIOS`, `DESCONTAR_STOCK`).
- **`config/ticket`**, **`config/siteContent`** (el teléfono del negocio pisa al de
  `config-negocio.js`), **`historial`**, **`cajas`**, **`compras`**, **`cupones`**, **`admins`**.

**Otros archivos:**
- `sandbox/` (ver §4.3).
- `pruebas/`: 85 suites en node con `vm`, que corren los módulos de verdad con un DOM falso.
- `check-admin.js` (`npm run check`): revisa que las clases CSS que se usan en `admin.html` y en
  los módulos listados existan, y que el HTML esté balanceado.
- `dev-server.js`: el servidor local.
- `migracion/`: scripts de la migración de datos (etapa 4, NO se corre sin pedido).
- `PENDIENTE.md`: el registro de todo.
- `SPEC-ROLES-TICKET.md` y `SETUP.md`.

## 4. Cómo trabajamos (reglas que Thiago pidió; todas siguen valiendo)

### 4.1 Reglas

1. **Nunca migrar datos** (la etapa 4 de variantes: agrupar los productos que ya existen) hasta
   que Thiago lo pida explícito. Antes hay que hablarlo con la clienta.
2. **Nunca hacer push a producción, `firebase deploy` ni escribir en la base de producción** por
   iniciativa propia. Solo cuando Thiago lo pide con esas palabras, y con la clienta sin usar el
   sistema.
3. **Cambios mínimos y puntuales.** Si pide algo visual, se toca solo lo visual. Nada de refactors
   ("te pedí un cambio solo visual, no que refactorices todo"). Si aparece otra cosa para
   arreglar, se propone aparte.
4. **Cuidado con lo que se borra.**
5. **Todo va primero al sandbox**, se prueba ahí y queda en **commits locales**.
6. **Commits en español, sin tildes ni ñ**, con formato `tipo(area): resumen`, un cuerpo corto
   con el porqué y al final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
7. **No dejar puertos abiertos raros.** Al cerrar el sandbox se verifica que no quede nada
   escuchando ni procesos del emulador. **Nunca matar procesos de los MCP.**
8. **No imprimir ni manejar credenciales.**
9. **Nunca iniciar sesión en el panel de producción** (`/admin`). Para verificar alcanza con que
   la pantalla de ingreso cargue sin errores. El panel bueno para probar es **`/sandbox`**.
10. **En el sandbox se entra con la cuenta de Thiago**, `thiagowendler53@gmail.com`, no con la de
    Jero. Antes de iniciar sesión hay que comprobar `firebase.auth().emulatorConfig`.
11. **Los textos para la clienta, muy simples** (interfaz, avisos, ayudas "?"). Los resúmenes
    para Thiago, cortos. Si son para copiar y mandar, sin markdown (pidió sacar los asteriscos
    de las negritas).
12. **Antes de dar por terminado un trabajo grande**, revisión de código y prueba en el sandbox.
    Se usó `/code-review` a esfuerzo máximo el 26/09 y el 27/09.
13. Cuando termina algo, Thiago dice qué sigue: no adelantar etapas que no pidió.

### 4.2 Cómo se hace un cambio

1. **Leer** el código que se va a tocar, con el contexto alrededor.
2. **Hacer el cambio** con un script de node, en el scratchpad de la sesión, que aplica
   **reemplazos exactos todo-o-nada**: si un texto no aparece la cantidad de veces esperada, no se
   escribe ningún archivo. Hay que respetar el final de línea de cada archivo, porque el repo es
   CRLF (`core.autocrlf=true`) y algunos archivos son LF.
   - Reemplazar una función `async` buscando `function X(` deja `async async`. Hay que corregirlo.
   - La herramienta Write decodifica los `\uXXXX`. Si un regex los necesita, se escriben escapados.
3. **Pruebas.** `node --check` del archivo, `npm run check` y `npm test`, que tiene que dar 0
   fallas; al 27/09 eran **3580 pruebas en 85 suites**. Cada arreglo lleva su prueba en
   `pruebas/t-*.js`.
4. **Si se tocó la tienda:** si cambió `app.js` o `styles.css`, correr `npm run build` (check +
   terser + cleancss). La tienda carga `app.min.js` y `styles.min.css`.
5. **Ver el cambio en el sandbox.** Se recarga la página del sandbox en el panel del navegador de
   la app y se revisa con JS, lectura del DOM o capturas. Las capturas a veces fallan si la ventana
   de la app está atrás; en ese caso se verifica con JS.
6. **Documentar y guardar.** Anotar en `PENDIENTE.md`, con la cantidad de pruebas, y hacer el
   commit local.
7. **Contarle a Thiago** en pocas líneas y en español simple.

### 4.3 El sandbox

- **Cómo se levanta:** con la vista previa de la app, entrada **`brotes-sandbox`** de
  `.claude/launch.json`.
  - Por dentro corre `sandbox/con-java.js firebase emulators:exec --only firestore,auth,storage,functions --project demo-brotes "node sandbox/arrancar.js --puerto 5173"`.
  - Con `--puerto` usa ese puerto o no arranca. Sin `--puerto` (`npm run sandbox`), si el 5173
    está ocupado se corre al 5174 o al siguiente.
  - Tarda unos 40 s: emulador, siembra de datos y servidor.
- **La dirección** es **http://localhost:5173/sandbox**. `/admin` en modo sandbox muestra un
  cartel de aviso.
- **Los datos son efímeros.** Cada arranque siembra lo mismo con `sandbox/sembrar.js`: 100
  productos, 20 proveedores, 40 ventas, 5 pedidos, 6 compras y cupones. Los admins son jeroobregon03,
  thiagowendler53 y admin@local. Uno de cada cuatro productos tiene el costo con más de un mes.
  Hay un solo grupo de presentaciones: Yerba Mate Tostado (500 Gr) con Te Verde Tostado (1 Kg).
- **Después de arrancar**, Thiago lo quiere **con los envíos apagados, como producción**:
  1. leer `config/pedidos` de producción por REST público;
  2. escribirlo en el emulador con un PATCH a `http://127.0.0.1:8080/v1/projects/demo-brotes/databases/(default)/documents/config/pedidos`,
     con el header `Authorization: Bearer owner`.
- **Para entrar**, desde la página del sandbox:
  `firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential('{"sub":"thiago-sandbox","email":"thiagowendler53@gmail.com","email_verified":true}'))`,
  siempre después de comprobar que `emulatorConfig` existe.
- **Para cambiar datos del emulador** se usa el REST del emulador con `updateMask.fieldPaths`
  para no pisar el documento. Así se atrasa la fecha de costo para probar avisos.
- **Para cerrarlo:**
  1. `preview_stop`;
  2. verificar que no quede nada escuchando en 5173, 8080, 9099, 9199, 5001, 4400, 4500 y 9150,
     ni procesos `emulators:exec`, `cloud-firestore-emulator`, `dev-server.js` o
     `functionsEmulatorRuntime`;
  3. si queda algo, matar **solo el árbol del sandbox**.
- La app puede cortar el sandbox si se cierra el panel del navegador de la app. Si "se cerró
  solo", se vuelve a levantar.

### 4.4 Producción, con cuidado

- **Lecturas:** solo con scripts de lectura en el scratchpad.
  - REST público para colecciones públicas (productos, config).
  - Para lo demás, la sesión de la CLI de Firebase que ya está iniciada, vía `firebase-tools/lib`
    (`getGlobalDefaultAccount` + `requireAuth` + `new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' })`),
    sin mostrar el token. La CLI está en `C:/Users/Thiago/AppData/Roaming/npm/node_modules/firebase-tools` (15.5.1).
- **Escrituras:** solo con el OK de Thiago para esa escritura puntual.
  1. contar sin escribir;
  2. probar en UN documento, comparando sus campos antes y después;
  3. recién ahí el resto, con `updateMask` que tenga solo los campos exactos.
- **Functions:** `firebase deploy --only functions:NOMBRE,functions:OTRO --project brotesdietetica-2f78e --non-interactive`.
  Nunca `--force`. Después se miran los logs con `firebase functions:log --only NOMBRE`.
- **Tienda y panel:** `git push origin main` y Vercel publica solo. Para verificar se compara lo
  que sirve https://brotesdietetica.vercel.app con los archivos del repo, y se abren la tienda y
  la pantalla de ingreso de `/admin` (sin iniciar sesión) buscando errores de consola.

## 5. Lo que se hizo del 24 al 27/09 (todo subido a producción el 27/09)

### 5.1 Lista de cambios (la versión corta que se le pasó a Thiago)

- **Centro de avisos** (era "Inicio del día"): la primera pantalla al entrar. Muestra:
  - cómo fue ayer;
  - lo que se vende y está sin stock (el **negativo** también, desde el 29/09; del 26 al 29/09 no se mostraba);
  - los costos desactualizados, de a 10;
  - lo que se está por terminar;
  - la caja abierta de otro día.

  Lee 30 días de ventas una vez por día, unas 250 lecturas.
- **Costos desactualizados:** fecha del último cambio de costo en cada producto. Al vender, si
  pasó más de un mes, avisa: "Modificar costos" o "Ignorar advertencia y vender de todas formas".
- **Ventana de costos** (`abrirEditorCostos`):
  - se usa desde cuatro lugares: al vender (`'min'`/`'may'`), desde el Centro (`'inicio'`,
    "Revisar costos") y desde el panel de bolsas de Productos (`'prod'`, "Cambiar costos");
  - desde el Centro y desde Productos **guarda solo lo que se toca** o se marca "Sigue igual";
    al vender confirma todo;
  - al lado de cada campo muestra cómo queda el precio, con la caja cerrada, la oferta y el
    precio real si no cambia el costo;
  - en las bolsas se escribe **lo que costó la bolsa entera**.
- **"?" del redondeo:** explica que la bolsa puede mostrar unos pesos de diferencia y que
  **NO SE PIERDE DINERO**.
- **Freno de stock:** sin stock suficiente no se puede vender en el mostrador. Los pedidos web sí
  pueden dejar el stock en negativo. **El 29/09 se cambió** (subido ese día): avisa y deja vender (§5.5).
- **"Agregar stock"** en Stock: suma lo que llegó. El lápiz corrige el total.
- **Productos con varios tamaños en una fila**, con un panel de tamaños que tiene la columna Costo.
- **Proveedores:** las listas detrás del botón "Ver listas de proveedores", con buscador.
- **Etiquetas:** hoja A4 llena (24, 14, 40 o 65 por hoja).
- **Caja:** deshacer un ingreso o egreso mientras la caja está abierta. Queda tachado "DESHECHO".
- **Ticket del pedido:** "Imprimir ticket del pedido" en la ventana del pedido. **Falta probarlo
  en la impresora térmica.**
- **Clientes del local en la venta:**
  - "Agregar cliente nuevo" desde la venta;
  - aviso de duplicado por teléfono o DNI;
  - el menú dice "Clientes del local" y "Clientes de la web";
  - se sacó la casilla de promociones por WhatsApp.
- **Ventas con otra cara:** agrupadas por día, con total diario y etiquetas de colores.
- **La venta arranca en Retiro**, minorista y mayorista. Editar una venta vieja guardada como
  envío sin cargo, con los envíos apagados, la pasa a Retiro. Las que cobraron envío quedan como
  están.
- **Buscadores y formulario de producto bien a la vista:** "opción A", borde verde y fondo más
  claro. En el formulario los precios automáticos quedan apagados.
- **Se sacó** el botón del PDF Semanal y la lectura de PDF en Compras. El código quedó comentado.
- **Dos revisiones de código completas** (26/09 y 27/09) con todo lo encontrado ya corregido.
  Entre los arreglos del 27/09 están:
  - una bolsa de menos de 1 kg sin tocar ya no se guarda como cambio;
  - los nombres no repiten el tamaño;
  - guardar dos veces seguidas no escribe dos veces;
  - los atajos de teclado no actúan detrás de una ventana abierta;
  - la columna Costo y la ventana hacen la misma cuenta (`costoDeBolsa` y `kiloDeBolsa`);
  - una venta que sacó de dos bolsas cuenta una vez;
  - el sandbox desde la vista previa no se corre de puerto.

### 5.2 La nueva lógica de productos (variantes, bolsas y cajas cerradas), en detalle

**La idea:** un producto que viene en varios tamaños es **uno solo**. Es una tarjeta en la tienda,
una fila en Productos y una línea en la venta. **Por dentro, cada tamaño es un producto aparte**,
con su código, código de barras, etiqueta, stock, costo, fecha de costo y proveedor, enlazado al
principal por `gramajePadreId` (el mismo enlace de los "gramajes" viejos). El principal también
es un tamaño, el primero.

**Tres casos:**
- **Presentaciones (etapa 1)**, por unidad: Maní x 80 g y x 160 g, Alfajor x1 y x12.
- **Bolsas de granel (etapa 2, "escalas")**, por peso: Yerba en bolsas de 1, 3 y 5 kg.
- **Caja cerrada (etapa 3):** una presentación por unidad marcada con `cajaCerrada`, que se cobra
  al precio mayorista en el mostrador y en la tienda. Las sueltas van a precio normal.
- La **etapa 4**, migrar los grupos existentes, **NO se hace** sin pedido.

**Cómo se carga** (formulario del producto):
1. Se elige "¿Cómo se vende?": por unidad o por peso.
2. "Agregar presentación" o "Agregar bolsa" abre la tabla "Costo y precio de cada
   presentación/bolsa". La primera fila es el mismo producto. Con más de un tamaño, esa tabla es
   **el único lugar de carga** (los campos de arriba se esconden).
3. Cada fila tiene:
   - tamaño (número y unidad, en un widget con la unidad al lado);
   - costo: en las bolsas, **lo que costó la bolsa entera**; se guarda por kilo,
     `round(bolsa × 1000 / gramos)`;
   - stock (gramos o unidades);
   - % de ganancia, % mayorista y % de oferta.

   El precio y el mayorista se calculan solos y se ven al lado.
4. En las presentaciones por unidad está la casilla "Caja cerrada", con su "?".
5. "Asociar uno existente" engancha un producto ya cargado. "Cargar una con su propio formulario"
   sirve para otro nombre, forma de venta, foto o código de barras.
6. **El lápiz de cada tamaño** en la tabla de productos abre su propia ficha, que en las bolsas
   **todavía pide "Costo por kilo"**. Se ofreció cambiarlo a costo de bolsa y Thiago no lo pidió.

**En Productos:**
- Una fila por producto, con la etiqueta "2 bolsas" o "3 presentaciones".
- Esa etiqueta abre un panel con Tamaño, Código, **Costo** ("$2.001 la bolsa / $667 el kilo"),
  Precio y Stock, más "Asociar uno existente" y "Editar bolsas".
- Tocar el costo abre "Cambiar costos" con todas las bolsas.

**En la tienda:** una tarjeta y el cliente elige el tamaño. En el granel con bolsas, el precio
depende de la cantidad.

**Al vender:**
- **Presentaciones:** se elige el tamaño. Si uno no tiene stock, se ofrece otro que lo cubra
  (dos de 80 g en vez de una de 160 g).
- **Granel con bolsas:** se escriben los gramos y **se cobra la bolsa más grande que no supera lo
  que se lleva**. Con 1, 3 y 5 kg: 700 g y 2,9 kg pagan la de 1 kg, y 3,1 kg paga la de 3 kg.
  Si llevando más paga menos, avisa.
- **De qué bolsa sale el stock:** de la bolsa del precio cobrado. Si no alcanza, sigue con la
  siguiente, y si no, con la anterior. En ese caso aparece un **aviso de mezcla** en palabras
  simples: "No alcanza la bolsa de 2 kg", de qué bolsa sale cada parte y cuánto se gana ("$1.300
  en vez de $1.600").
- **Por dentro** son tantos renglones como bolsas de las que sale, todos al precio de la escala
  cobrada (`escalaId`). En la venta se ven juntos en una línea.
- **Caja cerrada:** se cobra el mayorista.
- **Freno de stock:** sin stock suficiente no deja agregar ni registrar. Dice cuánto hay y manda
  a "Agregar stock". Desde el 29/09 avisa y deja vender: ver §5.5.
- **Aviso de costo desactualizado** si algún producto de la venta tiene el costo sin revisar hace
  más de 30 días.

**El redondeo de las bolsas:** $2.000 por 3 kg da $666,67 el kilo, que se guarda como $667. La
bolsa vuelve a mostrarse como $2.001. Lo mismo pasa con 2.200 → 2.199 y 2.300 → 2.301. La
diferencia es de hasta medio peso por kilo: $1 en 3 kg, $12 en 25 kg. **Se decidió dejarlo así**
y explicarlo con el "?". Los precios casi no cambian.

**Los productos que ya existen no se agrupan solos.** El 27/09 había 2 productos enlazados en
producción (de los "gramajes" viejos).

### 5.3 La subida del 27/09

- **Push a `main`** de `86c2470..b83d763`: 43 commits del 24 al 27/09 (el último es la actualización de `PENDIENTE.md`).
  Vercel publicó y **se comprobó que sirve los mismos archivos que el repo**.
- **Functions:** `descontarStockPedido` actualizada (compara precio y costo contra la escala
  cobrada, y la caja cerrada contra el mayorista) y `registrarCambioDeCosto` creada. Sus logs
  quedaron sin errores.
- **`costoActualizadoEn` cargado en los 1316 productos**, el 27/09 a las 18:46 ART, solo ese campo
  y probado primero en uno. **Los avisos de costo viejo empiezan el 27/10** en los productos que no
  cambien de costo.
- **Verificado:** la tienda carga sin errores y con productos. La pantalla de ingreso de `/admin`
  carga sin errores y con todos los módulos nuevos, sin iniciar sesión.
- **Las reglas de Firestore no cambiaron.**

### 5.4 Lo del 28/09 (subido a producción el 28/09, push hasta `86d51dd`, verificado)

- **Stock agrupado:** en Stock, un producto con bolsas o presentaciones es un bloque, como en
  Productos, con cada tamaño abajo y siempre a la vista. La ventana de "Agregar stock" dice el
  tamaño ("Mani prueba x 1 kg"). Detalle en `PENDIENTE.md` §1-bis O, con lo que la revisión
  antes de subir dejó anotado para más adelante (menores).
- **Etiquetas en térmica adhesiva:** ya se podía (rollos térmicos y "Rollo continuo" tildado o no).
  Se agregó el rollo de 50 × 25 mm, el texto en negro puro en la térmica y que se acuerde del
  formato y del tipo de rollo. Falta probarlo con la impresora. Detalle en `PENDIENTE.md` §1-bis P.

### 5.5 Lo del 29/09 (subido a producción el 29/09, push hasta `a2f3f77`, verificado)

- **Vender sin stock suficiente, con aviso** (pedido del dueño): el freno del 26/09 queda apagado
  con un solo interruptor, `FRENAR_VENTA_SIN_STOCK = false` (admin-variantes.js). Se agrega y se
  registra igual; al registrar sale "Stock insuficiente" con "Vender igual" y en cuánto queda el
  stock. El Centro de avisos muestra lo que está en negativo. Detalle en `PENDIENTE.md` §1-bis Q.

### 5.6 Lo del 29/09, segunda parte (subido a producción el 29/09, push hasta `f75f08d`, verificado)

- **Cargar compra con bolsas** (pedido del dueño): en Proveedores > Cargar compra, las bolsas de un
  producto van juntas en un recuadro ("Mani RC · 2 bolsas"), cada una con su tamaño, en la lista
  para agregar y en "Lo que entró". Una bolsa se carga por lo que costó la bolsa, con el kilo al
  lado, como en el formulario; el costo se sigue guardando por kilo. Si una bolsa queda con menos
  de una bolsa (se escribió 2 pensando en 2 bolsas), avisa antes de guardar. Detalle en
  `PENDIENTE.md` §1-bis R.
- **El buscador de Proveedores** (pedido del dueño): al borrar la búsqueda vuelven todos los
  proveedores. Antes, después de tocar uno con algo escrito, la lista se quedaba con lo que había
  encontrado. Detalle en `PENDIENTE.md` §1-bis S.
- **La ficha del proveedor** (pedido del dueño): los tamaños de un producto van juntos en un
  recuadro en lo vendido (el producto entero es un puesto), en lo que no se vendió y en la
  exportación. Detalle en `PENDIENTE.md` §1-bis T.
- **Una compra guardada** (pedido del dueño): al verla, al exportarla y en Deudas, las bolsas de un
  producto van juntas, con el total del producto y cuántas bolsas entraron. Detalle en
  `PENDIENTE.md` §1-bis U.
- **Los recuadros sin "2 bolsas"** (pedido del dueño): en Cargar compra y en la ficha del
  proveedor, la cabecera del recuadro dice solo el nombre del producto. Detalle en `PENDIENTE.md`
  §1-bis V.

### 5.7 Lo del 30/09 al 02/10 (subido a producción el 01/10 y el 02/10, push hasta `3230d04`, verificado)

- **Cargar compra, un producto por peso sin otras bolsas** (pedido del dueño): también se carga
  por bolsa, con el kilo al lado, si el producto dice de cuánto es la bolsa (en el nombre, o
  anotado aparte). Si no lo dice (118 en producción), la fila pregunta "¿De cuánto es la bolsa?",
  y al guardar la compra queda anotado en el producto, aparte (`bolsaGramos`, ver §1-bis AA).
  Detalle en `PENDIENTE.md` §1-bis W.
- **El tamaño de la bolsa, solo en Cargar compra** (pedido del dueño): la compra dice qué bolsa es
  ("la bolsa de 2 kg").
  La ventana de costos, los avisos y la ayuda de la ficha siguen por kilo, como en producción: se
  probó llevarlo ahí y Thiago pidió no complicarlo. Detalle en `PENDIENTE.md` §1-bis X.
- **Cargar compra: kg o g, y el aviso de costos claro** (pedido del dueño): el tamaño de la bolsa se
  escribe con un selector kg / g al lado (sin adivinar la unidad), y el aviso de costos dice "Tenía
  cargado" y "En esta compra" por producto, con los botones "Dejar como estaba" y "Actualizar". La
  calculadora de la bolsa de la ficha dice qué hace: "¿La factura dice el precio de la bolsa de 3
  kg? Escribilo acá y se calcula solo el costo por kilo." Detalle en `PENDIENTE.md` §1-bis Y.
- **El tamaño de la bolsa, aparte de Gramaje** (pedido del dueño): "Gramaje / Presentación" es lo
  que ve el cliente (lista de precios en PDF, etiquetas, buscador del mostrador, botones de
  presentación de la tienda) y queda como siempre. La bolsa del proveedor de un producto por peso
  va aparte (`bolsaGramos`): en la ficha, abajo del costo, un campo en kilos (solo números, hasta
  5) con "¿Querés disponer de más tamaños?" debajo, que baja a "Agregar otra bolsa" y lo resalta;
  Cargar compra la anota cuando la pregunta, y su campo acepta hasta 5 caracteres. La lista de
  precios en PDF dice "el kilo" en los productos por peso. Detalle en `PENDIENTE.md` §1-bis Z y AA.
- **Los grupos juntos en la lista de precios; la bolsa en Revisar costos** (pedido del dueño): en
  la lista de precios en PDF (minorista y mayorista) cada grupo de bolsas o presentaciones sale
  junto, de menor a mayor. En la ventana de costos, un granel que sabe de cuánto es su bolsa tiene
  "o la bolsa de 5 kg", opcional, que calcula el costo por kilo. Las demás exportaciones ya salían
  bien con las bolsas. Detalle en `PENDIENTE.md` §1-bis AB.
- **"Por peso" / "Unitario" y qué costo va en cada campo** (pedido del dueño, visual): en la tarjeta
  de costos viejos del Centro de avisos, un cuadradito verde al lado del nombre; en la ventana de
  costos, "Costo por bolsa:", "Costo por kilo:" o "Costo por unidad:" arriba de cada campo. Detalle
  en `PENDIENTE.md` §1-bis AC.
- **Revisión antes de subir (01/10)**: arreglos chicos de lo nuevo (borrar la bolsa dejaba el kilo
  mal, "1/2 kg" en el nombre, "1.500" en gramos, el tamaño que no recalculaba, el PDF con un
  principal oculto). Detalle en `PENDIENTE.md` §1-bis AD.
- **La fecha del costo al instante (01/10)**: al cambiar un costo desde una compra, la ficha o la
  tabla de bolsas, la fecha va en la misma escritura; antes el panel la veía vieja hasta F5. Falta
  en Importar Costos y el PDF semanal. Detalle en `PENDIENTE.md` §1-bis AE.
- **"Actualizar" en Cargar compra recalcula el precio (01/10)**: antes cambiaba solo el
  costo; ahora también el precio y el mayorista con el mismo porcentaje, y el aviso los muestra. Al
  lado del costo de la bolsa, el kilo, el precio y el mayorista. Detalle en `PENDIENTE.md` §1-bis AF.
- **Aviso de la bolsa más cara por kilo (01/10)**: en Cargar compra ("Actualizar") y en la
  ventana de costos, si una bolsa queda más cara por kilo que una más chica del mismo producto, avisa y
  pregunta. En los renglones por unidad de la compra, al lado del costo, el precio y el mayorista.
  Detalle en `PENDIENTE.md` §1-bis AG.
- **Mayorista sin ganancia (01/10)**: con el % mayorista en 0 el mayorista quedaba igual al
  costo (222 productos visibles de producción). Ahora queda en 0 (cobra el de mostrador) en la ficha, la
  ventana de costos y la compra; la venta mayorista avisa si algo se cobra al costo; la lista PDF
  mayorista los deja afuera, avisando. Los 222 se arreglan solos al tocarlos; todos juntos, solo con OK.
  Detalle en `PENDIENTE.md` §1-bis AH.
- **Revisión antes de subir AF a AH (01/10)**: el aviso de la bolsa más cara ya no salta de
  más (el mayorista, solo con el % en las dos bolsas; solo saltos nuevos o peores) y "No actualizar"
  deja como estaban solo esas bolsas; "Se vende sin ganancia" cuenta el descuento de toda la venta,
  dice "perdés $X" o el descuento que lo causa, y marca lo que gana menos del 5%; "Actualizar" en la
  compra no toca el precio de los que no tienen % y marca si un precio baja; esos avisos arrancan en
  "Volver" o "No actualizar". Los menores, anotados. Detalle en `PENDIENTE.md` §1-bis AI.
- **Cargar compra con el mismo costo (02/10)**: si "Actualizar" no se va a ofrecer, al lado del
  costo van los precios que tiene (con centavos mostraba otros, y "Sin mayorista" en uno sin % que lo
  tenía; solo era lo que se veía). Visto de paso: la compra de hoy no aparece en el panel del proveedor
  hasta las 12:00 (viejo; Thiago: queda así). Detalle en `PENDIENTE.md` §1-bis AJ.
- **"Se vende sin ganancia" al guardar y al vender (02/10)**: la ficha (con su tabla de bolsas) y
  la ventana de costos avisan antes de guardar un precio igual al costo (sin % de ganancia) o en $0; al
  vender en mostrador, un aviso con el texto del dueño y "Cargar el % de ganancia" (una ventanita encima
  de la venta, que toma el precio nuevo) o "Vender igual". Detalle en `PENDIENTE.md` §1-bis AK.
- **Borrar una compra vuelve los costos que cambió (02/10)**: con "Actualizar", la compra anota
  cómo estaba cada producto; al borrarla vuelve a como estaba (costo, precio, mayorista y fecha), salvo que
  después lo hayan cambiado (el aviso dice qué compra lo cambió, y esa se queda con el "antes"). La compra
  se borra en la misma transacción, y un doble clic en "Eliminar" abre un solo aviso. Las compras de
  antes no lo anotaban. Detalle en `PENDIENTE.md` §1-bis AL.
- **Cargar compra: el total del renglón se escribe (02/10, sin subir)**: si el proveedor pasa el total y
  no lo de cada bolsa (o cada unidad), se escribe el total y sale lo que falta: el costo, o la cantidad si
  no se escribió (si no da justo, lo explica en amarillo). El total escrito queda exacto. Solo números (sin
  puntos), "Gramos entrantes" con "Equivale a 5,3 kg". Detalle en `PENDIENTE.md` §1-bis AM.

## 6. Decisiones ya tomadas (no volver a discutirlas)

- **Sin stock suficiente se puede vender, con aviso**, y el negativo **aparece** en el Centro de
  avisos (pedido del dueño, 29/09). Del 26/09 al 29/09 frenaba y el negativo no aparecía. Para volver
  a frenar: `FRENAR_VENTA_SIN_STOCK = true` en admin-variantes.js.
- El nombre de la sección es "Centro de avisos". La venta arranca en Retiro. Se sacó la casilla de
  promociones.
- Los buscadores quedan con la "opción A". El formulario de producto va resaltado con la misma
  receta.
- **El mayorista redondea hacia arriba de a $50**, en todo el sistema. Con porcentajes parecidos,
  una bolsa puede quedar con el mayorista más caro que el precio normal. Thiago: "está bien, dejalo".
- **El redondeo de la bolsa ($2.001) se deja** y se explica con el "?" ("NO SE PIERDE DINERO").
  Cambiarlo tocaba demasiada lógica.
- En la ventana de costos, **las bolsas se escriben por bolsa**, y tocar la columna Costo abre esa
  ventana.
- Brotes no hace envíos: `haceEnvios:false` en producción, y el sandbox se prepara igual.
- La parte de Ventas con otra cara y el Centro de avisos son "experimentales", pero quedaron.
- En Stock, los tamaños de un bloque van **siempre a la vista**, no detrás de un botón (28/09).

## 7. Pendientes

### 7.1 Después de la subida (lo más urgente)

0. **Avisarle a la clienta lo nuevo de Compras y Proveedores** (§5.6, subido el 29/09) y lo del 01/10
   (§5.7: en Cargar compra lo que viene en bolsa se carga con lo que costó la bolsa, y si no dice de
   cuánto es se pregunta una sola vez; la lista de precios dice "el kilo"; "Actualizar" en una compra
   cambia también el precio y el mayorista; los avisos de la bolsa más cara y "Se vende sin
   ganancia"; la lista PDF mayorista deja afuera los que no dejan ganancia), y que recargue el panel
   (F5) entre una venta y otra si lo tenía abierto.
1. **Avisarle a la clienta** que desde el 29/09 puede vender sin stock (sale el aviso "Stock
   insuficiente" con "Vender igual") y que el Centro de avisos le muestra lo que quedó en negativo,
   para cargarlo. Del 27/09 al 29/09 estuvo el freno (el 27/09 había 154 de 344 productos a la venta
   sin stock: 123 en 0 y 31 en negativo).
2. **Probar el ticket del pedido en la impresora térmica.**
3. **Ventas viejas guardadas como envío sin cargo** (el default de antes): siguen diciendo "Envío"
   en la lista y en el ticket hasta que se editan. Pasarlas todas a Retiro es un cambio de datos
   que hay que decidir con la clienta.
4. **La migración (etapa 4):** agrupar los productos existentes en presentaciones o bolsas.
   **Solo cuando Thiago lo pida, después de hablar con la clienta.** Hay scripts en `migracion/`.
   Relacionado: `PENDIENTE.md` §1-bis C ("que el agrupamiento de gramajes ande").
5. **Los 222 productos con el mayorista igual al costo** (`PENDIENTE.md` §1-bis AH y AI): hablar con la
   clienta si les pone un % mayorista. Se arreglan solos al tocarlos; todos juntos es una escritura en
   producción, solo con OK de Thiago. Mientras, la venta mayorista avisa y la lista PDF los deja afuera.
6. **6 productos visibles se venden en mostrador a lo mismo que costaron** (precio igual al costo, sin
   % de ganancia): Tortilla de espinaca mediana (la creó el 01/10), Chalitas integrales DeliRe, Tarta brocoli o 3
   cebollas, Crepes de Pollo, Canelones y Pastel de quinoa y mani (`PENDIENTE.md` §1-bis AI). Que la
   clienta les cargue el % de ganancia; tocarlos desde acá es una escritura en producción, solo con OK.

### 7.2 Pendientes anotados en `PENDIENTE.md` §M (del 25/09)

1. **El panel no puede crear pedidos telefónicos.** `firestore.rules` solo deja crear pedidos web.
   El arreglo propuesto es agregar `allow create: if isAdmin();` en `/pedidos` y desplegar las
   reglas, pero **espera el OK de Thiago**.
2. Convertir un pedido web en venta cambiando las cantidades no mueve el stock.
3. Hay $1 de redondeo en los renglones de un granel que sale de dos bolsas: cada renglón se
   redondea por separado.

### 7.3 Detalles que la revisión del 27/09 encontró y quedaron afuera (menores)

- **Lentitud en listas largas:** `tieneVariantes` recorre todos los productos y se llama dentro
  de ordenamientos y por cada fila (`_iniOrden`, `_iniClaveTop`, `gramosDeBolsa` en el panel de
  bolsas). Son unos milisegundos.
- **Código repetido:**
  - la cuenta bolsa ↔ kilo sigue escrita a mano en varios lugares del formulario
    (`admin-variantes.js`, `admin-escalas.js`);
  - el CSS de "bien a la vista" está repetido;
  - las flechas de las fotos usan `!important`.
- **"(hoy)":** en "Cambiar costos", un costo cambiado anoche dice "(hoy)", porque cuenta 24 h y
  no días de calendario.
- **Fracciones:** un tamaño escrito "1/2 kg" se lee como 2 kg (`contenidoDeVariante`). No hay
  datos así en producción; el formulario no deja escribirlo.
- **Nombres en los avisos de error:** el nombre del producto en otros ~20 avisos del panel entra
  sin escapar (se arregló solo el de costos).
- **La ficha propia de una bolsa** pide "Costo por kilo" (ver §5.2).
- El aviso "firebase-functions desactualizado" al desplegar: actualizarlo trae cambios que rompen.
  Las functions piden node 22 y la máquina tiene node 20 (es solo un aviso).

### 7.4 Pendientes viejos de `PENDIENTE.md` §0 (al 21/09) y §2

- Lectores de otras marcas: medir si aparece uno de más de 40 ms.
- Cargar los códigos de barras: hay 1 cargado sobre unos 1300.
- Roles por empleado (`SPEC-ROLES-TICKET.md` §A).
- Decidir la sección Etiquetas.
- Limpiar 4 nombres repetidos.
- 34 productos del reporte viejo.
- Alerta de presupuesto de USD 5 en Google Cloud.
- Revisar el plan de Vercel.
- Portar a YERCO lo de §6.
- Decisiones abiertas de §2:
  - el QR de reseña exige Google;
  - el contacto de Deft;
  - el registro formal o informal de los textos;
  - un token de GitHub en texto plano en otro proyecto (Autoleads).

## 8. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Registro detallado, con fechas | `PENDIENTE.md` (§0 qué sigue, §1-bis M y N lo último, §2 decisiones, §4 cómo verificar, §5 trampas del código, §7 referencia rápida) |
| Este contexto | `CONTEXTO.md` |
| Memoria de Claude | `~/.claude/projects/C--Users-Thiago-Desktop-brotesdietetica/memory/` (MEMORY.md) |
| Sandbox | `sandbox/` + entrada `brotes-sandbox` en `.claude/launch.json` |
| Pruebas | `pruebas/` (`npm test`), `check-admin.js` (`npm run check`) |
| Functions | `functions/index.js` |
| Reglas | `firestore.rules`, `storage.rules` |
| Producción | https://brotesdietetica.vercel.app — proyecto `brotesdietetica-2f78e` |

## 9. Mensaje para retomar después de un clear

Thiago le pasa este mensaje a Claude después del `/clear`:

```text
Hola Claude. Veníamos trabajando juntos en esta misma sesión en el proyecto Brotes Dietética (C:\Users\Thiago\Desktop\brotesdietetica) y acabo de hacer un /clear para liberar contexto, así que no tenés el historial del chat. No se perdió nada importante: todo está en el repo, en CONTEXTO.md, en PENDIENTE.md y en tu memoria del proyecto.

Para retomar exactamente como veníamos, antes de hacer cualquier cosa:
1. Leé entero CONTEXTO.md, en la raíz del repo. Es el contexto completo: qué es el sistema (tienda online + panel de administración de una dietética, Firebase + Vercel), cómo trabajamos, todo lo que hicimos del 24 al 27/09, la nueva lógica de productos (presentaciones, bolsas de granel, caja cerrada), lo que subimos a producción el 27/09, las decisiones ya tomadas y los pendientes.
2. Mirá PENDIENTE.md: secciones 0, M, N, 2 y 5 (trampas del código).
3. Revisá tu memoria del proyecto (MEMORY.md y sus archivos).

Las reglas de trabajo siguen todas igual. Las más importantes:
- No migrar datos (etapa 4) ni hacer push, firebase deploy o escrituras en producción sin que yo lo pida explícito. La migración recién después de hablar con la clienta.
- Cambios mínimos y puntuales: si pido algo visual, solo visual, sin refactors. Cuidado con lo que borrás.
- Todo primero en el sandbox (entrada brotes-sandbox de la vista previa, http://localhost:5173/sandbox, entrando con thiagowendler53@gmail.com y con los envíos apagados como producción), y commits locales en español sin tildes, con la línea Co-Authored-By.
- Sin puertos abiertos raros: al cerrar el sandbox verificá puertos y procesos, y nunca mates procesos de los MCP.
- No imprimas credenciales y nunca inicies sesión en el panel de producción (/admin).
- Textos para la clienta muy simples; resúmenes para mí cortos, y sin asteriscos si son para copiar.
- Antes de dar por terminado algo grande: revisión de código y prueba en el sandbox.

Dónde estamos (28/09): el 27/09 subimos todo a producción (push a main hasta b83d763, functions descontarStockPedido y registrarCambioDeCosto desplegadas, fecha de costo cargada en los 1316 productos, todo verificado). El 28/09 subimos además el Stock agrupado (un producto con bolsas o presentaciones es un bloque) y las etiquetas en térmica adhesiva (push hasta 86d51dd, verificado). El 29/09 subimos que se pueda vender sin stock con un aviso y que el Centro de avisos muestre los negativos (push hasta a2f3f77, verificado; PENDIENTE.md §1-bis Q). Después subimos también (push hasta f75f08d, verificado) que en Cargar compra las bolsas de un producto vayan juntas y se carguen por bolsa, que en Proveedores al borrar la búsqueda vuelvan todos, que la ficha del proveedor muestre los tamaños de un producto juntos, que una compra guardada muestre sus bolsas juntas, y que los recuadros digan solo el nombre del producto (PENDIENTE.md §1-bis R a V). El 01/10 subimos (push hasta 6206081, verificado) lo de las bolsas del proveedor: Cargar compra por bolsa también en los granel sueltos (el tamaño va aparte, en bolsaGramos), "el kilo" y los grupos juntos en la lista de precios, "O el costo de la bolsa" y "Costo por bolsa/kilo/unidad" en la ventana de costos, "Por peso/Unitario" en el Centro de avisos, los arreglos de la revisión y la fecha del costo al instante (PENDIENTE.md §1-bis W a AE). Ese mismo día subimos también (push hasta d969232, verificado) que "Actualizar" en Cargar compra recalcule el precio, el aviso de la bolsa más cara por kilo, el mayorista sin ganancia (con el % mayorista en 0 queda en 0; aviso al vender; la lista PDF mayorista sin esos) y los arreglos de su revisión (PENDIENTE.md §1-bis AF a AI). El 02/10 (push hasta 3230d04, verificado): en Cargar compra, con el mismo costo, al lado van los precios que tiene (§1-bis AJ), el aviso "Se vende sin ganancia" al guardar (ficha, tabla de bolsas, ventana de costos) y al vender en mostrador, con "Cargar el % de ganancia" ahí mismo (§1-bis AK), y que borrar una compra vuelva los costos que cambió con "Actualizar", con el aviso de qué compra los cambió si no vuelven (§1-bis AL). El sandbox quedó abierto (datos de prueba).

Pendientes principales: avisarle a la clienta lo nuevo de Compras y Proveedores, y que ya puede vender sin stock (con el aviso) y que el Centro le muestra los negativos, probar el ticket del pedido en la impresora térmica, decidir qué hacer con las ventas viejas guardadas como "Envío", y la migración (etapa 4), que se hace solo cuando yo lo pida. El resto de los pendientes está en CONTEXTO.md §7.

Cuando termines de leer, confirmame en pocas líneas que tenés el contexto y esperá mi próximo pedido; no arranques nada por tu cuenta.
```
