# Especificación — Roles de empleado y ticket térmico

> Escrita el 11/09/2026. Son las dos funciones que el dossier de Deft Comercio promete y
> que todavía no existen. Hay que construirlas **en este sistema** antes de clonarlo para
> el cliente nuevo.

---

## A) Roles y permisos

### El problema

Hoy entrar al panel es todo o nada: quien está en `/admins` ve las 17 secciones y puede
borrar una venta, cambiar un precio o vaciar el stock. El local va a tener empleados de
mostrador, y el dueño quiere que un cajero venda sin poder tocar los precios ni ver la
facturación del mes.

### Qué ya existe y no hay que rehacer

- La colección `/admins`, un documento por mail (el id es el mail en minúsculas).
- El mecanismo de **custom claims**: los documentos ya tienen `claimPendiente` y
  `claimAplicadoEn`, y hay una Cloud Function que aplica el claim de admin.
- El dueño está fijo en las reglas de Firestore y **no se puede quitar desde el panel**.
  Es la salida de emergencia y se conserva tal cual.

### Modelo de datos

**Colección nueva `/roles`**, un documento por rol:

```js
{
  nombre: 'Cajero de tarde',        // lo escribe el dueño, es lo que se ve en pantalla
  secciones: {                      // una clave por item del menú
    caja:true, ventas:true, ventasMay:false, pedidos:false,
    clientes:false, clientesAuth:false, resenas:false, cupones:false,
    products:true, stock:false, insumos:false, proveedores:false,
    stats:false, historial:false, editor:false, factura:false, config:false
  },
  acciones: {
    ventaCrear:true, ventaEditar:true, ventaEliminar:false,
    cajaAbrirCerrar:true, cajaMovimientos:true,
    productoCrear:false, productoEditar:false, productoEliminar:false,
    precioEditar:false, stockEditar:false,
    pedidoGestionar:false, compraCrear:false, proveedorEditar:false,
    cuponGestionar:false, exportar:false, usuariosGestionar:false, configEditar:false
  },
  creadoPor:'...', creadoEn: <ts>, actualizadoEn: <ts>
}
```

**`/admins/{mail}` suma un campo**: `rolId`.

Las claves de `secciones` son **exactamente las que ya usa `switchSection()`** —`caja`,
`ventas`, `ventasMay`, `pedidos`, `clientes`, `clientesAuth`, `resenas`, `cupones`,
`products`, `stock`, `insumos`, `proveedores`, `stats`, `historial`, `editor`, `factura`,
`config`—. No se inventa una nomenclatura paralela: si mañana se agrega una sección, la
clave es la misma que el `switchSection`, y el rol la muestra sola.

En pantalla cada interruptor lleva **el rótulo del menú**, no la clave: el dueño ve
"Ventas mayoristas", no `ventasMay`.

### La decisión que evita dejar a todos afuera

**Un admin sin `rolId` conserva acceso total.** Al desplegar esto, los cuatro admins de
hoy no tienen rol asignado; si "sin rol" significara "sin permisos", el panel se cerraría
para todos en el mismo deploy, dueño incluido. El rol restringe **cuando se asigna**, no
por omisión.

### Dónde se hace cumplir

Tres capas, y **sólo la tercera es de verdad**:

1. **El menú** — `admin-roles.js` esconde las secciones que el rol no tiene, y
   `switchSection()` rechaza la que no corresponda (por si alguien la llama desde la
   consola o por un atajo de teclado). Los atajos `1`–`6` respetan lo mismo.
2. **Las acciones** — un único helper `puede('ventaEliminar')`. Los botones que la persona
   no puede usar **no se dibujan**; el handler igual vuelve a preguntar antes de escribir.
3. **Las reglas de Firestore** — es la única capa que un empleado no puede saltear. Las
   dos de arriba son comodidad; ésta es el permiso.

Para que las reglas no paguen un `get()` por escritura, los permisos viajan en el
**custom claim** del token, igual que hoy viaja el de admin:

- Una Cloud Function escucha `/roles/{id}` y `/admins/{mail}` y recalcula el claim de los
  usuarios afectados (`permisos: { secciones, acciones }`).
- Cambiar un rol cambia a todos los que lo tienen, sin tocarlos uno por uno.
- El token viejo sigue vivo hasta una hora: al cargar el panel se hace
  `getIdToken(true)` para forzar el refresco, y el claim nuevo entra al instante.

### La pantalla

**Configuración → Usuarios y roles**, dos columnas:

- **Roles**: lista, botón "Nuevo rol". Al abrir uno: el nombre arriba y los interruptores
  agrupados en **Secciones** y **Acciones**. Abajo, cuántas personas lo tienen.
- **Usuarios**: los mails con acceso, cada uno con un desplegable para elegir su rol. El
  dueño aparece marcado como *Acceso total* y su desplegable está deshabilitado.

Borrar un rol que alguien tiene asignado **pide confirmación y dice a quiénes afecta**;
esas personas quedan sin `rolId`, es decir con acceso total — así que el aviso tiene que
decirlo con esas palabras, no con un "¿Está seguro?".

### Pruebas (`pruebas/t-roles.js`)

Tienen que fallar contra el commit anterior:

- Un rol sin `stats` no dibuja el item del menú, `switchSection('stats')` no cambia de
  sección, y el atajo `5` tampoco.
- Un rol sin `ventaEliminar` no dibuja el botón de borrar **y** `deleteVenta()` corta
  antes de escribir.
