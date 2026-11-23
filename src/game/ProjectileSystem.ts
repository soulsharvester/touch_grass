import * as THREE from "three";
import type { WeaponKind } from "./types.js";

interface Projectile {
  object: THREE.Group;
  trail: THREE.Line;
  start: THREE.Vector3;
  target: THREE.Vector3;
  elapsed: number;
  duration: number;
  kind: WeaponKind;
  onImpact: (position: THREE.Vector3) => void;
}

interface Explosion {
  sphere: THREE.Mesh;
  light: THREE.PointLight;
  shards: THREE.Mesh[];
  velocities: THREE.Vector3[];
  elapsed: number;
}

export class ProjectileSystem {
  private readonly projectiles: Projectile[] = [];
  private readonly explosions: Explosion[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  fire(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    kind: WeaponKind,
    onImpact: (position: THREE.Vector3) => void,
  ): void {
    const object = kind === "rocket" ? this.createRocket() : this.createBullet();
    const trail = this.createTrail(kind);
    const distance = origin.distanceTo(target);

    object.position.copy(origin);
    this.scene.add(object, trail);
    this.projectiles.push({
      object,
      trail,
      start: origin.clone(),
      target: target.clone(),
      elapsed: 0,
      duration: Math.max(distance / (kind === "rocket" ? 13 : 42), 0.08),
      kind,
      onImpact,
    });
  }

  update(delta: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      projectile.elapsed += delta;
      const progress = Math.min(projectile.elapsed / projectile.duration, 1);
      projectile.object.position.lerpVectors(projectile.start, projectile.target, progress);

      const direction = projectile.target.clone().sub(projectile.start).normalize();
      projectile.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      this.updateTrail(projectile, direction, progress);

      if (progress < 1) continue;

      this.removeProjectile(projectile);
      this.projectiles.splice(index, 1);
      if (projectile.kind === "rocket") this.createExplosion(projectile.target);
      projectile.onImpact(projectile.target.clone());
    }

    this.updateExplosions(delta);
  }

  clear(): void {
    for (const projectile of this.projectiles) this.removeProjectile(projectile);
    this.projectiles.length = 0;

    for (const explosion of this.explosions) this.removeExplosion(explosion);
    this.explosions.length = 0;
  }

  private createBullet(): THREE.Group {
    const group = new THREE.Group();
    const bullet = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 8),
      new THREE.MeshBasicMaterial({ color: "#e7ff89" }),
    );
    group.add(bullet);
    return group;
  }

  private createRocket(): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: "#e58655", metalness: 0.25, roughness: 0.42 }),
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.27, 8),
      new THREE.MeshStandardMaterial({ color: "#efcf8b", roughness: 0.42 }),
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.5;
    group.add(nose);

    const finMaterial = new THREE.MeshStandardMaterial({ color: "#9b5948", roughness: 0.7 });
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.23), finMaterial);
      fin.position.set(side * 0.14, 0, -0.29);
      group.add(fin);
    }
    return group;
  }

  private createTrail(kind: WeaponKind): THREE.Line {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({
      color: kind === "rocket" ? "#ff9c62" : "#e7ff89",
      transparent: true,
      opacity: kind === "rocket" ? 0.7 : 0.95,
    });
    return new THREE.Line(geometry, material);
  }

  private updateTrail(projectile: Projectile, direction: THREE.Vector3, progress: number): void {
    const positions = projectile.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    const distance = projectile.start.distanceTo(projectile.target) * progress;
    const tailDistance = Math.max(0, distance - (projectile.kind === "rocket" ? 1.8 : 1.1));
    const tail = projectile.start.clone().addScaledVector(direction, tailDistance);
    const head = projectile.object.position;
    positions.setXYZ(0, tail.x, tail.y, tail.z);
    positions.setXYZ(1, head.x, head.y, head.z);
    positions.needsUpdate = true;
    projectile.trail.geometry.computeBoundingSphere();
  }

  private createExplosion(position: THREE.Vector3): void {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({
        color: "#ffb452",
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    );
    sphere.position.copy(position);
    sphere.scale.setScalar(0.2);
    this.scene.add(sphere);

    const light = new THREE.PointLight("#ff9d4c", 9, 15, 2);
    light.position.copy(position);
    this.scene.add(light);

    const shards: THREE.Mesh[] = [];
    const velocities: THREE.Vector3[] = [];
    const geometry = new THREE.TetrahedronGeometry(0.17, 0);
    const colors = ["#ffcf70", "#ee7550", "#fff0bc", "#a9bf72"];
    for (let index = 0; index < 12; index += 1) {
      const shard = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: colors[index % colors.length] }),
      );
      shard.position.copy(position);
      shard.scale.setScalar(0.6 + Math.random() * 1.2);
      this.scene.add(shard);
      shards.push(shard);

      const direction = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 1.4 + 0.25,
        Math.random() * 2 - 1,
      ).normalize();
      velocities.push(direction.multiplyScalar(5 + Math.random() * 8));
    }
    this.explosions.push({ sphere, light, shards, velocities, elapsed: 0 });
  }

  private updateExplosions(delta: number): void {
    for (let index = this.explosions.length - 1; index >= 0; index -= 1) {
      const explosion = this.explosions[index];
      explosion.elapsed += delta;
      const progress = Math.min(explosion.elapsed / 1.15, 1);
      explosion.sphere.scale.setScalar(0.2 + progress * 7);
      (explosion.sphere.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.72;
      explosion.light.intensity = (1 - progress) * 9;

      for (let shardIndex = 0; shardIndex < explosion.shards.length; shardIndex += 1) {
        const shard = explosion.shards[shardIndex];
        const velocity = explosion.velocities[shardIndex];
        shard.position.addScaledVector(velocity, delta);
        velocity.y -= 9.8 * delta;
        shard.rotation.x += delta * 8;
        shard.rotation.z += delta * 10;
      }

      if (progress >= 1) {
        this.removeExplosion(explosion);
        this.explosions.splice(index, 1);
      }
    }
  }

  private removeProjectile(projectile: Projectile): void {
    this.scene.remove(projectile.object, projectile.trail);
    projectile.object.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        this.disposeMaterials(object.material);
      }
    });
    projectile.trail.geometry.dispose();
    this.disposeMaterials(projectile.trail.material);
  }

  private removeExplosion(explosion: Explosion): void {
    this.scene.remove(explosion.sphere, explosion.light);
    explosion.sphere.geometry.dispose();
    this.disposeMaterials(explosion.sphere.material);
    const sharedShardGeometry = explosion.shards[0]?.geometry;
    for (const shard of explosion.shards) {
      this.scene.remove(shard);
      this.disposeMaterials(shard.material);
    }
    sharedShardGeometry?.dispose();
  }

  private disposeMaterials(materials: THREE.Material | THREE.Material[]): void {
    for (const material of Array.isArray(materials) ? materials : [materials]) material.dispose();
  }
}
