import {
  parseParticipants,
  decodeParticipantBytes,
  isSafeGroupingHeader,
  eligibleHeaders,
  chooseHeader,
  drawRound,
  drawSubset,
  filterPool,
  groupingFilterValue,
  createStageDeck,
} from "./lucky-draw-model.js";
import {
  STAGES,
  GROUP_STAGE_IDS,
  ShowDirector,
  Sound,
} from "./show-director.js";
import { cryptoRandomInt } from "./round-planner.js";
import {
  canUseGroupPlan,
  effectiveRoundCount,
  estimatedShowSeconds,
  fixedRoundTarget,
  normalizeScheduleConfig,
} from "./round-schedule.js";

const $ = (id) => document.getElementById(id);
const html = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const SCHEDULE_STAGE_IDS = STAGES.map((stage) => stage.id);
const DEFAULTS = {
  title: "럭키드로우",
  subtitle: "EVERYONE IN. ONE LUCKY MOMENT.",
  prize: "오늘의 행운",
  theme: "graphite",
  pace: "normal",
  reduced: false,
  schedule: normalizeScheduleConfig({}, SCHEDULE_STAGE_IDS),
};
let config = { ...DEFAULTS };
try {
  const saved = JSON.parse(
    localStorage.getItem("lucky-draw-event-v1") || "null",
  );
  if (saved && typeof saved === "object") {
    for (const key of ["title", "subtitle", "prize"])
      if (typeof saved[key] === "string")
        config[key] = saved[key].slice(0, key === "subtitle" ? 80 : 48);
    if (["graphite", "paper", "night"].includes(saved.theme))
      config.theme = saved.theme;
    if (["normal", "long"].includes(saved.pace)) config.pace = saved.pace;
    config.reduced = saved.reduced === true;
    config.schedule = normalizeScheduleConfig(
      saved.schedule,
      SCHEDULE_STAGE_IDS,
    );
  }
} catch {}
const state = {
  rows: [],
  headers: [],
  importWarnings: [],
  source: "",
  hash: "",
  demo: true,
  alive: [],
  initialN: 0,
  usedHeaders: new Set(),
  excludedHeaders: new Set(),
  history: [],
  audit: [],
  winners: [],
  winnerIds: new Set(),
  busy: false,
  loading: false,
  finalists: false,
  finished: false,
  pending: null,
  round: 0,
  sessionId: "",
  pool: { preset: "all", column: "", values: [] },
  exclude: true,
  epoch: 0,
};
let backgroundURL = null;
let backgroundPending;
let draftPreset = "all";
let draftSchedule = normalizeScheduleConfig(
  config.schedule,
  SCHEDULE_STAGE_IDS,
);
let confirmationResolve = null;
const deck = createStageDeck(GROUP_STAGE_IDS);
const sound = new Sound();
const director = new ShowDirector($("showCanvas"), {
  sound,
  onProgress: (p, label) => {
    $("raceProgress").style.width = `${Math.round(p * 100)}%`;
    $("phaseLabel").textContent = label;
  },
  onCaption: (t) => ($("sceneCaption").textContent = t),
});
const reduced = () =>
  config.reduced || matchMedia("(prefers-reduced-motion: reduce)").matches;
const fixedMode = () => config.schedule.mode === "fixed";
const effectiveRounds = () =>
  effectiveRoundCount(state.initialN, config.schedule.requestedRounds);
const roundPosition = () => state.history.length + 1;
const roundDisplay = (round = roundPosition()) =>
  fixedMode()
    ? `ROUND ${round} / ${effectiveRounds()}`
    : `ROUND ${String(round).padStart(2, "0")}`;

