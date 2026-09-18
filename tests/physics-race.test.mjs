import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Box2DFactory from "box2d-wasm";
import { PhysicsShowEngine } from "../src/physics-show-engine.js";
import { PHYSICS_STAGE_IDS } from "../src/physics-stage-maps.js";
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
const people = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `P${i}`,
    label: `Person ${i}`,
    lane: i % 2,
    count: i + 1,
  }));

test("all courses qualify exactly the committed group or people, with stable identities", async () => {
  for (const stage of PHYSICS_STAGE_IDS) {
    const n = stage === "spotlight-cut" ? 8 : stage === "twin-orbit" ? 4 : 2;
    const count =
      stage === "spotlight-cut" ? 4 : stage === "twin-orbit" ? 2 : 1;
    const tokens = people(n),
      selected = tokens.slice(n - count).map((t) => t.id);
    const race = await preparePhysicsRace(
      await engine(),
      stage,
      tokens,
      selected,
      { seed: 18 },
    );
    const initial = race.sample(0).tokens.map((t) => t.token.id);
    const observed = new Set();
    for (let elapsed = 0; elapsed <= race.duration + 0.02; elapsed += 0.02) {
      const frame = race.sample(elapsed);
      assert.deepEqual(
        frame.tokens.map((t) => t.token.id),
        initial,
        stage,
      );
      for (const token of frame.tokens)
        if (token.y >= frame.stage.goalY - 1e-8) observed.add(token.token.id);
    }
    const end = race.sample(race.duration);
    for (const token of end.tokens)
      if (token.y >= end.stage.goalY - 1e-8) observed.add(token.token.id);
    assert.deepEqual(observed, new Set(selected), `${stage} physical crossing`);
    assert.deepEqual(
      new Set(end.arrivedIds),
      new Set(selected),
      `${stage} result`,
    );
    assert.ok(
      race.duration >= 18 && race.duration < 40,
      `${stage} duration ${race.duration}`,
    );
  }
});

test("changing the fair outcome or group size does not change physical trajectories", async () => {
  const tokens = people(2);
  const a = await preparePhysicsRace(
    await engine(),
    "last-marble",
    tokens,
    ["P0"],
    { seed: 71 },
  );
  const b = await preparePhysicsRace(
    await engine(),
    "last-marble",
    tokens.map((t) => ({ ...t, count: 1000 - t.count })),
    ["P1"],
    { seed: 71 },
  );
  assert.equal(a.duration, b.duration);
  for (const time of [0, 5, 10, a.duration]) {
    const positions = (race) =>
      race
        .sample(time)
        .tokens.map(({ x, y, angle, radius }) => ({ x, y, angle, radius }));
    assert.deepEqual(positions(a), positions(b));
  }
  assert.deepEqual(a.sample(a.duration).arrivedIds, ["P0"]);
  assert.deepEqual(b.sample(b.duration).arrivedIds, ["P1"]);
});

test("slow-motion rendering interpolates between fixed physics steps", async () => {
  const e = await engine();
  await e.start("last-gate", people(2));
  e.stage.zoomY = 0;
  e.stage.slowZone = 10000;
  e.timeScale = 0.58;
  const velocity = new e.Box2D.b2Vec2(2, 0);
  e.tokens[0].body.SetLinearVelocity(velocity);
  e.Box2D.destroy(velocity);
  e.step(0.02);
  const nativeX = e.tokens[0].body.GetPosition().x;
  const a = e.frame().tokens[0].x;
  const b = e.step(0.002).tokens[0].x;
  const c = e.step(0.002).tokens[0].x;
  assert.equal(
    e.tokens[0].body.GetPosition().x,
    nativeX,
    "no new physics step yet",
  );
  assert.ok(a < b && b < c, "the marble moves on each render frame");
  e.dispose();
});

test("unknown and duplicate qualification IDs are rejected", async () => {
  for (const selected of [["missing"], ["P0", "P0"], []])
    await assert.rejects(
      preparePhysicsRace(await engine(), "steel-drop", people(2), selected),
    );
});
