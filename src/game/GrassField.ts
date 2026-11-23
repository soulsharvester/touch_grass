import * as THREE from "three";

interface GrassBlade {
  x: number;
  z: number;
  height: number;
  width: number;
  value: number;
  regrowAt: number;
  knockedAt: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  spinX: number;
  spinZ: number;
  active: boolean;
}

interface GrassChunk {
  ground: THREE.Mesh;
  grass: THREE.InstancedMesh;
  blades: GrassBlade[];
}

export interface HarvestResult {
  count: number;
  blades: number;
}

const CHUNK_SIZE = 48;
const BLADES_PER_CHUNK = 300;
const CHUNK_RADIUS = 1;
const REGROW_DELAY = 10_000;

export class GrassField {
  private readonly chunks = new Map<string, GrassChunk>();
  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly groundGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
  private readonly dummy = new THREE.Object3D();

  constructor(private readonly scene: THREE.Scene) {}

  updateAround(position: THREE.Vector3): void {
    // Keep only nearby chunks loaded so exploration grows the field without growing memory use.
    const centerX = Math.floor(position.x / CHUNK_SIZE);
    const centerZ = Math.floor(position.z / CHUNK_SIZE);
    const needed = new Set<string>();

    for (let x = centerX - CHUNK_RADIUS; x <= centerX + CHUNK_RADIUS; x += 1) {
      for (let z = centerZ - CHUNK_RADIUS; z <= centerZ + CHUNK_RADIUS; z += 1) {
        const key = `${x},${z}`;
        needed.add(key);
        if (!this.chunks.has(key)) this.createChunk(x, z, key);
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) {
        this.removeChunk(chunk);
        this.chunks.delete(key);
      }
    }
  }

  updateRegrowth(now: number, delta: number): void {
    for (const chunk of this.chunks.values()) {
      let changed = false;
      for (let index = 0; index < chunk.blades.length; index += 1) {
        const blade = chunk.blades[index];
        if (blade.active) continue;

        if (now >= blade.regrowAt) {
          blade.active = true;
          blade.knockedAt = 0;
          blade.position.set(blade.x, blade.height / 2, blade.z);
          blade.velocity.set(0, 0, 0);
          blade.rotationX = 0;
          blade.rotationZ = 0;
          this.setBladeMatrix(chunk.grass, index, blade);
          changed = true;
          continue;
        }

        if (blade.knockedAt === 0) continue;
        blade.position.addScaledVector(blade.velocity, delta);
        blade.velocity.y -= 9.8 * delta;
        const floor = blade.height / 2;
        if (blade.position.y < floor) {
          blade.position.y = floor;
          blade.velocity.y = Math.abs(blade.velocity.y) * 0.22;
          blade.velocity.x *= 0.72;
          blade.velocity.z *= 0.72;
          if (blade.velocity.y < 0.55) blade.velocity.y = 0;
        }
        blade.velocity.x *= Math.exp(-0.4 * delta);
        blade.velocity.z *= Math.exp(-0.4 * delta);
        blade.rotationX += blade.spinX * delta;
        blade.rotationZ += blade.spinZ * delta;
        const age = now - blade.knockedAt;
        const fade = Math.max(0, 1 - Math.max(0, age - 3_800) / 1_500);
        this.setBladeMatrix(chunk.grass, index, blade, fade);
        changed = true;
      }
      if (changed) chunk.grass.instanceMatrix.needsUpdate = true;
    }
  }

  harvestNear(
    position: THREE.Vector3,
    radius: number,
    force: number,
    pushDirection?: THREE.Vector3,
  ): HarvestResult {
    const radiusSquared = radius * radius;
    let count = 0;
    let blades = 0;

    for (const chunk of this.chunks.values()) {
      let chunkHarvested = false;
      for (let index = 0; index < chunk.blades.length; index += 1) {
        const blade = chunk.blades[index];
        if (!blade.active) continue;

        const dx = blade.position.x - position.x;
        const dz = blade.position.z - position.z;
        if (dx * dx + dz * dz > radiusSquared) continue;

        blade.active = false;
        blade.regrowAt = performance.now() + REGROW_DELAY;
        this.kickBlade(blade, position, force, pushDirection);
        this.setBladeMatrix(chunk.grass, index, blade);
        chunkHarvested = true;
        count += 1;
        blades += Math.max(1, Math.round(blade.value * force));
      }
      if (chunkHarvested) chunk.grass.instanceMatrix.needsUpdate = true;
    }

    return { count, blades };
  }