function applyAppearance() {
  document.body.dataset.theme = config.theme;
  $("eventTitle").textContent = config.title || "럭키드로우";
  document.title =
    config.title && config.title !== "럭키드로우"
      ? `${config.title} · 럭키드로우`
      : "럭키드로우";
  $("eventSubtitle").textContent = config.subtitle;
  $("prizeLabel").textContent = config.prize;
  director.refreshPalette();
  director.reduced = reduced();
}
function status(text, error = false) {
  $("statusText").textContent = text;
  $("statusDot").style.background = error ? "var(--danger)" : "";
}
function lock() {
  const locked = state.busy || state.loading;
  for (const id of [
    "settingsButton",
    "poolSettingsButton",
    "prepareButton",
    "demoButton",
    "csvInput",
  ])
    $(id).disabled = locked;
  $("nextButton").disabled = locked || !state.alive.length;
  $("pauseButton").hidden = !state.busy;
  $("prepareButton").hidden = state.busy;
  $("soundButton").disabled = false;
}
function initialProbability() {
  return state.initialN
    ? `모든 참가자의 시작 당첨 확률 1/${state.initialN.toLocaleString("ko")}`
    : "시작할 때 모든 참가자의 당첨 기회는 같습니다.";
}
function poolLabel() {
  if (state.pool.preset === "manager") return "매니저";
  if (state.pool.preset === "senior") return "책임매니저 이상 · 임원 포함";
  if (!state.pool.column) return "전체 참가자";
  if (!state.pool.values.length) return `${state.pool.column} · 선택 없음`;
  if (state.pool.values.length === 1)
    return `${state.pool.column} · ${state.pool.values[0] || "(미입력)"}`;
  return `${state.pool.column} · ${state.pool.values.length}개 값`;
}
function filteredRows(pool = state.pool, exclude = state.exclude) {
  let rows = state.rows;
  if (pool.preset === "manager")
    rows = rows.filter((r) => r["직위"] === "매니저");
  else if (pool.preset === "senior")
    rows = rows.filter((r) => r["직위"] && r["직위"] !== "매니저");
  else if (pool.column) rows = filterPool(rows, pool);
  return rows.filter((r) => !exclude || !state.winnerIds.has(r._id));
}
function renderCounts() {
  $("poolName").textContent = poolLabel();
  $("remainingCount").textContent = state.alive.length.toLocaleString("ko");
  $("initialCount").textContent = ` / ${state.initialN.toLocaleString("ko")}`;
  $("fairnessText").textContent = initialProbability();
  $("winnerCount").textContent = state.winners.length;
  $("demoTag").textContent = state.demo
    ? "가상 명단 · 리허설"
    : "참가자 명단 적용";
  $("demoTag").hidden = !state.demo;
}
function renderJourney() {
  const nodes = [
    { label: "시작", count: state.initialN },
    ...state.history.map((h) => ({ label: h.label, count: h.after })),
  ];
  $("journeyItems").innerHTML = nodes
    .map(
      (n, i) =>
        `<div class="journey-node ${i === nodes.length - 1 ? "current" : ""}"><span class="n">${n.count.toLocaleString("ko")}</span><span class="label">${html(n.label)}</span></div>`,
    )
    .join("");
  $("journeyItems").scrollLeft = $("journeyItems").scrollWidth;
}
function nextLabel() {
  let text = "추첨 시작";
  if (state.finished) text = "다음 당첨자 뽑기";
  else if (state.pending)
    text = state.pending.showCompleted
      ? "결과 확인"
      : state.pending.result
        ? "연출 다시 보기"
        : "경기 시작";
  else if (fixedMode() && state.alive.length === 1) text = "당첨자 공개";
  else if (fixedMode() && state.history.length < effectiveRounds())
    text = `${roundDisplay()} 시작`;
  else if (state.finalists) {
    text =
      state.alive.length > 4
        ? "최종 4명 뽑기"
        : state.alive.length > 2
          ? "최종 2명 뽑기"
          : state.alive.length > 1
            ? "마지막 추첨"
            : "당첨자 공개";
  } else if (state.alive.length <= 10 && state.alive.length)
    text = "최종 후보 공개";
  else if (state.history.length) text = "다음 라운드";
  $("nextText").textContent = text;
  lock();
}
function renderIntro() {
  $("boardEyebrow").textContent = "HOW TO PLAY";
  $("boardTitle").textContent = "함께 따라가는 추첨";
  $("boardContent").innerHTML = [
    ["내 그룹 확인", "매번 바뀌는 기준으로 같은 그룹을 함께 응원해요."],
    ["다른 게임, 다른 긴장감", "게임은 매 라운드 무작위로 바뀝니다."],
    ["마지막에 만나는 이름", "10명 이하가 남으면 이름을 공개해요."],
  ]
    .map(
      (x, i) =>
        `<div class="intro-step"><span>${String(i + 1).padStart(2, "0")}</span><div><strong>${x[0]}</strong><p>${x[1]}</p></div></div>`,
    )
    .join("");
}
function renderPlan(plan, chosen = null) {
  $("boardEyebrow").textContent = "FIND YOUR GROUP";
  $("boardTitle").textContent = `이번 기준 · ${plan.label}`;
  $("boardContent").innerHTML =
    plan.lanes
      .map(
        (l, i) =>
          `<div class="lane-card ${chosen === i ? "chosen" : chosen !== null ? "out" : ""}"><div class="lane-head"><span class="lane-key ${i ? "b" : ""}"><i></i>${i ? "B" : "A"} 편</span><span>${l.count}명</span></div><div class="lane-groups">${l.labels.map((v) => `<span class="group-label">${html(v)}</span>`).join("")}</div><p class="lane-probability">${chosen === i ? "다음 라운드 진출 · " : ""}선택 확률 ${((l.count / plan.before) * 100).toFixed(1)}%</p></div>`,
      )
      .join("") +
    `<p class="remaining-note">같은 편의 그룹은 함께 남습니다.<br>사람 수가 다른 만큼 선택 확률도 달라집니다.</p>`;
}
function renderFinalists() {
  $("boardEyebrow").textContent = "THE FINALISTS";
  $("boardTitle").textContent = state.finished
    ? "오늘의 주인공"
    : `함께 남은 ${state.alive.length}명`;
  $("boardContent").innerHTML = [...state.alive]
    .sort((a, b) => a._drawId.localeCompare(b._drawId))
    .map(
      (r) =>
        `<div class="finalist"><strong>${html(r._name)}</strong><small>${html(r._drawId)}</small></div>`,
    )
    .join("");
}
function showOverlay(eyebrow, title, details, note = "", winner = false) {
  $("revealLayer").hidden = false;
  $("revealLayer").classList.toggle("winner", winner);
  $("revealEyebrow").textContent = eyebrow;
  $("revealTitle").textContent = title;
  $("revealDetails").textContent = details;
  $("revealNote").textContent = note;
  document.querySelector(".winner-particles")?.remove();
  if (winner && !reduced()) {
    const container = document.createElement("div");
    container.className = "winner-particles";
    container.setAttribute("aria-hidden", "true");
    container.innerHTML = Array.from(
      { length: 24 },
      (_, i) =>
        `<i style="--x:${(i * 37) % 100}%;--size:${3 + (i % 4)}px;--speed:${4 + (i % 5)}s;--delay:${-i * 0.23}s"></i>`,
    ).join("");
    $("revealLayer").prepend(container);
  }
}
function hideOverlay() {
  $("revealLayer").hidden = true;
  document.querySelector(".winner-particles")?.remove();
}
function readyScene() {
  hideOverlay();
  $("arena").classList.remove("running");
  $("sceneEyebrow").textContent = "ARE YOU READY?";
  $("sceneTitle").innerHTML = "오늘의 주인공은<br><em>누구일까요?</em>";
  $("sceneDescription").innerHTML =
    "같은 그룹을 함께 응원하고,<br>마지막 한 사람을 만나보세요.";
  $("readyPill").hidden = false;
  $("readyText").textContent = state.alive.length
    ? `${state.alive.length.toLocaleString("ko")}명의 준비가 끝났습니다`
    : "현재 추첨 대상이 없습니다";
  $("roundLabel").textContent = "READY";
  $("stageLabel").textContent = "모두의 행운이 모이는 곳";
  $("phaseLabel").textContent = "준비 완료";
  $("stageCounter").textContent = fixedMode()
    ? effectiveRounds()
      ? `${effectiveRounds()} GAMES · FIXED SCHEDULE`
      : "NO ELIMINATION GAME"
    : `${GROUP_STAGE_IDS.length} GAMES · RANDOM ORDER`;
  $("raceProgress").style.width = "0";
  $("sceneCaption").textContent = "";
  director.setIdle(reduced());
}
function resetSession() {
  state.alive = [...filteredRows()];
  state.initialN = state.alive.length;
  state.usedHeaders = new Set();
  state.history = [];
  state.pending = null;
  state.finalists = false;
  state.finished = false;
  state.round = 0;
  state.sessionId = crypto.randomUUID();
  readyScene();
  renderIntro();
  renderCounts();
  renderJourney();
  nextLabel();
  status(
    state.alive.length
      ? "명단을 확인했다면, 오늘의 추첨을 시작하세요."
      : "해당 그룹에 남은 참가자가 없습니다. 행사 설정에서 대상을 바꾸세요.",
  );
}

