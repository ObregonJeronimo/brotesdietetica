# Brotes Dietética — Puesta en marcha (Firebase + Vercel)

Réplica del sistema de YERCO para **Brotes Dietética**.
Desarrollado por **Deft Software Solutions** · +54 9 351 206-7970

Stack: HTML/CSS/JS sin framework · Firebase (Auth + Firestore + Storage + Functions) · Vercel (estático).

---

## Índice

1. [Antes de empezar](#1-antes-de-empezar)
2. [Crear el proyecto de Firebase](#2-crear-el-proyecto-de-firebase)
3. [Firestore: reglas e índices](#3-firestore-reglas-e-índices)
4. [Authentication (login con Google)](#4-authentication-login-con-google)
5. [Storage](#5-storage)
6. [App Check (reCAPTCHA v3)](#6-app-check-recaptcha-v3)
7. [Cloud Functions](#7-cloud-functions)
8. [Pegar la config en el repo](#8-pegar-la-config-en-el-repo)
9. [Importar en Vercel](#9-importar-en-vercel)
10. [Environment Variables: la respuesta corta](#10-environment-variables-la-respuesta-corta)
11. [Sembrar los datos iniciales](#11-sembrar-los-datos-iniciales)
12. [Checklist de verificación](#12-checklist-de-verificación)
13. [Manejo de credenciales](#13-manejo-de-credenciales)
14. [Cómo editar datos del negocio](#14-cómo-editar-datos-del-negocio)
15. [Build de los archivos .min](#15-build-de-los-archivos-min)
16. [Diferencias respecto de YERCO](#16-diferencias-respecto-de-yerco)
17. [Deuda técnica heredada](#17-deuda-técnica-heredada)

---

## 1. Antes de empezar

Necesitás:

- Cuenta de Google (la del dueño o la tuya) para el proyecto de Firebase.
- Cuenta de Vercel conectada a GitHub.
- Node 18+ instalado (hay Node 24, ya verificado).
- Firebase CLI: `npm i -g firebase-tools`

Admins del panel definidos en este repo:

| Email | Rol |
|---|---|
| `jeroobregon03@gmail.com` | vos |
| `thiagowendler53@gmail.com` | el dueño |

> Los emails de admin están en **4 lugares** y tienen que coincidir. Ver [§13](#13-manejo-de-credenciales).

---

## 2. Crear el proyecto de Firebase

1. https://console.firebase.google.com → **Agregar proyecto**.
2. Nombre: `brotes-dietetica`. Anotá el **Project ID** real que te asigna
   (suele quedar `brotes-dietetica` o `brotes-dietetica-xxxxx`). Lo vas a necesitar 4 veces.
3. Google Analytics: **desactivar** (no se usa).
4. **Pasar a plan Blaze ahora.** Las 4 Cloud Functions son Gen 2 (Cloud Run + Eventarc);
   el plan gratuito Spark **no puede desplegarlas**. Con el uso de un negocio chico el
   costo real es ~USD 0, pero pide tarjeta. Poné un presupuesto de alerta en USD 5.
5. **Agregar app → Web** (ícono `</>`). Apodo: `brotes-web`. **No** marcar Firebase Hosting
   (el hosting lo hace Vercel).
6. Copiá el objeto `firebaseConfig` que te muestra. Lo pegás en el [paso 8](#8-pegar-la-config-en-el-repo).

---

## 3. Firestore: reglas e índices

1. **Firestore Database → Crear base de datos**.
2. Modo: **producción** (bloqueado). Las reglas reales las desplegamos abajo.
3. **Ubicación: `southamerica-east1` (São Paulo).**
   > ⚠️ **Esto es irreversible.** Tiene que ser la misma región que las Functions.
   > Si te equivocás, la única salida es rehacer el proyecto entero.

Desde la carpeta del repo:

```bash
firebase login
```

```bash
firebase use --add
```

(elegí el proyecto nuevo, alias `default`)

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Qué se despliega:

- **`firestore.rules`** — quién puede leer/escribir cada colección. Es **la única barrera
  real de seguridad**: el panel `/admin` no protege nada por sí solo.
- **`firestore.indexes.json`** — 4 índices compuestos. En YERCO existían solo en la consola
  del proyecto viejo, sin versionar. Si faltan, **fallan cosas en silencio**:

  | Índice | Si falta |
  |---|---|
  | `resenas(clienteAuthUid, usado)` | `/resena` muestra **"Link inválido" a todos** |
  | `cupones(codigo, activo)` | falla **todo** canje de cupón |
  | `pedidos(clienteAuthUid, creadoEn desc)` | "Mis pedidos" queda vacío o desordenado |
  | `cuponesUsos(cuponId, uid)` | no se controla el uso único por cliente |

  Los índices tardan unos minutos en construirse. Miralos en Firestore → Índices.

---

## 4. Authentication (login con Google)

Esta parte es **idéntica a YERCO** a propósito: ahí ya funciona bien, incluido el caso
difícil (login en celular).

1. **Authentication → Comenzar → Google** → habilitar. **Solo Google**, nada más.
2. Poné **nombre público del proyecto** ("Brotes Dietética") y **email de soporte**:
   es lo que ve el cliente en la pantalla de consentimiento de Google.
3. **Authentication → Settings → Dominios autorizados**, agregá:
   - `localhost`
   - `TU-PROJECT-ID.firebaseapp.com`
   - `TU-PROJECT-ID.web.app`
   - `brotesdietetica.vercel.app` (o el host que te dé Vercel)
   - el dominio propio si lo hay, **con y sin `www`**
4. **Google Cloud Console → APIs y servicios → Credenciales → cliente OAuth 2.0 Web**
   (se creó solo):
   - *Orígenes de JavaScript autorizados*: `https://brotesdietetica.vercel.app`,
     `https://TU-PROJECT-ID.firebaseapp.com`, `http://localhost:5173`
   - *URI de redireccionamiento autorizados*:
     `https://TU-PROJECT-ID.firebaseapp.com/__/auth/handler`,
     `https://brotesdietetica.vercel.app/__/auth/handler`

### Por qué el login funciona en celular (no toques esto sin leer)

Firebase, por defecto, hace el login a través de `TU-PROJECT-ID.firebaseapp.com`. En
Android/iOS eso **se rompe**: el navegador bloquea cookies de terceros y el login queda
colgado. La solución de YERCO —replicada acá— es hacer que el login pase por **nuestro
propio dominio**, con un reverse proxy.

Son **3 piezas acopladas**. Si rompés una, el login móvil muere con `auth/internal-error`
y, como en desktop se usa popup, **desde la computadora parece que funciona**:

| Pieza | Archivo |
|---|---|
| `authDomain` = nuestro host si está en la lista | `firebase-config.js` → `DOMINIOS_PROPIOS` |
| proxy de `/__/auth/*` y `/__/firebase/*` hacia Firebase | `vercel.json` → `rewrites` |
| nuestro host permitido en `frame-src` | `vercel.json` → CSP |

**Probá el login en un teléfono real antes de dar el sitio por terminado.**

> ⚠️ **No agregues un redirect de `www` → sin `www` (ni al revés).** Combinado con el proxy
> de auth genera `ERR_TOO_MANY_REDIRECTS`. En YERCO pasó y hubo que revertirlo de urgencia.
> Serví los dos hostnames y listá los dos en todos lados.

---

## 5. Storage

1. **Storage → Comenzar**, misma región (`southamerica-east1`).
2. Desplegar las reglas:

```bash
firebase deploy --only storage
```

> YERCO **no tenía** `storage.rules` en el repo (las reglas vivían solo en la consola). Sin
> este archivo, subir la foto de un producto falla con `storage/unauthorized` y nada en el
> código te dice por qué. Acá el archivo existe: lectura pública, escritura solo admins,
> máximo 6 MB y solo `image/*`.

---

## 6. App Check (reCAPTCHA v3)

Evita que un bot te llene la base de pedidos basura.

1. https://www.google.com/recaptcha/admin → **reCAPTCHA v3** (⚠️ *no* Enterprise).
   Dominios: `brotesdietetica.vercel.app`, `localhost`, y el dominio propio si lo hay.
2. Te da 2 claves:
   - **Clave de sitio** → va en `firebase-config.js` (es pública, no es secreto).
   - **Clave secreta** → va **solo** en la consola de Firebase. Nunca en el repo.
3. **Firebase → App Check → registrar la app Web** con proveedor reCAPTCHA v3 y pegar la
   clave secreta.
4. **Dejá la aplicación forzada (enforcement) APAGADA** hasta verificar que el sitio anda.
   Si la prendés con una clave que no corresponde al dominio, **todas** las lecturas de
   Firestore fallan y el catálogo se ve vacío, con un solo error en la consola.

---

## 7. Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Las 4 funciones, todas en `southamerica-east1`, Node 22:

| Función | Qué hace |
|---|---|
| `notifyTelegramOnNewOrder` | avisa por Telegram cada pedido web |
| `procesarUsoCupon` | suma usos al cupón y lo desactiva al llegar a `maxUsos` |
| `rateLimitPedidos` | borra el pedido si el mismo usuario hizo más de 5 en 1 hora |
| `sanitizarPedido` | limpia los textos del pedido del lado del servidor |

> `procesarUsoCupon` es el **único** código que incrementa `cupones.usos`. Si no la
> desplegás, el tope `maxUsos` **nunca** se aplica.

### Telegram (opcional)

1. Hablale a [@BotFather](https://t.me/BotFather) → `/newbot` → te da un **token**.
2. Escribile algo a tu bot y abrí
   `https://api.telegram.org/bot<TOKEN>/getUpdates` para sacar el `chat.id`.
3. En Firestore creá **a mano** el documento `config/telegram`:
   ```
   token  : "123456:ABC-DEF..."
   chatId : "-1001234567890"
   ```
   No hay pantalla en el panel que lo cree.

> 🔒 El token del bot es **el único secreto real** del sistema. En YERCO quedaba
> **legible por cualquiera** (la regla `config/{doc}` tenía `allow read: if true`). Acá lo
> corregí: `config/telegram` es solo-admin. Ver [§13](#13-manejo-de-credenciales).

---

## 8. Pegar la config en el repo

Hay que reemplazar los `REEMPLAZAR-...` en **2 archivos**.

### `firebase-config.js`

```js
const DOMINIOS_PROPIOS = [
    'brotesdietetica.vercel.app',      // ajustá al host real de Vercel
    // 'brotesdietetica.com.ar',
    // 'www.brotesdietetica.com.ar',
];

const FIREBASE_PROJECT_ID = 'tu-project-id';

const firebaseConfig = {
    apiKey: "AIza...",                  // del paso 2.6
    authDomain: /* automático */,
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: `${FIREBASE_PROJECT_ID}.firebasestorage.app`,
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef"
};

const RECAPTCHA_SITE_KEY = '6Lc...';    // del paso 6
```

> Verificá `storageBucket` contra lo que dice la consola: los proyectos nuevos usan
> `.firebasestorage.app`, los viejos `.appspot.com`.

### `vercel.json`

Reemplazá **las 3 apariciones** de `REEMPLAZAR-project-id`:

- 2 en `rewrites` (los destinos `/__/auth/*` y `/__/firebase/*`)
- 1 en la CSP → `frame-src`

Y si usás un dominio propio, agregalo también en `frame-src`.

---

## 9. Importar en Vercel

1. https://vercel.com → **Add New → Project** → importar
   `github.com/ObregonJeronimo/brotesdietetica`.
2. Configuración: **no toques nada.** `vercel.json` ya declara lo que hace falta:

   ```json
   "buildCommand": "npm run build",
   "outputDirectory": "."
   ```

| Campo | Valor |
|---|---|
| **Framework Preset** | `Other` |
| **Root Directory** | `./` |
| **Build Command** | **sin override** — lo define `vercel.json` |
| **Output Directory** | **sin override** — lo define `vercel.json` |
| **Environment Variables** | **ninguna** — ver [§10](#10-environment-variables-la-respuesta-corta) |
| **Production Branch** | `main` |

3. **Deploy.**

> ⚠️ **Los dos campos de `vercel.json` son obligatorios.** Vercel detecta el script
> `build` del `package.json`, **lo corre igual**, y después busca una carpeta de salida
> `public/`. Como este sitio es estático y se sirve desde la raíz, esa carpeta no existe y
> el deploy falla con:
> ```
> Error: No Output Directory named "public" found after the Build completed.
> ```
> Dejar *Build Command* vacío en la UI **no** alcanza: vacío significa "usá el default", y
> el default es exactamente eso. Hay que declararlo explícito, y por eso está en el repo.

**Ventaja de que el build corra en Vercel:** los `.min` se regeneran en cada deploy, así que
**no pueden quedar desincronizados** de `app.js` / `styles.css` aunque te olvides de correr
`npm run build` antes del commit. Igual conviene correrlo local para probar antes de subir.

4. Anotá el host que te asignó (`brotesdietetica.vercel.app`) y **volvé al paso 4.3** a
   agregarlo en los dominios autorizados de Firebase, y al paso 8 en `DOMINIOS_PROPIOS`.

### Dominio propio (cuando lo compren)

1. Vercel → **Domains** → agregar el dominio **y** su `www`. Configurá el DNS como indica.
2. Agregarlo en: `firebase-config.js` (`DOMINIOS_PROPIOS`), Firebase → dominios
   autorizados, el cliente OAuth, y la CSP de `vercel.json`.
3. **Sin redirect entre `www` y el apex** (ver el aviso del paso 4).

---

## 10. Environment Variables: la respuesta corta

### **No hace falta ninguna. Dejá esa pantalla vacía.**

Lo verifiqué: no hay ni una sola referencia a `process.env`, `import.meta.env`, `VITE_`,
`NEXT_PUBLIC_` ni ningún mecanismo de sustitución en todo el repo. No hay bundler ni build:
`firebase-config.js` es un script común que se sirve tal cual.

**Y eso está bien, no es descuido.** Los 6 valores de `firebaseConfig` y la clave de sitio
de reCAPTCHA son **públicos por diseño**: llegan al navegador de cualquier visitante sin
importar cómo los pongas. La `apiKey` de Firebase Web **no es una contraseña**: identifica
al proyecto, no autoriza nada. Lo que realmente protege los datos es:

1. `firestore.rules` y `storage.rules` — quién puede leer/escribir qué
2. App Check — que los pedidos vengan de esta web y no de un script
3. Dominios autorizados de OAuth — dónde funciona el login

Meter esos valores en variables de entorno daría **una falsa sensación de seguridad**:
igual terminan en el HTML que cualquiera puede ver.

**Cuándo sí valdría la pena:** el día que quieras un entorno de *staging* separado con otro
proyecto de Firebase desde el mismo repo. Eso requiere agregar un build (una plantilla
`firebase-config.template.js` + un script que inyecte `process.env`), y además generar
`vercel.json` porque Vercel **no** interpola variables dentro de ese archivo. No lo
necesitás para lanzar.

---

## 11. Sembrar los datos iniciales

En un proyecto de Firebase vacío **el panel no arranca**. Dos trabas reales:

- Guardar un producto exige elegir una *lista de proveedor* → si no hay ninguna, no podés
  guardar **ni crear ni re-guardar** nada.
- El `<select>` de **Categoría** se arma con las categorías de los productos que **ya
  existen** (no con las categorías dadas de alta) → con la colección vacía nunca podés
  crear el primer producto. Círculo cerrado.

Para eso está **`/setup-inicial.html`**:

1. Abrí `https://tu-sitio.vercel.app/setup-inicial.html` (o `http://localhost:5173/setup-inicial.html`).
2. Entrá con Google (tiene que ser un email admin).
3. Te muestra qué documentos faltan. Apretá **Crear los que faltan**.

Crea 10 documentos y **nunca borra ni sobreescribe** nada. Se puede correr las veces que quieras.

| Documento | Para qué |
|---|---|
| `listas/{id}` | *bloqueante* — lista de proveedor inicial |
| `_categorias/GENERAL` | *bloqueante* — categoría inicial |
| `productos/{id}` | *bloqueante* — producto oculto que desbloquea el selector |
| `config/siteContent` | textos e imágenes de la web |
| `config/factura` | datos que salen impresos en el ticket |
| `config/resenasConfig` | preguntas del formulario de reseñas |
| `config/pedidosCount` · `clientesAuthCount` · `ventasCount` · `ventasMayCount` | contadores en 0 |

Falta uno a mano: **`config/telegram`** (lleva el token del bot, ver paso 7).

Después:

1. Borrá o dejá oculto el "Producto de ejemplo".
2. Cargá el catálogo real: **/admin → Importar Nuevos Excel** (columnas `NOMBRE` y
   `CATEGORIA` obligatorias; `SUBCATEGORIA`, `COSTO`, `PORCENTAJE`, `STOCK`, `DESCRIPCION`
   opcionales).
3. Subí el logo y la imagen del hero desde **/admin → Editor Web**.

---

## 12. Checklist de verificación

Probá en este orden. Cada ítem tapa una falla que, si no la buscás, **no da error visible**.

- [ ] La home carga **con estilos** (si se ve sin diseño, faltan los `.min` → `npm run build`).
- [ ] Se ven los productos del catálogo.
- [ ] **Login con Google en la computadora** (popup).
- [ ] **Login con Google en un celular real** (redirect) ← el que más se rompe.
- [ ] Mi perfil: guardar nombre/teléfono y agregar una dirección.
- [ ] Carrito → Confirmar pedido → aparece en **/admin → Pedidos**.
- [ ] Llega el aviso de Telegram (si lo configuraste).
- [ ] Cupón: crealo en /admin y aplicalo en el checkout.
- [ ] **/admin** deja entrar a los 2 emails admin y **rechaza** cualquier otro.
- [ ] Subir la foto de un producto (verifica `storage.rules`).
- [ ] Imprimir una factura: sale **BROTES DIETETICA** y la dirección correcta.
- [ ] Generar un link de reseña desde /admin y abrirlo: **no** debe decir "Link inválido"
      (si lo dice, falta el índice de `resenas`).
- [ ] `/politicas` y `/mayoristas` cargan.
- [ ] Buscá `yerco` en el sitio publicado: **0 resultados**.

Recién cuando todo esto pase: **prendé el enforcement de App Check** (paso 6.4) y volvé a
probar la home y un pedido.

---

## 13. Manejo de credenciales

### Va al repo (es público por diseño)

- Los 6 valores de `firebaseConfig` y la clave **de sitio** de reCAPTCHA.
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `vercel.json`, `firebase.json`.
- `config-negocio.js` — son los datos de contacto del negocio, están para que se vean.
- Los emails de admin (ya están en un `firestore.rules` que se sirve público).

### NO va al repo nunca

- **Token del bot de Telegram** → Firestore `config/telegram` (solo-admin).
- **Clave secreta de reCAPTCHA** → solo la consola de App Check.
- **JSON de cuenta de servicio** (`*-firebase-adminsdk-*.json`) → da acceso **total** al
  proyecto e **ignora las reglas**. No hace falta ninguno: las Functions usan credenciales
  implícitas. Ya está en `.gitignore`.
- Exports de clientes (`BROTES_costos_*.xlsx`) y facturas en PDF.

### Los emails de admin están en 4 lugares

Para agregar o quitar un admin hay que tocar **los cuatro** y volver a desplegar las reglas:

| Lugar | Formato | Autoridad |
|---|---|---|
| `firestore.rules` → `isAdmin()` | email en texto | **REAL** — autoriza los datos |
| `storage.rules` → `isAdmin()` | email en texto | **REAL** — autoriza las subidas |
| `admin.html` → `_AH` | SHA-256, primeros 16 hex | **solo cosmético** |
| `config-negocio.js` → `ADMIN_EMAILS` | email en texto | UI / documentación |

Hashes actuales, verificados:

```
jeroobregon03@gmail.com     -> 7a7f8cbeb22e2015
thiagowendler53@gmail.com   -> 5b731af37421f947
```

Para generar uno nuevo:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('email@ejemplo.com').digest('hex').slice(0,16))"
```

> ⚠️ **El control de `admin.html` es cosmético.** Solo esconde un `<div>` y se saltea desde
> las devtools en 10 segundos. Lo único que frena una escritura son las reglas de Firestore.
> Nunca escribas una función asumiendo que `_AH` protege algo.
>
> En YERCO estas listas **ya se habían desincronizado**: un email está en las reglas pero no
> en `_AH` (entra a los datos, no puede abrir el panel) y otro al revés (abre el panel y
> todo le da *permission denied*). Acá los 4 lugares coinciden.

### El token de GitHub que me pasaste

Lo pegaste en el chat, así que **consideralo comprometido: revocalo.**
GitHub → Settings → Developer settings → Personal access tokens → *Revoke*.

También conviene: el remote de **YERCO** tiene el token **escrito dentro de la URL**
(`git remote -v` lo muestra en texto plano, y queda en `.git/config`). En este repo lo dejé
limpio, sin token. Para arreglar YERCO:

```bash
git -C "C:\Users\Usuario\Documents\YERCO" remote set-url origin https://github.com/ObregonJeronimo/YERCO.git
```

Y usá el Git Credential Manager de Windows (o `gh auth login`) en vez de tokens en la URL.

---

## 14. Cómo editar datos del negocio

Pediste que la zona de envío se cambie en **un solo lugar**. Hay dos caminos:

### A) Sin tocar código, sin redeploy → `/admin → Editor Web`

Guarda en Firestore (`config/siteContent`) y **pisa** lo que dice el código. Se puede
cambiar: textos del hero, "Quiénes somos", las 4 tarjetas, el CTA, la descripción del
footer, Instagram, **WhatsApp**, email, la **imagen de fondo del hero**, la del CTA y los
**3 logos**. Es el camino recomendado para el dueño.

### B) En el código → `config-negocio.js`

Un solo archivo con todo: nombre, WhatsApp, email, Instagram, dirección, mapa,
**`zonaEnvio`**, horario, umbrales de envío y los datos de Deft. El HTML se rellena solo con
los atributos `data-negocio="clave"` / `data-negocio-href="clave"`.

Después de editarlo:

```bash
npm run build
```

```bash
git add -A && git commit -m "cambio datos negocio" && git push
```

**Precedencia:** código (`config-negocio.js`) → lo pisa Firestore (`config/siteContent`).

### Otras cosas puntuales

| Qué | Dónde |
|---|---|
| Imagen de fondo del hero | `/admin → Editor Web`, o `--hero-bg` en `styles.css` |
| Paleta de colores | `:root` en `styles.css` (más `politicas.html`, `mayoristas.html`, `resena.html`, `admin.html`, cada uno con su copia) |
| Datos del ticket/factura | `/admin → Configuración de factura` (Firestore `config/factura`) |
| Mínimo mayorista ($400.000) | `mayoristas.html`, **está 2 veces** |
| Costo de envío / envío gratis | `app.js` (checkout) **y** `ENVIO_PRECIO`/`ENVIO_GRATIS_DESDE` en `admin.html` — **tienen que coincidir** |

---

## 15. Build de los archivos .min

`index.html` carga los **minificados**, no los fuentes:

| Se sirve | Se genera desde |
|---|---|
| `app.min.js` | `app.js` |
| `styles.min.css` | `styles.css` |
| `toolbar.min.css` | `toolbar.css` |
| `footer-dev.min.css` | `footer-dev.css` |

```bash
npm run build
```

> **En producción no hace falta acordarse:** `vercel.json` tiene
> `"buildCommand": "npm run build"`, así que Vercel regenera los `.min` en cada deploy a
> partir de las fuentes. Nunca quedan desincronizados.
>
> Localmente **sí** hace falta correrlo: si editás `app.js` o `styles.css` y abrís el sitio
> con `npm run dev`, vas a seguir viendo la versión vieja hasta que buildees. No avisa, no
> falla: simplemente no cambia nada.
>
> YERCO no tenía script de build (se minificaba a mano); acá quedó automatizado con
> `terser` + `clean-css`.
>
> `admin.html` es la excepción: tiene el CSS y el JS embebidos, se edita directo y no
> necesita build.

Servidor local para probar (replica los rewrites de Vercel: `/admin`, `/politicas`, ...):

```bash
npm run dev
```

---

## 16. Diferencias respecto de YERCO

Todo lo demás es réplica, incluido **el manejo de cuentas de Google completo**.

**Marca**
- Nombre, logos (SVG nuevos: badge circular, wordmark claro/oscuro, favicon simplificado).
- Paleta del logo: verde bosque `#1E3E2C`, amarillo oro `#EDB833`, crema `#F5EEDA`,
  carbón `#26261F`.
- Fondo del hero nuevo (`img/hero-bg.svg`), claro porque el hero lleva texto oscuro.
- Datos de contacto, dirección y zona de envío de Brotes.
- **`img/default-product.jpg` era el logo de YERCO** (la "Y" con la hoja) y se usaba como
  imagen por defecto de todo producto sin foto → reemplazado por `img/default-product.svg`,
  neutro (17 referencias actualizadas).

**Términos y condiciones (`/politicas`)**
Reescrito y dividido en dos partes, porque un reemplazo de nombre a secas dejaba a Deft
como responsable de la inocuidad de los alimentos:
- Secciones 1–10 + privacidad + envíos → **Brotes Dietética**, que vende y responde.
- *Términos de la plataforma* y *Propiedad intelectual* → **Deft Software Solutions**, que
  desarrolla, provee y mantiene el software.
- Agregados: cuentas de usuario y qué informa Google, terceros que intervienen
  (Firebase/Vercel/WhatsApp), jurisdicción, y fecha de última actualización.

**Footer**
Bloque "Sitio y sistema desarrollados por **Deft Software Solutions**" con WhatsApp y
teléfono +54 9 351 206-7970.
> El link lleva `class="wa-dev"` **a propósito**: `app.js` reescribe todos los links de
> `wa.me` con el número del negocio **excepto** los `.wa-dev`. Si le sacás esa clase, el
> contacto de Deft pasa a apuntar al local.

**Infraestructura que en YERCO no estaba versionada**
- `storage.rules` — no existía; sin él fallan las subidas de imágenes.
- `firestore.indexes.json` — los 4 índices vivían solo en la consola.
- `setup-inicial.html` — reemplaza al viejo `seed.html`, que **borraba toda la colección
  `productos`** en lotes y la repoblaba desde un Google Sheet de YERCO. Eliminado.
- `package.json` con scripts de build; `dev-server.js` para desarrollo local.
- `config-negocio.js` como fuente única de los datos del negocio.

**Seguridad (arreglos sobre YERCO)**
1. **`config/telegram` era legible por cualquiera.** La regla `config/{doc}` tenía
   `allow read: if true` y ahí vive el **token del bot**. Ahora es solo-admin.
2. **`resenas` se podía actualizar sin estar logueado.** Como `read` es público, los ids de
   los tokens se pueden listar, así que cualquiera podía dejar la reseña de otro (el login
   de `resena.html` es solo del lado del cliente). Ahora exige sesión y que
   `clienteAuthUid` sea el de quien escribe.
3. **XSS almacenado.** El nombre de una dirección guardada se insertaba crudo con
   `innerHTML` (y ese dato lo lee también el panel de admin, que sí tiene permisos de
   escritura). Ahora se escapa al mostrar y se sanitiza al guardar.

**Bugs heredados que arreglé** (existen en YERCO; avisame si los querés allá)
1. **El botón "Menor precio" no hacía nada.** `ordenAlfa` arrancaba en `'asc'` y el
   comparador lo evalúa primero, así que el orden alfabético ganaba siempre. Ahora los dos
   órdenes son mutuamente excluyentes (que es para lo que el CSS ya atenuaba el botón inactivo).
2. **La página se bajaba sola y nadie veía el hero.** `app.js:62` tenía
   `hash==='#productos' ? 'productos' : 'productos'` — las dos ramas iguales. Ahora solo
   baja si la URL lo pide. (Importante justo acá: era la imagen de fondo que querías cambiar.)
3. **`/resena`: la primera pantalla se renderizaba sin estilos.** Un `</div>` mal ubicado
   dejaba `#needsLoginArea` (el "iniciá sesión", lo primero que ve todo el mundo) **fuera**
   de la tarjeta.
4. **3 bytes de control crudos** (`0x00`, `0x1F`, `0x7F`) dentro de un regex en `app.js`.
   Por el NUL, `git` y `grep` trataban el archivo como binario y lo salteaban en las
   búsquedas. Reescrito como `/[\x00-\x1F\x7F]/g` (mismo comportamiento).
5. **`rateLimitPedidos` y `sanitizarPedido` se desplegaban en `us-central1`** porque no
   declaraban región, mientras las otras dos iban a `southamerica-east1`.

---

## 17. Deuda técnica heredada

Cosas que **no** toqué (funcionan o no molestan hoy), anotadas para que no te sorprendan:

**Seguridad, en orden de prioridad**
1. `config/pedidosCount` y `config/clientesAuthCount` los puede escribir **cualquier usuario
   logueado** (lo necesita la transacción del cliente). Un cliente podría desordenar la
   numeración de pedidos. Se arregla moviendo el contador a una Cloud Function.
2. `cuponesUsos` se puede crear **sin estar logueado** si se omite el campo `uid` → se puede
   quemar el `maxUsos` de un cupón.
3. Las reseñas se publican con `visible:true` puesto por el cliente, **sin moderación**.
4. **El checkout sin login es contradictorio:** la UI dice que iniciar sesión es opcional,
   pero `firestore.rules` exige estar autenticado para crear un pedido. Si el cliente no
   inicia sesión, la escritura falla, el `try/catch` se la come y **solo** sale el mensaje de
   WhatsApp: el pedido nunca llega al panel. Hay que decidir uno de los dos modelos.
5. Un cliente no puede borrar su propio perfil (`clientesAuth` no tiene regla de `delete`),
   aunque las políticas prometen borrado por email.

**Funcional**
- Los umbrales de envío (`2000`, `30000`, `100000`) están repetidos en `app.js`,
  `admin.html` e `index.html` (los marcadores `30k`/`100k` de la barra son porcentajes fijos).
- `optImg()` es un stub que no hace nada: se sirven las imágenes de Storage a tamaño completo.
- El número de pedido se muestra como `N°007` en un lado y `#000007` en otro.
- La función de **gramaje** es código muerto (`gramajePadreId` se lee pero nunca se asigna).
- Las reseñas se leen con `limit(50)` **antes** de filtrar por visibles → pasando los 50
  tokens, empiezan a desaparecer reseñas publicadas.
- **PDF Semanal** está calzado a la plantilla de un proveedor puntual (`FRUTICOR`, alto de
  página y columnas fijos). Si Brotes no usa ese proveedor, son ~90 líneas inertes.
- Toda importación identifica productos por `nombre` exacto: si el proveedor renombra algo,
  crea un producto duplicado en vez de actualizarlo.
- La sección `sec-excelJoaco` del panel es inalcanzable (no hay nada que la abra).
- Los listados del panel leen colecciones completas sin `limit()`; `historial` crece sin
  tope. Vigilá la cuota de lecturas de Firestore.

**Orden de scripts que no se puede cambiar**
- `admin-pagination.js` tiene que quedar **último** en `admin.html`: parchea funciones que
  captura al cargar.
- `app.min.js` va al final del `<body>` **sin `defer`**: `loadSiteContent()` y `loadReviews()`
  se llaman en el nivel superior del script.

---

*Documento mantenido por Deft Software Solutions · +54 9 351 206-7970*
