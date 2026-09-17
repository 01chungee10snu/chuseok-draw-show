import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prepareRows, poolRows, assignDrawIds } from "../src/round-planner.js";
import { headerCandidates, chooseHeaderRound, drawHeaderLane } from "../src/header-round-engine.js";

function parseSimpleCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].replace(/^\uFEFF/, "").split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

const raw = parseSimpleCsv(fs.readFileSync(new URL("../data/demo_participants.csv", import.meta.url), "utf8"));
const prepared = prepareRows(raw);
const manager = assignDrawIds(poolRows(prepared, "manager"), "manager");

test("manager pool exposes groupable header candidates based on current survivors", () => {
  const candidates = headerCandidates(manager);
  assert.ok(candidates.length >= 6);
  const sil = candidates.find((c) => c.feature === "실");
  assert.ok(sil);
  assert.equal(sil.groupCount, 5);
  assert.equal(sil.groups.reduce((n, g) => n + g.count, 0), manager.length);
});

test("every header candidate partitions unique-value groups into two complete balanced lanes", () => {
  for (const candidate of headerCandidates(manager)) {
    const laneRows = candidate.laneRows.flat();
    assert.equal(laneRows.length, manager.length, candidate.feature);
    assert.equal(new Set(laneRows.map((r) => r._id)).size, manager.length, candidate.feature);
    assert.ok(candidate.groups.length >= 2 && candidate.groups.length <= 7, candidate.feature);
    const [a, b] = candidate.laneCounts;
    assert.ok(a > 0 && b > 0, candidate.feature);
    assert.ok(Math.abs(a - b) / manager.length <= 0.30, candidate.feature);
  }
});

test("population weighted lane draw keeps exact 1/N final-probability algebra", () => {
  for (const candidate of headerCandidates(manager)) {
    const n = manager.length;
    for (const laneCount of candidate.laneCounts) {
      const pLane = laneCount / n;
      const pPersonConditional = 1 / laneCount;
      assert.ok(Math.abs(pLane * pPersonConditional - 1 / n) < 1e-12, candidate.feature);
    }
  }
});

test("used headers disappear and repeated rounds naturally shrink to identity reveal range", () => {
  for (let trial = 0; trial < 30; trial += 1) {
    let alive = [...manager];
    const used = new Set();
    let rounds = 0;
    while (alive.length > 10 && rounds < 8) {
      const { selected, candidates } = chooseHeaderRound(alive, { usedFeatures: used });
      assert.ok(selected, `trial ${trial} / alive ${alive.length}`);
      assert.ok(!used.has(selected.feature));
      assert.ok(candidates.every((c) => !used.has(c.feature)));
      const result = drawHeaderLane(selected);
      assert.ok(result.survivors.length < alive.length);
      assert.ok(result.survivors.length > 0);
      used.add(selected.feature);
      alive = result.survivors;
      rounds += 1;
    }
    assert.ok(alive.length >= 2 && alive.length <= 10, `trial ${trial}: ${alive.length}`);
    assert.ok(rounds <= 6, `trial ${trial}: ${rounds}`);
  }
});