function dateParts(value) {
  if (!/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value || "")) return null;
  const [y, m, d] = value.split(/[-/.]/).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
    ? {
        year: y,
        month: m,
        weekday: [
          "일요일",
          "월요일",
          "화요일",
          "수요일",
          "목요일",
          "금요일",
          "토요일",
        ][date.getUTCDay()],
        season:
          m <= 2 || m === 12
            ? "겨울"
            : m <= 5
              ? "봄"
              : m <= 8
                ? "여름"
                : "가을",
      }
    : null;
}
function addDerived(parsed) {
  const extras = new Set();
  for (const row of parsed.rows) {
    const b = dateParts(row["생년월일"]),
      j = dateParts(row["최초입사일"]);
    const vals = {};
    if (b) {
      Object.assign(vals, {
        "태어난 계절": b.season,
        "태어난 요일": b.weekday,
        출생월: String(b.month),
        연령대: `${Math.max(0, Math.floor((new Date().getFullYear() - b.year) / 10) * 10)}대`,
      });
    }
    if (j)
      Object.assign(vals, { "입사 계절": j.season, 입사연도: String(j.year) });
    const code = row._name.codePointAt(0) - 0xac00;
    if (code >= 0 && code < 11172)
      vals["성씨 초성"] = [
        "ㄱ",
        "ㄲ",
        "ㄴ",
        "ㄷ",
        "ㄸ",
        "ㄹ",
        "ㅁ",
        "ㅂ",
        "ㅃ",
        "ㅅ",
        "ㅆ",
        "ㅇ",
        "ㅈ",
        "ㅉ",
        "ㅊ",
        "ㅋ",
        "ㅌ",
        "ㅍ",
        "ㅎ",
      ][Math.floor(code / 588)];
    for (const [key, value] of Object.entries(vals)) {
      if (!parsed.headers.includes(key)) {
        row[key] = value;
        extras.add(key);
      }
    }
  }
  return { ...parsed, headers: [...parsed.headers, ...extras] };
}
async function digest(text) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function loadText(text, { source, demo = false }, expectedEpoch) {
  const parsed = addDerived(parseParticipants(text)),
    hash = await digest(text);
  if (expectedEpoch !== state.epoch) return;
  state.rows = parsed.rows;
  state.headers = parsed.headers;
  state.importWarnings = [...parsed.warnings];
  state.hash = hash;
  state.source = source;
  state.demo = demo;
  state.winners = [];
  state.winnerIds = new Set();
  state.audit = [];
  state.excludedHeaders = new Set();
  state.pool = { preset: "all", column: "", values: [] };
  state.exclude = true;
  deck.reset();
  resetSession();
  populateDataSettings();
  if (parsed.warnings.length)
    status(`${state.rows.length}명 준비 완료. ${parsed.warnings.join(" ")}`);
}
async function confirmAction(title, message) {
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  $("confirmDialog").showModal();
  return new Promise((resolve) => {
    confirmationResolve = resolve;
  });
}
function finishConfirmation(accepted) {
  $("confirmDialog").close();
  const fn = confirmationResolve;
  confirmationResolve = null;
  fn?.(accepted);
}
$("confirmAccept").onclick = () => finishConfirmation(true);
$("confirmCancel").onclick = () => finishConfirmation(false);
$("confirmDialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  finishConfirmation(false);
});
async function requestLoad(loader, source, demo) {
  if (state.busy || state.loading) return;
  if (state.history.length || state.winners.length || state.pending) {
    const accepted = await confirmAction(
      "새 명단으로 바꿀까요?",
      "현재 명단의 진행 상황과 당첨 기록이 지워집니다. 필요한 기록은 먼저 저장해 주세요.",
    );
    if (!accepted) return;
  }
  const epoch = ++state.epoch;
  state.loading = true;
  lock();
  $("settingsError").textContent = "";
  try {
    await loadText(await loader(), { source, demo }, epoch);
  } catch (e) {
    status(e.message, true);
    $("settingsError").textContent = e.message;
  } finally {
    if (epoch === state.epoch) {
      state.loading = false;
      nextLabel();
    }
  }
}

