# Brotes Dietética — Qué falta hacer

**Para:** Thiago
**Estado del código:** terminado y subido. No hace falta programar nada más.
**Lo que falta:** configuración en las consolas de Firebase y Vercel.

Tiempo estimado: **40–60 min**, casi todo esperando que Firestore cree los índices.

---

## 0. Datos del proyecto (tenelos a mano)

| Qué | Valor |
|---|---|
| Repo | `github.com/ObregonJeronimo/brotesdietetica` |
| Sitio | https://brotesdietetica.vercel.app |
| Panel admin | https://brotesdietetica.vercel.app/admin |
| Proyecto Firebase | `brotesdietetica-2f78e` |
| Región Firestore | `southamerica-east1` (São Paulo) — ya elegida, **no se puede cambiar** |
| Plan Firebase | Spark (gratis) |
| Admins del panel | `jeroobregon03@gmail.com` · `thiagowendler53@gmail.com` |
| Carpeta local | `C:\Users\Usuario\Documents\brotesdietetica` |

**Contactos del negocio ya cargados en el código:** WhatsApp `+54 9 351 687-2770`,
email `brotesdietetica@gmail.com`, dirección `Manuel de Falla, X5021 Córdoba`,
zona de envío `Rivera Indarte y alrededores`.

---

## Ya está hecho (no lo toques)

- Ecommerce y panel `/admin` completos, replicados de YERCO.
- Marca, logos, paleta del logo y textos de Brotes.
- Términos y condiciones divididos: lo comercial es de Brotes, el software de Deft.
- Footer con el crédito de Deft Software Solutions y contacto.
- Deploy en Vercel funcionando (HTTP 200, con estilos, cabeceras de seguridad OK).
- `firebase-config.js` y `vercel.json` ya apuntan a `brotesdietetica-2f78e`.
- Proyecto Firebase creado, Firestore en São Paulo, modo producción.

**Comprobado:** el sitio conecta con Firestore y responde `permission-denied`.
Eso es lo esperado — las credenciales están bien, faltan las reglas (paso 2).

---

## PASO 1 — Ver con qué cuenta se creó el proyecto

Esto primero, porque define cómo hacés el paso 2.

Entrá a https://console.firebase.google.com/project/brotesdietetica-2f78e y mirá
**el avatar de arriba a la derecha**: ese es el mail dueño del proyecto. Anotalo.

> **Por qué importa:** desde la PC de Jero la CLI está logueada como
> `jeroobregon03@gmail.com`, y **ese mail no ve el proyecto**. Ve los otros 6
> (incluido `yerco-bb620`) pero no este. O sea que se creó con otra cuenta.

Aprovechá y agregá a los dos como propietarios, así cualquiera lo puede mantener:

**⚙ Configuración del proyecto → Usuarios y permisos → Agregar miembro**
→ `jeroobregon03@gmail.com` y `thiagowendler53@gmail.com`, rol **Propietario**.

---

## PASO 2 — Desplegar las reglas (lo más importante)

Ahora Firestore tiene las reglas de bloqueo total que pone Firebase por defecto:

```
allow read, write: if false;
```

Con eso **nada funciona**: el catálogo se ve vacío y el panel no puede escribir.
Hay que reemplazarlas por las del repo. Son 3 cosas.

| Archivo del repo | Dónde va | Si falta |
|---|---|---|
| `firestore.rules` | Firestore → Reglas | no funciona nada |
| `firestore.indexes.json` | Firestore → Índices | fallan cosas **en silencio** |
| `storage.rules` | Storage → Reglas | no se pueden subir fotos de productos |

### Opción A — Por línea de comandos (recomendada: más rápido y sin errores de tipeo)

Tenés que estar logueado con la cuenta **dueña del proyecto** (la del paso 1).

```bash
npm install -g firebase-tools
```

```bash
cd C:\Users\Usuario\Documents\brotesdietetica
```

```bash
firebase login
```

