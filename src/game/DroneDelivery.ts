import * as THREE from "three";

interface Delivery {
  group: THREE.Group;
  parcel: THREE.Mesh;
  start: THREE.Vector3;
  target: THREE.Vector3;
  elapsed: number;
  duration: number;
  dropped: boolean;
  onPickup: () => void;
}

export class DroneDelivery {
  private readonly deliveries: Delivery[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  dropAt(position: THREE.Vector3, onPickup: () => void): void {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#d4dfca", roughness: 0.7 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: "#4b5c50", roughness: 0.8 });
    const packageMaterial = new THREE.MeshStandardMaterial({ color: "#d98a54", roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.42), bodyMaterial);
    body.castShadow = true;
    group.add(body);

    for (const side of [-1, 1]) {
      for (const front of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.055, 0.055), darkMaterial);
        arm.position.set(side * 0.35, 0.04, front * 0.2);
        arm.rotation.y = side * front * 0.45;
        group.add(arm);

        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 12), bodyMaterial);
        rotor.position.set(side * 0.65, 0.08, front * 0.38);
        group.add(rotor);
      }
    }

    const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.37, 0.42), packageMaterial);
    parcel.position.y = -0.35;
    parcel.castShadow = true;
    group.add(parcel);

    const target = new THREE.Vector3(position.x, 3, position.z + 1.8);
    const start = target.clone().add(new THREE.Vector3(-15, 13, -9));
    group.position.copy(start);
    this.scene.add(group);
    this.deliveries.push({ group, parcel, start, target, elapsed: 0, duration: 3.4, dropped: false, onPickup });
  }

  update(delta: number, playerPosition: THREE.Vector3): void {
    for (let index = this.deliveries.length - 1; index >= 0; index -= 1) {
      const delivery = this.deliveries[index];
      if (!delivery.dropped) {
        delivery.elapsed += delta;
        const progress = Math.min(delivery.elapsed / delivery.duration, 1);
        const eased = 1 - (1 - progress) ** 2;
        delivery.group.position.lerpVectors(delivery.start, delivery.target, eased);
        delivery.group.position.y += Math.sin(progress * Math.PI) * 2.5;
        delivery.group.rotation.z = Math.sin(delivery.elapsed * 16) * 0.035;

        if (progress < 1) continue;

        // Leave the package on the ground after the drone flies in; the player must collect it.
        this.scene.remove(delivery.group);
        delivery.group.remove(delivery.parcel);
        delivery.parcel.position.set(delivery.target.x, 0.23, delivery.target.z);
        this.scene.add(delivery.parcel);
        this.disposeGroup(delivery.group);
        delivery.dropped = true;
      }

      const dx = playerPosition.x - delivery.parcel.position.x;
      const dz = playerPosition.z - delivery.parcel.position.z;
      if (dx * dx + dz * dz < 2.25) {
        this.scene.remove(delivery.parcel);
        delivery.parcel.geometry.dispose();
        this.disposeMaterials(delivery.parcel.material);
        delivery.onPickup();
        this.deliveries.splice(index, 1);
      }
    }
  }

  clear(): void {
    for (const delivery of this.deliveries) {
      this.scene.remove(delivery.group);
      this.scene.remove(delivery.parcel);
      delivery.group.remove(delivery.parcel);
      this.disposeGroup(delivery.group);
      delivery.parcel.geometry.dispose();
      this.disposeMaterials(delivery.parcel.material);
    }
    this.deliveries.length = 0;
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        this.disposeMaterials(object.material);
      }
    });
  }

  private disposeMaterials(materials: THREE.Material | THREE.Material[]): void {
    for (const material of Array.isArray(materials) ? materials : [materials]) material.dispose();
  }
}
