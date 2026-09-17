import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Box2DFactory from "box2d-wasm";
import {
  PhysicsShowEngine,
  isPhysicsStage,
} from "../src/physics-show-engine.js";
import {
  getPhysicsQualitySummary,
  getPhysicsStageSpec,
  PHYSICS_STAGE_IDS,
} from "../src/physics-stage-maps.js";

test("all eight v0.7 show stages are Box2D stages", () => {
  assert.equal(PHYSICS_STAGE_IDS.length, 8);
  for (const id of PHYSICS_STAGE_IDS)
    assert.equal(isPhysicsStage(id), true, id);
  assert.equal(isPhysicsStage("unknown-stage"), false);
});

test("every stage has a substantial controlled course", () => {
  const summary = getPhysicsQualitySummary();
  for (const id of PHYSICS_STAGE_IDS) {
    const quality = summary[id];
    assert.ok(quality.entityCount >= 20, `${id} entity count`);
    assert.ok(quality.kinematicCount >= 1, `${id} kinematic controls`);
    assert.ok(quality.courseHeight >= 34, `${id} course height`);
    assert.equal(quality.hasCamera, true, `${id} camera`);
    assert.equal(quality.hasSlowMotion, true, `${id} slow motion`);
    assert.equal(quality.hasStuckWatchdog, true, `${id} stuck watchdog`);
    assert.ok(
      quality.fixedStep > 0 && quality.fixedStep <= 0.02,
      `${id} fixed step`,
    );
    assert.ok(
      quality.minTimeScale > 0 && quality.minTimeScale < 1,
      `${id} slow factor`,
    );
    assert.ok(quality.maxZoom > 1, `${id} zoom`);
    assert.ok(quality.cruiseSpeed > 1, `${id} cruise rate`);
  }
});

test("steel-drop entry bumpers are symmetric and leave the center open", () => {
  const stage = getPhysicsStageSpec("steel-drop");
  const bumpers = stage.entities.filter(
    (entity) => entity.tone === "entryBumper",
  );
  assert.equal(bumpers.length, 2);
  assert.equal(bumpers[0].x + bumpers[1].x, stage.width);
  assert.equal(bumpers[0].y, bumpers[1].y);
  assert.ok(bumpers[0].x + bumpers[0].radius < stage.width / 2 - 4);
  assert.ok(bumpers[1].x - bumpers[1].radius > stage.width / 2 + 4);
  assert.ok(stage.quality.entityCount >= 30);
});

test("repeated starts destroy the previous real Box2D world and dispose clears state", async () => {
  const wasmBinary = fs.readFileSync(
    new URL(
      "../node_modules/box2d-wasm/dist/umd/Box2D.simd.wasm",
      import.meta.url,
    ),
  );
  const Box2D = await Box2DFactory({ wasmBinary });
  const nativeDestroy = Box2D.destroy.bind(Box2D);
  const destroyed = new Set();
  Box2D.destroy = (object) => {
    destroyed.add(object);
    nativeDestroy(object);
  };
  const engine = new PhysicsShowEngine();
  engine.Box2D = Box2D;
  engine.readyPromise = Promise.resolve(Box2D);
  await engine.start("steel-drop", [
    { id: "A", label: "A", lane: 0, count: 1 },
  ]);
  const firstWorld = engine.world;
  engine.step(0.02);
  await engine.start("last-marble", [
    { id: "B", label: "B", lane: 1, count: 1 },
  ]);
  assert.equal(destroyed.has(firstWorld), true);
  assert.equal(engine.frame().stage.id, "last-marble");
  const secondWorld = engine.world;
  engine.dispose();
  assert.equal(destroyed.has(secondWorld), true);
  assert.equal(engine.world, null);
  assert.equal(engine.frame().stage, null);
});

test("twin-orbit carries the four-token finalist case through both lanes", async () => {
  const wasmBinary = fs.readFileSync(
    new URL(
      "../node_modules/box2d-wasm/dist/umd/Box2D.simd.wasm",
      import.meta.url,
    ),
  );
  const Box2D = await Box2DFactory({ wasmBinary });
  const engine = new PhysicsShowEngine();
  engine.Box2D = Box2D;
  engine.readyPromise = Promise.resolve(Box2D);
  const tokens = ["P003", "P009", "P002", "P005"].map((id, index) => ({
    id,
    label: id,
    lane: index % 2,
    count: 1,
  }));
  await engine.start("twin-orbit", tokens);
  let frame;
  let maxProgress = 0;
  for (let frameIndex = 0; frameIndex < 19 * 60; frameIndex += 1) {
    frame = engine.step(1 / 60);
    maxProgress = Math.max(maxProgress, frame.stats.progress);
  }
  assert.ok(maxProgress >= 0.985, `max progress ${maxProgress}`);
  for (const token of frame.tokens) {
    assert.ok(token.y / frame.stage.goalY >= 0.985, `${token.token.id} progress`);
  }
  engine.dispose();
});
