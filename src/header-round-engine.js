import { cryptoRandomInt, weightedGateIndex } from "./round-planner.js";

const specs = [
  { key: "실", name: "소속 실", kind: "categorical", family: "ORG", read: 5, get: (r) => r["실"] },
  { key: "팀", name: "소속 팀", kind: "categorical", family: "ORG", read: 5, get: (r) => r["팀"] },
  { key: "직무", name: "직무", kind: "categorical", family: "WORK", read: 5, get: (r) => r["직무"] },
  { key: "조직상역할", name: "조직상 역할", kind: "categorical", family: "ROLE", read: 5, get: (r) => r["조직상역할"] },
  { key: "직군", name: "직군", kind: "categorical", family: "ROLE", read: 5, get: (r) => r["직군"] },
  { key: "직위", name: "직위", kind: "categorical", family: "ROLE", read: 5, get: (r) => r["직위"] },
  { key: "출생계절", name: "태어난 계절", kind: "categorical", family: "BIRTH", read: 5, get: (r) => r._birthSeason },
  { key: "출생요일", name: "태어난 요일", kind: "categorical", family: "MYSTERY", read: 3, get: (r) => r._birthWeekday },
  { key: "입사계절", name: "입사 계절", kind: "categorical", family: "CAREER", read: 4, get: (r) => r._joinSeason },
  { key: "입사요일", name: "입사한 날의 요일", kind: "categorical", family: "MYSTERY", read: 3, get: (r) => r._joinWeekday },
  { key: "사번끝자리홀짝", name: "사번 끝자리 홀짝", kind: "categorical", family: "NUMBER", read: 4, get: (r) => r._empOddEven },
  { key: "출생연도", name: "출생연도 구간", kind: "numeric", family: "BIRTH", read: 5, get: (r) => r._birthYear, unit: "년" },
  { key: "출생월", name: "출생월 구간", kind: "numeric", family: "BIRTH", read: 5, get: (r) => r._birthMonth, unit: "월" },
  { key: "입사연도", name: "최초 입사연도 구간", kind: "numeric", family: "CAREER", read: 5, get: (r) => r._joinYear, unit: "년" },
  { key: "입사월", name: "최초 입사월 구간", kind: "numeric", family: "CAREER", read: 4, get: (r) => r._joinMonth, unit: "월" },
  { key: "근속연수", name: "근속연수 구간", kind: "numeric", family: "CAREER", read: 5, get: (r) => r._tenure, unit: "년" },
  { key: "직위연차", name: "직위연차 구간", kind: "numeric", family: "CAREER", read: 5, get: (r) => r._positionYear, unit: "년차" },
];

function normalizedEntropy(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total || counts.length < 2) return 0;
  const h = counts.reduce((sum, n) => {
    const p = n / total;
    return sum - (p > 0 ? p * Math.log2(p) : 0);
  }, 0);
  return h / Math.log2(counts.length);
}

function desiredGroupCount(n, uniqueCount) {
  const base = n > 100 ? 5 : n > 45 ? 4 : 3;
  return Math.max(2, Math.min(6, uniqueCount, base));
}

function numericLabel(min, max, unit) {
  if (min === max) return `${min}${unit}`;
  if (unit === "년차") return `${min}~${max}년차`;
  return `${min}~${max}${unit}`;
}

