import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Box2DFactory from "box2d-wasm";
import { PhysicsShowEngine } from "../src/physics-show-engine.js";
import { PHYSICS_STAGE_IDS } from "../src/physics-stage-maps.js";
import { obstaclePose } from "../src/physics-motion.js";
import { preparePhysicsRace } from "../src/physics-race.js";

const ready = Box2DFactory({
  wasmBinary: fs.readFileSync(
    new URL(
      "../node_modules/box2d-wasm/dist/umd/Box2D.simd.wasm",
      import.meta.url,
    ),
  ),
});
async function engine() {
  const e = new PhysicsShowEngine();
  e.Box2D = await ready;
  e.readyPromise = Promise.resolve(e.Box2D);
  return e;
}
const tokens = [
  { id: "A", lane: 0, count: 1 },
  { id: "B", lane: 1, count: 1 },
];

test("moving Box2D obstacles follow continuous bounded poses in every course", async () => {
  for (const stage of PHYSICS_STAGE_IDS) {
    const e = await engine();
    const initial = await e.start(stage, tokens);
    assert.ok(initial.stage.quality.translatingCount >= 2, stage);
    for (let step = 0; step < 300; step++) {
      e.step(0.01);
      for (const { def, body } of e.entities.filter(
        (item) => item.def.motion,
      )) {
        const expected = obstaclePose(def, e.simulationTime);
        const p = body.GetPosition();
        assert.ok(Math.abs(p.x - expected.x) < 0.00002, `${stage} body x`);
        assert.ok(Math.abs(p.y - expected.y) < 0.00002, `${stage} body y`);
        assert.ok(
          Math.abs(body.GetAngle() - expected.angle) < 0.00002,
          `${stage} angle`,
        );
      }
    }
    const before = e.frame().entities;
    assert.deepEqual(
      e.step(0).entities,
      before,
      "zero time never moves obstacles",
    );
    e.dispose();
  }
});

test("a translating obstacle physically pushes a marble through Box2D contact", async () => {
  async function position(moving) {
    const e = await engine();
    await e.start("steel-drop", tokens.slice(0, 1));
    const zero = e._vec(0, 0),
      start = e._vec(6, 2);
    e.world.SetGravity(zero);
    e.tokens[0].body.SetTransform(start, 0);
    e.tokens[0].body.SetLinearVelocity(zero);
    e._destroy(zero, start);
    e._createEntity({
      kind: "circle",
      bodyType: "kinematic",
      x: 4,
      y: 2,
      radius: 0.7,
      restitution: 0.1,
      motion: moving
        ? { kind: "shuttle", x: 2, period: 4, phase: -Math.PI / 2 }
        : undefined,
    });
    for (let step = 0; step < 200; step++) e.step(0.01);
    const x = e.tokens[0].body.GetPosition().x;
    e.dispose();
    return x;
  }
  assert.ok(
    (await position(true)) > (await position(false)) + 1,
    "motion changes contact, rather than only the drawing",
  );
});

test("race playback preserves obstacle translation and angular interpolation", async () => {
  const race = await preparePhysicsRace(await engine(), "moon-orbit", tokens, [
    "A",
  ]);
  const frames = [0, race.duration * 0.27, race.duration * 0.56].map((t) =>
    race.sample(t),
  );
  const orbitIndex = frames[0].entities.findIndex(
    (e) => e.def.tone === "orbitBumper",
  );
  const poses = frames.map((f) => f.entities[orbitIndex]);
  assert.ok(Math.abs(poses[0].x - poses[1].x) > 0.1);
  assert.ok(Math.abs(poses[0].y - poses[2].y) > 0.1);
  const time = race.duration * 0.42;
  const a = race.sample(time).entities[orbitIndex];
  const b = race.sample(time + 0.001).entities[orbitIndex];
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y) > 0);
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 0.02);
  assert.deepEqual(race.sample(race.duration).arrivedIds, ["A"]);
});

test("breakaway contacts disable the fixture and replay its disappearance", async () => {
  const e = await engine();
  const race = await preparePhysicsRace(e, "breakaway-steps", tokens, ["A"], {
    seed: 18,
  });
  const before = race.sample(0).entities;
  const after = race.sample(race.duration).entities;
  const broken = after.filter(
    (entity) => entity.def.breakOnContact && entity.active === false,
  );
  assert.ok(broken.length >= 1, "at least one contacted plank breaks");
  assert.ok(
    before
      .filter((entity) => entity.def.breakOnContact)
      .every((entity) => entity.active),
  );
  assert.ok(broken.every((entity) => entity.brokenFor > 0));
});

test("explicit playback seconds preserve physical paths and exact qualifiers", async () => {
  const a = await preparePhysicsRace(
    await engine(),
    "gear-cascade",
    tokens,
    ["B"],
    { seed: 18, playbackDuration: 12 },
  );
  const b = await preparePhysicsRace(
    await engine(),
    "gear-cascade",
    tokens,
    ["B"],
    { seed: 18, playbackDuration: 30 },
  );
  assert.equal(a.duration, 12);
  assert.equal(b.duration, 30);
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    assert.deepEqual(
      a.sample(12 * fraction).tokens,
      b.sample(30 * fraction).tokens,
    );
    assert.deepEqual(
      a.sample(12 * fraction).entities,
      b.sample(30 * fraction).entities,
    );
  }
  assert.deepEqual(a.sample(12).arrivedIds, ["B"]);
});