  findShotTarget(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 24): THREE.Vector3 | null {
    let nearest: { chunk: GrassChunk; index: number; distance: number } | undefined;
    const maxSpread = 1.15;

    for (const chunk of this.chunks.values()) {
      for (let index = 0; index < chunk.blades.length; index += 1) {
        const blade = chunk.blades[index];
        if (!blade.active) continue;

        const dx = blade.position.x - origin.x;
        const dz = blade.position.z - origin.z;
        const along = dx * direction.x + dz * direction.z;
        if (along < 0 || along > maxDistance) continue;

        const across = Math.abs(dx * direction.z - dz * direction.x);
        if (across > maxSpread) continue;

        if (!nearest || along < nearest.distance) {
          nearest = { chunk, index, distance: along };
        }
      }
    }

    if (!nearest) return null;
    return nearest.chunk.blades[nearest.index].position.clone();
  }

  clear(): void {
    for (const chunk of this.chunks.values()) {
      this.removeChunk(chunk);
    }
    this.chunks.clear();
  }

  dispose(): void {
    this.clear();
    this.boxGeometry.dispose();
    this.groundGeometry.dispose();
  }

  private createChunk(chunkX: number, chunkZ: number, key: string): void {
    // Coordinate-based seeds make a visited patch look the same if the player returns.
    const seed = this.hashCoordinates(chunkX, chunkZ);
    const random = this.seededRandom(seed);
    const baseX = chunkX * CHUNK_SIZE;
    const baseZ = chunkZ * CHUNK_SIZE;
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: random() > 0.5 ? "#416c48" : "#3e6845",
      roughness: 1,
    });
    const ground = new THREE.Mesh(this.groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(baseX + CHUNK_SIZE / 2, -0.07, baseZ + CHUNK_SIZE / 2);
    ground.receiveShadow = true;

    const grassMaterial = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.95,
    });
    const grass = new THREE.InstancedMesh(this.boxGeometry, grassMaterial, BLADES_PER_CHUNK);
    grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    grass.castShadow = true;
    grass.receiveShadow = true;
    const blades: GrassBlade[] = [];

    for (let index = 0; index < BLADES_PER_CHUNK; index += 1) {
      const x = baseX + (random() - 0.5) * CHUNK_SIZE;
      const z = baseZ + (random() - 0.5) * CHUNK_SIZE;
      const height = 0.22 + random() * 0.8;
      const width = 0.12 + random() * 0.14;
      const blade: GrassBlade = {
        x,
        z,
        height,
        width,
        value: height * 2 + random(),
        regrowAt: 0,
        knockedAt: 0,
        position: new THREE.Vector3(x, height / 2, z),
        velocity: new THREE.Vector3(),
        rotationX: 0,
        rotationY: (x * 17 + z * 13) % Math.PI,
        rotationZ: 0,
        spinX: 0,
        spinZ: 0,
        active: true,
      };

      blades.push(blade);
      this.setBladeMatrix(grass, index, blade);
      grass.setColorAt(index, new THREE.Color().setHSL(0.28 + random() * 0.06, 0.42, 0.44 + random() * 0.18));
    }

    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    this.scene.add(ground, grass);
    this.chunks.set(key, { ground, grass, blades });
  }

  private removeChunk(chunk: GrassChunk): void {
    this.scene.remove(chunk.ground, chunk.grass);
    chunk.grass.dispose();
    for (const material of Array.isArray(chunk.ground.material) ? chunk.ground.material : [chunk.ground.material]) {
      material.dispose();
    }
    for (const material of Array.isArray(chunk.grass.material) ? chunk.grass.material : [chunk.grass.material]) {
      material.dispose();
    }
  }

  private kickBlade(blade: GrassBlade, impact: THREE.Vector3, force: number, direction?: THREE.Vector3): void {
    const push = direction?.clone() ?? new THREE.Vector3(
      blade.position.x - impact.x,
      0,
      blade.position.z - impact.z,
    );
    push.y = 0;
    if (push.lengthSq() < 0.001) push.set(1, 0, 0);
    push.normalize();

    const speed = 4 + Math.min(force, 4) * 2.2;
    blade.velocity.set(push.x * speed, 1.8 + Math.min(force, 4) * 0.55, push.z * speed);
    blade.rotationX = 0;
    blade.rotationZ = 0;
    blade.spinX = push.z * 8;
    blade.spinZ = -push.x * 8;
    blade.knockedAt = performance.now();
  }

  private setBladeMatrix(mesh: THREE.InstancedMesh, index: number, blade: GrassBlade, visibility = 1): void {
    this.dummy.position.copy(blade.position);
    this.dummy.scale.set(blade.width * visibility, blade.height * visibility, blade.width * visibility);
    this.dummy.rotation.set(blade.rotationX, blade.rotationY, blade.rotationZ);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private hashCoordinates(x: number, z: number): number {
    let hash = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(z ^ 0xc2b2ae35, 0x27d4eb2f);
    hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
    return (hash ^ (hash >>> 15)) >>> 0;
  }

  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
  }
}
