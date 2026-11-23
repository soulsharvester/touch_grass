import * as THREE from "three";
import type { ToolId, VehicleId } from "./types.js";

export class Player {
  readonly root = new THREE.Group();
  private readonly avatar = new THREE.Group();
  readonly firstPersonModel = new THREE.Group();
  private readonly car = new THREE.Group();
  private readonly gunner = new THREE.Group();
  private readonly tank = new THREE.Group();
  private readonly vehicles: Record<VehicleId, THREE.Group> = {
    car: this.car,
    gunner: this.gunner,
    tank: this.tank,
  };
  private readonly direction = new THREE.Vector3(0, 0, -1);
  private readonly velocity = new THREE.Vector3();
  private readonly gloves: THREE.Group;
  private readonly shears: THREE.Group;
  private readonly blaster: THREE.Group;
  private readonly rocketLauncher: THREE.Group;
  private punchArm: THREE.Mesh | null = null;
  private punchGlove: THREE.Mesh | null = null;
  private viewPunchGlove: THREE.Mesh | null = null;
  private readonly viewTools = new Map<ToolId, THREE.Group>();
  private verticalSpeed = 0;
  private grounded = true;
  private driving = false;
  private firstPerson = false;
  private equipped: ToolId | null = null;
  private walkTime = 0;
  private punchElapsed = -1;

  constructor(scene: THREE.Scene) {
    this.createAvatar();
    this.gloves = this.createGloves();
    this.shears = this.createShears();
    this.blaster = this.createBlaster();
    this.rocketLauncher = this.createRocketLauncher();
    this.avatar.add(this.gloves, this.shears, this.blaster, this.rocketLauncher);
    this.createFirstPersonModel();
    this.createCar();
    this.createGunner();
    this.createTank();
    this.root.add(this.avatar, ...Object.values(this.vehicles));
    scene.add(this.root);
    this.applyEquipment();
    this.updateVisibility();
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get forward(): THREE.Vector3 {
    return this.direction;
  }

  get isDriving(): boolean {
    return this.driving;
  }

  get vehicleKind(): VehicleId | null {
    return this.isVehicle(this.equipped) ? this.equipped : null;
  }

  get selectedVehicle(): VehicleId | null {
    return this.vehicleKind;
  }

  get aimPosition(): THREE.Vector3 {
    const height = this.driving ? (this.vehicleKind === "tank" ? 1.55 : 1.25) : 1.48;
    const forwardOffset = this.driving ? 2 : 0.28;
    return this.root.position.clone()
      .add(new THREE.Vector3(0, height, 0))
      .addScaledVector(this.direction, forwardOffset);
  }

  get viewPosition(): THREE.Vector3 {
    const height = this.driving ? (this.vehicleKind === "tank" ? 1.55 : 1.25) : 1.48;
    return this.root.position.clone()
      .add(new THREE.Vector3(0, height, 0))
      .addScaledVector(this.direction, this.driving ? 2 : 0);
  }

  get speed(): number {
    return this.velocity.length();
  }

  setTool(tool: ToolId | null): void {
    this.equipped = tool;
    if (this.driving && !this.vehicleKind) this.driving = false;
    this.applyEquipment();
    this.updateVisibility();
  }

  setFirstPerson(firstPerson: boolean): void {
    this.firstPerson = firstPerson;
    this.updateVisibility();
  }

  punch(): void {
    if (this.equipped === "gloves" && !this.driving) this.punchElapsed = 0;
  }

  toggleDriving(): boolean {
    if (!this.driving && !this.vehicleKind) return false;
    this.driving = !this.driving;
    this.updateVisibility();
    return this.driving;
  }

  update(delta: number, moveX: number, moveZ: number, jump: boolean): void {
    const inputLength = Math.hypot(moveX, moveZ);
    if (inputLength > 0) {
      moveX /= inputLength;
      moveZ /= inputLength;
      this.direction.set(moveX, 0, moveZ);
      this.root.rotation.y = Math.atan2(moveX, moveZ);
    }

    const speed = this.driving
      ? this.vehicleKind === "tank" ? 9 : this.vehicleKind === "gunner" ? 13 : 15
      : 7;
    this.velocity.set(moveX * speed, 0, moveZ * speed);
    this.root.position.x += this.velocity.x * delta;
    this.root.position.z += this.velocity.z * delta;

    if (jump && this.grounded && !this.driving) {
      this.verticalSpeed = 8.5;
      this.grounded = false;
    }

    if (!this.grounded) {
      this.verticalSpeed -= 22 * delta;
      this.root.position.y = Math.max(0, this.root.position.y + this.verticalSpeed * delta);
      if (this.root.position.y === 0) {
        this.grounded = true;
        this.verticalSpeed = 0;
      }
    }

    this.walkTime += delta * (this.driving ? 0 : this.speed);
    this.avatar.position.y = this.driving ? 0 : Math.abs(Math.sin(this.walkTime * 2.5)) * 0.045 * Math.min(this.speed, 1);

    if (this.punchElapsed >= 0) {
      this.punchElapsed += delta;
      const progress = Math.min(this.punchElapsed / 0.32, 1);
      const extension = Math.sin(progress * Math.PI) * 0.95;
      if (this.punchArm) {
        this.punchArm.position.z = 0.03 + extension;
        this.punchArm.rotation.x = -extension * 0.22;
      }
      if (this.punchGlove) this.punchGlove.position.z = 0.16 + extension;
      if (this.viewPunchGlove) this.viewPunchGlove.position.z = -0.78 - extension;
      if (progress === 1) {
        if (this.punchArm) {
          this.punchArm.position.z = 0.03;
          this.punchArm.rotation.x = 0;
        }
        if (this.punchGlove) this.punchGlove.position.z = 0.16;
        if (this.viewPunchGlove) this.viewPunchGlove.position.z = -0.78;
        this.punchElapsed = -1;
      }
    }
  }

  reset(): void {
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, Math.PI, 0);
    this.direction.set(0, 0, -1);
    this.velocity.set(0, 0, 0);
    this.verticalSpeed = 0;
    this.grounded = true;
    this.walkTime = 0;
    this.punchElapsed = -1;
    if (this.punchArm) {
      this.punchArm.position.z = 0.03;
      this.punchArm.rotation.x = 0;
    }
    if (this.punchGlove) this.punchGlove.position.z = 0.16;
    if (this.viewPunchGlove) this.viewPunchGlove.position.z = -0.78;
    this.driving = false;
    this.firstPerson = false;
    for (const vehicle of Object.values(this.vehicles)) vehicle.visible = false;
    this.avatar.visible = true;
    this.setTool(null);
  }

