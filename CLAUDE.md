# Brotes Dietética: reglas para Claude

Antes de hacer cualquier cosa, leé entero `CONTEXTO.md` (en la sección 4 está cómo trabajamos)
y mirá `PENDIENTE.md`.

## Regla obligatoria: nada se sube sin probarlo antes en el sandbox

Pedido de Thiago (21/10/2026). Todo cambio que sea una funcionalidad (un botón que hace algo,
un cambio en la lógica de una función, etc.) se prueba primero en el sandbox:

- **Lo prueba Claude**, como se viene haciendo: se levanta el sandbox (la entrada
  `brotes-sandbox` de la vista previa, en el puerto 5180 porque el 5173 lo usa otro proyecto;
  el panel en http://localhost:5180/sandbox, contra el emulador y el proyecto `demo-brotes`,
  sin tocar la base de la clienta), se hace el recorrido completo como lo haría la clienta y se
  comprueban los números en cada pantalla que el cambio toca.
- **Nada se pushea a producción si antes no se probó así y funcionó perfecto.** Además, el push
  lo pide Thiago, nunca por iniciativa propia (`CONTEXTO.md` §4.1).
- Las pruebas automáticas (`npm test`, `npm run check`) y los bancos (`_test-*.html`,
  `pruebas/*-banco.html`) ayudan, pero no reemplazan la prueba en el sandbox.
- Lo único que no pasa por el sandbox es la documentación (los `.md`).
- Al terminar, el sandbox se cierra verificando que no queden puertos abiertos ni procesos del
  emulador (nunca matar procesos de los MCP).
