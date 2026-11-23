import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ProjectileSystem } from "../src/game/ProjectileSystem.ts";

test("blaster bullets travel before applying their impact", () => {
  const scene = new THREE.Scene();
  const projectiles = new ProjectileSystem(scene);
  let impacts = 0;

  projectiles.fire(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 1, -12),
    "bullet",
    () => { impacts += 1; },
  );
  projectiles.update(0.1);
  assert.equal(impacts, 0);
  assert.equal(scene.children.length, 2);

  projectiles.update(0.3);
  assert.equal(impacts, 1);
  assert.equal(scene.children.length, 0);
});

test("rockets create a temporary explosion with visible shrapnel", () => {
  const scene = new THREE.Scene();
  const projectiles = new ProjectileSystem(scene);
  let impacts = 0;

  projectiles.fire(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0.5, -12),
    "rocket",
    () => { impacts += 1; },
  );
  projectiles.update(0.5);
  assert.equal(impacts, 0);
  assert.equal(scene.children.length, 2);

  projectiles.update(0.5);
  assert.equal(impacts, 1);
  assert.ok(scene.children.length >= 14);

  projectiles.update(0.8);
  assert.equal(scene.children.length, 0);
});
