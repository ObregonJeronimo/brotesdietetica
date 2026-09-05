# Migración FRUTICOR: de YERCO a Brotes

Trae los **873 productos** de la lista `FRUTICOR` de YERCO (`yerco-bb620`, lista
`BsDYIsMLaUkEkesQdfDX`) a Brotes (`brotesdietetica-2f78e`), dentro de una lista **nueva**
llamada `FRUTICOR-TODOS`. **No borra ni toca nada de las listas que ya existen.**

El detalle de qué se decidió y por qué está en `PENDIENTE.md` §1-bis A. Acá va sólo cómo se
corre.

## Antes de correr

Hace falta **ADC** (`firebase-admin` no usa el login del CLI de `gcloud`, usa el suyo):

```bash
gcloud auth application-default login
```

Y al terminar, conviene sacarlo:

```bash
gcloud auth application-default revoke
```

## Los tres pasos

```bash
node migracion/dump.js          # baja los dos catalogos a JSON local (SOLO LECTURA)
node migracion/migrar.js --dry  # calcula todo y deja el informe. NO escribe nada
node migracion/migrar.js --escribir
```

`dump.js` deja `fruticor.json`, `brotes.json` y `brotes-listas.json`. **No se commitean**:
traen el catálogo y los costos de YERCO, que es otro cliente. Están en `.gitignore`.

`--dry` deja tres archivos para revisar:

| archivo | qué trae |
|---|---|
| `informe-seco.txt` | el antes y el después, la clasificación y los 10 controles |
| `clasificacion.csv` | las 873 filas: motivo, envase, precio y stock antes/después |
| `duplicados.csv` | los 47 nombres que ya existen en Brotes y se van a duplicar |

## Qué hace `--escribir`

En orden, y se planta solo si `FRUTICOR-TODOS` ya existe (para no duplicar):

1. **893 imágenes** del bucket de YERCO al de Brotes, servidor a servidor. Cada copia estrena
   su token de descarga. El mapa queda en `mapa-imagenes.json`: si el paso se corta, al
   volver a correr no recopia lo que ya estaba. Son ~19 MB.
2. La lista `FRUTICOR-TODOS`.
3. Los **873 productos**, en lotes de 450.
4. El **remapeo de punteros** (153 `padreId` + 2 `gramajePadreId`) en una segunda pasada. Los
   ids los pone Firestore al crear, así que escribir el `padreId` de YERCO tal cual dejaría
   153 hijos apuntando a documentos que en Brotes no existen.
5. Las **17 categorías** que Brotes no tenía.

Al final cuenta los documentos —no los contadores— y verifica que no queden huérfanos ni
imágenes apuntando a YERCO.

## Después

Recalcular el uso de Storage desde el panel (**Configuración → Storage**): subió ~19 MB, y
el contador lo lleva una Cloud Function por evento.

## Para revertir

`mapa-ids.json` guarda el id de la lista y el mapa `idYerco → idBrotes`. Todo lo creado vive
en la lista `FRUTICOR-TODOS`, así que alcanza con borrar los productos de esa lista y la
lista. Las imágenes copiadas quedan en el bucket: se borran por separado si molestan.

## La trampa de este script

**A granel el precio es POR KILO y el stock va en GRAMOS** (`PENDIENTE.md` §5). En YERCO no
existe `tipoVenta` y los precios son **del bulto**, con el stock contando **bultos**. Por eso
un producto que acá queda como `peso` **no se copia tal cual**: se divide `costo`, `precio` y
`precioMayorista` por los kilos del bulto, y el stock se multiplica por los gramos. Un error
ahí no da error de consola: da un precio mil veces corrido.

La clasificación no se inventa por el nombre. En orden de prioridad:

1. **Lo que ya decidió el dueño.** 47 de los 873 están cargados en Brotes (lista `FRUTICOR
   1`) con su `tipoVenta` puesto a mano. Ese dato manda. Contra esos 47 la regla del envase
   acierta 40: las 7 que falla son de 500 gr que él sí vende sueltas.
2. **El envase que declara el nombre.** En kilos → `peso`; en gramos, cc, litros o unidades
   → `unidad`.
3. **El grupo**, cuando al proveedor se le comió la unidad (`MIX FRUT. SECOS CLASICO x 2,5`).
   Los hermanos del `grupoId` dicen que son kilos, y se exige además que el precio por kilo
   quede en el mismo orden que el de ellos.
