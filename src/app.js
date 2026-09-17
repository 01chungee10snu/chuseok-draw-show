import {
  prepareRows,
  validateColumns,
  poolRows,
  assignDrawIds,
  uniformSubset,
  fairnessStatement,
} from "./round-planner.js";
import {
  chooseHeaderRound,
  drawHeaderLane,
  headerFairnessStatement,
} from "./header-round-engine.js";

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
  marbleShow: $("marbleShow"), marbleCanvas: $("marbleCanvas"), marbleMode: $("marbleMode"), marbleRule: $("marbleRule"),
  rouletteRing: $("rouletteRing"), rouletteNeedle: $("rouletteNeedle"), roulettePhase: $("roulettePhase"), rouletteValue: $("rouletteValue"),
  marbleGateA: $("marbleGateA"), marbleGateB: $("marbleGateB"), marbleGateACount: $("marbleGateACount"), marbleGateBCount: $("marbleGateBCount"), marbleResult: $("marbleResult"),
  groupDeck: $("groupDeck"), indexLabel: $("indexLabel"), indexLegend: $("indexLegend"),
};

const state = {
  rows: [], poolKey: "manager", pool: [], alive: [], initialN: 0, roundNo: 1,
  usedFeatures: new Set(), usedFamilies: new Set(), source: "", hash: "", audit: [], history: [], busy: false, sound: true,
  currentRound: null, currentResult: null, identityRevealed: false,
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
  roulette(durationMs = 3200) {
    const seconds = durationMs / 1000;
    const ticks = 27;
    for (let i = 0; i < ticks; i += 1) {
      const u = i / (ticks - 1);
      const delay = seconds * (.50 * u + .50 * u * u);
      this.tone(510 - u * 160, .035 + u * .025, "square", .014 + u * .01, delay);
    }
    this.tone(48, Math.min(2.4, seconds * .76), "sine", .012, .08);
  }
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

class MarbleArena {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.token = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(els.marbleShow);
  }
  resize() {
    const rect = els.marbleShow.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.width = w; this.height = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  modeFor(family, total) {
    if (family === "FINAL") return total <= 8 ? "DUEL LOCK" : "FINALIST LOCK";
    if (["BIRTH", "MYSTERY"].includes(family)) return "PLINKO DROP";
    if (["NAME", "NUMBER"].includes(family)) return "REACTOR SPIN";
    if (family === "CAREER") return "GEAR RUN";
    return "VORTEX GATE";
  }
  drawBackdrop(mode, t) {
    const c = this.ctx, w = this.width, h = this.height, cx = w / 2, cy = h * .50;
    c.save();
    c.globalAlpha = .38;
    c.strokeStyle = mode === "PLINKO DROP" ? "#35516f" : "#28415d";
    c.lineWidth = 1;
    if (mode === "PLINKO DROP") {
      for (let y = 72; y < h - 40; y += 42) {
        for (let x = 44 + ((Math.round(y / 42) % 2) * 20); x < w - 40; x += 40) {
          c.fillStyle = "rgba(122,167,207,.38)";
          c.beginPath(); c.arc(x, y, 2.1, 0, Math.PI * 2); c.fill();
        }
      }
    } else {
      for (let r = Math.min(w, h) * .16; r < Math.min(w, h) * .54; r += Math.min(w, h) * .095) {
        c.beginPath(); c.ellipse(cx, cy, r, r * .48, 0, 0, Math.PI * 2); c.stroke();
      }
      if (mode === "GEAR RUN") {
        for (let i = 0; i < 32; i += 1) {
          const a = i / 32 * Math.PI * 2 + t * 2;
          const r1 = Math.min(w, h) * .44, r2 = r1 + (i % 2 ? 8 : 15);
          c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * .50);
          c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * .50); c.stroke();
        }
      }
    }
    c.restore();
  }
  makeMarbles(groups) {
    const all = [];
    groups.forEach((group, gi) => group.forEach((row, idx) => {
      const seed = (idx * 37 + gi * 101) % 997;
      all.push({
        row, group: gi, idx,
        angle: (seed / 997) * Math.PI * 2,
        radius: .22 + ((seed * 13) % 100) / 100 * .24,
        speed: .78 + ((seed * 17) % 100) / 100 * .48,
        phase: ((seed * 23) % 100) / 100 * Math.PI * 2,
        x0: ((seed * 29) % 100) / 100,
      });
    }));
    return all;
  }
  drawMarbles(marbles, selectedIndex, mode, t, selectedRows) {
    const c = this.ctx, w = this.width, h = this.height, cx = w / 2, cy = h * .50;
    const total = marbles.length;
    const selectedOrder = new Map(selectedRows.map((r, i) => [r._id, i]));
    const selectedN = selectedRows.length;
    const radius = total > 120 ? 3.0 : total > 70 ? 3.8 : total > 30 ? 4.7 : total > 12 ? 6.0 : 8.0;
    const motionT = Math.min(1, t / .78);
    const revealT = Math.max(0, Math.min(1, (t - .72) / .28));
    const ease = revealT * revealT * (3 - 2 * revealT);

    for (const m of marbles) {
      let x, y;
      if (mode === "PLINKO DROP") {
        const lane = .08 + m.x0 * .84;
        x = lane * w + Math.sin(m.phase + motionT * 18) * (10 + radius * 1.8);
        y = -20 + motionT * h * .92 + Math.abs(Math.sin(m.phase + motionT * 14)) * 11;
      } else {
        const dir = m.group === 0 ? 1 : -1;
        const spin = mode === "REACTOR SPIN" ? 17 : mode === "GEAR RUN" ? 13 : 11;
        const a = m.angle + motionT * spin * m.speed * dir;
        const rr = Math.min(w, h) * m.radius * (1 + .08 * Math.sin(m.phase + motionT * 10));
        x = cx + Math.cos(a) * rr;
        y = cy + Math.sin(a) * rr * .52;
      }

      let alpha = .92;
      let fill = m.group === 0 ? "#56c6ff" : "#ff9f43";
      if (revealT > 0) {
        if (m.group === selectedIndex) {
          const ord = selectedOrder.get(m.row._id) ?? 0;
          let tx, ty;
          if (selectedN <= 8) {
            const spread = Math.min(84, w * .62 / Math.max(1, selectedN - 1));
            tx = cx + (ord - (selectedN - 1) / 2) * spread;
            ty = h * .70 + Math.sin(ord * 1.7) * 8;
          } else {
            const col = ord % Math.max(4, Math.ceil(Math.sqrt(selectedN * 1.6)));
            const cols = Math.max(4, Math.ceil(Math.sqrt(selectedN * 1.6)));
            const row = Math.floor(ord / cols);
            tx = w * .28 + (col / Math.max(1, cols - 1)) * w * .44;
            ty = h * .64 + row * 10;
          }
          x = x + (tx - x) * ease; y = y + (ty - y) * ease;
          fill = "#ffd166"; alpha = 1;
        } else {
          const side = m.group === 0 ? .18 : .82;
          x = x + (w * side - x) * ease;
          y = y + ((h * 1.18) - y) * ease;
          alpha = Math.max(.03, 1 - ease * .96);
          fill = "#5f6874";
        }
      }

      c.save();
      c.globalAlpha = alpha;
      c.fillStyle = fill;
      if (m.group === selectedIndex && revealT > .35) {
        c.shadowBlur = 12; c.shadowColor = "rgba(255,205,96,.7)";
      }
      c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill();
      c.globalAlpha = alpha * .65;
      c.fillStyle = "#ffffff";
      c.beginPath(); c.arc(x - radius * .3, y - radius * .32, Math.max(1, radius * .28), 0, Math.PI * 2); c.fill();
      c.restore();

      if (selectedN <= 8 && m.group === selectedIndex && revealT > .55) {
        c.save(); c.globalAlpha = Math.min(1, (revealT - .55) * 3.5);
        c.fillStyle = "#fff5d8"; c.font = "700 11px system-ui, sans-serif"; c.textAlign = "center";
        c.fillText(`${m.row._drawId} ${m.row._name}`, x, y - radius - 10); c.restore();
      }
    }
  }
  async play({ groups, labels, selectedIndex, featureName, family, visual, subset = false, final = false }) {
    const token = ++this.token;
    const total = groups[0].length + groups[1].length;
    const mode = this.modeFor(family, total);
    const duration = final ? 3900 : subset ? 3400 : 3200;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const actualDuration = reduced ? 650 : duration;
    const split = groups[0].length / Math.max(1, total);
    const splitDeg = split * 360;
    const targetDeg = selectedIndex === 0 ? Math.max(8, splitDeg * .52) : splitDeg + Math.max(8, (360 - splitDeg) * .52);
    const turns = final ? 8 : 6;

    els.marbleShow.dataset.mode = mode;
    els.marbleShow.classList.add("active");
    els.marbleShow.setAttribute("aria-hidden", "false");
    els.groupDeck.innerHTML = "";
    els.marbleMode.textContent = mode;
    els.marbleRule.textContent = `${featureName} · ${visual}`;
    els.marbleGateA.textContent = labels[0]; els.marbleGateB.textContent = labels[1];
    els.marbleGateACount.textContent = `${groups[0].length}명`; els.marbleGateBCount.textContent = `${groups[1].length}명`;
    els.roulettePhase.textContent = subset ? "RANDOM LOCK" : "RULE LOCK";
    els.rouletteValue.textContent = `${total}`;
    els.marbleResult.textContent = subset ? "FINALISTS IN MOTION" : "MARBLES IN MOTION";
    els.rouletteRing.style.background = `conic-gradient(from -90deg, #2f9cdf 0deg ${splitDeg}deg, #f39b38 ${splitDeg}deg 360deg)`;
    this.resize();

    els.rouletteNeedle.getAnimations().forEach((a) => a.cancel());
    els.rouletteNeedle.animate(
      [{ transform: "rotate(0deg)" }, { transform: `rotate(${turns * 360 + targetDeg}deg)` }],
      { duration: actualDuration * .88, easing: "cubic-bezier(.10,.62,.14,1)", fill: "forwards" }
    );
    sound.roulette(actualDuration * .88);

    const marbles = this.makeMarbles(groups);
    const selectedRows = groups[selectedIndex];
    const start = performance.now();
    let lastPhase = "";
    await new Promise((resolve) => {
      const frame = (now) => {
        if (token !== this.token) { resolve(); return; }
        const t = Math.min(1, (now - start) / actualDuration);
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawBackdrop(mode, t);
        this.drawMarbles(marbles, selectedIndex, mode, t, selectedRows);
        const phase = t < .18 ? (subset ? "RANDOM LOCK" : "RULE LOCK") : t < .72 ? "FULL SPEED" : t < .93 ? "FINAL SPIN" : "GATE LOCKED";
        if (phase !== lastPhase) {
          lastPhase = phase; els.roulettePhase.textContent = phase;
          if (phase === "FINAL SPIN") els.marbleResult.textContent = "DON'T BLINK";
          if (phase === "GATE LOCKED") {
            els.rouletteValue.textContent = selectedIndex === 0 ? "A" : "B";
            els.marbleResult.textContent = subset ? `${selectedRows.length} LOCKED` : `${selectedRows.length} SURVIVE`;
          }
        }
        if (t < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });

    sound.impact();
    shakeStage();
    fx.burst(innerWidth * .5, innerHeight * .46, final ? 110 : 72, true);
    await wait(reduced ? 120 : 520);
    els.marbleShow.classList.remove("active");
    els.marbleShow.setAttribute("aria-hidden", "true");
    await wait(reduced ? 60 : 260);
  }
  renderGroupDeck(round, selectedLane = null) {
    els.groupDeck.innerHTML = round.groups.map((group) => {
      const stateClass = selectedLane === null ? "" : (group.lane === selectedLane ? "survive" : "out");
      return `<div class="group-chip lane-${group.lane} ${stateClass}" data-lane="${group.lane}"><span>${group.label}</span><strong>${group.count}</strong><small>명</small></div>`;
    }).join("");
  }
  drawValueGroupMarbles(round, selectedLane, t) {
    const c = this.ctx, w = this.width, h = this.height, cx = w / 2, cy = h * .49;
    const groups = round.groups;
    const maxCount = Math.max(...groups.map((g) => g.count));
    const revealT = Math.max(0, Math.min(1, (t - .68) / .32));
    const ease = revealT * revealT * (3 - 2 * revealT);
    const selected = groups.filter((g) => g.lane === selectedLane);
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i];
      const seed = (i * 137 + g.count * 31) % 997;
      const baseAngle = (i / groups.length) * Math.PI * 2 + (seed / 997) * .35;
      const dir = g.lane === 0 ? 1 : -1;
      const a = baseAngle + t * Math.PI * 8 * dir;
      const orbit = Math.min(w, h) * (.23 + (i % 3) * .035);
      let x = cx + Math.cos(a) * orbit;
      let y = cy + Math.sin(a) * orbit * .50;
      let alpha = 1;
      const radius = 25 + Math.sqrt(g.count / maxCount) * 22;
      if (revealT > 0) {
        if (g.lane === selectedLane) {
          const ord = selected.indexOf(g);
          const span = Math.min(w * .58, 150 * Math.max(1, selected.length - 1));
          const tx = selected.length === 1 ? cx : cx - span / 2 + (span * ord) / (selected.length - 1);
          const ty = h * .69 + Math.sin(ord * 1.9) * 8;
          x += (tx - x) * ease;
          y += (ty - y) * ease;
        } else {
          const tx = g.lane === 0 ? w * .10 : w * .90;
          x += (tx - x) * ease;
          y += (h * 1.16 - y) * ease;
          alpha = Math.max(.04, 1 - ease * .95);
        }
      }

      c.save();
      c.globalAlpha = alpha;
      const fill = g.lane === selectedLane && revealT > .2 ? "#ffd166" : g.lane === 0 ? "#49bff8" : "#f39b38";
      c.fillStyle = fill;
      c.shadowBlur = g.lane === selectedLane && revealT > .25 ? 24 : 10;
      c.shadowColor = fill;
      c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill();
      c.globalAlpha = alpha * .38;
      c.fillStyle = "#fff";
      c.beginPath(); c.arc(x - radius * .28, y - radius * .30, Math.max(4, radius * .22), 0, Math.PI * 2); c.fill();
      c.globalAlpha = alpha;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = "#07101a"; c.font = `900 ${Math.max(12, Math.min(17, radius * .42))}px system-ui, sans-serif`;
      const short = g.label.length > 10 ? `${g.label.slice(0, 9)}…` : g.label;
      c.fillText(short, x, y - 2);
      c.font = "800 11px system-ui, sans-serif";
      c.fillText(`${g.count}명`, x, y + 15);
      c.restore();
    }
  }
  async playHeaderRound(round, result, candidates) {
    const token = ++this.token;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const total = round.laneCounts[0] + round.laneCounts[1];
    const headerMs = reduced ? 180 : 1050;
    const raceMs = reduced ? 650 : 3100;

    els.marbleShow.classList.add("active");
    els.marbleShow.setAttribute("aria-hidden", "false");
    this.resize();
    els.marbleMode.textContent = "HEADER ROULETTE";
    els.marbleRule.textContent = "SELECT NEXT HEADER";
    els.roulettePhase.textContent = "HEADER SCAN";
    els.rouletteValue.textContent = "?";
    els.marbleResult.textContent = `${candidates.length} ELIGIBLE HEADERS`;
    els.marbleGateA.textContent = "WAIT"; els.marbleGateB.textContent = "WAIT";
    els.marbleGateACount.textContent = "—"; els.marbleGateBCount.textContent = "—";
    els.groupDeck.innerHTML = candidates.map((c) => `<div class="header-chip">${c.featureName}</div>`).join("");
    els.rouletteRing.style.background = "conic-gradient(from -90deg,#38516d 0 45deg,#15283c 45deg 90deg,#38516d 90deg 135deg,#15283c 135deg 180deg,#38516d 180deg 225deg,#15283c 225deg 270deg,#38516d 270deg 315deg,#15283c 315deg 360deg)";
    els.rouletteNeedle.getAnimations().forEach((a) => a.cancel());
    els.rouletteNeedle.animate([{ transform:"rotate(0deg)" },{ transform:"rotate(1440deg)" }],{ duration:headerMs,easing:"cubic-bezier(.18,.76,.18,1)",fill:"forwards" });
    sound.scan();
    let idx = 0;
    const timer = setInterval(() => {
      if (token !== this.token) return;
      const c = candidates[idx % candidates.length];
      els.marbleRule.textContent = c.featureName;
      idx += 1;
    }, reduced ? 45 : 95);
    await wait(headerMs);
    clearInterval(timer);
    if (token !== this.token) return;

    els.marbleRule.textContent = round.featureName;
    els.roulettePhase.textContent = "HEADER LOCKED";
    els.rouletteValue.textContent = `${round.groupCount}`;
    els.marbleResult.textContent = `${round.groupCount} UNIQUE GROUPS CREATED`;
    sound.impact();
    this.renderGroupDeck(round);
    await wait(reduced ? 80 : 380);

    const split = round.laneCounts[0] / total;
    const splitDeg = split * 360;
    const targetDeg = result.index === 0 ? Math.max(8, splitDeg * .52) : splitDeg + Math.max(8, (360 - splitDeg) * .52);
    els.marbleMode.textContent = this.modeFor(round.family, round.groupCount);
    els.marbleRule.textContent = `${round.featureName} · UNIQUE VALUE RACE`;
    els.marbleGateA.textContent = compactGroupLabels(round.lanes[0]);
    els.marbleGateB.textContent = compactGroupLabels(round.lanes[1]);
    els.marbleGateACount.textContent = `${round.laneCounts[0]}명`;
    els.marbleGateBCount.textContent = `${round.laneCounts[1]}명`;
    els.rouletteRing.style.background = `conic-gradient(from -90deg, #2f9cdf 0deg ${splitDeg}deg, #f39b38 ${splitDeg}deg 360deg)`;
    els.rouletteNeedle.getAnimations().forEach((a) => a.cancel());
    els.rouletteNeedle.animate([{ transform:"rotate(0deg)" },{ transform:`rotate(${6 * 360 + targetDeg}deg)` }],{ duration:raceMs * .88,easing:"cubic-bezier(.10,.62,.14,1)",fill:"forwards" });
    sound.roulette(raceMs * .88);

    const start = performance.now();
    let lastPhase = "";
    await new Promise((resolve) => {
      const frame = (now) => {
        if (token !== this.token) { resolve(); return; }
        const t = Math.min(1, (now - start) / raceMs);
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawBackdrop(this.modeFor(round.family, round.groupCount), t);
        this.drawValueGroupMarbles(round, result.index, t);
        const phase = t < .16 ? "GROUP LAUNCH" : t < .68 ? "FULL SPEED" : t < .92 ? "FINAL SPIN" : "GATE LOCKED";
        if (phase !== lastPhase) {
          lastPhase = phase; els.roulettePhase.textContent = phase;
          if (phase === "FINAL SPIN") els.marbleResult.textContent = "WHICH GROUPS SURVIVE?";
          if (phase === "GATE LOCKED") {
            els.rouletteValue.textContent = result.index === 0 ? "A" : "B";
            els.marbleResult.textContent = `${result.survivors.length} SURVIVE`;
            this.renderGroupDeck(round, result.index);
          }
        }
        if (t < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });

    sound.impact(); shakeStage(); fx.burst(innerWidth * .5, innerHeight * .46, 82, true);
    await wait(reduced ? 120 : 620);
    els.marbleShow.classList.remove("active");
    els.marbleShow.setAttribute("aria-hidden", "true");
    await wait(reduced ? 60 : 220);
  }
  playSubset(allRows, survivors, label, final = false) {
    const survivorIds = new Set(survivors.map((r) => r._id));
    const out = allRows.filter((r) => !survivorIds.has(r._id));
    return this.play({ groups: [survivors, out], labels: [label, "OUT"], selectedIndex: 0, featureName: label, family: "FINAL", visual: final ? "LAST MARBLE" : "RANDOM MARBLE LOCK", subset: true, final });
  }
}
const marbleArena = new MarbleArena(els.marbleCanvas);

function currentLabel() { return state.poolKey === "manager" ? "매니저" : "책임매니저 이상 · 임원 포함"; }
function aliveSet() { return new Set(state.alive.map((r) => r._id)); }

function resetGateClasses() {
  [els.gateA, els.gateB].forEach((e) => e.classList.remove("selected", "out", "spinning"));
}

function renderPeople() {
  if (!state.identityRevealed) {
    const n = state.alive.length;
    const dots = Array.from({ length: n }, (_, i) => `<i style="--d:${i % 11}"></i>`).join("");
    els.indexLabel.textContent = "GROUP SURVIVOR INDEX";
    els.indexLegend.innerHTML = `<i></i> GROUP SURVIVE <i class="out"></i> IDENTITY SEALED`;
    els.survivorGrid.classList.add("sealed-population");
    els.survivorGrid.style.setProperty("--cols", Math.min(25, Math.max(10, Math.ceil(Math.sqrt(n * 2.5)))));
    els.survivorGrid.innerHTML = `<div class="sealed-summary"><span>IDENTITY SEALED</span><strong>${n}</strong><small>개인 이름은 Final 직전까지 공개하지 않습니다.</small></div><div class="population-dots">${dots}</div>`;
    els.survivorCaption.textContent = state.currentRound
      ? `${state.currentRound.featureName}의 선택된 그룹으로 본인의 생존 여부를 확인하세요.`
      : `개인 이름 대신 Header 그룹을 따라가며 생존 여부를 확인합니다.`;
    return;
  }

  const alive = aliveSet();
  const list = [...state.alive].sort((a,b) => a._name.localeCompare(b._name,"ko") || a._drawId.localeCompare(b._drawId));
  const cols = list.length <= 4 ? 4 : list.length <= 8 ? 4 : 5;
  els.indexLabel.textContent = "IDENTITY REVEAL";
  els.indexLegend.innerHTML = `<i></i> FINALIST <i class="out"></i> GROUP PHASE COMPLETE`;
  els.survivorGrid.classList.remove("sealed-population");
  els.survivorGrid.style.setProperty("--cols", cols);
  els.survivorGrid.innerHTML = list.map((p) => {
    const isAlive = alive.has(p._id); const winner = state.alive.length === 1 && isAlive;
    return `<div class="person-card finalist ${winner ? "winner" : ""}" title="${p["실"]} / ${p["팀"]}"><span class="id">${p._drawId}</span><span class="nm">${p._name}</span></div>`;
  }).join("");
  els.survivorCaption.textContent = `${state.alive.length}명의 Finalist가 공개되었습니다.`;
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

function compactGroupLabels(groups) {
  const labels = groups.map((g) => g.label);
  if (labels.length <= 2) return labels.join(" · ");
  return `${labels.slice(0, 2).join(" · ")} 외 ${labels.length - 2}`;
}

function setRuleDisplay(rule) {
  resetGateClasses();
  const total = rule.laneCounts[0] + rule.laneCounts[1];
  const pA = rule.laneCounts[0] / total, pB = rule.laneCounts[1] / total;
  els.ruleName.textContent = rule.featureName;
  els.ruleHint.textContent = `${rule.groupCount}개 고유값 그룹 · 현재 ${total}명의 실제 분포로 생성 · ${headerFairnessStatement(rule)}`;
  els.gateALabel.textContent = compactGroupLabels(rule.lanes[0]);
  els.gateBLabel.textContent = compactGroupLabels(rule.lanes[1]);
  els.gateACount.textContent = `${rule.laneCounts[0]}명`;
  els.gateBCount.textContent = `${rule.laneCounts[1]}명`;
  els.gateAPct.textContent = `${(pA*100).toFixed(1)}%`;
  els.gateBPct.textContent = `${(pB*100).toFixed(1)}%`;
  els.gates.style.gridTemplateColumns = `${rule.laneCounts[0]}fr 42px ${rule.laneCounts[1]}fr`;
  els.statusBefore.textContent = total;
  els.statusTarget.textContent = `≈${Math.round(total / 2)}`;
  els.statusAfter.textContent = "?";
  els.statusMessage.textContent = "각 고유값 그룹은 A/B 생존 Lane에 배치되고, Lane 선택확률은 포함 인원에 비례합니다.";
}

function setNextLabel() {
  if (!state.pool.length) els.nextLabel.textContent = "START DRAW";
  else if (!state.identityRevealed && state.alive.length > 10) els.nextLabel.textContent = state.history.length ? "NEXT HEADER" : "START HEADER ROULETTE";
  else if (!state.identityRevealed) els.nextLabel.textContent = "REVEAL FINALISTS";
  else if (state.alive.length > 4) els.nextLabel.textContent = `${state.alive.length} → FINAL 4`;
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
  state.currentRound = null; state.currentResult = null; state.identityRevealed = false;
  els.headline.innerHTML = "THE LAST <em>ONE</em>";
  els.subline.textContent = "매 라운드 새로운 Header와 고유값 그룹이 생존 경쟁을 시작합니다.";
  els.groupDeck.innerHTML = "";
  resetGateClasses();
  els.ruleName.textContent = `${currentLabel()} ${state.pool.length}명 · IDENTITY SEALED`;
  els.ruleHint.textContent = "SPACE를 누르면 현재 생존자 데이터에서 사용 가능한 Header만 골라 Roulette를 시작합니다.";
  els.gateALabel.textContent = "HEADER"; els.gateBLabel.textContent = "ROULETTE"; els.gateACount.textContent="—";els.gateBCount.textContent="—";els.gateAPct.textContent="";els.gateBPct.textContent="";
  els.statusBefore.textContent = state.pool.length; els.statusTarget.textContent="≈50%"; els.statusAfter.textContent="—"; els.statusMessage.textContent = "이름은 숨긴 채 Header 고유값 그룹으로 라운드를 진행합니다.";
  els.roundKicker.textContent = "READY"; els.roundNumber.textContent="00";
  els.nextBtn.disabled = !state.pool.length; setNextLabel(); renderCore();
}

async function executeDynamicRound() {
  const before = state.alive.length;
  const { selected: round, candidates } = chooseHeaderRound(state.alive, { usedFeatures: state.usedFeatures });
  if (!round) {
    const n = Math.min(10, Math.max(5, Math.ceil(before / 2)));
    const survivors = uniformSubset(state.alive, n);
    els.ruleName.textContent = "GROUPABLE HEADER EXHAUSTED";
    els.ruleHint.textContent = "현재 생존자에서 의미 있게 그룹화 가능한 미사용 Header가 없어 균등 무작위로 Identity Reveal 구간까지 이동합니다.";
    els.statusBefore.textContent = before; els.statusTarget.textContent = n; els.statusAfter.textContent = "?";
    await marbleArena.playSubset(state.alive, survivors, `FINALISTS ${n}`, false);
    state.alive = survivors;
    state.history.push({ label: "FAIR CUT", after: survivors.length });
    state.audit.push(`FALLBACK uniform ${before} → ${survivors.length}`);
    state.roundNo += 1;
    state.identityRevealed = true;
    els.statusAfter.textContent = survivors.length;
    await executeIdentityReveal(false);
    return;
  }

  state.currentRound = round;
  state.currentResult = null;
  els.roundKicker.textContent = "HEADER ROUND";
  els.roundNumber.textContent = String(state.roundNo).padStart(2, "0");
  setRuleDisplay(round);
  const result = drawHeaderLane(round);
  state.currentResult = result;
  els.gateA.classList.add("spinning"); els.gateB.classList.add("spinning");
  state.audit.push(`R${state.roundNo} HEADER ${round.feature} | groups=${round.groupCount} | A=${round.laneCounts[0]} B=${round.laneCounts[1]}`);
  await marbleArena.playHeaderRound(round, result, candidates);

  resetGateClasses();
  const selectedGate = result.index === 0 ? els.gateA : els.gateB;
  const rejectedGate = result.index === 0 ? els.gateB : els.gateA;
  selectedGate.classList.add("selected"); rejectedGate.classList.add("out");
  els.statusAfter.textContent = result.survivors.length;
  els.statusMessage.textContent = `${result.selectedLabels.join(" · ")} 생존 · Gate ${result.index === 0 ? "A" : "B"} 선택확률 ${(result.probability * 100).toFixed(1)}%`;
  await wait(320);

  state.alive = result.survivors;
  state.usedFeatures.add(round.feature); state.usedFamilies.add(round.family);
  state.history.push({ label: round.featureName, after: state.alive.length });
  state.audit.push(`R${state.roundNo} SELECT ${result.index === 0 ? "A" : "B"} p=${result.probability.toFixed(4)} | ${before} → ${state.alive.length} | ${result.selectedLabels.join(" / ")}`);
  state.roundNo += 1;
  flashStage();

  if (state.alive.length <= 10) {
    state.identityRevealed = true;
    await executeIdentityReveal(true);
  } else {
    renderCore();
  }
}

async function executeIdentityReveal(auto = false) {
  state.identityRevealed = true;
  els.roundKicker.textContent = "IDENTITY REVEAL";
  els.ruleName.textContent = `THE LAST ${state.alive.length}`;
  els.ruleHint.textContent = "그룹 라운드가 끝났습니다. 지금부터 처음으로 생존자의 이름이 공개됩니다.";
  els.statusBefore.textContent = state.alive.length;
  els.statusTarget.textContent = "FINAL";
  els.statusAfter.textContent = state.alive.length;
  els.statusMessage.textContent = `${state.alive.length}명의 Finalist 공개 · 이후는 개인 균등 추첨`;
  els.headline.innerHTML = "IDENTITY <em>REVEAL</em>";
  els.subline.textContent = `${state.history.length}개의 Header를 통과한 Finalist`;
  sound.final();
  fx.burst(innerWidth * .5, innerHeight * .40, 100, true);
  flashStage();
  renderCore();
  state.audit.push(`IDENTITY REVEAL ${state.alive.length} finalists${auto ? " auto" : " manual"}`);
  await wait(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 80 : 650);
}

async function executeFinalCut(target) {
  const before = state.alive.length;
  els.roundKicker.textContent = target === 1 ? "LAST DRAW" : "FINAL STAGE";
  els.roundNumber.textContent = String(target).padStart(2, "0");
  els.ruleName.textContent = target === 1 ? "THE LAST ONE" : `FINAL ${target}`;
  els.ruleHint.textContent = "그룹 단계가 끝난 뒤에는 현재 Finalist만 대상으로 균등 무작위 추첨합니다.";
  resetGateClasses();
  els.gateALabel.textContent = `FINAL ${target}`; els.gateBLabel.textContent = "OUT";
  els.gateACount.textContent = `${target}명`; els.gateBCount.textContent = `${before - target}명`;
  els.gateAPct.textContent = `${(target / before * 100).toFixed(1)}%`; els.gateBPct.textContent = `${((before - target) / before * 100).toFixed(1)}%`;
  els.statusBefore.textContent = before; els.statusTarget.textContent = target; els.statusAfter.textContent = "?";
  els.gateA.classList.add("spinning"); els.gateB.classList.add("spinning");
  const survivors = uniformSubset(state.alive, target);
  await marbleArena.playSubset(state.alive, survivors, target === 1 ? "LAST MARBLE" : `FINAL ${target}`, target === 1);
  state.alive = survivors;
  resetGateClasses(); els.gateA.classList.add("selected"); els.gateB.classList.add("out"); els.statusAfter.textContent = target;
  els.statusMessage.textContent = `${before}명 중 ${target}명 균등 무작위 생존`;
  state.history.push({ label:`FINAL ${target}`, after:target });
  state.audit.push(`FINAL uniform subset ${before} → ${target} | conditional p=${(target / before).toFixed(4)}`);
  flashStage(); renderCore();
  if (target === 1) await revealWinner();
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
  state.busy = true; els.nextBtn.disabled = true;
  try {
    if (!state.identityRevealed && state.alive.length > 10) await executeDynamicRound();
    else if (!state.identityRevealed) await executeIdentityReveal(false);
    else if (state.alive.length > 4) await executeFinalCut(4);
    else if (state.alive.length > 2) await executeFinalCut(2);
    else if (state.alive.length > 1) await executeFinalCut(1);
    else await revealWinner();
  } catch (err) {
    console.error(err); els.statusMessage.textContent = `오류: ${err.message}`; state.audit.push(`ERROR ${err.message}`); renderAudit();
  } finally { state.busy = false; els.nextBtn.disabled = false; setNextLabel(); }
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
