import * as THREE from "three";

interface GrassBlade {
  x: number;
  z: number;
  height: number;
  width: number;
  value: number;
  regrowAt: number;
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
const REGROW_DELAY = 9_000;

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

  updateRegrowth(now: number): void {
    for (const chunk of this.chunks.values()) {
      let changed = false;
      for (let index = 0; index < chunk.blades.length; index += 1) {
        const blade = chunk.blades[index];
        if (blade.active || now < blade.regrowAt) continue;

        blade.active = true;
        this.setBladeMatrix(chunk.grass, index, blade);
        changed = true;
      }
      if (changed) chunk.grass.instanceMatrix.needsUpdate = true;
    }
  }

  harvestNear(position: THREE.Vector3, radius: number, force: number): HarvestResult {
    const radiusSquared = radius * radius;
    let count = 0;
    let blades = 0;

    for (const chunk of this.chunks.values()) {
      let chunkHarvested = false;
      for (let index = 0; index < chunk.blades.length; index += 1) {
        const blade = chunk.blades[index];
        if (!blade.active) continue;

        const dx = blade.x - position.x;
        const dz = blade.z - position.z;
        if (dx * dx + dz * dz > radiusSquared) continue;

        blade.active = false;
        blade.regrowAt = performance.now() + REGROW_DELAY;
        this.dummy.position.set(blade.x, -1, blade.z);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        chunk.grass.setMatrixAt(index, this.dummy.matrix);
        chunkHarvested = true;
        count += 1;
        blades += Math.max(1, Math.round(blade.value * force));
      }
      if (chunkHarvested) chunk.grass.instanceMatrix.needsUpdate = true;
    }

    return { count, blades };
  }

  harvestShot(origin: THREE.Vector3, direction: THREE.Vector3): HarvestResult {
    let nearest: { chunk: GrassChunk; index: number; distance: number } | undefined;
    const maxDistance = 18;
    const maxSpread = 1.15;

    for (const chunk of this.chunks.values()) {
      for (let index = 0; index < chunk.blades.length; index += 1) {
        const blade = chunk.blades[index];
        if (!blade.active) continue;

        const dx = blade.x - origin.x;
        const dz = blade.z - origin.z;
        const along = dx * direction.x + dz * direction.z;
        if (along < 0 || along > maxDistance) continue;

        const across = Math.abs(dx * direction.z - dz * direction.x);
        if (across > maxSpread) continue;

        if (!nearest || along < nearest.distance) {
          nearest = { chunk, index, distance: along };
        }
      }
    }

    if (!nearest) return { count: 0, blades: 0 };

    const blade = nearest.chunk.blades[nearest.index];
    blade.active = false;
    blade.regrowAt = performance.now() + REGROW_DELAY;
    this.dummy.position.set(blade.x, -1, blade.z);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    nearest.chunk.grass.setMatrixAt(nearest.index, this.dummy.matrix);
    nearest.chunk.grass.instanceMatrix.needsUpdate = true;

    return { count: 1, blades: Math.max(2, Math.round(blade.value * 3)) };
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

  private setBladeMatrix(mesh: THREE.InstancedMesh, index: number, blade: GrassBlade): void {
    this.dummy.position.set(blade.x, blade.height / 2, blade.z);
    this.dummy.scale.set(blade.width, blade.height, blade.width);
    this.dummy.rotation.y = (blade.x * 17 + blade.z * 13) % Math.PI;
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