  dispose(): void {
    for (const group of [this.root, this.firstPersonModel]) {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
    }
  }

  private createAvatar(): void {
    const skin = new THREE.MeshStandardMaterial({ color: "#e5aa79", roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: "#e8a24a", roughness: 0.86 });
    const pants = new THREE.MeshStandardMaterial({ color: "#394b56", roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: "#222f34", roughness: 0.9 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 4, 8), shirt);
    torso.position.y = 1.05;
    torso.castShadow = true;
    this.avatar.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), skin);
    head.position.set(0, 1.7, 0.04);
    head.castShadow = true;
    this.avatar.add(head);

    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.035), dark);
    eyes.position.set(0, 1.74, 0.29);
    this.avatar.add(eyes);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.44, 3, 6), skin);
      arm.position.set(side * 0.42, 1.02, 0.03);
      arm.rotation.z = side * -0.2;
      arm.castShadow = true;
      this.avatar.add(arm);
      if (side === -1) this.punchArm = arm;

      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.42, 3, 6), pants);
      leg.position.set(side * 0.16, 0.39, 0);
      leg.castShadow = true;
      this.avatar.add(leg);

      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, 0.37), dark);
      shoe.position.set(side * 0.16, 0.1, 0.07);
      shoe.castShadow = true;
      this.avatar.add(shoe);
    }
  }

  private createGloves(): THREE.Group {
    const gloves = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: "#e56d56", roughness: 0.65 });
    for (const side of [-1, 1]) {
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), material);
      glove.scale.set(1, 0.85, 1.1);
      glove.position.set(side * 0.53, 0.9, 0.16);
      glove.castShadow = true;
      gloves.add(glove);
      if (side === -1) this.punchGlove = glove;
    }
    return gloves;
  }

  private createShears(): THREE.Group {
    const shears = new THREE.Group();
    const handle = new THREE.MeshStandardMaterial({ color: "#d8874b", roughness: 0.7 });
    const blades = new THREE.MeshStandardMaterial({ color: "#d5d9c4", metalness: 0.45, roughness: 0.36 });

    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), handle);
      ring.position.set(0.41 + side * 0.1, 0.83, 0.1);
      shears.add(ring);

      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.5, 0.035), blades);
      blade.position.set(0.5 + side * 0.075, 1.1, 0.1);
      blade.rotation.z = side * 0.18;
      shears.add(blade);
    }
    return shears;
  }

  private createBlaster(): THREE.Group {
    const blaster = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.48),
      new THREE.MeshStandardMaterial({ color: "#647f6a", metalness: 0.18, roughness: 0.55 }),
    );
    body.position.set(0.48, 0.98, 0.2);
    blaster.add(body);

    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 0.17, 10),
      new THREE.MeshStandardMaterial({ color: "#c5e17c", emissive: "#809348", emissiveIntensity: 0.3 }),
    );
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0.48, 0.99, 0.51);
    blaster.add(nozzle);
    return blaster;
  }

  private createRocketLauncher(): THREE.Group {
    const launcher = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.95, 10),
      new THREE.MeshStandardMaterial({ color: "#66745a", metalness: 0.22, roughness: 0.5 }),
    );
    body.rotation.x = Math.PI / 2;
    body.position.set(0.48, 1.12, 0.12);
    launcher.add(body);

    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 0.14),
      new THREE.MeshStandardMaterial({ color: "#d7c78e", roughness: 0.5 }),
    );
    sight.position.set(0.48, 1.27, 0.1);
    launcher.add(sight);
    return launcher;
  }

  private createFirstPersonModel(): void {
    const skin = new THREE.MeshStandardMaterial({ color: "#e5aa79", roughness: 0.82 });
    const sleeve = new THREE.MeshStandardMaterial({ color: "#e8a24a", roughness: 0.86 });
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.38, 3, 6), sleeve);
      arm.rotation.x = -Math.PI / 2;
      arm.position.set(side * 0.35, -0.55, -0.82);
      this.firstPersonModel.add(arm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
      hand.position.set(side * 0.35, -0.47, -0.59);
      this.firstPersonModel.add(hand);
    }

    const gloves = new THREE.Group();
    const gloveMaterial = new THREE.MeshStandardMaterial({ color: "#e56d56", roughness: 0.65 });
    for (const side of [-1, 1]) {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), gloveMaterial);
      fist.scale.set(1, 0.88, 1.15);
      fist.position.set(side * 0.37, -0.43, -0.78);
      gloves.add(fist);
      if (side === -1) this.viewPunchGlove = fist;
    }
    this.addViewTool("gloves", gloves);

    const shears = new THREE.Group();
    const bladeMaterial = new THREE.MeshStandardMaterial({ color: "#d5d9c4", metalness: 0.45, roughness: 0.36 });
    const handleMaterial = new THREE.MeshStandardMaterial({ color: "#d8874b", roughness: 0.7 });
    for (const side of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.52), bladeMaterial);
      blade.position.set(0.46 + side * 0.08, -0.42, -0.95);
      blade.rotation.y = side * 0.16;
      shears.add(blade);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), handleMaterial);
      handle.position.set(0.46 + side * 0.14, -0.43, -0.62);
      shears.add(handle);
    }
    this.addViewTool("shears", shears);

    const blaster = new THREE.Group();
    const blasterBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.18, 0.55),
      new THREE.MeshStandardMaterial({ color: "#647f6a", metalness: 0.18, roughness: 0.55 }),
    );
    blasterBody.position.set(0.46, -0.39, -0.83);
    blaster.add(blasterBody);
    const blasterTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10),
      new THREE.MeshStandardMaterial({ color: "#c5e17c", emissive: "#809348", emissiveIntensity: 0.3 }),
    );
    blasterTip.rotation.x = -Math.PI / 2;
    blasterTip.position.set(0.46, -0.39, -1.16);
    blaster.add(blasterTip);
    this.addViewTool("blaster", blaster);

    const rocket = new THREE.Group();
    const rocketTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.95, 10),
      new THREE.MeshStandardMaterial({ color: "#66745a", metalness: 0.22, roughness: 0.5 }),
    );
    rocketTube.rotation.x = -Math.PI / 2;
    rocketTube.position.set(0.46, -0.36, -0.88);
    rocket.add(rocketTube);
    this.addViewTool("rocket", rocket);
  }

  private addViewTool(id: ToolId, tool: THREE.Group): void {
    this.viewTools.set(id, tool);
    this.firstPersonModel.add(tool);
  }

  private createCar(): void {
    this.buildCar(this.car, "#d97958");
  }

  private createGunner(): void {
    this.buildCar(this.gunner, "#708d66");
    const mount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.32, 0.25, 10),
      new THREE.MeshStandardMaterial({ color: "#4c5f49", roughness: 0.65 }),
    );
    mount.position.set(0, 1.48, -0.05);
    this.gunner.add(mount);

    const cannon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 1.25, 10),
      new THREE.MeshStandardMaterial({ color: "#394a3d", metalness: 0.28, roughness: 0.5 }),
    );
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(0, 1.53, 0.55);
    this.gunner.add(cannon);
  }

  private createTank(): void {
    const hullMaterial = new THREE.MeshStandardMaterial({ color: "#667c48", roughness: 0.82 });
    const trackMaterial = new THREE.MeshStandardMaterial({ color: "#303a33", roughness: 0.95 });
    const metalMaterial = new THREE.MeshStandardMaterial({ color: "#8a9b5b", roughness: 0.7 });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.66, 2.7), hullMaterial);
    hull.position.y = 0.74;
    hull.castShadow = true;
    this.tank.add(hull);

    for (const side of [-1, 1]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.72, 2.8), trackMaterial);
      track.position.set(side * 1.05, 0.48, 0);
      track.castShadow = true;
      this.tank.add(track);
    }

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.52, 10), metalMaterial);
    turret.position.set(0, 1.34, -0.12);
    turret.castShadow = true;
    this.tank.add(turret);

    const launcher = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.55, 10), trackMaterial);
    launcher.rotation.x = Math.PI / 2;
    launcher.position.set(0, 1.38, 0.9);
    this.tank.add(launcher);
  }

  private buildCar(vehicle: THREE.Group, color: string): void {
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: "#b9d1c5", metalness: 0.12, roughness: 0.28 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: "#293234", roughness: 0.95 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.45), bodyMaterial);
    body.position.y = 0.65;
    body.castShadow = true;
    vehicle.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 1.2), glassMaterial);
    cabin.position.set(0, 1.12, -0.12);
    cabin.castShadow = true;
    vehicle.add(cabin);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.15, 0.15), bodyMaterial);
    bumper.position.set(0, 0.47, 1.25);
    vehicle.add(bumper);

    for (const side of [-1, 1]) {
      for (const front of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.2, 12), tireMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 0.87, 0.42, front * 0.77);
        wheel.castShadow = true;
        vehicle.add(wheel);
      }
    }
  }

  private applyEquipment(): void {
    this.gloves.visible = this.equipped === "gloves";
    this.shears.visible = this.equipped === "shears";
    this.blaster.visible = this.equipped === "blaster";
    this.rocketLauncher.visible = this.equipped === "rocket";
    for (const [id, tool] of this.viewTools) tool.visible = this.equipped === id;
  }

  private updateVisibility(): void {
    this.avatar.visible = !this.driving && !this.firstPerson;
    this.firstPersonModel.visible = this.firstPerson && !this.driving;
    for (const [id, vehicle] of Object.entries(this.vehicles) as [VehicleId, THREE.Group][]) {
      vehicle.visible = this.driving && id === this.vehicleKind;
    }
  }

  private isVehicle(tool: ToolId | null): tool is VehicleId {
    return tool === "car" || tool === "gunner" || tool === "tank";
  }
}
