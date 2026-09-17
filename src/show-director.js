import { PhysicsShowEngine } from "./physics-show-engine.js";

export const STAGES = [
  {
    id: "steel-drop",
    name: "중력 계단",
    kind: "physics",
    cue: "층층이 내려가는 공을 따라가세요.",
  },
  {
    id: "moon-orbit",
    name: "회전 미로",
    kind: "physics",
    cue: "돌아가는 미로, 마지막 출구는 어디일까요?",
  },
  {
    id: "pinball-grid",
    name: "핀볼 바운스",
    kind: "physics",
    cue: "마지막 반동까지 지켜보세요.",
  },
  {
    id: "furnace-split",
    name: "스윙 게이트",
    kind: "physics",
    cue: "열리고 닫히는 문을 통과합니다.",
  },
  {
    id: "last-gate",
    name: "라스트 게이트",
    kind: "physics",
    cue: "마지막 문을 향해 함께 갑니다.",
  },
  {
    id: "orbit-rally",
    name: "오비트 랠리",
    kind: "orbit",
    cue: "각자의 궤도에서 마지막 한 바퀴.",
  },
  {
    id: "light-grid",
    name: "라이트 그리드",
    kind: "grid",
    cue: "빛이 지나가는 그룹을 함께 따라가세요.",
  },
  {
    id: "pulse-gates",
    name: "리듬 터널",
    kind: "tunnel",
    cue: "다가오는 문, 끝까지 함께해요.",
  },
  {
    id: "spotlight-cut",
    name: "스포트라이트",
    kind: "physics",
    cue: "다음 무대의 주인공을 기다립니다.",
  },
  {
    id: "twin-orbit",
    name: "트윈 레이스",
    kind: "physics",
    cue: "마지막 두 자리를 향해.",
  },
  {
    id: "last-marble",
    name: "파이널 마블",
    kind: "physics",
    cue: "마지막 순간, 오늘의 행운이 열립니다.",
  },
];
export const GROUP_STAGE_IDS = STAGES.slice(0, 8).map((s) => s.id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

export class Sound {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.voices = new Set();
  }
  async enable(on) {
    this.enabled = on;
    if (!on) {
      this.stop();
      return;
    }
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      await this.ctx.resume();
    } catch {
      this.enabled = false;
    }
  }
  stop() {
    for (const v of this.voices) {
      try {
        v.stop();
      } catch {}
    }
    this.voices.clear();
  }
  tone(f = 330, d = 0.08, gain = 0.022) {
    if (!this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime,
        o = this.ctx.createOscillator(),
        g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.007);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.ctx.destination);
      o.onended = () => {
        this.voices.delete(o);
        o.disconnect();
        g.disconnect();
      };
      this.voices.add(o);
      o.start(t);
      o.stop(t + d + 0.02);
    } catch {}
  }
  win() {
    [262, 330, 392, 523].forEach((f) => this.tone(f, 0.8, 0.015));
  }
}