function candidateOptions() {
  return {
    usedHeaders: state.usedHeaders,
    allowedHeaders: state.headers.filter((h) => !state.excludedHeaders.has(h)),
  };
}
function prepareHeader() {
  const plan = chooseHeader(state.alive, candidateOptions());
  state.round++;
  if (plan) {
    const stageId = deck.next();
    state.pending = { kind: "header", plan, stageId, result: null };
    renderPlan(plan);
    showOverlay(
      `ROUND ${String(state.round).padStart(2, "0")} · 이번 기준`,
      plan.label,
      "오른쪽에서 나의 편을 확인해 주세요.",
      STAGES.find((s) => s.id === stageId).kind === "physics"
        ? "A·B 대표 공 중 먼저 골인한 편의 그룹 전체가 진출합니다."
        : "마지막에 선택 표시가 남는 편의 그룹 전체가 진출합니다.",
    );
    status("내 그룹을 확인하고, 진행자가 경기를 시작해 주세요.");
  } else {
    state.pending = {
      kind: "sealed",
      target: 10,
      stageId: "light-grid",
      result: null,
    };
    $("boardEyebrow").textContent = "EQUAL CHANCE";
    $("boardTitle").textContent = "참가번호 추첨";
    $("boardContent").innerHTML =
      '<p class="remaining-note">더 나눌 수 있는 미사용 기준이 없어, 현재 참가자 중 10명을 동일한 확률로 뽑습니다. 이름은 다음 단계에서 공개합니다.</p>';
    showOverlay(
      "ONE MORE CHANCE",
      "참가번호 추첨",
      "같은 확률로, 마지막 10명을 기다립니다.",
      "개인 이름은 아직 공개하지 않습니다.",
    );
    status("사용 가능한 기준이 없어 10명을 균등 추첨합니다.");
  }
  const stage = STAGES.find((s) => s.id === state.pending.stageId);
  $("roundLabel").textContent = `ROUND ${String(state.round).padStart(2, "0")}`;
  $("stageLabel").textContent = stage.name;
  $("stageCounter").textContent = `NEXT · ${stage.name}`;
  nextLabel();
}
function chooseFixedHeaderPlan(remaining) {
  const plans = eligibleHeaders(state.alive, candidateOptions())
    .filter((plan) => canUseGroupPlan(plan, remaining))
    .sort((a, b) => {
      const imbalanceA =
        Math.abs(a.lanes[0].count - a.lanes[1].count) / a.before;
      const imbalanceB =
        Math.abs(b.lanes[0].count - b.lanes[1].count) / b.before;
      return imbalanceA - imbalanceB || a.header.localeCompare(b.header, "ko");
    })
    .slice(0, 6);
  return plans.length ? plans[cryptoRandomInt(plans.length)] : null;
}
function defaultPersonalStage(target) {
  if (target === 1) return "last-marble";
  if (target === 2) return "twin-orbit";
  return "spotlight-cut";
}
function prepareFixedRound() {
  const total = effectiveRounds();
  const round = roundPosition();
  const remaining = total - state.history.length;
  if (state.alive.length <= 1 || remaining < 1) {
    completeWinner();
    return;
  }
  state.round = round;
  const entry = config.schedule.entries[round - 1];
  const plan =
    state.alive.length > 10 && remaining >= 3
      ? chooseFixedHeaderPlan(remaining)
      : null;
  if (plan) {
    const stageId = entry.stageId || deck.next();
    state.pending = {
      kind: "header",
      plan,
      stageId,
      duration: entry.seconds,
      fixed: true,
      result: null,
    };
    renderPlan(plan);
    showOverlay(
      `${roundDisplay(round)} · 이번 기준`,
      plan.label,
      "오른쪽에서 나의 편을 확인해 주세요.",
      STAGES.find((stage) => stage.id === stageId)?.kind === "physics"
        ? "A·B 대표 공 중 먼저 골인한 편의 그룹 전체가 진출합니다."
        : "마지막에 선택 표시가 남는 편의 그룹 전체가 진출합니다.",
    );
    status("내 그룹을 확인하고, 진행자가 경기를 시작해 주세요.");
  } else {
    const target = fixedRoundTarget(state.alive.length, remaining);
    const sealed = state.alive.length > 10;
    const stageId = sealed
      ? "light-grid"
      : entry.stageId || defaultPersonalStage(target);
    state.pending = {
      kind: sealed ? "sealed" : "final",
      target,
      stageId,
      duration: entry.seconds,
      fixed: true,
      result: null,
    };
    if (sealed) {
      $("boardEyebrow").textContent = "EQUAL CHANCE";
      $("boardTitle").textContent = "참가번호 추첨";
      $("boardContent").innerHTML =
        `<p class="remaining-note">${state.alive.length.toLocaleString("ko")}명 중 ${target.toLocaleString("ko")}명을 같은 확률로 뽑습니다.<br>개인 이름은 10명 이하가 된 뒤 공개합니다.</p>`;
      showOverlay(
        roundDisplay(round),
        "참가번호 추첨",
        `${target.toLocaleString("ko")}명이 다음 라운드로 진출합니다.`,
        "참가번호를 라이트 그리드로 공개합니다.",
      );
    } else {
      renderFinalists();
      showOverlay(
        roundDisplay(round),
        target === 1 ? "마지막 추첨" : `${target}명을 향한 추첨`,
        "남은 모든 사람에게 같은 기회가 있습니다.",
      );
    }
    status(
      `${state.alive.length.toLocaleString("ko")}명 중 ${target.toLocaleString("ko")}명을 기다립니다.`,
    );
  }
  const stage = STAGES.find((item) => item.id === state.pending.stageId);
  $("roundLabel").textContent = roundDisplay(round);
  $("stageLabel").textContent = stage?.name || "추첨";
  $("stageCounter").textContent = `NEXT · ${stage?.name || "추첨"}`;
  nextLabel();
}
function revealFinalists() {
  state.finalists = true;
  renderFinalists();
  showOverlay(
    "MEET THE FINALISTS",
    `${state.alive.length}명의 최종 후보`,
    state.alive.length <= 4
      ? state.alive.map((r) => r._name).join(" · ")
      : "지금, 이름을 확인해 주세요.",
    "이제부터 남은 사람 중 같은 확률로 추첨합니다.",
  );
  $("roundLabel").textContent = "FINALISTS";
  $("phaseLabel").textContent = "최종 후보 공개";
  status("축하합니다. 공개된 최종 후보를 함께 응원해 주세요.");
  sound.win();
  nextLabel();
}
function prepareFinal() {
  if (state.alive.length === 1) {
    completeWinner();
    return;
  }
  const n = state.alive.length > 4 ? 4 : state.alive.length > 2 ? 2 : 1;
  state.pending = {
    kind: "final",
    target: n,
    stageId: n === 4 ? "spotlight-cut" : n === 2 ? "twin-orbit" : "last-marble",
    result: null,
  };
  return runPending();
}
async function runPending() {
  const p = state.pending;
  if (!p) return;
  if (p.applied) return;
  if (!p.result) {
    p.before = [...state.alive];
    p.result =
      p.kind === "header"
        ? drawRound(p.plan)
        : {
            survivors: drawSubset(state.alive, p.target),
            before: state.alive.length,
            after: p.target,
            probability: p.target / state.alive.length,
          };
    p.committedAt = new Date().toISOString();
    p.raceSeed = crypto.getRandomValues(new Uint32Array(1))[0];
    state.audit.push({
      type: "draw_committed",
      session: state.sessionId,
      round: state.round,
      stage: p.stageId,
      kind: p.kind,
      initialN: state.initialN,
      before: p.result.before,
      after: p.result.after,
      conditionalProbability: p.result.probability,
      header: p.plan?.header,
      lanes: p.plan?.lanes.map((l) => ({ count: l.count, labels: l.labels })),
      selectedLane: p.result.lane,
      at: p.committedAt,
    });
  }
  hideOverlay();
  $("arena").classList.add("running");
  $("roundLabel").textContent = p.fixed
    ? roundDisplay(state.history.length + 1)
    : p.kind === "header"
      ? `ROUND ${String(state.round).padStart(2, "0")}`
      : p.target === 1
        ? "THE FINAL"
        : "FINAL STAGE";
  $("stageLabel").textContent = STAGES.find((s) => s.id === p.stageId).name;
  $("readyPill").hidden = true;
  $("stageCounter").textContent =
    `LIVE · ${STAGES.find((s) => s.id === p.stageId).name}`;
  let tokens;
  if (p.kind === "header")
    tokens = p.plan.lanes.map((lane, i) => ({
      id: `r${state.round}lane${i}`,
      label: `${i ? "B" : "A"}편 · ${lane.count}명`,
      lane: i,
      count: lane.count,
    }));
  else if (p.kind === "sealed")
    tokens = Array.from({ length: 6 }, (_, i) => ({
      id: `sealed-${i}`,
      label: "?",
      mark: "?",
      lane: i % 2,
      count: 1,
    }));
  else
    tokens = p.before.map((r, i) => ({
      id: r._drawId,
      label: r._name,
      mark: String(i + 1),
      lane: i % 2,
      count: 1,
    }));
  status(
    p.kind === "header"
      ? `${p.plan.label} · 나의 편을 함께 응원해 주세요.`
      : `${p.before.length}명 중 ${p.target}명을 기다립니다.`,
  );
  let meta;
  const advancingIds =
    p.kind === "header"
      ? [tokens[p.result.lane].id]
      : p.kind === "final"
        ? p.result.survivors.map((row) => row._drawId)
        : [];
  try {
    meta = await director.play(tokens, {
      stageId: p.stageId,
      duration: p.fixed ? p.duration : config.pace === "long" ? 24 : 18,
      ...(p.fixed ? { exactDuration: true } : {}),
      reduced: reduced(),
      advancingIds,
      seed: p.raceSeed,
      caption:
        STAGES.find((s) => s.id === p.stageId).kind !== "physics"
          ? "마지막에 선택 표시가 남는 공을 확인해 주세요."
          : p.kind === "header"
            ? "먼저 골인한 대표 공의 편 전체가 다음 라운드로 갑니다."
            : p.kind === "final"
              ? `먼저 골인한 ${p.target}개의 공이 진출합니다.`
              : "최종 후보를 기다립니다.",
    });
  } catch (error) {
    state.audit.push({
      type: "show_failed",
      session: state.sessionId,
      stage: p.stageId,
      reason: "render-error",
    });
    director.setIdle(reduced());
    $("arena").classList.remove("running");
    $("sceneCaption").textContent = "";
    showOverlay(
      "잠시 멈췄습니다",
      "같은 결과로 이어갑니다",
      "연출 다시 보기를 누르면 계속 진행합니다.",
      "추첨 결과는 이미 정해졌으며 다시 뽑지 않습니다.",
    );
    status(
      "화면 재생 중 문제가 생겼습니다. 정해진 결과를 유지한 채 다시 진행할 수 있습니다.",
      true,
    );
    return;
  }
  p.showCompleted = true;
  state.audit.push({
    type: "show_finished",
    session: state.sessionId,
    ...meta,
  });
  $("arena").classList.remove("running");
  $("sceneCaption").textContent = "";
  applyPending();
}
function applyPending() {
  const p = state.pending;
  if (!p?.result || p.applied) return;
  p.applied = true;
  state.alive = [...p.result.survivors];
  if (p.kind === "header") {
    state.usedHeaders.add(p.plan.header);
    renderPlan(p.plan, p.result.lane);
    showOverlay(
      `${p.fixed ? roundDisplay(state.history.length + 1) : `ROUND ${String(state.round).padStart(2, "0")}`} · 함께 남은 사람들`,
      `${state.alive.length}명, 다음 무대로`,
      p.result.selectedLabels.join(" · "),
      `${p.result.lane ? "B" : "A"} 편이 다음 라운드로 진출합니다.`,
    );
  } else if (p.kind === "sealed") {
    showOverlay(
      "GROUP STAGE COMPLETE",
      `${state.alive.length.toLocaleString("ko")}명, 다음 무대로`,
      state.alive.length <= 10
        ? "최종 후보를 공개할 준비가 끝났습니다."
        : "다음 참가번호 추첨을 이어갑니다.",
    );
  } else {
    renderFinalists();
    showOverlay(
      "ONE STEP CLOSER",
      `${state.alive.length}명, 다음 무대로`,
      state.alive.map((r) => r._name).join(" · "),
    );
  }
  const label =
    p.kind === "header"
      ? p.plan.label
      : p.kind === "sealed"
        ? "참가번호"
        : `최종 ${state.alive.length}명`;
  state.history.push({
    label,
    before: p.result.before,
    after: state.alive.length,
  });
  state.audit.push({
    type: "result_revealed",
    session: state.sessionId,
    after: state.alive.length,
    at: new Date().toISOString(),
  });
  state.pending = null;
  renderCounts();
  renderJourney();
  sound.win();
  if ((p.kind === "final" || p.fixed) && state.alive.length === 1)
    completeWinner();
  else
    status(
      state.alive.length <= 10 && !state.finalists
        ? "이제 최종 후보의 이름을 공개합니다."
        : `${state.alive.length}명이 남았습니다. 다음 순간을 함께 기다려 주세요.`,
    );
}
function completeWinner() {
  if (!state.alive.length) return;
  const person = state.alive[0];
  state.finalists = true;
  state.finished = true;
  if (!state.winners.some((w) => w.session === state.sessionId)) {
    state.winners.push({
      session: state.sessionId,
      name: person._name,
      drawId: person._drawId,
      prize: config.prize,
      pool: poolLabel(),
      initialN: state.initialN,
      at: new Date().toISOString(),
    });
    state.winnerIds.add(person._id);
    state.audit.push({
      type: "winner",
      session: state.sessionId,
      drawId: person._drawId,
      initialN: state.initialN,
      at: new Date().toISOString(),
    });
  }
  renderFinalists();
  showOverlay(
    "TODAY’S LUCKY ONE",
    person._name,
    config.prize,
    `${person._drawId} · ${poolLabel()} · 축하합니다!`,
    true,
  );
  $("roundLabel").textContent = "WINNER";
  $("phaseLabel").textContent = "당첨을 축하합니다";
  $("stageCounter").textContent = "ONE LUCKY MOMENT";
  renderCounts();
  status("오늘의 주인공입니다. 함께 박수 보내주세요!");
  sound.win();
  nextLabel();
}
async function advance() {
  if (state.busy || state.loading || !state.alive.length) return;
  if (state.finished) {
    resetSession();
    return;
  }
  state.busy = true;
  lock();
  try {
    if (state.pending) {
      if (state.pending.showCompleted) applyPending();
      else await runPending();
    } else if (fixedMode()) {
      if (state.alive.length === 1) completeWinner();
      else if (state.alive.length <= 10 && !state.finalists) revealFinalists();
      else prepareFixedRound();
    } else if (state.finalists) await prepareFinal();
    else if (state.alive.length <= 10) revealFinalists();
    else prepareHeader();
  } catch (e) {
    status(`진행 중 문제가 발생했습니다. ${e.message}`, true);
  } finally {
    state.busy = false;
    director.pause(false);
    document.body.classList.remove("is-paused");
    $("pauseButton").textContent = "잠시 멈춤";
    nextLabel();
  }
}

