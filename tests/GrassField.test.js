import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { GrassField } from "../src/game/GrassField.ts";

test("grass hit by a shot is removed and can regrow", () => {
  const scene = new THREE.Scene();
  const field = new GrassField(scene);
  const origin = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3(0, 0, -1);

  field.updateAround(origin);
  const target = field.findShotTarget(origin, direction);
  assert.ok(target, "the generated field should contain a blade in range");

  const hit = field.harvestNear(target, 0.01, 2, direction);
  assert.equal(hit.count, 1);
  assert.ok(hit.blades > 0);

  field.updateRegrowth(performance.now() + 20_000, 1);
  assert.ok(field.findShotTarget(origin, direction));
  field.dispose();
});

test("streamed grass patches are deterministic when revisited", () => {
  const origin = new THREE.Vector3(0, 0, 0);
  const direction = new THREE.Vector3(0, 0, -1);
  const first = new GrassField(new THREE.Scene());
  const second = new GrassField(new THREE.Scene());

  first.updateAround(origin);
  second.updateAround(origin);

  assert.deepEqual(
    first.findShotTarget(origin, direction),
    second.findShotTarget(origin, direction),
  );
  first.dispose();
  second.dispose();
});
