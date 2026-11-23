import type { GameCallbacks, ShopItem, ToolId } from "./types.js";

export class UI {
  private readonly menu = this.required<HTMLElement>("#menu-screen");
  private readonly loading = this.required<HTMLElement>("#loading-screen");
  private readonly game = this.required<HTMLElement>("#game-ui");
  private readonly shop = this.required<HTMLElement>("#shop-panel");
  private readonly pause = this.required<HTMLElement>("#pause-screen");
  private readonly shopItems = this.required<HTMLElement>("#shop-items");
  private readonly toast = this.required<HTMLElement>("#toast");
  constructor(private readonly callbacks: GameCallbacks) {
    this.required<HTMLButtonElement>("#new-game").addEventListener("click", callbacks.start);
    this.required<HTMLButtonElement>("#pause-game").addEventListener("click", callbacks.pause);
    this.required<HTMLButtonElement>("#resume-game").addEventListener("click", callbacks.resume);
    this.required<HTMLButtonElement>("#quit-game").addEventListener("click", callbacks.quit);
    this.required<HTMLButtonElement>("#shop-open").addEventListener("click", () => this.setShopOpen(true));
    this.required<HTMLButtonElement>("#fire-tool").addEventListener("click", callbacks.fire);
    this.required<HTMLButtonElement>("#mobile-fire").addEventListener("click", callbacks.fire);

    for (const closeButton of document.querySelectorAll<HTMLButtonElement>("[data-close='shop']")) {
      closeButton.addEventListener("click", () => this.setShopOpen(false));
    }

    for (const element of document.querySelectorAll<HTMLElement>("[data-key]")) {
      const code = element.dataset.key;
      if (!code) continue;
      element.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        callbacks.keyDown(code);
      });
      for (const eventName of ["pointerup", "pointerleave", "pointercancel"]) {
        element.addEventListener(eventName, () => callbacks.keyUp(code));
      }
    }
  }

  showMenu(): void {
    this.menu.classList.remove("is-hidden");
    this.loading.classList.add("is-hidden");
    this.game.classList.add("is-hidden");
    this.shop.classList.add("is-hidden");
    this.pause.classList.add("is-hidden");
  }

  showLoading(): void {
    this.menu.classList.add("is-hidden");
    this.loading.classList.remove("is-hidden");
    this.game.classList.add("is-hidden");
  }

  showGame(): void {
    this.loading.classList.add("is-hidden");
    this.menu.classList.add("is-hidden");
    this.game.classList.remove("is-hidden");
    this.shop.classList.add("is-hidden");
    this.pause.classList.add("is-hidden");
  }

  setPaused(paused: boolean): void {
    this.pause.classList.toggle("is-hidden", !paused);
    this.shop.classList.add("is-hidden");
  }

  setShopOpen(open: boolean): void {
    this.shop.classList.toggle("is-hidden", !open);
  }

  updateHud(blades: number, elapsedSeconds: number): void {
    this.required<HTMLElement>("#blade-count").innerHTML = `${blades.toLocaleString()} <span class="blade-icon">✳</span>`;
    const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
    const seconds = Math.floor(elapsedSeconds % 60).toString().padStart(2, "0");
    this.required<HTMLElement>("#time-played").textContent = `${minutes}:${seconds}`;
    this.required<HTMLElement>("#shop-balance").textContent = blades.toLocaleString();
  }

  updateShop(items: ShopItem[]): void {
    this.shopItems.replaceChildren();

    for (const item of items) {
      const row = document.createElement("article");
      row.className = `shop-item${item.selected ? " is-selected" : ""}`;

      const icon = document.createElement("div");
      icon.className = `item-icon item-icon-${item.id}`;
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = this.iconFor(item.id);

      const details = document.createElement("div");
      details.className = "item-details";
      const title = document.createElement("h3");
      title.textContent = item.name;
      const description = document.createElement("p");
      description.textContent = item.description;
      details.append(title, description);

      const action = document.createElement("button");
      action.className = `button item-action${item.selected ? " button-equipped" : ""}`;
      action.textContent = item.selected ? "Equipped" : item.pending ? "On its way" : item.owned ? "Equip" : `${item.price} ✳`;
      action.disabled = item.selected || item.pending;
      action.addEventListener("click", () => this.callbacks.shopAction(item.id));

      row.append(icon, details, action);
      this.shopItems.append(row);
    }
  }

  setVehicleMode(active: boolean): void {
    this.required<HTMLElement>("#vehicle-badge").classList.toggle("is-hidden", !active);
  }

  setToolAvailable(available: boolean): void {
    const desktop = this.required<HTMLButtonElement>("#fire-tool");
    const mobile = this.required<HTMLButtonElement>("#mobile-fire");
    desktop.classList.toggle("is-hidden", !available);
    desktop.classList.toggle("is-visible", available);
    mobile.classList.toggle("is-hidden", !available);
  }

  announce(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.add("is-visible");
    window.setTimeout(() => this.toast.classList.remove("is-visible"), 2_500);
  }

  private iconFor(id: ToolId): string {
    const icons: Record<ToolId, string> = {
      gloves: "✳",
      shears: "✂",
      car: "↗",
      blaster: "◎",
    };
    return icons[id];
  }

  private required<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Required game UI element "${selector}" is missing.`);
    return element;
  }
}