function safePoolHeaders() {
  return state.headers.filter(
    (h) =>
      isSafeGroupingHeader(state.rows, h) &&
      new Set(state.rows.map((r) => r[h])).size <= 100,
  );
}
function populateDataSettings() {
  $("dataStatus").textContent = state.rows.length
    ? `${state.source} · ${state.rows.length.toLocaleString("ko")}명 · 명단 준비 완료`
    : "불러온 명단이 없습니다.";
  $("dataWarnings").textContent = state.importWarnings.join(" ");
  $("dataWarnings").hidden = !state.importWarnings.length;
  $("poolColumn").innerHTML =
    '<option value="">전체 참가자</option>' +
    safePoolHeaders()
      .map((h) => `<option value="${html(h)}">${html(h)}별로 선택</option>`)
      .join("");
  $("poolColumn").value = state.pool.column;
  $("excludeWinners").checked = state.exclude;
  $("hrPresets").hidden = !state.rows.some((r) => r["직위"] === "매니저");
  draftPreset = state.pool.preset;
  populatePoolValues(state.pool.values);
  markPreset();
  const now = new Set(eligibleHeaders(state.rows).map((p) => p.header));
  $("headerChecks").innerHTML =
    state.headers
      .filter((h) => now.has(h))
      .map(
        (h) =>
          `<label><input type="checkbox" value="${html(h)}" ${state.excludedHeaders.has(h) ? "" : "checked"}>${html(h)}</label>`,
      )
      .join("") ||
    '<p class="hint">사용 가능한 그룹 기준이 없으면 참가번호로 균등 추첨합니다.</p>';
}
function markPreset() {
  document
    .querySelectorAll("[data-preset]")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.preset === draftPreset),
    );
}
function selectedPoolValues() {
  return [...document.querySelectorAll("#poolValues input:checked")].map(
    (input) => input.value,
  );
}
function draftPool() {
  return {
    preset: draftPreset,
    column: $("poolColumn").value,
    values: selectedPoolValues(),
  };
}
function updatePoolEstimate() {
  const count = filteredRows(draftPool(), $("excludeWinners").checked).length;
  $("poolEstimate").textContent =
    `적용 예상 인원 ${count.toLocaleString("ko")}명`;
  $("poolEstimate").classList.toggle("empty", count === 0);
  updateScheduleEstimate(count);
}
function updateScheduleEstimate(population) {
  if (!$("scheduleEstimate")) return;
  const count =
    population ?? filteredRows(draftPool(), $("excludeWinners").checked).length;
  if (!count) {
    $("scheduleEstimate").textContent =
      "추첨 대상을 선택하면 예상 시간을 계산합니다.";
    return;
  }
  const estimate = estimatedShowSeconds(draftSchedule, count);
  if (!estimate.rounds) {
    $("scheduleEstimate").textContent =
      "참가자가 1명이어서 별도의 탈락 게임 없이 당첨자를 공개합니다.";
    return;
  }
  const rounded = Math.round(estimate.total);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  $("scheduleEstimate").textContent =
    `실제 ${estimate.rounds}라운드 · 게임 ${estimate.playback}초 + 결과 확인 약 ${estimate.confirmation.toFixed(1)}초 · 합계 약 ${minutes ? `${minutes}분 ` : ""}${seconds}초`;
}
function renderScheduleRows() {
  draftSchedule = normalizeScheduleConfig(draftSchedule, SCHEDULE_STAGE_IDS);
  const count = draftSchedule.requestedRounds;
  const stageOptions = STAGES;
  $("scheduleRows").innerHTML = draftSchedule.entries
    .slice(0, count)
    .map(
      (entry, index) =>
        `<div class="schedule-row"><span>${index + 1}</span><label class="seconds-field"><input data-schedule-seconds="${index}" type="number" min="12" max="90" step="1" value="${entry.seconds}" aria-label="${index + 1}라운드 게임 시간"><small>초</small></label><label><select data-schedule-stage="${index}" aria-label="${index + 1}라운드 게임"><option value="">자동</option>${stageOptions.map((stage) => `<option value="${html(stage.id)}" ${entry.stageId === stage.id ? "selected" : ""}>${html(stage.name)}</option>`).join("")}</select></label></div>`,
    )
    .join("");
  $("scheduleRows")
    .querySelectorAll("[data-schedule-seconds]")
    .forEach((input) => {
      input.oninput = () => {
        draftSchedule.entries[Number(input.dataset.scheduleSeconds)].seconds =
          input.value;
        updateScheduleEstimate();
      };
    });
  $("scheduleRows")
    .querySelectorAll("[data-schedule-stage]")
    .forEach((select) => {
      select.onchange = () => {
        draftSchedule.entries[Number(select.dataset.scheduleStage)].stageId =
          select.value;
      };
    });
  updateScheduleEstimate();
}
function updateScheduleMode() {
  const fixed = $("scheduleModeInput").value === "fixed";
  draftSchedule.mode = fixed ? "fixed" : "automatic";
  $("automaticScheduleFields").hidden = fixed;
  $("fixedScheduleFields").hidden = !fixed;
  updateScheduleEstimate();
}
function populatePoolValues(selected = []) {
  const key = $("poolColumn").value;
  const counts = new Map();
  if (key)
    state.rows.forEach((row) => {
      const value = groupingFilterValue(row, key);
      counts.set(value, (counts.get(value) || 0) + 1);
    });
  const values = [...counts.keys()].sort((a, b) =>
    String(a).localeCompare(String(b), "ko"),
  );
  const checked = new Set(Array.isArray(selected) ? selected : [selected]);
  $("poolValues").innerHTML = values
    .map(
      (value) =>
        `<label><input type="checkbox" value="${html(value)}" ${checked.has(value) ? "checked" : ""}><span class="pool-value-name">${html(value || "(미입력)")}</span><span class="pool-value-count">${counts.get(value).toLocaleString("ko")}명</span></label>`,
    )
    .join("");
  $("poolValuePanel").hidden = !key;
  $("poolValues")
    .querySelectorAll("input")
    .forEach((input) => {
      input.onchange = () => {
        draftPreset = "all";
        markPreset();
        updatePoolEstimate();
      };
    });
  updatePoolEstimate();
}
function openSettings(focusPool = false) {
  if (state.busy || state.loading) return;
  for (const [id, key] of [
    ["titleInput", "title"],
    ["subtitleInput", "subtitle"],
    ["prizeInput", "prize"],
    ["paceInput", "pace"],
  ])
    $(id).value = config[key];
  document.querySelector(`input[name=theme][value="${config.theme}"]`).checked =
    true;
  $("motionInput").checked = config.reduced;
  draftSchedule = normalizeScheduleConfig(config.schedule, SCHEDULE_STAGE_IDS);
  $("scheduleModeInput").value = draftSchedule.mode;
  $("fixedRoundsInput").value = draftSchedule.requestedRounds;
  renderScheduleRows();
  updateScheduleMode();
  populateDataSettings();
  backgroundPending = undefined;
  $("settingsError").textContent = "";
  $("settingsDialog").showModal();
  if (focusPool)
    requestAnimationFrame(() => {
      $("poolFilter").scrollIntoView({ block: "center" });
      $("poolColumn").focus();
    });
}
$("settingsButton").onclick = () => openSettings();
$("poolSettingsButton").onclick = () => openSettings(true);
$("scheduleModeInput").onchange = updateScheduleMode;
$("fixedRoundsInput").oninput = () => {
  const input = $("fixedRoundsInput");
  // Let a user clear the field or type the first digit of 10–12.
  // Normalize out-of-range values only when the edit is committed.
  if (!input.value || !input.validity.valid) return;
  draftSchedule.requestedRounds = input.valueAsNumber;
  renderScheduleRows();
};
$("fixedRoundsInput").onchange = () => {
  draftSchedule.requestedRounds = $("fixedRoundsInput").value;
  draftSchedule = normalizeScheduleConfig(draftSchedule, SCHEDULE_STAGE_IDS);
  $("fixedRoundsInput").value = draftSchedule.requestedRounds;
  renderScheduleRows();
};
$("poolColumn").onchange = () => {
  draftPreset = "all";
  const values = $("poolColumn").value
    ? [
        ...new Set(
          state.rows.map((row) =>
            groupingFilterValue(row, $("poolColumn").value),
          ),
        ),
      ]
    : [];
  populatePoolValues(values);
  markPreset();
};
$("selectAllPoolValues").onclick = () => {
  $("poolValues")
    .querySelectorAll("input")
    .forEach((input) => {
      input.checked = true;
    });
  draftPreset = "all";
  markPreset();
  updatePoolEstimate();
};
$("clearPoolValues").onclick = () => {
  $("poolValues")
    .querySelectorAll("input")
    .forEach((input) => {
      input.checked = false;
    });
  draftPreset = "all";
  markPreset();
  updatePoolEstimate();
};
$("excludeWinners").onchange = updatePoolEstimate;
document.querySelectorAll("[data-preset]").forEach(
  (b) =>
    (b.onclick = () => {
      draftPreset = b.dataset.preset;
      $("poolColumn").value = "";
      populatePoolValues();
      markPreset();
      updatePoolEstimate();
    }),
);
$("settingsForm").onsubmit = async (e) => {
  e.preventDefault();
  if (state.busy || state.loading) return;
  const theme = document.querySelector("[name=theme]:checked").value;
  const next = {
    title: $("titleInput").value.trim() || "럭키드로우",
    subtitle: $("subtitleInput").value.trim(),
    prize: $("prizeInput").value.trim() || "오늘의 행운",
    theme,
    pace: $("paceInput").value,
    reduced: $("motionInput").checked,
    schedule: normalizeScheduleConfig(
      {
        ...draftSchedule,
        mode: $("scheduleModeInput").value,
        requestedRounds: $("fixedRoundsInput").value,
      },
      SCHEDULE_STAGE_IDS,
    ),
  };
  const pool = {
    preset: draftPreset,
    column: $("poolColumn").value,
    values: selectedPoolValues(),
  };
  const exclude = $("excludeWinners").checked;
  const excluded = new Set(state.excludedHeaders);
  document.querySelectorAll("#headerChecks input").forEach((c) => {
    if (c.checked) excluded.delete(c.value);
    else excluded.add(c.value);
  });
  const changesPool =
    JSON.stringify(pool) !== JSON.stringify(state.pool) ||
    exclude !== state.exclude ||
    [...excluded].sort().join("|") !==
      [...state.excludedHeaders].sort().join("|");
  const changesSchedule =
    JSON.stringify(next.schedule) !== JSON.stringify(config.schedule) ||
    (next.schedule.mode === "automatic" && next.pace !== config.pace);
  if (
    (changesPool || changesSchedule) &&
    (state.history.length || state.pending) &&
    !state.finished
  ) {
    const accepted = await confirmAction(
      "추첨 진행을 새로 준비할까요?",
      "대상 또는 라운드 설정이 바뀌어 현재 진행을 초기화합니다. 이미 발표한 당첨 기록은 유지합니다.",
    );
    if (!accepted) return;
  }
  config = next;
  state.pool = pool;
  state.exclude = exclude;
  state.excludedHeaders = excluded;
  try {
    localStorage.setItem("lucky-draw-event-v1", JSON.stringify(config));
  } catch {}
  applyAppearance();
  if (backgroundPending !== undefined) {
    if (backgroundURL) URL.revokeObjectURL(backgroundURL);
    backgroundURL = backgroundPending;
    $("eventBackground").style.backgroundImage = backgroundURL
      ? `url("${backgroundURL}")`
      : "";
    backgroundPending = undefined;
  }
  if (changesPool || changesSchedule) resetSession();
  else if (state.finished) {
    const w = state.winners.find((w) => w.session === state.sessionId);
    if (w) {
      $("revealDetails").textContent = w.prize;
    }
  }
  $("settingsDialog").close();
};
$("backgroundInput").onchange = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  ) {
    $("settingsError").textContent =
      "10MB 이하의 JPG, PNG, WebP 이미지를 선택해 주세요.";
    e.target.value = "";
    return;
  }
  if (backgroundPending) URL.revokeObjectURL(backgroundPending);
  backgroundPending = URL.createObjectURL(file);
  $("settingsError").textContent =
    "배경 이미지를 선택했습니다. 설정 적용을 눌러 주세요.";
};
$("clearBackground").onclick = () => {
  if (backgroundPending) URL.revokeObjectURL(backgroundPending);
  backgroundPending = null;
  $("backgroundInput").value = "";
  $("settingsError").textContent = "설정을 적용하면 배경 이미지가 지워집니다.";
};
$("settingsDialog").addEventListener("close", () => {
  if (backgroundPending) URL.revokeObjectURL(backgroundPending);
  backgroundPending = undefined;
});
$("csvInput").onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    $("settingsError").textContent = "CSV 파일은 10MB 이하여야 합니다.";
    e.target.value = "";
    return;
  }
  await requestLoad(
    async () => decodeParticipantBytes(await file.arrayBuffer()),
    file.name,
    false,
  );
  e.target.value = "";
};
const demoLoader = () =>
  fetch("./data/demo_participants.csv", { cache: "no-store" }).then((r) => {
    if (!r.ok)
      throw Error(
        "가상 명단을 불러오지 못했습니다. CSV 파일을 직접 선택해 주세요.",
      );
    return r.text();
  });
