# Kanbam

Tablero Kanban hecho con Vanilla TypeScript, Vite y CSS moderno, sin frameworks ni backend. Guarda el estado en `localStorage` e incluye datos de ejemplo para probarlo de inmediato.

## Funcionalidades

- 4 columnas fijas (*Por hacer*, *En progreso*, *En revisión*, *Completado*) con contador de tarjetas.
- Crear, editar y eliminar tarjetas con validación de título y confirmación al borrar.
- Arrastrar y soltar tarjetas entre columnas y reordenarlas dentro de la misma columna con HTML5 Drag & Drop. En móvil también se puede mover de columna desde *Editar*.
- Búsqueda por texto y filtros por prioridad y etiqueta en tiempo real.
- Exportar e importar el tablero en `.json` validando el formato antes de cargarlo.
- Tema claro y oscuro persistido con variables CSS.
- Botón para restaurar los datos demo y atajos de teclado (`N` para nueva tarjeta, `Escape` para cerrar modales).

## Estructura del proyecto

```text
src/
├── core/
│   ├── types.ts        # Tipos de tareas, columnas, filtros y estado
│   ├── storage.ts      # Lectura/escritura en localStorage, datos demo y validación
│   └── store.ts        # Estado en memoria con suscripciones
├── components/
│   ├── Toolbar.ts      # Buscador, filtros, acciones y cambio de tema
│   ├── Board.ts        # Tablero de columnas
│   ├── Column.ts       # Columna individual
│   ├── TaskCard.ts     # Tarjeta de tarea
│   ├── TaskModal.ts    # Modales de formulario y confirmación
│   └── Toast.ts        # Avisos en pantalla
├── utils/
│   ├── dom.ts          # escapeHtml para evitar XSS y helper con <template>
│   └── dnd.ts          # Eventos de Drag & Drop
├── App.ts              # Conecta el store, la interfaz y los atajos
├── main.ts             # Punto de entrada
└── style.css           # Variables CSS, anidado nativo y diseño responsive
```

## Decisiones técnicas

- **Sin frameworks:** el estado se maneja en un store propio con suscripciones (`store.subscribe`) para re-renderizar el tablero cuando algo cambia, manteniendo la barra de búsqueda montada para no perder el foco al escribir.
- **Validación de datos:** al leer de `localStorage` o importar un `.json`, se valida la estructura con type guards antes de aplicar el estado. Si los datos están rotos, se restauran los de ejemplo.
- **Seguridad en el DOM:** todos los textos ingresados por el usuario pasan por `escapeHtml` antes de insertarse en plantillas.

## Cómo correrlo

Requiere Node.js y `pnpm`.

```bash
pnpm install
pnpm dev
```

Otros scripts disponibles:

```bash
pnpm exec tsc --noEmit   # revisar tipos
pnpm build               # compilar para producción
pnpm preview             # ver el build en local
```
