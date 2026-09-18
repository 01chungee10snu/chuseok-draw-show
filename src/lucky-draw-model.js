import {
  cryptoRandomInt,
  uniformSubset,
  weightedGateIndex,
} from "./round-planner.js";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 20_000;
const MISSING = "(미입력)";
const NAME_ALIASES = new Set(["성명", "이름", "name"]);
const ID_ALIASES = new Set(["사번", "참가자id", "id"]);

function canonicalHeader(header) {
  return String(header).trim().toLocaleLowerCase("en-US");
}

function parseCsvRecords(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  let atFieldStart = true;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (afterQuote && char !== "," && char !== "\n" && char !== "\r") {
      throw new Error("닫는 따옴표 뒤에 잘못된 문자가 있습니다.");
    }
    if (char === '"' && !atFieldStart) {
      throw new Error("따옴표는 필드 시작 위치에서만 사용할 수 있습니다.");
    } else if (char === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (char === ",") {
      record.push(field);
      field = "";
      afterQuote = false;
      atFieldStart = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      afterQuote = false;
      atFieldStart = true;
    } else {
      field += char;
      atFieldStart = false;
    }
  }
  if (quoted) throw new Error("닫히지 않은 따옴표가 있습니다.");
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function parseParticipants(csvText) {
  if (typeof csvText !== "string") throw new Error("CSV 텍스트가 필요합니다.");
  if (new TextEncoder().encode(csvText).byteLength > MAX_BYTES) {
    throw new Error("CSV 파일은 10MB 이하여야 합니다.");
  }
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const records = parseCsvRecords(text);
  while (
    records.length > 1 &&
    records.at(-1).length === 1 &&
    records.at(-1)[0] === ""
  )
    records.pop();
  if (!records.length) throw new Error("CSV가 비어 있습니다.");

  const headers = records[0].map((header) => header.trim());
  if (!headers.length || headers.some((header) => !header)) {
    throw new Error("비어 있는 열 이름이 있습니다.");
  }
  const normalizedHeaders = headers.map(canonicalHeader);
  if (new Set(normalizedHeaders).size !== headers.length) {
    throw new Error("중복된 열 이름이 있습니다.");
  }

  const nameColumnIndex = normalizedHeaders.findIndex((header) =>
    NAME_ALIASES.has(header),
  );
  if (nameColumnIndex < 0)
    throw new Error("성명, 이름 또는 name 열이 필요합니다.");
  const idColumnIndex = normalizedHeaders.findIndex((header) =>
    ID_ALIASES.has(header),
  );
  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_ROWS)
    throw new Error("참가자는 최대 20,000명까지 등록할 수 있습니다.");
  if (!dataRecords.length) throw new Error("참가자 이름이 없습니다.");

  const explicitIds = new Set();
  const names = new Map();
  const rows = dataRecords.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`${rowIndex + 2}행의 열 개수가 헤더와 다릅니다.`);
    }
    const name = values[nameColumnIndex];
    if (!name.trim())
      throw new Error(`${rowIndex + 2}행의 참가자 이름이 비어 있습니다.`);
    const explicitId = idColumnIndex >= 0 ? values[idColumnIndex].trim() : "";
    if (explicitId) {
      if (explicitIds.has(explicitId))
        throw new Error(`중복된 참가자 ID가 있습니다: ${explicitId}`);
      explicitIds.add(explicitId);
    }
    const nameKey = name.trim();
    const nameInfo = names.get(nameKey) || { count: 0, missingIds: 0 };
    nameInfo.count += 1;
    if (!explicitId) nameInfo.missingIds += 1;
    names.set(nameKey, nameInfo);
    const drawId = `P${String(rowIndex + 1).padStart(3, "0")}`;
    return {
      ...Object.fromEntries(
        headers.map((header, index) => [header, values[index]]),
      ),
      _id: explicitId ? `E:${explicitId}` : drawId,
      _name: name,
      _drawId: drawId,
    };
  });

  const warnings = [...names]
    .filter(([, info]) => info.count > 1 && info.missingIds > 0)
    .map(([name]) => `ID가 없는 동명이인이 있습니다: ${name}`);
  return { rows, headers, nameColumn: headers[nameColumnIndex], warnings };
}

function isDeniedHeader(header) {
  if (String(header).trim().startsWith("_")) return true;
  const key = canonicalHeader(header).replace(/[\s_-]+/g, "");
  if (NAME_ALIASES.has(key) || ID_ALIASES.has(key)) return true;
  return /(성명|이름|name|사번|참가자id|employeeid|userid|identifier|identity|주민|여권|passport|생년월일|birthdate|dob|이메일|email|메일|전화|phone|mobile|휴대폰|연락처|주소|address|거주지|메모|비고|설명|자유|freetext|comment|note|내용|fields)/i.test(
    key,
  );
}

function valueOf(row, header) {
  const raw = row[header];
  return raw === null || raw === undefined || String(raw).trim() === ""
    ? MISSING
    : String(raw);
}

function strictNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const text = String(value).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return NaN;
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

function desiredBinCount(rowCount, uniqueCount) {
  const count =
    rowCount >= 120
      ? 6
      : rowCount >= 60
        ? 5
        : rowCount >= 24
          ? 4
          : rowCount >= 8
            ? 3
            : 2;
  return Math.min(count, uniqueCount, 6);
}

