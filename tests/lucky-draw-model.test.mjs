import test from "node:test";
import assert from "node:assert/strict";
import { weightedGateIndexFromInt } from "../src/round-planner.js";
import {
  parseParticipants,
  eligibleHeaders,
  drawSubset,
  filterPool,
  createStageDeck,
} from "../src/lucky-draw-model.js";

test("weighted intervals and equal-person probability algebra are exact", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((x) => weightedGateIndexFromInt([3, 2], x)),
    [0, 0, 0, 1, 1],
  );
  for (const size of [3, 2])
    assert.ok(Math.abs((size / 5) * (1 / size) - 1 / 5) < 1e-12);
});

test("CSV handles BOM, CRLF, quoted commas, newlines, and escaped quotes", () => {
  const csv =
    '\ufeffname,팀,메모\r\n"홍, 길동",A,"첫 줄\n둘째 ""줄"""\r\n김영희,B,ok\r\n';
  const parsed = parseParticipants(csv);
  assert.equal(parsed.nameColumn, "name");
  assert.equal(parsed.rows[0]._name, "홍, 길동");
  assert.equal(parsed.rows[0].메모, '첫 줄\n둘째 "줄"');
  assert.equal(parsed.rows[0]._id, "P001");
  assert.equal(parsed.rows[1]._drawId, "P002");
});

test("CSV rejects malformed shape, unclosed quotes, and duplicate explicit IDs", () => {
  assert.throws(() => parseParticipants('이름,팀\n"가,A'), /따옴표/);
  assert.throws(() => parseParticipants('이름,팀\n"가"oops,A'), /따옴표 뒤/);
  assert.throws(() => parseParticipants('이름,팀\n가"oops,A'), /필드 시작/);
  assert.throws(() => parseParticipants("이름,팀\n가"), /열 개수/);
  assert.throws(
    () => parseParticipants("이름,id\n가,7\n나,7"),
    /중복된 참가자 ID/,
  );
});

test("explicit and generated internal IDs occupy separate namespaces", () => {
  const result = parseParticipants("이름,id\n가,P002\n나,");
  assert.deepEqual(
    result.rows.map((row) => row._id),
    ["E:P002", "P002"],
  );
  assert.equal(new Set(result.rows.map((row) => row._id)).size, 2);
});

test("trailing blank lines are ignored", () => {
  assert.equal(parseParticipants("이름,팀\n가,A\n\n\n").rows.length, 1);
});

test("same names without IDs are accepted with a warning", () => {
  const result = parseParticipants("이름,팀\n가,A\n가,B");
  assert.equal(result.rows.length, 2);
  assert.equal(result.warnings.length, 1);
});

test("arbitrary safe custom headers partition all rows exactly once", () => {
  const rows = parseParticipants(
    "이름,근무형태,지역\n가,재택,서울\n나,출근,부산\n다,재택,서울\n라,출근,제주",
  ).rows;
  const plans = eligibleHeaders(rows);
  const plan = plans.find((item) => item.header === "근무형태");
  assert.ok(plan);
  assert.equal(
    plan.groups.reduce((sum, group) => sum + group.count, 0),
    rows.length,
  );
  assert.equal(
    new Set(plan.groups.flatMap((group) => group.rows)).size,
    rows.length,
  );
  assert.ok(plan.lanes.every((lane) => lane.count > 0));
  assert.equal(
    plans.some((item) => item.header === "이름" || item.header.startsWith("_")),
    false,
  );
});

test("allowedHeaders and usedHeaders strictly filter candidates", () => {
  const rows = parseParticipants(
    "name,부서,색상\nA,개발,빨강\nB,영업,파랑\nC,개발,빨강\nD,영업,파랑",
  ).rows;
  assert.deepEqual(
    eligibleHeaders(rows, { allowedHeaders: ["색상"] }).map(
      (plan) => plan.header,
    ),
    ["색상"],
  );
  assert.deepEqual(
    eligibleHeaders(rows, {
      allowedHeaders: ["색상"],
      usedHeaders: new Set(["색상"]),
    }),
    [],
  );
});

test("incomplete numeric data treats missing as a category and never zero", () => {
  const rows = parseParticipants("이름,점수\n가,10\n나,\n다,20\n라,").rows;
  const plan = eligibleHeaders(rows, { allowedHeaders: ["점수"] })[0];
  assert.ok(plan);
  assert.deepEqual(
    new Set(plan.groups.map((group) => group.label)),
    new Set(["10", "20", "(미입력)"]),
  );
  assert.equal(
    plan.groups.some((group) => group.label === "0"),
    false,
  );
});

test("fully numeric quantile groups preserve ties", () => {
  const rows = parseParticipants(
    "name,점수\nA,1\nB,1\nC,2\nD,3\nE,4\nF,4\nG,5\nH,6",
  ).rows;
  const plan = eligibleHeaders(rows, { allowedHeaders: ["점수"] })[0];
  const tieGroups = plan.groups.filter((group) =>
    group.rows.some((row) => row.점수 === "1"),
  );
  assert.equal(tieGroups.length, 1);
  assert.equal(tieGroups[0].rows.filter((row) => row.점수 === "1").length, 2);
});

test("filterPool supports exact OR selections, including missing values", () => {
  const rows = [{ 팀: "A" }, { 팀: "a" }, { 팀: "" }, {}, { 팀: "#N/A" }];
  assert.deepEqual(filterPool(rows, { column: "팀", value: "A" }), [rows[0]]);
  assert.deepEqual(filterPool(rows, { column: "팀", values: ["A", "a"] }), [
    rows[0],
    rows[1],
  ]);
  assert.deepEqual(filterPool(rows, { column: "팀", values: [""] }), [
    rows[2],
    rows[3],
    rows[4],
  ]);
  assert.deepEqual(filterPool(rows, { column: "팀", values: [] }), []);
  assert.notEqual(filterPool(rows), rows);
});

test("drawSubset validates n", () => {
  assert.throws(() => drawSubset([1, 2], 0), /추첨 인원/);
  assert.throws(() => drawSubset([1, 2], 1.5), /추첨 인원/);
  assert.equal(drawSubset([1, 2], 2).length, 2);
});

test("stage deck has no repeats within a cycle or across cycle boundaries", () => {
  const deck = createStageDeck(["a", "b", "c"], () => 0);
  const first = [deck.next(), deck.next(), deck.next()];
  const second = [deck.next(), deck.next(), deck.next()];
  assert.equal(new Set(first).size, 3);
  assert.equal(new Set(second).size, 3);
  assert.notEqual(first.at(-1), second[0]);
  deck.reset();
  assert.ok(["a", "b", "c"].includes(deck.next()));
});
