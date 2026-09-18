export const FIXED_ROUND_MIN = 2;
export const FIXED_ROUND_MAX = 12;
export const ROUND_SECONDS_MIN = 12;
export const ROUND_SECONDS_MAX = 90;
export const DEFAULT_ROUND_SECONDS = 24;

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function normalizeStageId(value, stageIds) {
  const id = typeof value === "string" ? value : "";
  return new Set(stageIds).has(id) ? id : "";
}

export function normalizeScheduleConfig(value = {}, stageIds = []) {
  const mode = value.mode === "fixed" ? "fixed" : "automatic";
  const requestedRounds = boundedInteger(
    value.requestedRounds,
    6,
    FIXED_ROUND_MIN,
    FIXED_ROUND_MAX,
  );
  const source = Array.isArray(value.entries) ? value.entries : [];
  const entries = Array.from({ length: FIXED_ROUND_MAX }, (_, index) => ({
    seconds: boundedInteger(
      source[index]?.seconds,
      DEFAULT_ROUND_SECONDS,
      ROUND_SECONDS_MIN,
      ROUND_SECONDS_MAX,
    ),
    stageId: normalizeStageId(source[index]?.stageId, stageIds),
  }));
  return { mode, requestedRounds, entries };
}

export function effectiveRoundCount(initialN, requestedRounds) {
  const population = Math.max(0, Math.floor(Number(initialN) || 0));
  const requested = boundedInteger(
    requestedRounds,
    FIXED_ROUND_MIN,
    FIXED_ROUND_MIN,
    FIXED_ROUND_MAX,
  );
  return population <= 1 ? 0 : Math.min(requested, population - 1);
}

export function fixedRoundTarget(population, remainingRounds) {
  const n = Math.max(1, Math.floor(Number(population) || 1));
  const remaining = Math.max(1, Math.floor(Number(remainingRounds) || 1));
  if (n <= 1) return 1;
  if (remaining === 1) return 1;
  let target = Math.max(
    remaining,
    Math.min(n - 1, Math.ceil(n ** ((remaining - 1) / remaining))),
  );
  if (n > 10 && remaining <= 10) target = Math.min(target, 10);
  return Math.max(1, Math.min(n - 1, target));
}

export function canUseGroupPlan(plan, remainingRounds) {
  const remaining = Math.max(1, Math.floor(Number(remainingRounds) || 1));
  return (
    remaining >= 3 &&
    Array.isArray(plan?.lanes) &&
    plan.lanes.length === 2 &&
    plan.lanes.every((lane) => Number(lane.count) >= remaining)
  );
}

export function estimatedShowSeconds(schedule, initialN) {
  const normalized = normalizeScheduleConfig(schedule);
  const rounds = effectiveRoundCount(initialN, normalized.requestedRounds);
  const playback = normalized.entries
    .slice(0, rounds)
    .reduce((sum, entry) => sum + entry.seconds, 0);
  return {
    rounds,
    playback,
    confirmation: rounds * 1.4,
    total: playback + rounds * 1.4,
  };
}
