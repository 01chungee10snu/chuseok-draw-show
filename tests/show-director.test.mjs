import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Box2DFactory from "box2d-wasm";
import { ShowDirector } from "../src/show-director.js";

const tokens = ["P003", "P009", "P002", "P005"].map((id, i) => ({
  id,
  label: id,
  lane: i % 2,
  count: 1,
}));

// Drive the real playback loop with controlled browser frame timestamps.
// Only canvas painting is omitted; scheduling, completion and physics stay live.
function playback(t) {
  const document = new EventTarget();
  document.body = {};
  document.hidden = false;
  let nextFrame;
  const globals = {
    document,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ getPropertyValue: () => "#999" }),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: (callback) => {
      nextFrame = callback;
      return 1;
    },
    cancelAnimationFrame: () => {
      nextFrame = null;
    },
  };
  const original = new Map();
  for (const [key, value] of Object.entries(globals)) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  }
  const director = new ShowDirector({
    getContext: () => ({ setTransform() {} }),
    getBoundingClientRect: () => ({ width: 960, height: 600 }),
  });
  for (const name of [
    "base",
    "label",
    "drawIdle",
    "drawOrbit",
    "drawGrid",
    "drawTunnel",
    "drawReduced",
    "drawPhysics",
  ])
    director[name] = () => {};
  t.after(() => {
    director.destroy();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    director,
    frame(now) {
      assert.equal(typeof nextFrame, "function", "playback remains scheduled");
      const callback = nextFrame;
      nextFrame = null;
      callback(now);
    },
    visibility(hidden) {
      document.hidden = hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

for (const interval of [100, 600]) {
  test(`visible ${interval}ms frames complete a 12-second show on time`, async (t) => {
    const { director, frame } = playback(t);
    const result = director.play(tokens, { stageId: "orbit-rally" });
    frame(1000);
    for (let now = 1000 + interval; now <= 13000 + interval; now += interval)
      frame(now);
    assert.equal(director.running, false);
    assert.equal((await result).reason, "completed");
    assert.ok(
      director.time >= 12 && director.time <= 12 + interval / 1000 + 0.001,
    );
  });
}

test("manual pause excludes suspended time even without background frames", async (t) => {
  const { director, frame } = playback(t);
  const result = director.play(tokens, {
    stageId: "light-grid",
    reduced: true,
  });
  frame(1000);
  frame(1040);
  const before = director.time;
  director.pause(true);
  frame(1080);
  assert.equal(director.time, before);
  director.pause(false);
  frame(1180);
  assert.equal(director.time, before, "resume starts a fresh frame interval");
  for (let now = 1220; now < 3700; now += 40) frame(now);
  assert.equal(director.running, false);
  await result;
});

test("hidden tabs freeze the show and resume without revealing a pending result", async (t) => {
  const { director, frame, visibility } = playback(t);
  const result = director.play(tokens, {
    stageId: "pulse-gates",
    reduced: true,
  });
  frame(1000);
  frame(1040);
  const before = director.time;
  visibility(true);
  frame(1100);
  assert.equal(director.time, before);
  visibility(false);
  frame(1500);
  assert.equal(
    director.time,
    before,
    "the first visible frame excludes hidden time",
  );
  visibility(true);
  visibility(false);
  frame(60000);
  assert.equal(
    director.time,
    before,
    "a fully suspended tab also stays at its position",
  );
  assert.equal(director.running, true);
  for (let now = 60040; now < 62500; now += 40) frame(now);
  await result;
});

test("asynchronous stage loading is excluded from show duration", async (t) => {
  const { director, frame } = playback(t);
  let loaded;
  director.engine.start = () =>
    new Promise((resolve) => {
      loaded = resolve;
    });
  director.engine.step = () => {};
  director.engine.frame = () => ({ stats: { progress: 1 }, timeScale: 1 });
  const result = director.play(tokens, { stageId: "steel-drop", duration: 1 });
  frame(1000);
  frame(1100);
  assert.equal(director.time, 0);
  loaded();
  await Promise.resolve();
  frame(1400);
  assert.equal(
    director.time,
    0,
    "WASM loading does not spend the show's duration",
  );
  frame(2400);
  assert.equal(director.running, false);
  await result;
});

test("a long visible stall makes bounded progress without skipping to the result", async (t) => {
  const { director, frame } = playback(t);
  const result = director.play(tokens, {
    stageId: "orbit-rally",
    reduced: true,
  });
  frame(1000);
  frame(61000);
  assert.ok(director.time > 0 && director.time <= 1);
  assert.equal(director.running, true);
  for (let now = 61040; now <= 63500; now += 40) frame(now);
  await result;
});

test("real Box2D reaches the final gate with 600ms render intervals", async (t) => {
  const { director, frame } = playback(t);
  const wasmBinary = fs.readFileSync(
    new URL(
      "../node_modules/box2d-wasm/dist/umd/Box2D.simd.wasm",
      import.meta.url,
    ),
  );
  const Box2D = await Box2DFactory({ wasmBinary });
  director.engine.Box2D = Box2D;
  director.engine.readyPromise = Promise.resolve(Box2D);
  const result = director.play(tokens, { stageId: "twin-orbit" });
  while (director.initializing) await Promise.resolve();
  frame(1000);
  for (let now = 1600; now <= 20200 && director.running; now += 600) frame(now);
  assert.equal(director.running, false);
  const completed = await result;
  assert.equal(completed.reason, "completed");
  assert.ok(
    completed.maxProgress >= 0.985,
    `progress ${completed.maxProgress}`,
  );
  assert.ok(completed.elapsed < 19);
});
