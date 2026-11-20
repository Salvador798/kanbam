# Alcance del Proyecto: Tablero Kanban en Vanilla TypeScript

## 1. Objetivo del proyecto

Construir una aplicación web de tablero Kanban rápida, tipada y sin dependencias de _frameworks_ ni _backend_, que permita gestionar tareas de forma visual, persistir los cambios en `localStorage` de forma segura y ofrecer una experiencia lista para probar desde el primer segundo en procesos de selección remotos.

---

## 2. Stack y enfoque técnico

- **Lenguaje:** Vanilla TypeScript (tipado estricto, sin `any` innecesarios).
- **Empaquetador y gestor:** Vite + `pnpm`.
- **Estilos:** CSS nativo moderno (Variables CSS, Grid/Flexbox, soporte para tema Claro / Oscuro).
- **Persistencia:** `localStorage` encapsulado detrás de un módulo/repositorio propio (`storage.ts`), sin backend ni base de datos.

---

## 3. Lo que SÍ entra en el alcance (MVP sólido)

### A. Gestión del tablero y columnas

- **4 columnas fijas:** _Por hacer_, _En progreso_, _En revisión_ y _Completado_.
- **Contador de tarjetas** actualizado en tiempo real en cada columna.
- **Estado inicial precargado (seed):** si no hay datos válidos en `localStorage`, cargar automáticamente entre 6 y 8 tarjetas realistas de ejemplo y ofrecer un botón para **Restaurar demo**.

### B. CRUD de tarjetas

- **Crear tarjeta** mediante un modal o formulario rápido con:
  - Título (obligatorio, con validación).
  - Descripción breve (opcional).
  - Prioridad (_Baja_, _Media_, _Alta_).
  - Etiqueta o categoría (ej. _UI_, _Bug_, _Feature_, _Docs_).
  - Columna inicial.
- **Editar tarjeta** existente (modificar cualquiera de sus campos o moverla de columna).
- **Eliminar tarjeta** con confirmación sencilla para evitar borrados accidentales.

### C. Movimiento y ordenación (Drag & Drop nativo)

- Arrastrar tarjetas entre columnas y reordenarlas dentro de la misma columna usando la **HTML5 Drag and Drop API**.
- Retroalimentación visual clara al arrastrar y al pasar sobre una zona válida para soltar.
- Actualización inmediata del orden en el estado y en `localStorage`.

### D. Búsqueda y filtrado en tiempo real

- Buscador por texto (filtra por título o descripción).
- Filtro por prioridad (_Todas_, _Alta_, _Media_, _Baja_) y/o etiqueta.
- Botón para **Limpiar filtros** cuando haya algún filtro activo.

### E. Persistencia, respaldo y experiencia de uso

- Guardado automático en `localStorage` con manejo de errores (`try/catch`) y validación básica de estructura/versión ante datos corruptos o vacíos.
- **Exportar tablero a `.json`** y **importar tablero desde `.json`** (validando el archivo antes de aplicarlo).
- **Cambio de tema Claro / Oscuro** persistido mediante variables CSS.
- **Atajos de teclado básicos:** `N` para abrir nueva tarjeta (fuera de campos de texto) y `Escape` para cerrar modales.

---

## 4. Lo que NO entra en el alcance

- Backend, API propia, base de datos o autenticación (login, registro, roles, sesiones).
- Sincronización multi-usuario en tiempo real (_WebSockets_ / _Server-Sent Events_).
- Subida de archivos pesados o hilos de comentarios anidados complejos.
- _Frameworks_ frontend (Vue, React, Angular, etc.), librerías de UI, gestores de estado externos o librerías de _drag-and-drop_.

---

## 5. Criterios de calidad y "definición de terminado"

1. **Compilación limpia:** sin errores ni advertencias de TypeScript (`tsc --noEmit`) ni de empaquetado con `pnpm`.
2. **Arquitectura modular:** separación clara de responsabilidades entre tipos, estado (_store_ con suscripciones), persistencia en `localStorage`, renderizado DOM, _drag & drop_ y estilos.
3. **Renderizado seguro en el DOM:** uso de nodos/texto seguro (`textContent` / `createElement` o sanitización estricta) evitando inyección insegura de HTML con datos de usuario.
4. **Diseño adaptable (_responsive_):** usable tanto en escritorio como en pantallas más pequeñas.
5. **Despliegue y documentación:** publicado en una URL pública y con un `README.md` que explique el alcance, las decisiones técnicas sin _framework_ y cómo correrlo con `pnpm`.

---

## 6. Orden sugerido de construcción

1. **Base y tipos:** inicializar con `pnpm`, configurar TypeScript estricto, crear `types.ts` (`Task`, `ColumnId`, `Priority`, `BoardState`) y `storage.ts` con datos demo y validación.
2. **Estado y renderizado:** implementar `store.ts` con patrón de suscripción, filtros/búsqueda y renderizado del tablero y modales.
3. **Drag & Drop + Exportar/Importar:** implementar `dnd.ts`, descarga/carga de JSON y cambio de tema Claro/Oscuro.
4. **Pulido y publicación:** probar casos límite (tablero vacío, sin coincidencias en filtros, `localStorage` alterado), redactar `README.md` y desplegar.