export class ShowDirector {
  constructor(
    canvas,
    { onProgress = () => {}, onCaption = () => {}, sound } = {},
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.engine = new PhysicsShowEngine();
    this.onProgress = onProgress;
    this.onCaption = onCaption;
    this.sound = sound;
    this.running = false;
    this.paused = false;
    this.time = 0;
    this.lastTime = 0;
    this.idleTime = 0;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.refreshPalette();
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }
  refreshPalette() {
    const s = getComputedStyle(document.body);
    this.colors = Object.fromEntries(
      [
        "panel",
        "surface",
        "text",
        "muted",
        "line",
        "accent",
        "ink",
        "lane-a",
        "lane-b",
      ].map((k) => [k, s.getPropertyValue("--" + k).trim()]),
    );
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
  }
  pause(value) {
    this.paused = value;
    this.sound?.stop();
  }
  setIdle(reduced = false) {
    this.reduced = reduced;
    this.running = false;
    this.paused = false;
  }
  async play(
    tokens,
    { stageId, duration = 12, reduced = false, caption = "" } = {},
  ) {
    if (this.running) throw Error("이미 진행 중인 연출입니다.");
    this.tokens = tokens.map((t, i) => ({ ...t, showIndex: i }));
    this.stage = STAGES.find((s) => s.id === stageId) || STAGES[0];
    this.duration = duration;
    this.time = 0;
    this.lastTick = -1;
    this.paused = false;
    this.reduced = reduced;
    this.running = true;
    this.initializing = true;
    this.finished = false;
    this.renderError = null;
    this.result = {
      stage: this.stage.id,
      kind: this.stage.kind,
      renderedAs: reduced ? "reduced" : this.stage.kind,
      reason: "completed",
      maxProgress: 0,
    };
    try {
      this.onCaption(caption || this.stage.cue);
    } catch (error) {
      this.fail(error);
      throw error;
    }
    if (this.stage.kind === "physics" && !reduced) {
      try {
        await this.engine.start(this.stage.id, this.tokens);
      } catch (e) {
        console.warn("show initialization unavailable; preserving draw", e);
        this.result.fallback = true;
        this.result.renderedAs = "reduced";
        this.result.reason = "renderer-unavailable";
      }
    }
    this.initializing = false;
    if (this.renderError) throw this.renderError;
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
  loop(now) {
    try {
      const raw = this.lastTime ? (now - this.lastTime) / 1000 : 0;
      this.lastTime = now;
      const dt =
        document.hidden || raw > 0.5 ? 0 : Math.min(0.05, Math.max(0, raw));
      if (this.running) {
        if (!this.paused && !this.initializing) this.time += dt;
        this.drawRunning(this.paused ? 0 : dt);
      } else {
        if (!this.reduced) this.idleTime += dt;
        this.drawIdle();
      }
    } catch (error) {
      if (this.running) this.fail(error);
      else console.warn("idle renderer unavailable", error);
    } finally {
      this.raf = requestAnimationFrame(this.loop);
    }
  }
  base() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    c.fillStyle = this.colors.panel;
    c.fillRect(0, 0, this.w, this.h);
  }
  line(x1, y1, x2, y2, color = this.colors.line, width = 1) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  circle(x, y, r, fill, stroke) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0.1, r), 0, TAU);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1;
      c.stroke();
    }
  }
  label(
    text,
    x,
    y,
    {
      size = 15,
      color = this.colors.text,
      maxWidth = 180,
      background = true,
    } = {},
  ) {
    const c = this.ctx;
    c.save();
    c.font = `600 ${size}px "Apple SD Gothic Neo",system-ui,sans-serif`;
    let shown = String(text);
    while (c.measureText(shown).width > maxWidth && shown.length > 2)
      shown = shown.slice(0, -2) + "…";
    const width = Math.min(maxWidth, c.measureText(shown).width) + 20;
    if (background) {
      c.fillStyle = this.colors.panel;
      c.globalAlpha = 0.94;
      c.beginPath();
      c.roundRect(x - width / 2, y - size, width, size + 13, 6);
      c.fill();
      c.globalAlpha = 1;
    }
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = color;
    c.fillText(shown, x, y, maxWidth);
    c.restore();
  }
  marble(token, x, y, r = 18, showLabel = true) {
    const c = this.ctx,
      fill = token.lane === 1 ? this.colors["lane-b"] : this.colors["lane-a"];
    c.save();
    this.circle(x + 1.5, y + 4, r, "#0002");
    this.circle(x, y, r, fill, this.colors.line);
    c.globalAlpha = 0.23;
    this.circle(x - r * 0.2, y - r * 0.27, r * 0.38, "#fff");
    c.globalAlpha = 1;
    c.fillStyle = "#292b27";
    c.font = `700 ${Math.max(11, r * 0.56)}px system-ui`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(token.mark ?? (token.lane === 1 ? "B" : "A"), x, y + 1);
    if (token.lane === 1) {
      c.strokeStyle = "#293432";
      c.lineWidth = 1.5;
      c.strokeRect(x - r * 0.68, y - r * 0.68, r * 1.36, r * 1.36);
    }
    c.restore();
    if (showLabel)
      this.label(token.label, x, y - r - 22, {
        size: this.w < 500 ? 13 : 16,
        maxWidth: Math.min(180, this.w * 0.32),
      });
  }
  drawIdle() {
    this.base();
    const c = this.ctx,
      w = this.w,
      h = this.h,
      small = w < 600,
      cx = w * (small ? 0.83 : 0.77),
      cy = h * 0.5,
      r = Math.min(w * 0.23, h * 0.34),
      t = this.idleTime * 0.12;
    c.save();
    c.globalAlpha = 0.72;
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = this.colors.line;
      c.lineWidth = i === 1 ? 12 : 1;
      c.beginPath();
      c.arc(
        cx,
        cy,
        r + i * 22,
        -Math.PI * 0.88 + t * (i % 2 ? -0.2 : 0.25),
        Math.PI * 0.78 + t * (i % 2 ? -0.2 : 0.25),
      );
      c.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const a = t + (i * TAU) / 7;
      const x = cx + Math.cos(a) * (r + 22),
        y = cy + Math.sin(a) * (r + 22);
      this.circle(
        x,
        y,
        i === 2 ? 24 : 8,
        i === 2 ? this.colors["lane-a"] : this.colors.surface,
        this.colors.line,
      );
    }
    this.circle(cx, cy, 52, this.colors.surface, this.colors.line);
    c.fillStyle = this.colors.muted;
    c.font = "300 54px system-ui";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("✳", cx, cy + 1);
    this.line(cx - r - 80, cy + r + 69, cx + r + 50, cy + r + 69);
    for (let i = 0; i < 8; i++)
      this.line(
        cx - r - 70 + i * 28,
        cy + r + 62,
        cx - r - 70 + i * 28,
        cy + r + 76,
      );
    c.restore();
  }
  drawRunning(dt) {
    if (this.finished) return;
    this.base();
    if (this.initializing) {
      this.label("무대를 준비하고 있어요", this.w / 2, this.h / 2, {
        size: 20,
        maxWidth: this.w * 0.8,
      });
      return;
    }
    let progress = this.time / this.duration;
    const tick = Math.floor(this.time * 2);
    if (tick !== this.lastTick && !this.paused) {
      this.lastTick = tick;
      this.sound?.tone(
        progress > 0.8 ? 220 : 390 + (tick % 4) * 40,
        0.055,
        0.012,
      );
    }
    if (this.reduced || this.result.fallback) {
      this.drawReduced(progress);
      if (this.time >= 2.4) {
        this.finish();
        return;
      }
      this.onProgress(Math.min(1, this.time / 2.4), "결과를 기다리는 중");
      return;
    }
    if (this.stage.kind === "physics") {
      this.engine.step(dt);
      const frame = this.engine.frame();
      const p = frame.stats?.progress || 0;
      this.result.maxProgress = Math.max(this.result.maxProgress, p);
      this.drawPhysics(frame);
      if (this.time >= this.duration && p >= 0.985) {
        this.finish();
        return;
      }
      if (this.time >= this.duration + 7) {
        this.result.reason = "time-budget";
        this.finish();
        return;
      }
      progress = Math.min(0.97, Math.max(progress * 0.8, p * 0.95));
      this.onProgress(
        progress,
        frame.timeScale < 0.7 ? "마지막 순간을 천천히" : "코스를 따라 이동 중",
      );
    } else {
      if (this.stage.kind === "orbit") this.drawOrbit(progress);
      else if (this.stage.kind === "grid") this.drawGrid(progress);
      else this.drawTunnel(progress);
      this.onProgress(
        Math.min(0.98, progress),
        progress > 0.78 ? "잠시 후 결과 공개" : "우리 그룹을 함께 응원해요",
      );
      if (this.time >= this.duration) {
        this.finish();
        return;
      }
    }
    if (this.time > this.duration * 0.8)
      this.onCaption("곧, 다음 무대의 주인공이 공개됩니다.");
  }
  drawPhysics(frame) {
    const c = this.ctx,
      w = this.w,
      h = this.h,
      st = frame.stage;
    if (!st) return;
    const top = 65,
      bottom = h - 68,
      areaH = bottom - top;
    const zoom = Math.min(frame.camera.zoom, 2.4);
    const scale = Math.min(w / 25, areaH / 13.6) * zoom;
    const front = frame.tokens.reduce(
      (a, b) => (!a || b.y > a.y ? b : a),
      null,
    );
    const focus = frame.tokens.filter((x) => front.y - x.y < 3);
    const fx = focus.reduce((s, t) => s + t.x, 0) / Math.max(1, focus.length);
    const centerX = 12 + (fx - 12) * clamp((zoom - 1) / 1.4, 0, 1);
    const centerY = frame.camera.y;
    const sx = (x) => w / 2 + (x - centerX) * scale,
      sy = (y) => (top + bottom) / 2 + (y - centerY) * scale;
    c.save();
    c.beginPath();
    c.rect(0, top, w, areaH);
    c.clip();
    c.globalAlpha = 0.6;
    for (let x = 0; x < 25; x += 2) {
      this.line(sx(x), top, sx(x), bottom, this.colors.line, 0.5);
    }
    c.globalAlpha = 1;
    const finishY = sy(st.goalY);
    if (finishY > top - 30 && finishY < bottom + 30) {
      c.fillStyle = this.colors.surface;
      c.fillRect(sx(1), finishY, w, 30);
      for (let i = 0; i < 23; i++) {
        c.fillStyle = i % 2 ? this.colors.panel : this.colors.muted;
        c.fillRect(sx(i + 1), finishY, scale, 6);
      }
      this.label("RESULT GATE", w / 2, finishY + 24, {
        size: 12,
        maxWidth: 200,
      });
    }
    for (const { def, x, y, angle } of frame.entities) {
      c.save();
      c.translate(sx(x), sy(y));
      c.rotate(angle);
      const active = def.bodyType === "kinematic";
      c.fillStyle = active ? this.colors.muted : this.colors.surface;
      c.strokeStyle = active ? this.colors.text : this.colors.line;
      c.lineWidth = Math.max(1, scale * 0.025);
      if (def.kind === "box") {
        c.beginPath();
        c.roundRect(
          -def.hw * scale,
          -def.hh * scale,
          def.hw * scale * 2,
          Math.max(3, def.hh * scale * 2),
          3,
        );
        c.fill();
        c.stroke();
        if (active)
          this.circle(0, 0, Math.max(2, scale * 0.12), this.colors.panel);
      } else if (def.kind === "circle") {
        this.circle(0, 0, def.radius * scale, c.fillStyle, c.strokeStyle);
        if (def.radius > 0.5) this.circle(0, 0, 3, this.colors.panel);
      }
      c.restore();
      if (def.kind === "polyline") {
        c.strokeStyle =
          def.tone === "finish" ? this.colors.text : this.colors.muted;
        c.lineWidth = Math.max(2, scale * 0.065);
        c.lineCap = "round";
        c.beginPath();
        def.points.forEach(([px, py], i) =>
          i ? c.lineTo(sx(px), sy(py)) : c.moveTo(sx(px), sy(py)),
        );
        c.stroke();
      }
    }
    for (const token of frame.tokens) {
      const x = sx(token.x),
        y = sy(token.y);
      if (y < top - 80 || y > bottom + 80 || x < -80 || x > w + 80) continue;
      c.globalAlpha = 0.2;
      c.strokeStyle =
        token.token.lane === 1 ? this.colors["lane-b"] : this.colors["lane-a"];
      c.lineWidth = 5;
      c.lineCap = "round";
      c.beginPath();
      token.trail.forEach((p, i) =>
        i ? c.lineTo(sx(p.x), sy(p.y)) : c.moveTo(sx(p.x), sy(p.y)),
      );
      c.stroke();
      c.globalAlpha = 1;
      this.marble(token.token, x, y, clamp(token.radius * scale, 13, 25), true);
    }
    // Offscreen tokens stay represented; a camera move must never look like elimination.
    const off = frame.tokens.filter(
      (t) => sy(t.y) < top + 15 || sx(t.x) < 12 || sx(t.x) > w - 12,
    );
    if (off.length) {
      c.globalAlpha = 0.9;
      this.label(`함께 이동 중 ${off.length}개 그룹`, w / 2, top + 25, {
        size: 12,
        maxWidth: w * 0.7,
      });
      c.globalAlpha = 1;
    }
    c.restore();
  }
  drawOrbit(progress) {
    const c = this.ctx,
      cx = this.w / 2,
      cy = this.h / 2 + 5,
      base = Math.min(this.w * 0.34, this.h * 0.31),
      n = this.tokens.length;
    for (let i = 0; i < n; i++) {
      const rx = base * (0.59 + (0.41 * (i + 1)) / n),
        ry = rx * 0.66;
      const speed = (i % 2 ? -1 : 1) * (0.48 + i * 0.085),
        angle = this.time * speed + (TAU * i) / n;
      const wobble = 1 + Math.sin(this.time * 0.75) * 0.06;
      c.save();
      c.translate(cx, cy);
      c.rotate(i % 2 ? 0.2 : -0.2);
      c.strokeStyle = this.colors.line;
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(0, 0, rx, ry, 0, 0, TAU);
      c.stroke();
      const x = Math.cos(angle) * rx * wobble,
        y = Math.sin(angle) * ry * wobble;
      this.marble(this.tokens[i], x, y, 17, this.w > 500);
      c.restore();
    }
    this.circle(cx, cy, 36, this.colors.surface, this.colors.line);
    this.label(
      String(Math.max(1, Math.ceil((1 - progress) * this.duration))),
      cx,
      cy + 2,
      { size: 30, maxWidth: 60, background: false },
    );
    this.label("함께 도는 마지막 궤도", cx, this.h - 95, {
      size: 15,
      maxWidth: this.w * 0.8,
    });
  }
  drawGrid(progress) {
    const c = this.ctx,
      w = this.w,
      h = this.h,
      n = this.tokens.length,
      cols = n <= 4 ? 2 : 3,
      rows = Math.ceil(n / cols),
      gap = 12,
      cellW = Math.min(180, (w - 70 - gap * (cols - 1)) / cols),
      cellH = Math.min(112, (h - 185 - gap * (rows - 1)) / rows),
      left = (w - cols * cellW - (cols - 1) * gap) / 2,
      top = (h - rows * cellH - (rows - 1) * gap) / 2;
    const tick = Math.floor(this.time * (progress > 0.78 ? 1.9 : 5.5));
    this.tokens.forEach((token, i) => {
      const x = left + (i % cols) * (cellW + gap),
        y = top + Math.floor(i / cols) * (cellH + gap);
      const lit = tick % n === i;
      const wave = 0.12 + 0.13 * Math.sin(this.time * 3 - i);
      c.fillStyle = lit ? this.colors["lane-a"] : this.colors.surface;
      c.strokeStyle = lit ? this.colors.text : this.colors.line;
      c.lineWidth = lit ? 2 : 1;
      c.beginPath();
      c.roundRect(x, y, cellW, cellH, 10);
      c.fill();
      c.stroke();
      const color = lit ? "#282b25" : this.colors.text;
      this.label(token.label, x + cellW / 2, y + cellH * 0.47, {
        size: this.w < 500 ? 14 : 18,
        maxWidth: cellW - 20,
        background: false,
        color,
      });
      this.label(
        `${token.count}명 · ${token.lane === 1 ? "B" : "A"}`,
        x + cellW / 2,
        y + cellH * 0.75,
        { size: 12, maxWidth: cellW - 20, background: false, color },
      );
      c.globalAlpha = wave;
      this.line(x + 12, y + 10, x + cellW - 12, y + 10, color, 2);
      c.globalAlpha = 1;
    });
  }
  drawTunnel(progress) {
    const c = this.ctx,
      w = this.w,
      h = this.h,
      cx = w / 2,
      cy = h * 0.48,
      time = this.time;
    for (let k = 0; k < 9; k++) {
      const z = (k / 9 + time * 0.16) % 1,
        s = 0.1 + z * z,
        ww = w * 0.85 * s,
        hh = h * 0.62 * s;
      c.globalAlpha = 0.1 + z * 0.6;
      c.strokeStyle = this.colors.muted;
      c.lineWidth = 1 + z * 5;
      c.beginPath();
      c.roundRect(cx - ww / 2, cy - hh / 2, ww, hh, 24 * s);
      c.stroke();
    }
    c.globalAlpha = 1;
    this.tokens.forEach((t, i) => {
      const column = (i + 0.5) / this.tokens.length,
        tx = 50 + column * (w - 100),
        ty = cy + Math.sin(time * 1.7 + i * 1.4) * h * 0.16;
      this.marble(t, tx, ty, 18, this.w > 420);
    });
    this.label("한 박자, 더 가까이", cx, h - 100, {
      size: 17,
      maxWidth: w * 0.8,
    });
  }
  drawReduced(progress) {
    const y = this.h * 0.47,
      n = this.tokens.length,
      visible = this.tokens.slice(0, 10),
      cols = Math.min(3, visible.length),
      rows = Math.ceil(visible.length / cols);
    visible.forEach((t, i) => {
      const x =
          this.w / 2 +
          ((i % cols) - (cols - 1) / 2) * Math.min(185, this.w / (cols + 1)),
        yy = y + (Math.floor(i / cols) - (rows - 1) / 2) * 80;
      this.marble(t, x, yy, 14, true);
    });
  }
  fail(error) {
    this.finished = true;
    this.running = false;
    this.initializing = false;
    this.sound?.stop();
    try {
      this.engine.dispose?.();
    } catch {}
    this.result = {
      ...(this.result || {}),
      reason: "render-error",
      message: String(error?.message || error),
    };
    const reject = this.reject;
    this.resolve = null;
    this.reject = null;
    if (reject) reject(error);
    else this.renderError = error;
  }
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.onProgress(1, "결과 공개");
    this.running = false;
    this.sound?.stop();
    this.result.elapsed = Number(this.time.toFixed(2));
    this.resolve?.({ ...this.result });
    this.resolve = null;
    this.reject = null;
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.sound?.stop();
    this.engine.dispose?.();
  }
}