```bash
firebase use --add
```

(elegí `brotesdietetica-2f78e`, alias `default`)

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Eso sube las reglas **y los 4 índices** de una. Si Storage todavía no está habilitado,
habilitalo primero desde la consola (misma región) y volvé a correr el comando.

### Opción B — Por consola, copiar y pegar

1. **Firestore Database → pestaña Reglas.** Borrá todo lo que hay.
   Abrí `firestore.rules` de la carpeta local, copiá **todo** y pegalo. **Publicar.**
2. **Storage.** Si nunca lo habilitaste: *Comenzar* → misma región (`southamerica-east1`).
   Después **pestaña Reglas** → borrá todo → pegá `storage.rules` → **Publicar.**
3. **Los 4 índices** a mano en **Firestore → Índices → Crear índice**.
   Todos con *Alcance de consulta* = **Colección**:

   | Colección | Campo 1 | Campo 2 |
   |---|---|---|
   | `pedidos` | `clienteAuthUid` Ascendente | `creadoEn` **Descendente** |
   | `cuponesUsos` | `cuponId` Ascendente | `uid` Ascendente |
   | `cupones` | `codigo` Ascendente | `activo` Ascendente |
   | `resenas` | `clienteAuthUid` Ascendente | `usado` Ascendente |

   Tardan unos minutos. Esperá a que los 4 digan **Habilitado**.

> ⚠️ El índice de `resenas` es el más traicionero: si falta, la página de reseñas
> le dice **"Link inválido"** a todo el mundo y parece que el link estuviera roto.

---

## PASO 3 — Agregar el dominio de Vercel a Firebase

**Authentication → Settings → Dominios autorizados → Agregar un dominio:**

```
brotesdietetica.vercel.app
```

Ahora solo están `localhost`, `brotesdietetica-2f78e.firebaseapp.com` y
`brotesdietetica-2f78e.web.app`, que vienen por defecto.

**Sin este paso el login con Google no funciona en el sitio publicado.**

---

## PASO 4 — Desactivar el acceso con email y contraseña

**Authentication → Sign-in method → Correo electrónico/contraseña → Inhabilitar.**
Dejá **solo Google**, igual que YERCO.

**Por qué:** el sitio no tiene ninguna pantalla de registro con email, no se usa para
nada. Pero mientras esté habilitado, cualquiera puede crearse una cuenta desde la
consola del navegador y pasar a contar como "usuario autenticado". Y hay reglas que
solo piden eso: crear pedidos y escribir los contadores de `config`. Con Google-only,
al menos hace falta una cuenta de Google real.

---

## PASO 5 — Crear los datos iniciales

En un Firestore vacío **el panel no arranca**, por dos trabas encadenadas:

- Guardar un producto exige elegir una *lista de proveedor*; si no hay ninguna, no se puede.
- El desplegable de *Categoría* se arma con las categorías **de los productos que ya
  existen** → con la colección vacía nunca podés crear el primero. Círculo cerrado.

Para eso hay una página que lo resuelve sola:

### https://brotesdietetica.vercel.app/setup-inicial.html

1. Entrá con Google (tiene que ser uno de los dos mails admin).
2. Te lista qué documentos faltan.
3. **Crear los que faltan.**

Crea 10 documentos y **nunca borra ni sobreescribe nada**. Se puede correr las veces
que quieras: si algo ya existe, lo saltea.

| Documento | Para qué |
|---|---|
| `listas/{id}` | **bloqueante** — lista de proveedor inicial |
| `_categorias/GENERAL` | **bloqueante** — categoría inicial |
| `productos/{id}` | **bloqueante** — producto oculto que desbloquea el desplegable |
| `config/siteContent` | textos e imágenes de la web |
| `config/factura` | datos que salen impresos en el ticket |
| `config/resenasConfig` | preguntas del formulario de reseñas |
| `config/pedidosCount` y 3 contadores más | numeración de pedidos y ventas |

