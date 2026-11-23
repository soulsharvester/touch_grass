import * as THREE from "three";
import type { ToolId } from "./types.js";

export class Player {
  readonly root = new THREE.Group();
  private readonly avatar = new THREE.Group();
  private readonly car = new THREE.Group();
  private readonly direction = new THREE.Vector3(0, 0, -1);
  private readonly velocity = new THREE.Vector3();
  private readonly gloves: THREE.Group;
  private readonly shears: THREE.Group;
  private readonly blaster: THREE.Group;
  private verticalSpeed = 0;
  private grounded = true;
  private driving = false;
  private equipped: ToolId | null = null;
  private walkTime = 0;

  constructor(scene: THREE.Scene) {
    this.createAvatar();
    this.gloves = this.createGloves();
    this.shears = this.createShears();
    this.blaster = this.createBlaster();
    this.avatar.add(this.gloves, this.shears, this.blaster);
    this.createCar();
    this.root.add(this.avatar, this.car);
    scene.add(this.root);
    this.applyEquipment();
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

  get speed(): number {
    return this.velocity.length();
  }

  setTool(tool: ToolId | null): void {
    this.equipped = tool;
    this.applyEquipment();
  }

  toggleDriving(): boolean {
    this.driving = !this.driving;
    this.car.visible = this.driving;
    this.avatar.visible = !this.driving;
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

    const speed = this.driving ? 15 : 7;
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
  }

  reset(): void {
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.direction.set(0, 0, -1);
    this.velocity.set(0, 0, 0);
    this.verticalSpeed = 0;
    this.grounded = true;
    this.walkTime = 0;
    this.driving = false;
    this.car.visible = false;
    this.avatar.visible = true;
    this.setTool(null);
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
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

  private createCar(): void {
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#d97958", roughness: 0.6 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: "#b9d1c5", metalness: 0.12, roughness: 0.28 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: "#293234", roughness: 0.95 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.45), bodyMaterial);
    body.position.y = 0.65;
    body.castShadow = true;
    this.car.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 1.2), glassMaterial);
    cabin.position.set(0, 1.12, -0.12);
    cabin.castShadow = true;
    this.car.add(cabin);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.15, 0.15), bodyMaterial);
    bumper.position.set(0, 0.47, 1.25);
    this.car.add(bumper);

    for (const side of [-1, 1]) {
      for (const front of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.2, 12), tireMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 0.87, 0.42, front * 0.77);
        wheel.castShadow = true;
        this.car.add(wheel);
      }
    }
  }

  private applyEquipment(): void {
    this.gloves.visible = this.equipped === "gloves";
    this.shears.visible = this.equipped === "shears";
    this.blaster.visible = this.equipped === "blaster";
  }
}
