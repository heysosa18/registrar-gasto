# Registrar gasto

App instalable para anotar un gasto en segundos desde el celular. Guarda en una hoja de Google
a través de Apps Script; este repositorio solo tiene la pantalla (no hay datos aquí).

- `index.html`, `app.js`: pantalla y lógica (funciona sin señal y reenvía al volver).
- `sw.js`: guarda la app en el celular para que abra al instante.
- La conexión con la hoja exige una clave que se entrega una sola vez al tocar "Conectar".
