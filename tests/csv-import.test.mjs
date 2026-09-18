import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeParticipantBytes,
  eligibleHeaders,
  isSafeGroupingHeader,
  parseParticipants,
} from "../src/lucky-draw-model.js";

test("CP949 bytes decode before tab-delimited parsing", () => {
  const bytes = Buffer.from(
    "bcbab8ed09b1d7b7ec0d0a4109b0a10d0a4209b3aa0d0a",
    "hex",
  );
  const parsed = parseParticipants(decodeParticipantBytes(bytes));
  assert.equal(parsed.nameColumn, "성명");
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(
    parsed.rows.map((row) => row.그룹),
    ["가", "나"],
  );
});

test("UTF-16 BOM files and Excel sep directives are supported", () => {
  const text = "sep=;\r\n Full Name ;Team\r\nA;red\r\nB;blue\r\n";
  const body = Buffer.from(text, "utf16le");
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
  const parsed = parseParticipants(decodeParticipantBytes(bytes));
  assert.equal(parsed.nameColumn, "Full Name");
  assert.equal(parsed.rows.length, 2);

  const beBody = Buffer.from("name,team\nA,x\nB,y", "utf16le");
  for (let index = 0; index < beBody.length; index += 2)
    [beBody[index], beBody[index + 1]] = [beBody[index + 1], beBody[index]];
  const beBytes = Buffer.concat([Buffer.from([0xfe, 0xff]), beBody]);
  assert.equal(
    parseParticipants(decodeParticipantBytes(beBytes)).rows.length,
    2,
  );
});

test("header aliases normalize whitespace and case conservatively", () => {
  const parsed = parseParticipants(
    " Employee Name , Employee ID ,Group\nA,01,x\nB,02,y",
  );
  assert.equal(parsed.nameColumn, "Employee Name");
  assert.deepEqual(
    parsed.rows.map((row) => row._id),
    ["E:01", "E:02"],
  );
  assert.throws(
    () => parseParticipants("Name, name ,Group\nA,B,x"),
    /중복된 열 이름/,
  );
});

test("comma, tab, and semicolon imports keep strict row validation", () => {
  assert.equal(parseParticipants("성명\nA\nB").rows.length, 2);
  assert.equal(parseParticipants("name;team\nA;x\nB;y").rows.length, 2);
  assert.equal(parseParticipants("name\tteam\nA\tx\nB\ty").rows.length, 2);
  assert.throws(() => parseParticipants("name;team\nA;x;extra"), /열 개수/);
  assert.throws(
    () => parseParticipants("name,id\nA,7\nB,7"),
    /중복된 참가자 ID/,
  );
});

test("single-character email and phone derivatives allow prefixes and missing spreadsheet errors", () => {
  const clean = parseParticipants(
    "name,사내메일첫글자,휴대전화뒤1자리\nA,a,1\nB,7,9\nC,,0\nD,b,#VALUE!",
  );
  assert.equal(clean.rows.length, 4);
  assert.match(clean.warnings[0], /휴대전화뒤1자리.*1개.*미입력/);
  assert.equal(isSafeGroupingHeader(clean.rows, "사내메일첫글자"), true);
  assert.equal(isSafeGroupingHeader(clean.rows, "휴대전화뒤1자리"), true);
  assert.deepEqual(
    eligibleHeaders(clean.rows)
      .map((plan) => plan.header)
      .sort(),
    ["사내메일첫글자", "휴대전화뒤1자리"].sort(),
  );
  const phonePlan = eligibleHeaders(clean.rows).find(
    (plan) => plan.header === "휴대전화뒤1자리",
  );
  assert.ok(phonePlan.groups.some((group) => group.label === "(미입력)"));

  const dirty = parseParticipants(
    "name,사내메일첫글자,휴대전화뒤1자리\nA,a,1\nB,user@example.com,010-1234-5678",
  ).rows;
  assert.equal(isSafeGroupingHeader(dirty, "사내메일첫글자"), false);
  assert.equal(isSafeGroupingHeader(dirty, "휴대전화뒤1자리"), false);
});

test("spreadsheet errors in identity columns fail clearly", () => {
  assert.throws(
    () => parseParticipants("name,id\n#N/A,1"),
    /참가자 이름.*스프레드시트 오류/,
  );
  assert.throws(
    () => parseParticipants("name,id\nA,#REF!"),
    /참가자 ID.*스프레드시트 오류/,
  );
});

test("recurring categorical values above seven stay whole across two lanes", () => {
  const rows = Array.from({ length: 24 }, (_, index) => ({
    name: `P${index + 1}`,
    조직: `G${(index % 12) + 1}`,
  }));
  const plan = eligibleHeaders(rows, { allowedHeaders: ["조직"] })[0];
  assert.ok(plan);
  assert.equal(plan.groups.length, 12);
  for (const value of new Set(rows.map((row) => row.조직))) {
    assert.equal(
      plan.groups.filter((group) =>
        group.rows.some((row) => row.조직 === value),
      ).length,
      1,
    );
  }

  const nearUnique = Array.from({ length: 12 }, (_, index) => ({
    name: `P${index + 1}`,
    자유값: `V${index + 1}`,
  }));
  assert.equal(
    eligibleHeaders(nearUnique, { allowedHeaders: ["자유값"] }).length,
    0,
  );
});