function numericGroups(rows, header) {
  const byNumber = new Map();
  for (const row of rows) {
    const number = strictNumber(row[header]);
    if (!Number.isFinite(number)) return null;
    if (!byNumber.has(number)) byNumber.set(number, []);
    byNumber.get(number).push(row);
  }
  const values = [...byNumber.keys()].sort((a, b) => a - b);
  if (values.length < 2) return null;
  const binCount = desiredBinCount(rows.length, values.length);
  const groups = [];
  let currentValues = [];
  let currentRows = [];
  let consumed = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    currentValues.push(value);
    currentRows.push(...byNumber.get(value));
    consumed += byNumber.get(value).length;
    const remainingBins = binCount - groups.length - 1;
    const remainingValues = values.length - i - 1;
    const boundary = (rows.length * (groups.length + 1)) / binCount;
    if (
      remainingBins > 0 &&
      remainingValues >= remainingBins &&
      consumed >= boundary
    ) {
      groups.push({ values: currentValues, rows: currentRows });
      currentValues = [];
      currentRows = [];
    }
  }
  if (currentRows.length)
    groups.push({ values: currentValues, rows: currentRows });
  if (groups.length < 2 || groups.length > 6) return null;
  return groups.map((group, index) => {
    const min = group.values[0];
    const max = group.values.at(-1);
    return {
      id: `${header}:${index + 1}`,
      label: min === max ? String(min) : `${min}–${max}`,
      rows: group.rows,
    };
  });
}

function categoricalGroups(rows, header) {
  const grouped = new Map();
  for (const row of rows) {
    const value = valueOf(row, header);
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  if (grouped.size < 2 || grouped.size > 7) return null;
  return [...grouped].map(([label, members], index) => ({
    id: `${header}:${index + 1}`,
    label,
    rows: members,
  }));
}

function assignLanes(groups) {
  const totals = [0, 0];
  const lanes = [[], []];
  const ordered = [...groups].sort(
    (a, b) =>
      b.rows.length - a.rows.length || a.label.localeCompare(b.label, "ko"),
  );
  for (const group of ordered) {
    const lane = totals[0] <= totals[1] ? 0 : 1;
    const tagged = { ...group, count: group.rows.length, lane };
    lanes[lane].push(tagged);
    totals[lane] += tagged.count;
  }
  return { lanes, totals, groups: lanes.flat() };
}

function buildPlan(rows, header) {
  const numbers = rows.map((row) => strictNumber(row[header]));
  const fullyNumeric = numbers.every(Number.isFinite);
  const hasNumeric = numbers.some(Number.isFinite);
  let groups;
  if (fullyNumeric) {
    groups = numericGroups(rows, header);
  } else {
    const unique = new Set(rows.map((row) => valueOf(row, header))).size;
    groups =
      hasNumeric && unique >= 2 && unique <= 7
        ? categoricalGroups(rows, header)
        : !hasNumeric
          ? categoricalGroups(rows, header)
          : null;
  }
  if (!groups) return null;
  const assignment = assignLanes(groups);
  const [a, b] = assignment.totals;
  if (!a || !b || Math.abs(a - b) / rows.length > 0.8) return null;
  return {
    header,
    label: header,
    groups: assignment.groups,
    lanes: assignment.lanes.map((lane) => ({
      rows: lane.flatMap((group) => group.rows),
      count: lane.reduce((sum, group) => sum + group.count, 0),
      labels: lane.map((group) => group.label),
    })),
    before: rows.length,
  };
}

export function eligibleHeaders(
  rows,
  { usedHeaders = new Set(), allowedHeaders } = {},
) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const allowed = allowedHeaders === undefined ? null : new Set(allowedHeaders);
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return headers
    .filter((header) => !usedHeaders.has(header))
    .filter((header) => !allowed || allowed.has(header))
    .filter((header) => !isDeniedHeader(header))
    .map((header) => buildPlan(rows, header))
    .filter(Boolean);
}

export function chooseHeader(rows, options = {}) {
  const plans = eligibleHeaders(rows, options).sort((a, b) => {
    const imbalanceA = Math.abs(a.lanes[0].count - a.lanes[1].count) / a.before;
    const imbalanceB = Math.abs(b.lanes[0].count - b.lanes[1].count) / b.before;
    return imbalanceA - imbalanceB || a.header.localeCompare(b.header, "ko");
  });
  const finalists = plans.slice(0, 6);
  return finalists.length ? finalists[cryptoRandomInt(finalists.length)] : null;
}

export function drawRound(plan) {
  if (!plan || !Array.isArray(plan.lanes) || plan.lanes.length !== 2)
    throw new Error("유효한 추첨 계획이 필요합니다.");
  const lane = weightedGateIndex(plan.lanes.map((item) => item.count));
  const selected = plan.lanes[lane];
  return {
    lane,
    survivors: [...selected.rows],
    selectedLabels: [...selected.labels],
    probability: selected.count / plan.before,
    before: plan.before,
    after: selected.count,
  };
}

export function drawSubset(rows, n) {
  if (
    !Array.isArray(rows) ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > rows.length
  ) {
    throw new Error("추첨 인원은 1명 이상이며 전체 인원 이하여야 합니다.");
  }
  return uniformSubset(rows, n);
}

export function filterPool(rows, { column = "", values, value = "" } = {}) {
  if (!column) return [...rows];
  const selected = new Set(
    (Array.isArray(values) ? values : [value]).map((item) => item ?? ""),
  );
  return rows.filter((row) => selected.has(row[column] ?? ""));
}

export function createStageDeck(ids, randomInt = cryptoRandomInt) {
  const source = [...new Set(ids)];
  let bag = [];
  let last;

  function refill() {
    bag = [...source];
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag.length > 1 && bag[0] === last) {
      const swapIndex = 1 + randomInt(bag.length - 1);
      [bag[0], bag[swapIndex]] = [bag[swapIndex], bag[0]];
    }
  }

  return {
    next() {
      if (!source.length) return null;
      if (!bag.length) refill();
      const next = bag.shift();
      last = next;
      return next;
    },
    reset() {
      bag = [];
      last = undefined;
    },
  };
}
