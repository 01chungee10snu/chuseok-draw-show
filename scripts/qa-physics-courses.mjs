import assert from "node:assert/strict";
import fs from "node:fs";
import Box2DFactory from "box2d-wasm";
import { PhysicsShowEngine } from "../src/physics-show-engine.js";
import { PHYSICS_STAGE_IDS } from "../src/physics-stage-maps.js";
import { preparePhysicsRace } from "../src/physics-race.js";

const Box2D = await Box2DFactory({
  wasmBinary: fs.readFileSync(
    new URL(
      "../node_modules/box2d-wasm/dist/umd/Box2D.simd.wasm",
      import.meta.url,
    ),
  ),
});
const results = [];
for (const stage of PHYSICS_STAGE_IDS) {
  for (const seed of [0, 1, 18, 71, 987654321]) {
    const engine = new PhysicsShowEngine();
    engine.Box2D = Box2D;
    engine.readyPromise = Promise.resolve(Box2D);
    const n = stage === "spotlight-cut" ? 10 : stage === "twin-orbit" ? 4 : 2;
    const k = stage === "spotlight-cut" ? 4 : stage === "twin-orbit" ? 2 : 1;
    const tokens = Array.from({ length: n }, (_, i) => ({
      id: `P${i}`,
      lane: i % 2,
      count: 1,
    }));
    const selected = tokens.slice(n - k).map((token) => token.id);
    try {
      const race = await preparePhysicsRace(engine, stage, tokens, selected, {
        seed,
      });
      const crossed = new Set();
      const identity = race.sample(0).tokens.map((t) => t.token.id);
      for (let step = 0; step <= Math.ceil(race.duration * 60); step++) {
        const frame = race.sample(Math.min(step / 60, race.duration));
        assert.deepEqual(
          frame.tokens.map((t) => t.token.id),
          identity,
        );
        for (const t of frame.tokens)
          if (t.y >= frame.stage.goalY - 1e-8) crossed.add(t.token.id);
      }
      assert.deepEqual(crossed, new Set(selected));
      assert.deepEqual(
        new Set(race.sample(race.duration).arrivedIds),
        new Set(selected),
      );
      assert.ok(
        race.duration >= 18 && race.duration <= 35,
        `duration ${race.duration}`,
      );
      results.push({
        stage,
        seed,
        duration: Number(race.duration.toFixed(3)),
        movingObstacles: race.stage.quality.kinematicCount,
        translatingObstacles: race.stage.quality.translatingCount,
        motionKinds: race.stage.quality.motionKinds,
        arrivalMatched: true,
        ok: true,
      });
    } catch (error) {
      results.push({ stage, seed, ok: false, error: error.message });
    } finally {
      engine.dispose();
    }
  }
}
const report = {
  version: "1.2.0",
  cases: results.length,
  passed: results.filter((r) => r.ok).length,
  results,
};
if (process.argv[2])
  fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (report.passed !== report.cases) process.exitCode = 1;