> Si la página dice que tu mail no es admin: o el paso 2 no se completó (las reglas
> viejas bloquean todo), o estás con otra cuenta de Google.

Después:

1. Borrá o dejá oculto el "Producto de ejemplo".
2. Cargá el catálogo real: **/admin → Importar Nuevos Excel**.
   Obligatorias: `NOMBRE` y `CATEGORIA`.
   Opcionales: `SUBCATEGORIA`, `COSTO`, `PORCENTAJE`, `STOCK`, `DESCRIPCION`.
3. Subí el logo y la foto del hero: **/admin → Editor Web**.

---

## PASO 6 — Probar (en este orden)

Cada punto tapa una falla que **no muestra ningún error visible** si está mal.

- [ ] La home carga con estilos y se ven los productos.
- [ ] Login con Google **en la computadora** (abre un popup).
- [ ] Login con Google **en un celular de verdad** ← el que más se rompe. Hacelo sí o sí.
- [ ] Mi perfil: guardar nombre y teléfono, agregar una dirección.
- [ ] Carrito → Confirmar pedido → **aparece en /admin → Pedidos**.
- [ ] Cupón: crealo en /admin y aplicalo en el checkout.
- [ ] `/admin` deja entrar a los 2 mails admin y **rechaza** cualquier otro.
- [ ] Subir la foto de un producto (esto prueba `storage.rules`).
- [ ] Imprimir una factura: tiene que decir **BROTES DIETETICA** y la dirección correcta.
- [ ] Generar un link de reseña desde /admin y abrirlo: **no** debe decir "Link inválido".
- [ ] Buscá "yerco" en el sitio publicado: **0 resultados**.

---

## PASO 7 — App Check (opcional, gratis, dejalo para el final)

**Qué es:** exige que las peticiones vengan de nuestra web y no de un script.

**Por qué conviene:** no es por robo de datos, es por **la factura**. Firestore cobra
por documento leído, el catálogo tiene que ser público, y la `apiKey` está a la vista
en el código de la página (eso es normal, no es una filtración). Sin App Check,
cualquiera puede leer la base en loop y hacernos consumir cuota.

**¿Cuesta?** No. App Check es gratis y la clave de **reCAPTCHA v3** también, de sobra
para el volumen de una dietética. La que cuesta es **reCAPTCHA Enterprise**: en la
pantalla de Firebase aparecen las dos, **elegí la de arriba (reCAPTCHA), NO Enterprise.**

Pasos (3 minutos):

1. `google.com/recaptcha/admin` → crear clave → tipo **reCAPTCHA v3**.
2. Dominios: `brotesdietetica.vercel.app` y `localhost`.
3. Te da **clave de sitio** y **clave secreta**.
4. Firebase → **App Check → Apps → brotesdietetica → reCAPTCHA** → pegá la
   **clave secreta** → Guardar.
5. La **clave de sitio** va en el código, en `firebase-config.js` línea 63. Reemplazá
   el texto `REEMPLAZAR-recaptcha-v3-site-key` por la clave, y después:

```bash
git add firebase-config.js && git commit -m "config: clave de sitio de reCAPTCHA" && git push
```

Vercel redeploya solo.

> **NO prendas "Aplicar" / enforcement hasta que el sitio esté andando.** Si lo forzás
> con la clave mal configurada, **todas** las lecturas de Firestore fallan, el catálogo
> se ve vacío y el único síntoma es un error en la consola del navegador.
>
> Mientras la clave siga en `REEMPLAZAR`, el código no activa App Check y todo funciona
> normal. No corre apuro.

---

## PASO 8 — Cloud Functions (requiere plan Blaze — leer antes de decidir)

Las 4 Cloud Functions **no se pueden desplegar en Spark** (son Gen 2, corren sobre
Cloud Run). **El sitio funciona igual sin ellas**: catálogo, carrito, checkout, login,
panel, facturas, reseñas y mayoristas andan bien.