- Un admin **sin `rolId`** pasa todos los permisos (la compatibilidad hacia atrás).
- El dueño pasa todos los permisos aunque tenga un rol restrictivo asignado.
- Una clave de sección nueva en `switchSection` sin su interruptor **rompe la prueba**:
  es lo que evita que una sección quede sin permiso por olvido.
- Contra las reglas (`npm run test:reglas`): con el claim sin `ventaEliminar`, el delete
  en `/ventas` se rechaza del lado del servidor.

---

## B) Ticket térmico después de la venta

### El flujo

Cerrada la venta —con doble `Enter` o con el botón— aparece **una sola pregunta**:

```
                  ¿Imprimir ticket?

            [ Imprimir ]   [ No imprimir ]
              ▲ enfocado

        ← →  elegir     Enter  confirmar     Esc  no imprimir
```

- **`Imprimir` viene enfocado.** Así el mostrador cierra la venta con un `Enter` y, si el
  cliente quiere el comprobante, con **otro `Enter`** ya sale.
- `←` y `→` mueven entre los dos botones. `Esc` equivale a *No imprimir*.
- El foco entra al diálogo al abrirlo y **no se puede salir con Tab** mientras está abierto.

### El Enter de la pistola no puede contestar esta pregunta

`admin-lector.js` ya distingue un `Enter` de ráfaga de uno humano. El diálogo tiene que
usar **esa misma distinción**: si el lector queda apoyado sobre el gatillo mientras el
diálogo está abierto, no se puede imprimir solo. Sólo un `Enter` clasificado como humano
lo confirma.

Además `_hayOtroModalEncima()` ya evita que el doble Enter cierre una venta con otra
ventana encima; el diálogo del ticket entra en esa misma categoría y no hay que tocar nada.

### Si no hay impresora configurada

El diálogo cambia de contenido en vez de fallar callado:

```
    Todavía no configuraste la impresora de tickets.

          [ Configurar ]   [ Ahora no ]
```

`Configurar` lleva a **Configuración → Impresión**. La venta ya quedó guardada: esto no
la bloquea nunca.

### Qué se configura, y qué no se puede configurar

En **Configuración → Impresión**:

| opción | valores |
|---|---|
| Ancho del papel | 58 mm · 80 mm |
| Tipo de rollo | continuo · con corte (troquelado) |
| Pie del ticket | texto libre ("¡Gracias por su compra!", CUIT, dirección) |
| Después de cada venta | preguntar · imprimir directo · no imprimir |

**Lo que hay que decir de frente:** el navegador **no puede elegir la impresora**. No
existe una API que las liste; la elección la hace el diálogo de impresión del sistema. Con
lo cual:

- "Configurada" acá significa **el formato del papel**, no el dispositivo.
- Para que no aparezca el diálogo del sistema en cada venta, la térmica tiene que quedar
  como **impresora predeterminada de Windows** y Chrome arrancar con `--kiosk-printing`.
  Eso es un paso de instalación en la máquina del local, y va en el manual de puesta en
  marcha; no es algo que el sistema pueda resolver solo.
- El texto de la pantalla tiene que decir esto mismo. Prometer "elegí tu impresora" y que
  después salte el diálogo de Windows es la clase de detalle que quema la entrega.

El tipo de rollo importa de verdad: en **continuo** el documento va con `@page size: W auto`
y un solo corte al final; en **troquelado** va una página por ticket. Es el mismo problema
que ya se resolvió en `admin-etiquetas.js` y se reusa de ahí, no se reescribe.

### El ticket

Se arma con la maquinaria que ya existe (`etiquetaDocumento`, `etiquetaFormato`), en una
ventana aparte que se imprime y se cierra.

Contenido: nombre del negocio (de `config-negocio.js`), número de venta, fecha y hora, los
renglones, el total, el método de pago, el vuelto si fue en efectivo, y el pie configurado.

**La trampa de siempre:** a granel la cantidad se guarda en **gramos** y el precio es **por
kilo**. En el ticket la cantidad se muestra en kg y el precio unitario dice `/kg`. Se usa
`esPorPeso()` y el mismo formateo de `stockTexto()`, no una cuenta nueva:

```
Almendras                 0,250 kg
  $32.830/kg                $8.208
```

### Reimprimir

En la lista de ventas, un ícono de impresora por renglón reimprime **el mismo ticket**, con
los datos guardados de esa venta y no con los precios de hoy. Queda registrado con
`logAction('imprimir', ...)`.

### Pruebas (`pruebas/t-ticket.js`)

- El documento se arma con el **total de la venta guardada**, no recalculado.
- Un renglón a granel de 250 g a $32.830/kg imprime `0,250 kg` y `$8.208` — el x1000 al
  revés da $8.207.500 y la prueba lo tiene que ver.
- El vuelto sale sólo si el método fue efectivo.
- `Imprimir` es el botón enfocado al abrir; `Esc` cierra sin imprimir.
- Un `Enter` de ráfaga (pistola) **no** confirma el diálogo; uno humano sí.
- Sin formato configurado, el diálogo ofrece *Configurar* y **no** llama a `print()`.
- Reimprimir una venta vieja usa los precios de esa venta.

---

## Orden sugerido

1. **El ticket primero.** Es autocontenido, reusa `admin-etiquetas.js`, y es lo que el
   mostrador va a usar todos los días desde el primer minuto.
2. **Los roles después.** Tocan reglas de Firestore, una Cloud Function y las 17 secciones
   del panel; conviene hacerlo con el sistema quieto y no el día antes de entregar.

Las dos cosas se portan a YERCO después (ver §6 de `PENDIENTE.md`).
