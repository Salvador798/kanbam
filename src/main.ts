import { createBoardStore } from './application/index.ts';
import {
  createLocalStorageBoardRepository,
  createLocalStorageThemeRepository,
  exportBoardToJson,
  importBoardFromJson,
} from './infrastructure/index.ts';
import { App } from './ui/App.ts';
import './ui/style.css';

// Composition root: the only place where concrete infrastructure meets the application.
const store = createBoardStore({
  boards: createLocalStorageBoardRepository(),
  themes: createLocalStorageThemeRepository(),
  serializer: {
    serialize: (board) => exportBoardToJson(board),
    deserialize: importBoardFromJson,
  },
});

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('No se encontró el elemento #app');
}

root.replaceChildren(App(store));
