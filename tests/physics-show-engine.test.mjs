import test from "node:test";
import assert from "node:assert/strict";
import { isPhysicsStage } from "../src/physics-show-engine.js";

test("Box2D is enabled only for the three show-only physics stages", () => {
  assert.equal(isPhysicsStage("steel-drop"), true);
  assert.equal(isPhysicsStage("pinball-grid"), true);
  assert.equal(isPhysicsStage("last-marble"), true);
  assert.equal(isPhysicsStage("moon-orbit"), false);
  assert.equal(isPhysicsStage("furnace-split"), false);
  assert.equal(isPhysicsStage("spotlight-cut"), false);
  assert.equal(isPhysicsStage("twin-orbit"), false);
});
