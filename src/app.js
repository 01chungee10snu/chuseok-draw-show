import {
  prepareRows,
  validateColumns,
  poolRows,
  assignDrawIds,
  chooseDynamicRule,
  drawRuleGate,
  uniformSubset,
  fairnessStatement,
  targetCount,
} from "./round-planner.js";

const $ = (id) => document.getElementById(id);
const els = {
  stage: $("stage"), demoBtn: $("demoBtn"), fileInput: $("fileInput"), sourceBadge: $("sourceBadge"), hashBadge: $("hashBadge"),
  survivorCount: $("survivorCount"), poolLabel: $("poolLabel"), eyebrow: $("eyebrow"), headline: $("headline"), subline: $("subline"),
  roundKicker: $("roundKicker"), roundNumber: $("roundNumber"), trajectory: $("trajectory"),
  ruleName: $("ruleName"), ruleHint: $("ruleHint"), probability: $("probability"),
  gates: $("gates"), gateA: $("gateA"), gateB: $("gateB"), gateALabel: $("gateALabel"), gateBLabel: $("gateBLabel"),
  gateACount: $("gateACount"), gateBCount: $("gateBCount"), gateAPct: $("gateAPct"), gateBPct: $("gateBPct"),
  statusBefore: $("statusBefore"), statusTarget: $("statusTarget"), statusAfter: $("statusAfter"), statusMessage: $("statusMessage"),
  survivorGrid: $("survivorGrid"), survivorCaption: $("survivorCaption"), nextBtn: $("nextBtn"), nextLabel: $("nextLabel"),
  resetBtn: $("resetBtn"), fullBtn: $("fullBtn"), soundBtn: $("soundBtn"), auditLog: $("auditLog"),
  winnerDialog: $("winnerDialog"), winnerName: $("winnerName"), winnerMeta: $("winnerMeta"), closeWinner: $("closeWinner"), fx: $("fx"),
};

const state = {
  rows: [], poolKey: "manager", pool: [], alive: [], initialN: 0, roundNo: 1,
  usedFeatures: new Set(), usedFamilies: new Set(), source: "", hash: "", audit: [], history: [], busy: false, sound: true,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => String(v).trim() !== ""));
  if (nonEmpty.length < 2) return [];
  const headers = nonEmpty[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

class SoundEngine {
  constructor() { this.ctx = null; }
  ensure() { this.ctx ||= new (window.AudioContext || window.webkitAudioContext)(); return this.ctx; }
  tone(freq = 220, dur = .08, type = "sine", gain = .035, delay = 0) {
    if (!state.sound) return;
    const ctx = this.ensure(), t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
  }
  scan() { [0,1,2,3,4,5].forEach((i) => this.tone(350 + i * 45, .05, "square", .018, i * .11)); }
  impact() { this.tone(82, .42, "sawtooth", .05); this.tone(164, .18, "triangle", .03, .02); }
  final() { [196,247,294,392].forEach((f,i) => this.tone(f,.65,"triangle",.035,i*.06)); }
}
const sound = new SoundEngine();

class FX {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext("2d"); this.p = [];
    this.resize(); window.addEventListener("resize", () => this.resize()); requestAnimationFrame(() => this.loop());
  }
  resize() { const dpr = Math.min(devicePixelRatio || 1, 2); this.c.width = innerWidth*dpr; this.c.height = innerHeight*dpr; this.c.style.width=`${innerWidth}px`; this.c.style.height=`${innerHeight}px`; this.ctx.setTransform(dpr,0,0,dpr,0,0); }
  burst(x = innerWidth*.5, y = innerHeight*.42, n = 55, warm = false) {
    for (let i=0;i<n;i+=1) this.p.push({x,y,vx:(Math.random()-.5)*10,vy:(Math.random()-.8)*9,a:1,r:1+Math.random()*2.7,warm,life:40+Math.random()*50});
  }
  loop() {
    this.ctx.clearRect(0,0,innerWidth,innerHeight);
    if (Math.random() < .15) this.p.push({x:Math.random()*innerWidth,y:innerHeight+4,vx:(Math.random()-.5)*.35,vy:-.4-Math.random()*.8,a:.22,r:.5+Math.random(),warm:false,life:130});
    this.p=this.p.filter((p)=>p.life>0&&p.a>.01);
    this.p.forEach((p)=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.025;p.life-=1;p.a*=.982;this.ctx.globalAlpha=p.a;this.ctx.fillStyle=p.warm?"#ffbd59":"#65b8ff";this.ctx.beginPath();this.ctx.arc(p.x,p.y,p.r,0,Math.PI*2);this.ctx.fill();});
    this.ctx.globalAlpha=1; requestAnimationFrame(()=>this.loop());
  }
}
const fx = new FX(els.fx);

