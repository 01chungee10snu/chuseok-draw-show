import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareRows,
  poolRows,
  assignDrawIds,
  targetCount,
  weightedGateIndexFromInt,
  chooseDynamicRule,
} from "../src/round-planner.js";

test("weighted gate index maps exact population intervals", () => {
  const sizes = [3, 2];
  assert.deepEqual([0,1,2,3,4].map((x) => weightedGateIndexFromInt(sizes, x)), [0,0,0,1,1]);
});

test("population weighted gate selection preserves equal per-person probability algebraically", () => {
  const N = 5;
  for (const ng of [3,2]) {
    const pGate = ng / N;
    const pPersonGivenGate = 1 / ng;
    assert.ok(Math.abs((pGate * pPersonGivenGate) - (1 / N)) < 1e-12);
  }
});

test("target count adapts to current survivor size", () => {
  assert.equal(targetCount(150), 78);
  assert.equal(targetCount(90), 45);
  assert.equal(targetCount(40), 19);
  assert.equal(targetCount(22), 11);
});

test("dynamic planner produces a balanced rule from current rows", () => {
  const rows = [];
  for (let i = 0; i < 80; i += 1) {
    rows.push({
      사번: String(1000000 + i), 본부: "경영지원본부",
      실: i < 45 ? "A실" : "B실", 팀: `T${i % 6}`, 성명: `${["김","이","박","최"][i%4]}가${i}`,
      직군: "일반", 조직상역할: "팀원", 직위: "매니저", 직위연차: String((i%8)+1),
      직무: `J${i%5}`, 최초입사일: `${2005 + (i%20)}-0${(i%9)+1}-01`, 생년월일: `${1978 + (i%28)}-0${(i%9)+1}-15`,
      휴대폰번호_뒷4자리: String(1000+i),
    });
  }
  const prepared = assignDrawIds(poolRows(prepareRows(rows), "manager"), "manager");
  const rule = chooseDynamicRule(prepared, {roundNo: 1, usedFeatures: new Set(), usedFamilies: new Set()});
  assert.ok(rule);
  const [a,b] = rule.counts;
  assert.equal(a+b, 80);
  assert.ok(Math.min(a,b) >= Math.floor(80*.32));
  assert.ok(Math.max(a,b) <= Math.ceil(80*.68));
});
