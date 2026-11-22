import "./style.css";
import { App } from "./App.ts";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("No se encontró el elemento #app");
}

root.replaceChildren(App());