function currentLabel() { return state.poolKey === "manager" ? "매니저" : "책임매니저 이상 · 임원 포함"; }
function aliveSet() { return new Set(state.alive.map((r) => r._id)); }

function resetGateClasses() {
  [els.gateA, els.gateB].forEach((e) => e.classList.remove("selected", "out", "spinning"));
}

function renderPeople() {
  const alive = aliveSet();
  const focus = state.alive.length <= 20;
  const list = (focus ? [...state.alive] : [...state.pool]).sort((a,b) => a._name.localeCompare(b._name,"ko") || a._drawId.localeCompare(b._drawId));
  const cols = focus ? (list.length <= 8 ? 4 : 5) : state.pool.length > 120 ? 15 : state.pool.length > 80 ? 12 : state.pool.length > 50 ? 10 : 8;
  els.survivorGrid.style.setProperty("--cols", cols);
  els.survivorGrid.innerHTML = list.map((p) => {
    const isAlive = alive.has(p._id); const finalist = focus && isAlive; const winner = state.alive.length === 1 && isAlive;
    return `<div class="person-card ${isAlive ? "" : "out"} ${finalist ? "finalist" : ""} ${winner ? "winner" : ""}" title="${p["실"]} / ${p["팀"]}"><span class="id">${p._drawId}</span><span class="nm">${p._name}</span></div>`;
  }).join("");
  els.survivorCaption.textContent = focus ? `${state.alive.length}명의 생존자만 확대 표시합니다.` : `전체 ${state.pool.length}명을 가나다순으로 유지해 본인의 생존/탈락을 찾을 수 있습니다.`;
}

function renderTrajectory() {
  const items = [{label:"START",count:state.initialN}, ...state.history.map((h,i)=>({label:h.label || `R${i+1}`,count:h.after}))];
  els.trajectory.innerHTML = items.map((x,i) => `<div class="trajectory-item ${i===items.length-1?"active":"done"}"><i>${i}</i><span>${x.label}</span><strong>${x.count}</strong></div>`).join("");
}

function renderCore() {
  els.survivorCount.textContent = state.alive.length || "—";
  els.poolLabel.textContent = state.pool.length ? `${currentLabel()} · ${state.pool.length}명` : "CSV를 불러오세요";
  els.roundNumber.textContent = String(Math.max(0,state.roundNo-1)).padStart(2,"0");
  els.probability.textContent = state.initialN ? `1 / ${state.initialN}` : "1 / N";
  if (state.initialN) els.probability.title = fairnessStatement(state.initialN);
  renderPeople(); renderTrajectory(); renderAudit();
}

function renderAudit() {
  const head = [
    `SOURCE  ${state.source || "—"}`,
    `SHA256  ${state.hash || "—"}`,
    `POOL    ${currentLabel()} / ${state.initialN || 0}`,
    state.initialN ? fairnessStatement(state.initialN) : "",
    ""
  ].filter(Boolean);
  const lines = state.audit.map((a,i) => `${String(i+1).padStart(2,"0")}  ${a}`);
  els.auditLog.textContent = [...head, ...lines].join("\n") || "No draw yet.";
}