function categoricalGroups(rows, spec) {
  const map = new Map();
  for (const row of rows) {
    const raw = spec.get(row);
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!value) return null;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  if (map.size < 2 || map.size > 7) return null;
  return [...map.entries()]
    .map(([value, members]) => ({ value, label: value, members, count: members.length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));
}

function numericGroups(rows, spec) {
  const byValue = new Map();
  for (const row of rows) {
    const value = Number(spec.get(row));
    if (!Number.isFinite(value)) return null;
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(row);
  }
  const values = [...byValue.keys()].sort((a, b) => a - b);
  if (values.length < 2) return null;
  const k = desiredGroupCount(rows.length, values.length);
  const target = rows.length / k;
  const groups = [];
  let bucketValues = [];
  let bucketRows = [];
  let remainingGroups = k;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    bucketValues.push(value);
    bucketRows.push(...byValue.get(value));
    const remainingValues = values.length - i - 1;
    const canClose = remainingValues >= remainingGroups - 1;
    if (canClose && remainingGroups > 1 && bucketRows.length >= target * .78) {
      groups.push({
        value: `${bucketValues[0]}:${bucketValues.at(-1)}`,
        label: numericLabel(bucketValues[0], bucketValues.at(-1), spec.unit),
        members: bucketRows,
        count: bucketRows.length,
      });
      bucketValues = [];
      bucketRows = [];
      remainingGroups -= 1;
    }
  }
  if (bucketRows.length) {
    groups.push({
      value: `${bucketValues[0]}:${bucketValues.at(-1)}`,
      label: numericLabel(bucketValues[0], bucketValues.at(-1), spec.unit),
      members: bucketRows,
      count: bucketRows.length,
    });
  }
  if (groups.length < 2 || groups.length > 7) return null;
  return groups;
}

function balancedLanes(groups) {
  const lanes = [[], []];
  const totals = [0, 0];
  const sorted = [...groups].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));
  for (const group of sorted) {
    const lane = totals[0] <= totals[1] ? 0 : 1;
    const tagged = { ...group, lane };
    lanes[lane].push(tagged);
    totals[lane] += group.count;
  }
  const taggedGroups = lanes.flat().sort((a, b) => a.label.localeCompare(b.label, "ko"));
  return { lanes, totals, groups: taggedGroups };
}

function headerCandidate(rows, spec) {
  const rawGroups = spec.kind === "numeric" ? numericGroups(rows, spec) : categoricalGroups(rows, spec);
  if (!rawGroups) return null;
  const lanePlan = balancedLanes(rawGroups);
  const [a, b] = lanePlan.totals;
  const n = rows.length;
  if (!a || !b) return null;
  const imbalance = Math.abs(a - b) / n;
  if (imbalance > .30) return null;
  const counts = rawGroups.map((g) => g.count);
  const entropy = normalizedEntropy(counts);
  const groupSweetSpot = 1 - Math.min(1, Math.abs(rawGroups.length - 4) / 4);
  const balance = 1 - imbalance;
  const score = balance * 4 + entropy * 2 + groupSweetSpot * 1.2 + (spec.read / 5) * 1.3;
  return {
    feature: spec.key,
    featureName: spec.name,
    family: spec.family,
    kind: spec.kind,
    groups: lanePlan.groups,
    lanes: lanePlan.lanes,
    laneCounts: lanePlan.totals,
    laneRows: lanePlan.lanes.map((lane) => lane.flatMap((g) => g.members)),
    groupCount: rawGroups.length,
    score,
    balance,
    entropy,
  };
}

export function headerCandidates(rows, { usedFeatures = new Set() } = {}) {
  return specs
    .filter((spec) => !usedFeatures.has(spec.key))
    .map((spec) => headerCandidate(rows, spec))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

export function chooseHeaderRound(rows, { usedFeatures = new Set() } = {}) {
  const ranked = headerCandidates(rows, { usedFeatures });
  if (!ranked.length) return { selected: null, candidates: [] };
  const best = ranked[0].score;
  const finalists = ranked.filter((c) => c.score >= best - .45).slice(0, 6);
  const selected = finalists[cryptoRandomInt(finalists.length)];
  return { selected, candidates: finalists };
}

export function drawHeaderLane(round) {
  const index = weightedGateIndex(round.laneCounts);
  const total = round.laneCounts[0] + round.laneCounts[1];
  const selectedGroups = round.lanes[index];
  return {
    index,
    survivors: round.laneRows[index],
    selectedGroups,
    selectedLabels: selectedGroups.map((g) => g.label),
    probability: round.laneCounts[index] / total,
  };
}

export function headerFairnessStatement(round) {
  const n = round.laneCounts[0] + round.laneCounts[1];
  return `Gate A ${round.laneCounts[0]}/${n}, Gate B ${round.laneCounts[1]}/${n}; 선택 Gate 내 후속 추첨이 균등하면 시작 개인 확률은 1/${n}`;
}
