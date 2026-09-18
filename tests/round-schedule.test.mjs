import test from "node:test";
import assert from "node:assert/strict";
import {
  canUseGroupPlan,
  effectiveRoundCount,
  estimatedShowSeconds,
  fixedRoundTarget,
  normalizeScheduleConfig,
} from "../src/round-schedule.js";

test("schedule settings normalize bounds and stage ids", () => {
  const schedule = normalizeScheduleConfig(
    {
      mode: "fixed",
      requestedRounds: 99,
      entries: [
        { seconds: 2, stageId: "known" },
        { seconds: 120, stageId: "removed" },
      ],
    },
    ["known"],
  );
  assert.equal(schedule.mode, "fixed");
  assert.equal(schedule.requestedRounds, 12);
  assert.deepEqual(schedule.entries[0], { seconds: 12, stageId: "known" });
  assert.deepEqual(schedule.entries[1], { seconds: 90, stageId: "" });
  assert.deepEqual(schedule.entries[2], { seconds: 24, stageId: "" });
});

test("fixed targets complete in the effective number of strictly shrinking games", () => {
  const populations = [1, 2, 3, 4, 8, 10, 11, 188, 20_000];
  for (const initialN of populations) {
    for (let requested = 2; requested <= 12; requested += 1) {
      const effective = effectiveRoundCount(initialN, requested);
      assert.equal(
        effective,
        initialN <= 1 ? 0 : Math.min(requested, initialN - 1),
      );
      if (initialN === 1) {
        continue;
      }
      let n = initialN;
      for (let remaining = effective; remaining >= 1; remaining -= 1) {
        const target = fixedRoundTarget(n, remaining);
        assert.ok(target < n, `${initialN}/${requested}: ${n} -> ${target}`);
        assert.ok(target >= 1);
        assert.ok(target >= remaining - 1);
        n = target;
      }
      assert.equal(n, 1, `${initialN}/${requested}`);
    }
  }
});

test("a sole participant needs no elimination game", () => {
  assert.equal(effectiveRoundCount(0, 12), 0);
  assert.equal(effectiveRoundCount(1, 12), 0);
  assert.equal(effectiveRoundCount(2, 12), 1);
});

test("eligible group branches leave enough people for every later game", () => {
  for (const remaining of [3, 4, 7, 12]) {
    const plan = { lanes: [{ count: remaining }, { count: remaining + 5 }] };
    assert.equal(canUseGroupPlan(plan, remaining), true);
    for (const lane of plan.lanes) {
      let n = lane.count;
      for (let left = remaining - 1; left >= 1; left -= 1) {
        const target = fixedRoundTarget(n, left);
        assert.ok(target < n);
        n = target;
      }
      assert.equal(n, 1);
    }
  }
  assert.equal(
    canUseGroupPlan({ lanes: [{ count: 5 }, { count: 2 }] }, 3),
    false,
  );
  assert.equal(
    canUseGroupPlan({ lanes: [{ count: 8 }, { count: 8 }] }, 2),
    false,
  );
});

test("estimated show time excludes MC waits and adds finish confirmation", () => {
  const result = estimatedShowSeconds(
    {
      mode: "fixed",
      requestedRounds: 3,
      entries: [{ seconds: 12 }, { seconds: 24 }, { seconds: 90 }],
    },
    20,
  );
  assert.deepEqual(result, {
    rounds: 3,
    playback: 126,
    confirmation: 4.199999999999999,
    total: 130.2,
  });
});