function setRuleDisplay(rule) {
  resetGateClasses();
  const total = rule.counts[0] + rule.counts[1];
  const pA = rule.counts[0] / total, pB = rule.counts[1] / total;
  els.ruleName.textContent = rule.featureName;
  els.ruleHint.textContent = `${rule.visual} · 현재 ${total}명의 실제 분포로 방금 생성된 기준`;
  els.gateALabel.textContent = rule.labels[0]; els.gateBLabel.textContent = rule.labels[1];
  els.gateACount.textContent = `${rule.counts[0]}명`; els.gateBCount.textContent = `${rule.counts[1]}명`;
  els.gateAPct.textContent = `${(pA*100).toFixed(1)}%`; els.gateBPct.textContent = `${(pB*100).toFixed(1)}%`;
  els.gates.style.gridTemplateColumns = `${rule.counts[0]}fr 42px ${rule.counts[1]}fr`;
  els.statusBefore.textContent = total; els.statusTarget.textContent = rule.target; els.statusAfter.textContent = "?";
  els.statusMessage.textContent = "Gate 면적과 실제 선택확률은 현재 인원 비율과 동일합니다.";
}

function setNextLabel() {
  if (!state.pool.length) els.nextLabel.textContent = "START DRAW";
  else if (state.alive.length > 20) els.nextLabel.textContent = state.history.length ? "NEXT ROUND" : "START DRAW";
  else if (state.alive.length > 8) els.nextLabel.textContent = "LOCK FINAL 8";
  else if (state.alive.length > 4) els.nextLabel.textContent = "FINAL 8 → 4";
  else if (state.alive.length > 2) els.nextLabel.textContent = "FINAL 4 → 2";
  else if (state.alive.length > 1) els.nextLabel.textContent = "FINAL DRAW";
  else els.nextLabel.textContent = "SHOW WINNER";
}

function flashStage() { els.stage.classList.remove("flash"); void els.stage.offsetWidth; els.stage.classList.add("flash"); }
function shakeStage() { els.stage.classList.remove("shake"); void els.stage.offsetWidth; els.stage.classList.add("shake"); }

async function loadCSVText(text, source) {
  const raw = parseCSV(text);
  if (!raw.length) throw new Error("CSV 행을 읽지 못했습니다.");
  const check = validateColumns(raw);
  if (check.missing.length) throw new Error(`필수 컬럼 누락: ${check.missing.join(", ")}`);
  state.rows = prepareRows(raw); state.source = source; state.hash = await sha256(text);
  els.sourceBadge.textContent = source; els.hashBadge.textContent = `SHA ${state.hash.slice(0,10).toUpperCase()}`;
  applyPool();
}

function applyPool() {
  const filtered = poolRows(state.rows, state.poolKey);
  state.pool = assignDrawIds(filtered, state.poolKey); state.alive = [...state.pool]; state.initialN = state.pool.length;
  state.roundNo = 1; state.usedFeatures = new Set(); state.usedFamilies = new Set(); state.audit = []; state.history = [];
  resetGateClasses();
  els.ruleName.textContent = `${currentLabel()} ${state.pool.length}명 준비 완료`;
  els.ruleHint.textContent = "SPACE를 누르면 현재 참가자 분포에서 첫 번째 Gate를 생성합니다.";
  els.gateALabel.textContent = "READY"; els.gateBLabel.textContent = "READY"; els.gateACount.textContent="—";els.gateBCount.textContent="—";els.gateAPct.textContent="";els.gateBPct.textContent="";
  els.statusBefore.textContent = state.pool.length; els.statusTarget.textContent="—"; els.statusAfter.textContent="—"; els.statusMessage.textContent = "먼저 본인의 이름을 확인하세요. 라운드 후 탈락자는 어둡게 남습니다.";
  els.roundKicker.textContent = "READY"; els.roundNumber.textContent="00";
  els.nextBtn.disabled = !state.pool.length; setNextLabel(); renderCore();
}