$("demoButton").onclick = () => requestLoad(demoLoader, "가상 명단", true);
$("prepareButton").onclick = async () => {
  if (state.busy || state.loading) return;
  if (state.history.length || state.pending) {
    if (
      !(await confirmAction(
        "다시 준비할까요?",
        "진행하던 추첨을 초기화합니다. 이미 발표한 당첨자와 제외 설정은 유지합니다.",
      ))
    )
      return;
  }
  resetSession();
};
$("nextButton").onclick = advance;
$("pauseButton").onclick = () => {
  if (!director.running) return;
  director.pause(!director.paused);
  document.body.classList.toggle("is-paused", director.paused);
  $("pauseButton").textContent = director.paused ? "이어서 진행" : "잠시 멈춤";
  status(
    director.paused
      ? "진행자가 잠시 멈췄습니다. 추첨 결과는 그대로 유지됩니다."
      : "이어서 진행합니다.",
  );
};
$("soundButton").onclick = async () => {
  await sound.enable(!sound.enabled);
  $("soundButton").textContent = sound.enabled ? "소리 켜짐" : "소리 꺼짐";
  $("soundButton").setAttribute("aria-pressed", String(sound.enabled));
  $("soundButton").title = sound.enabled ? "효과음 끄기" : "효과음 켜기";
  if (sound.enabled) sound.tone(440, 0.12);
};
async function fullScreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    status(
      "이 브라우저에서는 전체화면을 사용할 수 없습니다. 관객 화면을 그대로 이용하세요.",
    );
  }
}
$("screenButton").onclick = () => {
  document.body.classList.toggle("audience");
  $("screenButton").textContent = document.body.classList.contains("audience")
    ? "진행자 화면"
    : "관객 화면";
};
$("explainButton").onclick = () => $("infoDialog").showModal();
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
function renderRecords() {
  $("recordsList").innerHTML = state.winners.length
    ? state.winners
        .map(
          (w, i) =>
            `<div class="record-item"><div><small>${String(i + 1).padStart(2, "0")} · ${html(w.drawId)}</small><strong style="display:block">${html(w.name)}</strong><p>${html(w.pool)}</p></div><div class="record-meta"><p>${html(w.prize)}</p><small>${new Date(w.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</small></div></div>`,
        )
        .join("")
    : '<p class="remaining-note">아직 당첨자가 없습니다. 오늘의 첫 행운을 기다립니다.</p>';
  $("exportWinners").disabled = !state.winners.length;
  $("exportAudit").disabled = !state.audit.length;
}
$("recordsButton").onclick = () => {
  renderRecords();
  $("recordsDialog").showModal();
};
function download(text, type, name) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const cell = (s) => {
  let value = String(s ?? "");
  if (/^[=+\-@\t\r]/.test(value)) value = "'" + value;
  return '"' + value.replace(/"/g, '""') + '"';
};
$("exportWinners").onclick = () => {
  download(
    "\ufeff" +
      [
        [
          "순서",
          "참가번호",
          "이름",
          "경품",
          "추첨 대상",
          "시작 인원",
          "발표 시간",
        ],
        ...state.winners.map((w, i) => [
          i + 1,
          w.drawId,
          w.name,
          w.prize,
          w.pool,
          w.initialN,
          w.at,
        ]),
      ]
        .map((r) => r.map(cell).join(","))
        .join("\r\n"),
    "text/csv;charset=utf-8",
    "lucky-draw-winners.csv",
  );
};
$("exportAudit").onclick = () =>
  download(
    JSON.stringify(
      {
        app: "럭키드로우",
        version: "1.2.0",
        event: config.title,
        demo: state.demo,
        rosterSha256: state.hash,
        drawMechanism:
          "Web Crypto / population-weighted lanes / uniform final subset",
        notes:
          "공의 움직임은 결과 공개 연출이며 추첨 입력으로 사용되지 않습니다. 이름과 사번 원문은 포함하지 않습니다.",
        records: state.audit,
      },
      null,
      2,
    ),
    "application/json",
    "lucky-draw-audit.json",
  );
$("templateButton").onclick = () =>
  download(
    "\ufeff이름,참가자ID,팀,테이블,지역\r\n김하늘,001,기획팀,1,서울\r\n이바다,002,운영팀,2,부산\r\n박봄,003,기획팀,1,대전\r\n정별,004,운영팀,2,서울\r\n",
    "text/csv;charset=utf-8",
    "lucky-draw-template.csv",
  );
document.addEventListener("keydown", (e) => {
  if (
    e.repeat ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    document.querySelector("dialog[open]")
  )
    return;
  if (
    e.target.closest(
      "input,textarea,select,button,a,summary,[contenteditable=true]",
    )
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    advance();
  } else if (e.key.toLowerCase() === "f") {
    e.preventDefault();
    fullScreen();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (
    state.busy ||
    (!state.demo && (state.winners.length || state.history.length))
  ) {
    e.preventDefault();
    e.returnValue = "";
  }
});
// Read-only diagnostics for local verification. Never expose names or precommitted results.
if (["127.0.0.1", "localhost"].includes(location.hostname))
  Object.defineProperty(window, "luckyDrawQA", {
    get: () => ({
      version: "1.2.0",
      busy: state.busy,
      loading: state.loading,
      count: state.alive.length,
      initialN: state.initialN,
      finalists: state.finalists,
      finished: state.finished,
      round: state.round,
      schedule: {
        mode: config.schedule.mode,
        requestedRounds: config.schedule.requestedRounds,
        effectiveRounds: effectiveRounds(),
        completedRounds: state.history.length,
        next: config.schedule.entries[state.history.length]
          ? { ...config.schedule.entries[state.history.length] }
          : null,
      },
      stage: state.pending?.stageId || director.result?.stage,
      hasPending: !!state.pending,
      winners: state.winners.length,
      history: state.history.map((h) => ({ ...h })),
      physicsProgress: director.result?.maxProgress || 0,
      race: director.raceFrame
        ? {
            time: director.time,
            duration: director.duration,
            goalY: director.raceFrame.stage.goalY,
            camera: { ...director.raceFrame.camera },
            brokenObstacles: director.raceFrame.entities.filter(
              (e) => e.active === false,
            ).length,
            obstacles: director.raceFrame.entities.flatMap((e, index) =>
              e.def.bodyType === "kinematic"
                ? [
                    {
                      index,
                      kind: e.def.motion?.kind || "spin",
                      x: e.x,
                      y: e.y,
                      angle: e.angle,
                    },
                  ]
                : [],
            ),
            tokens: director.raceFrame.tokens.map((t) => ({
              id: t.token.id,
              x: t.x,
              y: t.y,
              arrived: t.arrived,
            })),
          }
        : null,
      audit: state.audit
        .filter((x) => x.type === "show_finished")
        .map((x) => ({ ...x })),
    }),
  });
applyAppearance();
renderIntro();
renderCounts();
renderJourney();
requestLoad(demoLoader, "가상 명단", true);
