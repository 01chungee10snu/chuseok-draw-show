const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function cryptoRandomInt(max) {
  if (!Number.isInteger(max) || max <= 0) throw new Error("max must be a positive integer");
  const range = 0x100000000;
  const limit = range - (range % max);
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= limit);
  return a[0] % max;
}

export function weightedGateIndexFromInt(sizes, x) {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (!Number.isInteger(x) || x < 0 || x >= total) throw new Error("x outside weighted range");
  let acc = 0;
  for (let i = 0; i < sizes.length; i += 1) {
    acc += sizes[i];
    if (x < acc) return i;
  }
  return sizes.length - 1;
}

export function weightedGateIndex(sizes) {
  return weightedGateIndexFromInt(sizes, cryptoRandomInt(sizes.reduce((a, b) => a + b, 0)));
}

export function cryptoShuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = cryptoRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function uniformSubset(items, n) {
  if (n >= items.length) return [...items];
  return cryptoShuffle(items).slice(0, n);
}

function dateValue(v) {
  if (!v) return null;
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function season(month) {
  if ([12, 1, 2].includes(month)) return "겨울";
  if ([3, 4, 5].includes(month)) return "봄";
  if ([6, 7, 8].includes(month)) return "여름";
  return "가을";
}

export function prepareRows(rows) {
  return rows.map((src, index) => {
    const clean = Object.fromEntries(Object.entries(src).map(([k, v]) => [String(k).trim(), String(v ?? "").trim()]));
    const birth = dateValue(clean["생년월일"]);
    const join = dateValue(clean["최초입사일"]);
    const employeeId = (clean["사번"] || `AUTO${index + 1}`).padStart(7, "0");
    const name = clean["성명"] || `참가자${index + 1}`;
    const currentYear = 2026;
    return {
      ...clean,
      _id: `${employeeId}-${index}`,
      _row: index,
      _employeeId: employeeId,
      _name: name,
      _surname: [...name][0] || "?",
      _birthYear: birth?.getFullYear() ?? null,
      _birthMonth: birth ? birth.getMonth() + 1 : null,
      _birthWeekday: birth ? WEEKDAYS[birth.getDay()] : null,
      _birthSeason: birth ? season(birth.getMonth() + 1) : null,
      _joinYear: join?.getFullYear() ?? null,
      _joinMonth: join ? join.getMonth() + 1 : null,
      _joinWeekday: join ? WEEKDAYS[join.getDay()] : null,
      _joinSeason: join ? season(join.getMonth() + 1) : null,
      _tenure: join ? Math.max(0, currentYear - join.getFullYear()) : null,
      _positionYear: Number.parseInt(clean["직위연차"], 10) || null,
      _empOddEven: /^\d{7}$/.test(employeeId) ? (Number(employeeId.at(-1)) % 2 ? "홀수" : "짝수") : null,
    };
  });
}

export function validateColumns(rows) {
  const required = ["사번", "본부", "실", "팀", "성명", "직군", "조직상역할", "직위", "직위연차", "직무", "최초입사일", "생년월일", "휴대폰번호_뒷4자리"];
  const columns = new Set(Object.keys(rows[0] || {}));
  return { required, missing: required.filter((c) => !columns.has(c)) };
}

export function poolRows(rows, poolKey) {
  if (poolKey === "manager") return rows.filter((r) => r["직위"] === "매니저");
  return rows.filter((r) => r["직위"] !== "매니저");
}

export function assignDrawIds(rows, poolKey) {
  const prefix = poolKey === "manager" ? "M" : "S";
  return [...rows]
    .sort((a, b) => a._name.localeCompare(b._name, "ko") || a._id.localeCompare(b._id))
    .map((r, i) => ({ ...r, _drawId: `${prefix}${String(i + 1).padStart(3, "0")}` }));
}

const featureSpecs = [
  { key: "실", name: "소속 실", type: "categorical", family: "ORG", read: 5, privacy: 5, visual: "ORGANIZATION GATES", get: (r) => r["실"] },
  { key: "팀", name: "소속 팀", type: "categorical", family: "ORG", read: 5, privacy: 5, visual: "TEAM CLUSTERS", get: (r) => r["팀"] },
  { key: "직군", name: "직군", type: "categorical", family: "ROLE", read: 5, privacy: 5, visual: "ROLE GATES", get: (r) => r["직군"] },
  { key: "조직상역할", name: "조직상 역할", type: "categorical", family: "ROLE", read: 5, privacy: 5, visual: "ROLE LADDER", get: (r) => r["조직상역할"] },
  { key: "직무", name: "직무", type: "categorical", family: "WORK", read: 5, privacy: 5, visual: "JOB CONSTELLATION", get: (r) => r["직무"] },
  { key: "성씨", name: "성씨", type: "categorical", family: "NAME", read: 5, privacy: 5, visual: "INITIAL REACTOR", get: (r) => r._surname },
  { key: "출생연도", name: "출생연도", type: "numeric", family: "BIRTH", read: 5, privacy: 4, visual: "BIRTH TIMELINE", get: (r) => r._birthYear },
  { key: "출생월", name: "출생월", type: "numeric", family: "BIRTH", read: 5, privacy: 4, visual: "12-MONTH DIAL", get: (r) => r._birthMonth },
  { key: "출생요일", name: "태어난 요일", type: "categorical", family: "MYSTERY", read: 2, privacy: 4, visual: "WEEKDAY MATRIX", get: (r) => r._birthWeekday },
  { key: "출생계절", name: "태어난 계절", type: "categorical", family: "BIRTH", read: 5, privacy: 4, visual: "FOUR SEASONS", get: (r) => r._birthSeason },
  { key: "입사연도", name: "최초 입사연도", type: "numeric", family: "CAREER", read: 5, privacy: 5, visual: "JOIN TIMELINE", get: (r) => r._joinYear },
  { key: "입사월", name: "최초 입사월", type: "numeric", family: "CAREER", read: 4, privacy: 5, visual: "JOIN MONTH DIAL", get: (r) => r._joinMonth },
  { key: "입사요일", name: "입사한 날의 요일", type: "categorical", family: "MYSTERY", read: 2, privacy: 5, visual: "FIRST-DAY MATRIX", get: (r) => r._joinWeekday },
  { key: "입사계절", name: "입사 계절", type: "categorical", family: "CAREER", read: 4, privacy: 5, visual: "JOIN SEASONS", get: (r) => r._joinSeason },
  { key: "근속연수", name: "근속연수", type: "numeric", family: "CAREER", read: 5, privacy: 5, visual: "TENURE SCALE", get: (r) => r._tenure },
  { key: "직위연차", name: "직위연차", type: "numeric", family: "CAREER", read: 5, privacy: 5, visual: "POSITION YEAR SCALE", get: (r) => r._positionYear },
  { key: "사번끝자리홀짝", name: "사번 끝자리 홀짝", type: "categorical", family: "NUMBER", read: 4, privacy: 3, visual: "ODD / EVEN", get: (r) => r._empOddEven },
];

const stagePreference = {
  1: { ORG: 1, WORK: .9, ROLE: .7, NAME: .6, CAREER: .45, BIRTH: .35, MYSTERY: .05, NUMBER: .15 },
  2: { CAREER: 1, BIRTH: .85, WORK: .55, ORG: .5, ROLE: .45, NAME: .45, MYSTERY: .25, NUMBER: .25 },
  3: { BIRTH: 1, MYSTERY: .82, NAME: .76, CAREER: .58, WORK: .35, ORG: .25, ROLE: .25, NUMBER: .35 },
  4: { NAME: .95, NUMBER: .85, MYSTERY: .82, BIRTH: .72, CAREER: .55, WORK: .3, ORG: .25, ROLE: .25 },
};

export function targetCount(n) {
  if (n > 100) return Math.round(n * .52);
  if (n > 50) return Math.round(n * .50);
  if (n > 24) return Math.round(n * .47);
  if (n > 20) return Math.round(n * .50);
  return n;
}

function quantileCut(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const unique = [...new Set(sorted)];
  if (unique.length < 2) return null;
  let idx = Math.max(0, Math.min(sorted.length - 2, Math.round(q * (sorted.length - 1))));
  let cut = sorted[idx];
  if (cut >= unique.at(-1)) cut = unique.at(-2);
  return cut;
}

function numericLabels(key, cut) {
  if (["출생연도", "입사연도"].includes(key)) return [`${cut}년 이하`, `${cut + 1}년 이상`];
  if (["출생월", "입사월"].includes(key)) return [`${cut}월 이하`, `${cut + 1}월 이상`];
  if (key === "근속연수") return [`${cut}년 이하`, `${cut + 1}년 이상`];
  if (key === "직위연차") return [`${cut}년차 이하`, `${cut + 1}년차 이상`];
  return [`${cut} 이하`, `${cut} 초과`];
}

function countsBy(rows, get) {
  const m = new Map();
  rows.forEach((r) => {
    const v = get(r);
    if (v === null || v === undefined || v === "") return;
    m.set(String(v), (m.get(String(v)) || 0) + 1);
  });
  return m;
}

function balancedCategories(rows, spec) {
  const counts = countsBy(rows, spec.get);
  if (counts.size < 2) return null;
  const items = [...counts.entries()].map(([value, count]) => ({ value, count, tie: cryptoRandomInt(1_000_000) }));
  items.sort((a, b) => b.count - a.count || a.tie - b.tie);
  const gates = [[], []];
  const totals = [0, 0];
  items.forEach((item) => {
    const g = totals[0] <= totals[1] ? 0 : 1;
    gates[g].push(item.value);
    totals[g] += item.count;
  });
  if (!gates[0].length || !gates[1].length) return null;
  return { gates, totals };
}

function compactValues(values) {
  if (values.length <= 4) return values.join(" · ");
  return `${values.slice(0, 3).join(" · ")} 외 ${values.length - 3}`;
}

function makeCandidate(rows, spec, a, b, labels, target) {
  return {
    feature: spec.key,
    featureName: spec.name,
    family: spec.family,
    visual: spec.visual,
    read: spec.read,
    privacy: spec.privacy,
    groups: [a, b],
    labels,
    counts: [a.length, b.length],
    target,
  };
}

function candidatesFor(rows) {
  const target = targetCount(rows.length);
  const result = [];
  for (const spec of featureSpecs) {
    const usable = rows.filter((r) => {
      const v = spec.get(r);
      return v !== null && v !== undefined && v !== "";
    });
    if (usable.length !== rows.length) continue;
    const unique = new Set(usable.map((r) => String(spec.get(r))));
    if (unique.size < 2) continue;

    if (spec.type === "numeric") {
      const values = usable.map(spec.get);
      const cuts = [...new Set([.45, .50, .55].map((q) => quantileCut(values, q)).filter((x) => x !== null))];
      cuts.forEach((cut) => {
        const a = rows.filter((r) => spec.get(r) <= cut);
        const b = rows.filter((r) => spec.get(r) > cut);
        if (a.length && b.length) result.push(makeCandidate(rows, spec, a, b, numericLabels(spec.key, cut), target));
      });
    } else {
      const partition = balancedCategories(rows, spec);
      if (!partition) continue;
      const setA = new Set(partition.gates[0]);
      const a = rows.filter((r) => setA.has(String(spec.get(r))));
      const b = rows.filter((r) => !setA.has(String(spec.get(r))));
      result.push(makeCandidate(rows, spec, a, b, [compactValues(partition.gates[0]), compactValues(partition.gates[1])], target));
    }
  }
  return result;
}

function score(candidate, rows, roundNo, usedFeatures, usedFamilies) {
  if (usedFeatures.has(candidate.feature)) return -Infinity;
  const n = rows.length;
  const min = Math.min(...candidate.counts);
  const max = Math.max(...candidate.counts);
  if (min < Math.max(2, Math.floor(n * .32)) || max > Math.ceil(n * .68)) return -Infinity;
  const worstError = Math.max(...candidate.counts.map((x) => Math.abs(x - candidate.target))) / Math.max(1, candidate.target);
  const fit = 1 - worstError;
  const pref = (stagePreference[Math.min(roundNo, 4)] || stagePreference[4])[candidate.family] ?? .35;
  const familyNovel = usedFamilies.has(candidate.family) ? -.12 : .38;
  const labelPenalty = Math.max(...candidate.labels.map((x) => x.length)) > 34 ? .15 : 0;
  return 4 * fit + 1.4 * (candidate.read / 5) + .65 * (candidate.privacy / 5) + .9 * pref + familyNovel - labelPenalty;
}

export function chooseDynamicRule(rows, { roundNo = 1, usedFeatures = new Set(), usedFamilies = new Set() } = {}) {
  const ranked = candidatesFor(rows)
    .map((candidate) => ({ candidate, score: score(candidate, rows, roundNo, usedFeatures, usedFamilies) }))
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const topScore = ranked[0].score;
  const top = ranked.filter((x) => x.score >= topScore - .2).slice(0, 5);
  return top[cryptoRandomInt(top.length)].candidate;
}

export function drawRuleGate(rule) {
  const index = weightedGateIndex(rule.counts);
  return {
    index,
    survivors: rule.groups[index],
    selectedLabel: rule.labels[index],
    probability: rule.counts[index] / rule.counts.reduce((a, b) => a + b, 0),
  };
}

export function fairnessStatement(initialN) {
  return `모든 개인의 시작 시점 최종 당첨확률 = 1/${initialN} (${(100 / initialN).toFixed(3)}%)`;
}