async function executeDynamicRound() {
  const before = state.alive.length;
  const rule = chooseDynamicRule(state.alive, {roundNo:state.roundNo,usedFeatures:state.usedFeatures,usedFamilies:state.usedFamilies});
  if (!rule) {
    const n = Math.max(8,targetCount(before));
    const survivors = uniformSubset(state.alive,n);
    state.alive = survivors;
    state.history.push({label:"FAIR CUT",after:survivors.length});
    state.audit.push(`FALLBACK uniform ${before} → ${survivors.length}`);
    els.ruleName.textContent = "FAIR RANDOM CUT"; els.ruleHint.textContent="설명 가능한 균형 Rule이 없어 균등 무작위 축소를 사용했습니다.";
    els.statusBefore.textContent=before;els.statusTarget.textContent=n;els.statusAfter.textContent=survivors.length;
    sound.impact();fx.burst(innerWidth*.5,innerHeight*.42,45,false);renderCore();state.roundNo+=1;return;
  }

  els.roundKicker.textContent = rule.family === "MYSTERY" ? "MYSTERY ROUND" : "DYNAMIC ROUND";
  els.roundNumber.textContent = String(state.roundNo).padStart(2,"0"); setRuleDisplay(rule);
  els.gateA.classList.add("spinning"); els.gateB.classList.add("spinning"); sound.scan();
  state.audit.push(`R${state.roundNo} RULE ${rule.feature} | A=${rule.counts[0]} B=${rule.counts[1]} | target=${rule.target}`);
  await wait(850);

  const result = drawRuleGate(rule); // weighted exactly by population
  resetGateClasses();
  const selected = result.index === 0 ? els.gateA : els.gateB; const rejected = result.index === 0 ? els.gateB : els.gateA;
  selected.classList.add("selected"); rejected.classList.add("out"); sound.impact(); shakeStage(); fx.burst(result.index===0?innerWidth*.43:innerWidth*.72,innerHeight*.46,65,true);
  els.statusAfter.textContent = result.survivors.length;
  els.statusMessage.textContent = `${result.selectedLabel} 생존 · 실제 선택확률 ${(result.probability*100).toFixed(1)}%`;
  await wait(700);

  state.alive = result.survivors;
  state.usedFeatures.add(rule.feature); state.usedFamilies.add(rule.family);
  state.history.push({label:rule.featureName,after:state.alive.length});
  state.audit.push(`R${state.roundNo} SELECT ${result.index===0?"A":"B"} p=${result.probability.toFixed(4)} | ${before} → ${state.alive.length}`);
  state.roundNo += 1; flashStage(); renderCore();
}

async function executeFinalCut(target) {
  const before=state.alive.length;
  els.roundKicker.textContent = target===8 ? "FINALIST LOCK" : "FINAL STAGE";
  els.roundNumber.textContent = target===8 ? "08" : String(target).padStart(2,"0");
  els.ruleName.textContent = target===8 ? "THE LAST 8" : `FINAL ${target}`;
  els.ruleHint.textContent = "현재 생존자에서 균등 무작위 subset으로 선택합니다. 모든 생존자의 확률은 동일합니다.";
  resetGateClasses(); els.gateALabel.textContent=`FINAL ${target}`;els.gateBLabel.textContent="OUT";
  els.gateACount.textContent=`${target}명`;els.gateBCount.textContent=`${before-target}명`;els.gateAPct.textContent=`${(target/before*100).toFixed(1)}%`;els.gateBPct.textContent=`${((before-target)/before*100).toFixed(1)}%`;
  els.statusBefore.textContent=before;els.statusTarget.textContent=target;els.statusAfter.textContent="?";
  els.gateA.classList.add("spinning");els.gateB.classList.add("spinning");sound.scan();
  await wait(900);
  state.alive=uniformSubset(state.alive,target);
  resetGateClasses();els.gateA.classList.add("selected");els.gateB.classList.add("out");els.statusAfter.textContent=target;
  els.statusMessage.textContent=`${before}명 중 ${target}명 균등 무작위 생존`;
  state.history.push({label:`FINAL ${target}`,after:target});state.audit.push(`FINAL uniform subset ${before} → ${target} | per-person conditional p=${(target/before).toFixed(4)}`);
  sound.impact();fx.burst(innerWidth*.55,innerHeight*.42,target===1?120:70,true);flashStage();renderCore();
  if (target===1) await revealWinner();
}

