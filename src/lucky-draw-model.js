import {
  cryptoRandomInt,
  uniformSubset,
  weightedGateIndex,
} from "./round-planner.js";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 20_000;
const MISSING = "(미입력)";
const EXCEL_ERROR =
  /^(?:#VALUE!|#N\/A|#REF!|#DIV\/0!|#NUM!|#NAME\?|#NULL!|#SPILL!|#CALC!)$/i;
const NAME_ALIASES = new Set([
  "성명",
  "이름",
  "name",
  "fullname",
  "employeename",
  "participantname",
  "직원명",
  "참가자명",
]);
const ID_ALIASES = new Set([
  "사번",
  "사원번호",
  "직원번호",
  "참가자id",
  "employeeid",
  "employeenumber",
  "empid",
  "staffid",
  "사원id",
  "직원id",
  "id",
]);

function canonicalHeader(header) {
  return String(header)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function aliasKey(header) {
  return canonicalHeader(header).replace(/[\s_-]+/g, "");
}

function firstRecordDelimiterCounts(text) {
  const counts = new Map([
    [",", 0],
    ["\t", 0],
    [";", 0],
  ]);
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && (char === "\n" || char === "\r")) {
      break;
    } else if (!quoted && counts.has(char)) {
      counts.set(char, counts.get(char) + 1);
    }
  }
  return counts;
}

function detectDelimiter(text) {
  const directive = text.match(/^sep=([,;\t])(?:\r\n|\r|\n)/i);
  if (directive)
    return {
      delimiter: directive[1],
      text: text.slice(directive[0].length),
    };
  const counts = [...firstRecordDelimiterCounts(text)].filter(
    ([, count]) => count > 0,
  );
  if (!counts.length) return { delimiter: ",", text };
  counts.sort((a, b) => b[1] - a[1]);
  if (counts[1] && counts[0][1] === counts[1][1])
    throw new Error(
      "CSV 구분자가 명확하지 않습니다. 쉼표, 탭 또는 세미콜론 중 하나를 사용해 주세요.",
    );
  return { delimiter: counts[0][0], text };
}

function parseCsvRecords(text, delimiter) {
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
    if (afterQuote && char !== delimiter && char !== "\n" && char !== "\r") {
      throw new Error("닫는 따옴표 뒤에 잘못된 문자가 있습니다.");
    }
    if (char === '"' && !atFieldStart) {
      throw new Error("따옴표는 필드 시작 위치에서만 사용할 수 있습니다.");
    } else if (char === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (char === delimiter) {
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
  let text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const detected = detectDelimiter(text);
  text = detected.text;
  const records = parseCsvRecords(text, detected.delimiter);
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

  const nameColumnIndex = headers.findIndex((header) =>
    NAME_ALIASES.has(aliasKey(header)),
  );
  if (nameColumnIndex < 0)
    throw new Error("성명, 이름 또는 name 열이 필요합니다.");
  const idColumnIndex = headers.findIndex((header) =>
    ID_ALIASES.has(aliasKey(header)),
  );
  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_ROWS)
    throw new Error("참가자는 최대 20,000명까지 등록할 수 있습니다.");
  if (!dataRecords.length) throw new Error("참가자 이름이 없습니다.");

  const explicitIds = new Set();
  const names = new Map();
  const spreadsheetErrors = new Map();
  const rows = dataRecords.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`${rowIndex + 2}행의 열 개수가 헤더와 다릅니다.`);
    }
    const name = values[nameColumnIndex];
    if (!name.trim())
      throw new Error(`${rowIndex + 2}행의 참가자 이름이 비어 있습니다.`);
    if (EXCEL_ERROR.test(name.trim()))
      throw new Error(
        `${rowIndex + 2}행의 참가자 이름에 스프레드시트 오류 값이 있습니다: ${name.trim()}`,
      );
    const explicitId = idColumnIndex >= 0 ? values[idColumnIndex].trim() : "";
    if (explicitId && EXCEL_ERROR.test(explicitId))
      throw new Error(
        `${rowIndex + 2}행의 참가자 ID에 스프레드시트 오류 값이 있습니다: ${explicitId}`,
      );
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
    headers.forEach((header, index) => {
      if (
        index !== nameColumnIndex &&
        index !== idColumnIndex &&
        EXCEL_ERROR.test(values[index].trim())
      )
        spreadsheetErrors.set(header, (spreadsheetErrors.get(header) || 0) + 1);
    });
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
  for (const [header, count] of spreadsheetErrors)
    warnings.push(
      `${header} 열의 스프레드시트 오류 ${count}개를 그룹 추첨에서 ${MISSING}으로 처리합니다.`,
    );
  return { rows, headers, nameColumn: headers[nameColumnIndex], warnings };
}

export function decodeParticipantBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_BYTES)
    throw new Error("CSV 파일은 10MB 이하여야 합니다.");
  if (!bytes.byteLength) throw new Error("CSV가 비어 있습니다.");

  const attempts = [];
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    attempts.push(["utf-16le", bytes.subarray(2)]);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff)
    attempts.push(["utf-16be", bytes.subarray(2)]);
  else attempts.push(["utf-8", bytes], ["euc-kr", bytes]);

  for (const [encoding, source] of attempts) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: true }).decode(source);
      if (decoded.includes("\0")) continue;
      return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
    } catch {}
  }
  throw new Error(
    "CSV 문자 인코딩을 읽을 수 없습니다. UTF-8, UTF-16 또는 CP949 파일을 사용해 주세요.",
  );
}

function isSingleCharacterDerivedField(rows, header, kind) {
  const values = rows
    .map((row) => String(row[header] ?? "").trim())
    .filter((value) => value && !EXCEL_ERROR.test(value));
  if (!values.length) return false;
  const pattern = kind === "email" ? /^[\p{L}\p{N}]$/u : /^\d$/u;
  return values.every((value) => pattern.test(value));
}

export function isSafeGroupingHeader(rows, header) {
  if (String(header).trim().startsWith("_")) return false;
  const key = aliasKey(header);
  if (NAME_ALIASES.has(key) || ID_ALIASES.has(key)) return false;
  if (/^(?:사내)?(?:이메일|메일)(?:첫|첫번째)?글자$/.test(key))
    return isSingleCharacterDerivedField(rows, header, "email");
  if (/^(?:휴대)?전화(?:번호)?(?:뒤|마지막)1자리$/.test(key))
    return isSingleCharacterDerivedField(rows, header, "phone");
  return !/(성명|이름|name|사번|참가자id|employeeid|userid|identifier|identity|주민|여권|passport|생년월일|birthdate|dob|이메일|email|메일|전화|phone|mobile|휴대폰|연락처|주소|address|거주지|메모|비고|설명|자유|freetext|comment|note|내용|fields)/i.test(
    key,
  );
}

function valueOf(row, header) {
  const raw = row[header];
  return raw === null ||
    raw === undefined ||
    String(raw).trim() === "" ||
    EXCEL_ERROR.test(String(raw).trim())
    ? MISSING
    : String(raw);
}

export function groupingFilterValue(row, header) {
  const raw = row[header];
  return raw === null ||
    raw === undefined ||
    String(raw).trim() === "" ||
    EXCEL_ERROR.test(String(raw).trim())
    ? ""
    : raw;
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
  if (
    grouped.size < 2 ||
    grouped.size > 100 ||
    (grouped.size > 7 && rows.length / grouped.size < 2)
  )
    return null;
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
      hasNumeric && unique >= 2 && unique <= 100
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
    .filter((header) => isSafeGroupingHeader(rows, header))
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
  return rows.filter((row) => selected.has(groupingFilterValue(row, column)));
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
