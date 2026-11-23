import * as THREE from "three";
import { DroneDelivery } from "./DroneDelivery.js";
import { GrassField } from "./GrassField.js";
import { Player } from "./Player.js";
import { UI } from "./UI.js";
import type { GameCallbacks, ShopItem, ToolId } from "./types.js";

const SHOP_CATALOG: Omit<ShopItem, "owned" | "pending" | "selected">[] = [
  { id: "gloves", name: "Garden gloves", price: 35, description: "Punch through a bigger patch with a little extra force." },
  { id: "shears", name: "Big snippers", price: 110, description: "A wider reach and more blades for every sweep." },
  { id: "blaster", name: "Grass popper", price: 150, description: "Point ahead and pop a distant tuft with F." },
  { id: "car", name: "Little red car", price: 240, description: "Hop in for a faster ride and a seriously wide mow." },
];

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly player: Player;
  private readonly field: GrassField;
  private readonly drone: DroneDelivery;
  private readonly ui: UI;
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly inventory = new Set<ToolId>();
  private readonly pendingPurchases = new Set<ToolId>();
  private state: "menu" | "loading" | "playing" | "paused" = "menu";
  private equipped: ToolId | null = null;
  private blades = 0;
  private elapsed = 0;
  private harvestCooldown = 0;
  private animationFrame = 0;
  private previousHudUpdate = 0;
  private lastFrameTime = performance.now();

  constructor(private readonly mount: HTMLElement) {
    this.scene.background = new THREE.Color("#a8c8a9");
    this.scene.fog = new THREE.Fog("#a8c8a9", 45, 115);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.mount.appendChild(this.renderer.domElement);

    const skyLight = new THREE.HemisphereLight("#e2f2dd", "#45644b", 2);
    this.scene.add(skyLight);
    const sun = new THREE.DirectionalLight("#fff0cf", 3);
    sun.position.set(-18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    this.scene.add(sun);

    this.player = new Player(this.scene);
    this.field = new GrassField(this.scene);
    this.drone = new DroneDelivery(this.scene);
    this.field.updateAround(this.player.position);
    this.camera.position.set(0, 8, 15);
    this.camera.lookAt(this.player.position);

    const callbacks: GameCallbacks = {
      start: () => this.start(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      quit: () => this.quit(),
      shopAction: (id) => this.handleShopAction(id),
      fire: () => this.fireTool(),
      keyDown: (code) => this.keyDown(code),
      keyUp: (code) => this.keyUp(code),
    };
    this.ui = new UI(callbacks);

    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.clearKeys);
    this.resize();
    this.ui.showMenu();
    this.animate();
  }

  private readonly resize = (): void => {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const code = event.code;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) event.preventDefault();
    if (code === "Escape") {
      if (this.state === "playing") this.pause();
      else if (this.state === "paused") this.resume();
      return;
    }
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keyUp(event.code);
  };

  private readonly clearKeys = (): void => {
    this.keys.clear();
    this.pressed.clear();
  };

  private keyDown(code: string): void {
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
  }

  private keyUp(code: string): void {
    this.keys.delete(code);
  }

  private start(): void {
    if (this.state === "loading") return;
    this.state = "loading";
    this.ui.showLoading();
    window.setTimeout(() => {
      if (this.state !== "loading") return;
      this.resetSession();
      this.state = "playing";
      this.lastFrameTime = performance.now();
      this.ui.showGame();
      this.ui.announce("Fresh air. Fresh patch. Go touch some grass.");
    }, 750);
  }

  private resetSession(): void {
    this.player.reset();
    this.field.clear();
    this.field.updateAround(this.player.position);
    this.drone.clear();
    this.inventory.clear();
    this.pendingPurchases.clear();
    this.equipped = null;
    this.blades = 0;
    this.elapsed = 0;
    this.harvestCooldown = 0;
    this.ui.setVehicleMode(false);
    this.ui.setToolAvailable(false);
    this.updateShop();
    this.ui.updateHud(this.blades, this.elapsed);
    this.camera.position.set(0, 8, 15);
    this.camera.lookAt(this.player.position);
  }

  private pause(): void {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.ui.setPaused(true);
    this.clearKeys();
  }

  private resume(): void {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.ui.setPaused(false);
    this.lastFrameTime = performance.now();
  }

  private quit(): void {
    this.state = "menu";
    this.clearKeys();
    this.player.reset();
    this.field.clear();
    this.drone.clear();
    this.ui.showMenu();
  }

  private handleShopAction(id: ToolId): void {
    if (this.inventory.has(id)) {
      this.equipped = id;
      this.player.setTool(id);
      this.ui.setToolAvailable(id === "blaster" && !this.player.isDriving);
      this.ui.announce(`${this.itemName(id)} ready. Let's clear a little more.`);
      this.updateShop();
      return;
    }

    if (this.pendingPurchases.has(id)) {
      this.ui.announce(`${this.itemName(id)} is already on its way.`);
      return;
    }

    const item = SHOP_CATALOG.find((entry) => entry.id === id);
    if (!item || this.blades < item.price) {
      this.ui.announce("Not quite enough blades yet. Keep wandering!");
      return;
    }

    this.blades -= item.price;
    this.pendingPurchases.add(id);
    this.drone.dropAt(this.player.position, () => {
      this.pendingPurchases.delete(id);
      this.inventory.add(id);
      this.equipped = id;
      this.player.setTool(id);
      this.ui.setToolAvailable(id === "blaster" && !this.player.isDriving);
      this.updateShop();
      this.ui.announce(`${item.name} picked up! It's yours.`);
    });
    this.ui.updateHud(this.blades, this.elapsed);
    this.updateShop();
    this.ui.announce(`${item.name} ordered. Pick up the package when it lands.`);
  }

  private updateShop(): void {
    const items = SHOP_CATALOG.map((item) => ({
      ...item,
      owned: this.inventory.has(item.id),
      pending: this.pendingPurchases.has(item.id),
      selected: this.equipped === item.id,
    }));
    this.ui.updateShop(items);
  }

  private itemName(id: ToolId): string {
    return SHOP_CATALOG.find((item) => item.id === id)?.name ?? "Tool";
  }

  private fireTool(): void {
    if (this.state !== "playing" || this.equipped !== "blaster" || this.player.isDriving) return;
    const origin = this.player.position.clone().add(new THREE.Vector3(0, 1, 0));
    const hit = this.field.harvestShot(origin, this.player.forward);
    if (hit.count === 0) {
      this.ui.announce("No grass in range. Try aiming toward a patch.");
      return;
    }

    this.blades += hit.blades;
    this.ui.updateHud(this.blades, this.elapsed);
    this.ui.announce(`Pop! +${hit.blades} blades`);
  }

  private animate = (): void => {
    this.animationFrame = window.requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    if (this.state === "playing") {
      this.elapsed += delta;
      this.harvestCooldown -= delta;
      const moveX = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
      const moveZ = Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) - Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"));
      const jump = this.pressed.has("Space") || this.pressed.has("ArrowUp");
      const fire = this.pressed.has("KeyF");
      const enterCar = this.pressed.has("KeyE");
      this.player.update(delta, moveX, moveZ, jump);
      this.pressed.clear();

      if (enterCar && this.inventory.has("car")) {
        const driving = this.player.toggleDriving();
        this.ui.setVehicleMode(driving);
        this.ui.setToolAvailable(this.equipped === "blaster" && !driving);
        this.ui.announce(driving ? "Road trip! Hold W to cruise." : "Back on your own two feet.");
      }

      if (fire) this.fireTool();

      this.field.updateAround(this.player.position);
      this.field.updateRegrowth(now);
      this.drone.update(delta, this.player.position);

      if (this.harvestCooldown <= 0) {
        const baseRadius = this.player.isDriving ? 3.5 : 1.2;
        const radius = this.equipped === "shears" ? 3.4 : this.equipped === "gloves" ? 2 : baseRadius;
        // Moving faster, jumping, and using a tool all make each grass impact more rewarding.
        const impactForce = this.player.isDriving ? 2.2 : 0.65 + Math.min(this.player.speed / 12, 1);
        const force = impactForce * (this.equipped === "shears" ? 1.7 : this.equipped === "gloves" ? 1.35 : 1);
        const heightBoost = 1 + this.player.position.y * 0.22;
        const result = this.field.harvestNear(this.player.position, radius, force * heightBoost);
        if (result.count > 0) {
          this.blades += result.blades;
          this.ui.announce(`+${result.blades} blades · ${result.count} tufts cleared`);
          this.harvestCooldown = this.player.isDriving ? 0.34 : 0.42;
        } else {
          this.harvestCooldown = 0.12;
        }
      }

      if (now - this.previousHudUpdate > 250) {
        this.ui.updateHud(this.blades, this.elapsed);
        this.previousHudUpdate = now;
      }
    }

    this.updateCamera(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private updateCamera(delta: number): void {
    const desiredPosition = new THREE.Vector3(
      this.player.position.x + this.player.forward.x * 4,
      this.player.position.y + 7.5,
      this.player.position.z + 12 + this.player.forward.z * 3,
    );
    this.camera.position.lerp(desiredPosition, 1 - Math.exp(-delta * 3));
    this.camera.lookAt(this.player.position.x, this.player.position.y + 0.75, this.player.position.z);
  }
}