Lo único que se pierde:

| Function | Qué se pierde si no está |
|---|---|
| `notifyTelegramOnNewOrder` | no llega el aviso por Telegram de cada pedido nuevo |
| `procesarUsoCupon` | el tope **global** de usos de un cupón no se aplica (el "un uso por cliente" sí sigue) |
| `rateLimitPedidos` | no hay límite de 5 pedidos por hora por cliente |
| `sanitizarPedido` | no hay limpieza de texto en el servidor (la del navegador sigue) |

**Blaze en la práctica sale ~USD 0** con este tráfico: mantiene la capa gratuita y
cobra solo el excedente. Pide tarjeta. Si lo activan, **poné un presupuesto de alerta
en USD 5** (Google Cloud → Facturación → Presupuestos).

**Sugerencia: arranquen en Spark.** Pasen a Blaze cuando el dueño quiera los avisos
por Telegram, que es lo que más se nota.

Si activan Blaze:

```bash
cd C:\Users\Usuario\Documents\brotesdietetica\functions && npm install && cd .. && firebase deploy --only functions
```

Para Telegram, además hay que crear a mano el documento `config/telegram` en Firestore
con los campos `token` y `chatId` (el bot se crea con @BotFather). Ningún panel lo crea.
Ese token **es el único secreto real del sistema**, y por eso la regla de Firestore lo
deja visible solo para admins.

---

## Trampas — cosas que NO hay que hacer

1. **No cambies Build Command ni Output Directory en Vercel.** Los define `vercel.json`.
   Si los tocás, el deploy falla con *No Output Directory named public found*.
2. **No agregues comentarios a `vercel.json`.** Rechaza cualquier clave que no esté en
   su esquema, incluida `"//"`. Es JSON estricto.
3. **No agregues un redirect de `www` a sin-`www`** (ni al revés) si algún día ponen
   dominio propio. Combinado con el proxy de login da `ERR_TOO_MANY_REDIRECTS`.
   En YERCO pasó y hubo que revertirlo de urgencia. Servir los dos hostnames.
4. **Si editás `app.js` o `styles.css`, corré `npm run build`** antes de mirar el
   resultado en local. La web carga los `.min`, no los fuentes. En producción no hace
   falta acordarse (Vercel lo hace solo), pero en local sí.
5. **No toques el orden de los `<script>` de `admin.html`.** `admin-pagination.js` tiene
   que quedar último.
6. **Para agregar o quitar un admin hay que tocar 4 lugares** y volver a desplegar las
   reglas (ver `SETUP.md` sección 13). Si tocás uno solo, la persona queda a medias:
   entra al panel pero todo le da error, o al revés.
7. **No borres el `class="wa-dev"`** del link de Deft en el footer. Sin esa clase, el
   código lo reescribe con el número del negocio.

---

## Si algo falla

| Síntoma | Causa casi siempre |
|---|---|
| Catálogo vacío, sin error visible | reglas sin desplegar (paso 2), o App Check forzado con clave mal |
| `permission-denied` en la consola | reglas sin desplegar (paso 2) |
| Login anda en PC pero no en celular | falta el dominio en Firebase (paso 3) |
| "Link inválido" en toda reseña | falta el índice de `resenas` (paso 2) |
| "Seleccioná una lista de proveedor" | falta el paso 5 |
| El desplegable de Categoría vacío | falta el paso 5 |
| `storage/unauthorized` al subir foto | `storage.rules` sin desplegar (paso 2) |
| La factura sale con datos viejos | falta `config/factura` (paso 5) |
| Todo el sitio sin diseño | los `.min` no se generaron; revisar el log del build en Vercel |

**Detalle completo del sistema:** `SETUP.md` en la raíz del repo. Ahí está también la
deuda técnica heredada de YERCO (sección 17) y el manejo de credenciales (sección 13).

---

*Deft Software Solutions · +54 9 351 206-7970*
