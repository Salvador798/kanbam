# Kanbam

Tablero Kanban interactivo construido con **Vanilla TypeScript**, **Vite** y **CSS moderno**, sin frameworks ni backend.

**Demo en vivo:** [https://kanbam-xi.vercel.app/](https://kanbam-xi.vercel.app/)

![Vista previa de Kanbam](./src/assets/wallpaper.png)

## Motivación del proyecto

La mayoría de aplicaciones frontend hoy se construyen directamente sobre React, Vue o Angular, lo que muchas veces oculta cómo funcionan por debajo el DOM, la reactividad, el manejo de eventos y la seguridad en el navegador.

El objetivo de **Kanbam** fue construir una aplicación completa y lista para usar desde cero con **TypeScript estricto** y APIs nativas del navegador, demostrando dominio de los fundamentos del frontend: arquitectura modular, flujo de datos predecible, validación de datos externos, accesibilidad y diseño adaptable a cualquier pantalla.

## Problemas técnicos resueltos

- **Mantener el DOM sincronizado sin framework ni Virtual DOM:** toda la lógica de datos vive en un `store` propio con patrón *Observer / Pub-Sub* (`store.subscribe`). Cada cambio en las tareas persiste en `localStorage` y dispara un re-render limpio del tablero, evitando contadores o columnas desactualizadas.
- **No perder el foco al buscar en tiempo real:** al no tener reconciliación de Virtual DOM, re-renderizar toda la página al escribir destruiría el `<input>` de búsqueda. Para resolverlo, `Toolbar` y los modales se montan una sola vez y actualizan su estado mediante `sync()`, mientras que solo `Board` se re-renderiza de forma declarativa.
- **Protección contra datos corruptos en `localStorage` e importación JSON:** en lugar de confiar en un `JSON.parse(...) as BoardState`, los datos externos se reciben como `unknown` y pasan por *Type Guards* (`isBoardState`, `isPersistedBoardEnvelope`) y migraciones de esquema que verifican versión y cada campo de cada tarjeta. Si el almacenamiento fue alterado o el archivo es inválido, la app no se rompe.
- **Prevención de XSS al renderizar texto del usuario:** el texto del usuario nunca se interpola en HTML: las tarjetas y columnas se construyen con APIs del DOM (`textContent`), y `htmlToElement` solo se usa con plantillas estáticas.
- **Drag & Drop nativo preciso (incluso con filtros activos):** la lógica en `dnd.ts` usa delegación de eventos sobre el contenedor del tablero (se registra una sola vez) y calcula la posición real de inserción en la columna destino, además de ofrecer cambio de columna desde *Editar* para dispositivos táctiles.
- **Accesibilidad y detalles de UI/UX:** navegación por teclado (`N` para nueva tarjeta, `Escape` para cerrar modales, `:focus-visible`), uso de `inert` y `aria-hidden` en modales animados, soporte para `prefers-reduced-motion`, notificaciones Toast (`role="status"`, `aria-live="polite"`) en lugar de `alert()` bloqueantes y diseño responsive probado desde `320px`.

## Funcionalidades

- **4 columnas fijas** (*Por hacer*, *En progreso*, *En revisión*, *Completado*) con contador en tiempo real y 7 tarjetas demo precargadas.
- **CRUD completo:** crear y editar tarjetas (título con validación, descripción, prioridad, etiqueta y columna) y eliminar con modal de confirmación.
- **Drag & Drop nativo:** mover tarjetas entre columnas y reordenarlas dentro de la misma columna con indicador visual de caída.
- **Búsqueda y filtros combinados:** texto (título o descripción), prioridad, etiqueta y botón para limpiar filtros activos.
- **Respaldo y personalización:** exportar e importar el tablero en `.json`, botón *Restaurar demo* y cambio de tema **Claro / Oscuro** persistido mediante variables CSS.

## Arquitectura

```text
src/
├── domain/              # Núcleo puro (sin imports de otras capas): tipos, validación, fechas, operaciones inmutables con Result
├── application/         # Casos de uso: store (Pub/Sub), filtros y puertos (BoardPersistence, ThemePersistence, BoardSerializer)
├── infrastructure/      # Adaptadores: repositorio localStorage, migraciones de esquema, guards, import/export JSON, seed
├── ui/
│   ├── components/      # Toolbar, Board, Column, TaskCard, TaskModal, Toast
│   ├── utils/           # dom.ts (plantillas estáticas), dnd.ts (Drag & Drop), tags.ts
│   ├── App.ts           # Raíz de la UI, suscripción al store y atajos de teclado
│   └── style.css        # Variables CSS, CSS Nesting nativo y diseño responsive
└── main.ts              # Composition root: conecta infraestructura con la aplicación y monta la UI
```

Regla de dependencias: `domain` no importa nada; `application` solo importa `domain` y recibe la persistencia por puertos inyectados; `ui` importa `application` y tipos de `domain`; únicamente `main.ts` conoce las implementaciones concretas de `infrastructure`.

## Stack

- **TypeScript** (modo estricto, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`)
- **Vite** + **pnpm**
- **CSS moderno** (Variables CSS, Grid/Flexbox, CSS Nesting nativo)
- **APIs nativas del navegador:** HTML5 Drag & Drop, `localStorage`, `crypto.randomUUID()`, `<template>`, `Blob` / `File.text()`, `inert`

## Instalación y uso local

Requiere Node.js y `pnpm`.

```bash
pnpm install
pnpm dev
```

Otros comandos útiles:

```bash
pnpm exec tsc --noEmit   # verificación de tipos
pnpm build               # build de producción
pnpm preview             # vista previa del build
```
