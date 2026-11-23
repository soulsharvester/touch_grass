export type ToolId = "gloves" | "shears" | "car" | "blaster";

export interface ShopItem {
  id: ToolId;
  name: string;
  price: number;
  description: string;
  owned: boolean;
  pending: boolean;
  selected: boolean;
}

export interface GameCallbacks {
  start: () => void;
  pause: () => void;
  resume: () => void;
  quit: () => void;
  shopAction: (id: ToolId) => void;
  fire: () => void;
  keyDown: (code: string) => void;
  keyUp: (code: string) => void;
}