async function revealWinner() {
  const w=state.alive[0]; sound.final(); fx.burst(innerWidth*.5,innerHeight*.35,180,true);
  els.winnerName.textContent=w._name;els.winnerMeta.textContent=`${w["실"]} · ${w["팀"]} · ${w["직위"]}`;
  els.headline.innerHTML="THE <em>WINNER</em>";els.subline.textContent=`${currentLabel()} 추첨 완료`;
  if (!els.winnerDialog.open) els.winnerDialog.showModal();
  state.audit.push(`WINNER ${w._drawId} | employee id not displayed`); renderAudit();
}

async function advance() {
  if (state.busy || !state.pool.length) return;
  state.busy=true;els.nextBtn.disabled=true;
  try {
    if (state.alive.length > 20) await executeDynamicRound();
    else if (state.alive.length > 8) await executeFinalCut(8);
    else if (state.alive.length > 4) await executeFinalCut(4);
    else if (state.alive.length > 2) await executeFinalCut(2);
    else if (state.alive.length > 1) await executeFinalCut(1);
    else await revealWinner();
  } catch (err) {
    console.error(err); els.statusMessage.textContent=`오류: ${err.message}`; state.audit.push(`ERROR ${err.message}`); renderAudit();
  } finally { state.busy=false;els.nextBtn.disabled=false;setNextLabel(); }
}

els.demoBtn.addEventListener("click", async()=>{
  try { const text=await fetch("./data/demo_participants.csv",{cache:"no-store"}).then((r)=>{if(!r.ok)throw new Error(`demo CSV ${r.status}`);return r.text();});await loadCSVText(text,"SYNTHETIC DEMO"); }
  catch(err){els.statusMessage.textContent=`데모 로드 실패: ${err.message}`;}
});
els.fileInput.addEventListener("change",async(e)=>{const f=e.target.files?.[0];if(!f)return;try{await loadCSVText(await f.text(),"LOCAL CSV · BROWSER ONLY");}catch(err){els.statusMessage.textContent=err.message;}});

document.querySelectorAll(".pool-btn").forEach((btn)=>btn.addEventListener("click",()=>{
  if(state.busy)return;document.querySelectorAll(".pool-btn").forEach((b)=>b.classList.toggle("active",b===btn));state.poolKey=btn.dataset.pool;if(state.rows.length)applyPool();
}));
els.nextBtn.addEventListener("click",advance);els.resetBtn.addEventListener("click",()=>{if(!state.busy&&state.rows.length)applyPool();});
els.fullBtn.addEventListener("click",()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen());
els.soundBtn.addEventListener("click",()=>{state.sound=!state.sound;els.soundBtn.textContent=state.sound?"SOUND ON":"SOUND OFF";if(state.sound)sound.tone(330,.08);});
els.closeWinner.addEventListener("click",()=>els.winnerDialog.close());

document.addEventListener("keydown",(e)=>{
  if(e.code==="Space"&&!e.repeat){e.preventDefault();advance();}
  if(e.key.toLowerCase()==="f"){e.preventDefault();els.fullBtn.click();}
  if(e.key.toLowerCase()==="r"&&!state.busy&&state.rows.length){e.preventDefault();applyPool();}
});

// Immediately load synthetic data so the prototype opens in a playable state.
els.demoBtn.click();
