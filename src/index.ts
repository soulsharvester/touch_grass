import "./style.css";
import { Game } from "./game/Game.js";

const mount = document.querySelector<HTMLElement>("#game-canvas");

if (!mount) {
  throw new Error("The game canvas mount point is missing.");
}

new Game(mount);
