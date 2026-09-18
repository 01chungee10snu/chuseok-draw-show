import Box2DFactory from "box2d-wasm";
import {
  getPhysicsStageSpec,
  PHYSICS_STAGE_IDS,
} from "./physics-stage-maps.js";

const STAGE_SET = new Set(PHYSICS_STAGE_IDS);

export function isPhysicsStage(stageId) {
  return STAGE_SET.has(stageId);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (current, target, dt, stiffness) =>
  lerp(current, target, 1 - Math.exp(-stiffness * dt));

function hashString(value) {
  let h = 2166136261;
  const s = String(value);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function colorForLane(lane) {
  return lane === 0 ? "#55c8ff" : "#ff9f43";
}

export class PhysicsShowEngine {
  constructor() {
    this.Box2D = null;
    this.readyPromise = null;
    this.world = null;
    this.stage = null;
    this.entities = [];
    this.tokens = [];
    this.accumulator = 0;
    this.timeScale = 1;
    this.physicsRate = 1;
    this.elapsedReal = 0;
    this.camera = { x: 12, y: 5.5, zoom: 1 };
    this.trails = new Map();
  }

  async ready() {
    if (!this.readyPromise) {
      this.readyPromise = Box2DFactory().then((Box2D) => {
        this.Box2D = Box2D;
        return Box2D;
      });
    }
    return this.readyPromise;
  }

  _vec(x, y) {
    return new this.Box2D.b2Vec2(x, y);
  }

  _destroy(...objects) {
    for (const object of objects) {
      if (object) this.Box2D.destroy(object);
    }
  }

  _bodyType(type) {
    if (type === "kinematic") return this.Box2D.b2_kinematicBody;
    if (type === "dynamic") return this.Box2D.b2_dynamicBody;
    return this.Box2D.b2_staticBody;
  }

  _createEntity(def) {
    const B = this.Box2D;
    const bodyDef = new B.b2BodyDef();
    const position = this._vec(def.x ?? 0, def.y ?? 0);
    let body;
    try {
      bodyDef.set_type(this._bodyType(def.bodyType));
      bodyDef.set_position(position);
      bodyDef.set_angle(def.angle ?? 0);
      body = this.world.CreateBody(bodyDef);
    } finally {
      this._destroy(position, bodyDef);
    }
    if (def.angularVelocity) body.SetAngularVelocity(def.angularVelocity);

    if (def.kind === "box") {
      const fixture = new B.b2FixtureDef();
      const shape = new B.b2PolygonShape();
      const center = this._vec(0, 0);
      try {
        fixture.set_density(1);
        fixture.set_friction(def.friction ?? 0.22);
        fixture.set_restitution(def.restitution ?? 0.32);
        shape.SetAsBox(def.hw, def.hh, center, 0);
        fixture.set_shape(shape);
        body.CreateFixture(fixture);
      } finally {
        this._destroy(center, shape, fixture);
      }
    } else if (def.kind === "circle") {
      const fixture = new B.b2FixtureDef();
      const shape = new B.b2CircleShape();
      try {
        fixture.set_density(1);
        fixture.set_friction(def.friction ?? 0.22);
        fixture.set_restitution(def.restitution ?? 0.32);
        shape.set_m_radius(def.radius);
        fixture.set_shape(shape);
        body.CreateFixture(fixture);
      } finally {
        this._destroy(shape, fixture);
      }
    } else if (def.kind === "polyline") {
      for (let i = 0; i < def.points.length - 1; i += 1) {
        const edge = new B.b2EdgeShape();
        const from = this._vec(def.points[i][0], def.points[i][1]);
        const to = this._vec(def.points[i + 1][0], def.points[i + 1][1]);
        try {
          edge.SetTwoSided(from, to);
          body.CreateFixture(edge, 1);
        } finally {
          this._destroy(from, to, edge);
        }
      }
    }

    this.entities.push({ def, body });
  }

  _tokenStart(token, index, total) {
    const h = hashString(token.id ?? token.label ?? index);
    const jitter = ((h % 1000) / 999 - 0.5) * 0.52;
    if (this.stage.id === "last-marble") {
      const positions = total <= 2 ? [7.1, 16.9] : null;
      return {
        x: positions
          ? positions[index]
          : 4.5 + (index / Math.max(1, total - 1)) * 15,
        y: 1.0 + (index % 2) * 0.22,
      };
    }
    if (this.stage.id === "twin-orbit") {
      const lane = token.lane ?? index % 2;
      const laneCenter = lane === 0 ? 6.6 : 17.4;
      return { x: laneCenter + jitter * 1.7, y: 1.1 + (index % 3) * 0.38 };
    }
    return {
      x:
        3.2 +
        (index / Math.max(1, total - 1)) * (this.stage.width - 6.4) +
        jitter,
      y: 1.0 + (index % 3) * 0.38,
    };
  }

  _createToken(token, index, total, maxCount) {
    const B = this.Box2D;
    const start = this._tokenStart(token, index, total);
    const def = new B.b2BodyDef();
    const position = this._vec(start.x, start.y);
    let body;
    try {
      def.set_type(B.b2_dynamicBody);
      def.set_position(position);
      def.set_linearDamping(0.18);
      def.set_angularDamping(0.018);
      def.set_bullet(true);
      body = this.world.CreateBody(def);
    } finally {
      this._destroy(position, def);
    }
    const shape = new B.b2CircleShape();
    const visualFactor = Math.sqrt(
      Math.max(1, token.count ?? 1) / Math.max(1, maxCount),
    );
    const radius = clamp(0.46 + visualFactor * 0.1, 0.48, 0.58);
    const fixture = new B.b2FixtureDef();
    try {
      shape.set_m_radius(radius);
      fixture.set_shape(shape);
      fixture.set_density(1);
      fixture.set_friction(0.18);
      fixture.set_restitution(this.stage.id === "pinball-grid" ? 0.58 : 0.42);
      body.CreateFixture(fixture);
    } finally {
      this._destroy(shape, fixture);
    }
    const h = hashString(token.id ?? token.label ?? index);
    const impulseX = (((h >> 8) % 1000) / 999 - 0.5) * 0.34;
    const impulse = this._vec(impulseX, 0.02);
    try {
      body.ApplyLinearImpulseToCenter(impulse, true);
    } finally {
      this._destroy(impulse);
    }
    return {
      token,
      body,
      radius,
      lastX: start.x,
      lastY: start.y,
      maxY: start.y,
      stuckFor: 0,
      noDownFor: 0,
      kickCount: 0,
      previous: { x: start.x, y: start.y, angle: 0 },
    };
  }

  async start(stageId, tokens) {
    if (!isPhysicsStage(stageId))
      throw new Error(`Physics stage not enabled: ${stageId}`);
    if (!tokens?.length) throw new Error("Physics stage requires tokens");
    await this.ready();
    this.dispose();
    this.stage = getPhysicsStageSpec(stageId);
    const gravity = this._vec(0, this.stage.gravity);
    try {
      this.world = new this.Box2D.b2World(gravity);
    } finally {
      this._destroy(gravity);
    }
    this.entities = [];
    this.tokens = [];
    this.accumulator = 0;
    this.timeScale = 1;
    this.physicsRate = this.stage.cruiseSpeed ?? 1;
    this.elapsedReal = 0;
    this.goalApproach = 0;
    this.camera = { x: this.stage.width / 2, y: 5.5, zoom: 1 };
    this.trails = new Map();
    this.stage.entities.forEach((def) => this._createEntity(def));
    const maxCount = Math.max(...tokens.map((t) => t.count ?? 1));
    this.tokens = tokens.map((t, i) =>
      this._createToken(t, i, tokens.length, maxCount),
    );
    this.tokens.forEach((item) => this.trails.set(item.token.id, []));
    this._rememberTransforms();
    return this.frame();
  }

  _progressStats() {
    const ys = this.tokens
      .map(({ body }) => body.GetPosition().y)
      .sort((a, b) => a - b);
    const frontY = ys.length ? ys[ys.length - 1] : 0;
    const followIndex = Math.max(0, Math.ceil((ys.length - 1) * 0.68));
    const followY = ys.length ? ys[followIndex] : frontY;
    const goalDist = Math.max(0, this.stage.goalY - frontY);
    const slowFactor = clamp(goalDist / this.stage.slowZone, 0, 1);
    const targetTimeScale =
      frontY >= this.stage.zoomY
        ? Math.max(this.stage.minTimeScale, slowFactor)
        : 1;
    const zoomProgress =
      frontY >= this.stage.zoomY
        ? clamp(1 - goalDist / this.stage.slowZone, 0, 1)
        : 0;
    return { frontY, followY, goalDist, targetTimeScale, zoomProgress };
  }

  _updateCamera(realDt, stats) {
    this.goalApproach = Math.max(this.goalApproach, stats.zoomProgress);
    const targetY = clamp(
      stats.followY + this.stage.cameraLead,
      5.5,
      this.stage.goalY - 1.8,
    );
    const targetZoom = lerp(
      1,
      this.stage.maxZoom,
      this.goalApproach * this.goalApproach,
    );
    this.camera.y = smooth(this.camera.y, targetY, realDt, 4.4);
    this.camera.zoom = smooth(this.camera.zoom, targetZoom, realDt, 3.6);
    this.camera.x = smooth(this.camera.x, this.stage.width / 2, realDt, 5.0);
  }

  _updateStuck(realDt) {
    for (const item of this.tokens) {
      const pos = item.body.GetPosition();
      const vel = item.body.GetLinearVelocity();
      const dx = pos.x - item.lastX;
      const dy = pos.y - item.lastY;
      const movedSq = dx * dx + dy * dy;
      const speedSq = vel.x * vel.x + vel.y * vel.y;
      const threshold = this.stage.stuckSpeed * this.stage.stuckSpeed;
      if (
        movedSq < 0.0012 &&
        speedSq < threshold &&
        pos.y < this.stage.goalY - 1.0
      ) {
        item.stuckFor += realDt;
      } else {
        item.stuckFor = Math.max(0, item.stuckFor - realDt * 0.5);
      }

      if (pos.y > item.maxY + 0.24) {
        item.maxY = pos.y;
        item.noDownFor = 0;
      } else if (pos.y < this.stage.goalY - 1.2) {
        item.noDownFor += realDt;
      }

      if (item.stuckFor >= this.stage.stuckDelay || item.noDownFor >= 2.8) {
        const h = hashString(`${item.token.id}-${item.kickCount}`);
        const recoveryCenter =
          this.stage.id === "twin-orbit"
            ? item.token.lane === 1
              ? 17.3
              : 6.7
            : this.stage.width / 2;
        const centerDelta = recoveryCenter - pos.x;
        const centerDir =
          Math.abs(centerDelta) > 0.35
            ? Math.sign(centerDelta)
            : h & 1
              ? 1
              : -1;
        // A small physical nudge, never a sudden replacement of velocity.
        const impulse = this._vec(centerDir * 1.35, 1.1);
        try {
          item.body.ApplyLinearImpulseToCenter(impulse, true);
        } finally {
          this._destroy(impulse);
        }
        item.body.SetAwake(true);
        item.stuckFor = 0;
        item.noDownFor = 0;
        item.kickCount += 1;
      }
      item.lastX = pos.x;
      item.lastY = pos.y;
    }
  }

  _updateTrails() {
    for (const item of this.tokens) {
      const p = this._transform(item);
      const trail = this.trails.get(item.token.id) || [];
      trail.push({ x: p.x, y: p.y });
      if (trail.length > 12) trail.shift();
      this.trails.set(item.token.id, trail);
    }
  }

  _rememberTransforms() {
    for (const item of [...this.entities, ...this.tokens]) {
      const p = item.body.GetPosition();
      item.previous = { x: p.x, y: p.y, angle: item.body.GetAngle() };
    }
  }

  _transform(item) {
    const p = item.body.GetPosition();
    const angle = item.body.GetAngle();
    const previous = item.previous || { x: p.x, y: p.y, angle };
    const alpha = clamp(this.accumulator / this.stage.fixedStep, 0, 1);
    return {
      x: lerp(previous.x, p.x, alpha),
      y: lerp(previous.y, p.y, alpha),
      angle: lerp(previous.angle, angle, alpha),
    };
  }

  step(realSeconds) {
    if (!this.world || !this.stage) return this.frame();
    const realDt = clamp(realSeconds, 0, 0.05);
    this.elapsedReal += realDt;
    const before = this._progressStats();
    this.timeScale = smooth(
      this.timeScale,
      before.targetTimeScale,
      realDt,
      5.2,
    );
    const cruiseRate = lerp(
      this.stage.cruiseSpeed ?? 1,
      1,
      before.zoomProgress,
    );
    this.physicsRate = cruiseRate * this.timeScale;
    this.accumulator += realDt * this.physicsRate;
    let guard = 0;
    while (this.accumulator >= this.stage.fixedStep && guard < 12) {
      this._rememberTransforms();
      this.world.Step(
        this.stage.fixedStep,
        this.stage.velocityIterations,
        this.stage.positionIterations,
      );
      this.accumulator -= this.stage.fixedStep;
      guard += 1;
    }
    this._updateStuck(guard * this.stage.fixedStep);
    this._updateTrails();
    const after = this._progressStats();
    this._updateCamera(realDt, after);
    return this.frame();
  }

  _entitySnapshot(item) {
    return { def: item.def, ...this._transform(item) };
  }

  frame() {
    if (!this.stage)
      return {
        tokens: [],
        entities: [],
        camera: this.camera,
        timeScale: 1,
        stage: null,
        stats: null,
      };
    const stats = this._progressStats();
    return {
      stage: this.stage,
      camera: { ...this.camera },
      timeScale: this.timeScale,
      physicsRate: this.physicsRate,
      stats: {
        ...stats,
        progress: clamp(stats.frontY / this.stage.goalY, 0, 1.2),
      },
      entities: this.entities.map((e) => this._entitySnapshot(e)),
      tokens: this.tokens.map((item) => {
        const { token, body, radius, stuckFor, kickCount } = item;
        const p = this._transform(item);
        const v = body.GetLinearVelocity();
        return {
          token,
          radius,
          x: p.x,
          y: p.y,
          angle: p.angle,
          vx: v.x,
          vy: v.y,
          stuckFor,
          kickCount,
          trail: [...(this.trails.get(token.id) || [])],
        };
      }),
    };
  }

  dispose() {
    if (this.world && this.Box2D) this._destroy(this.world);
    this.world = null;
    this.stage = null;
    this.entities = [];
    this.tokens = [];
    this.accumulator = 0;
    this.timeScale = 1;
    this.physicsRate = 1;
    this.elapsedReal = 0;
    this.camera = { x: 12, y: 5.5, zoom: 1 };
    this.trails = new Map();
  }

  _viewTransform(width, height) {
    const visibleWorldH = 13.6 / this.camera.zoom;
    const scale = height / visibleWorldH;
    return {
      scale,
      sx: (x) => width / 2 + (x - this.camera.x) * scale,
      sy: (y) => height / 2 + (y - this.camera.y) * scale,
    };
  }

  _drawEntity(ctx, snap, tx) {
    const { def } = snap;
    const x = tx.sx(snap.x),
      y = tx.sy(snap.y);
    const s = tx.scale;
    const kinetic = def.bodyType === "kinematic";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(snap.angle);
    const tone = def.tone || "steel";
    const fill = kinetic
      ? "rgba(255,194,88,.78)"
      : tone.includes("furnace")
        ? "rgba(198,76,28,.72)"
        : tone.includes("moon")
          ? "rgba(146,162,205,.74)"
          : "rgba(105,137,163,.68)";
    const stroke = kinetic ? "rgba(255,225,150,.96)" : "rgba(186,215,237,.82)";
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, s * 0.035);
    if (def.kind === "box") {
      ctx.beginPath();
      ctx.roundRect(
        -def.hw * s,
        -def.hh * s,
        def.hw * 2 * s,
        def.hh * 2 * s,
        Math.max(2, def.hh * s),
      );
      ctx.fill();
      ctx.stroke();
    } else if (def.kind === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, def.radius * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    if (def.kind === "polyline") {
      ctx.save();
      ctx.strokeStyle =
        def.tone === "finish"
          ? "rgba(255,205,96,.95)"
          : "rgba(112,150,181,.72)";
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      def.points.forEach(([px, py], i) => {
        const cx = tx.sx(px),
          cy = tx.sy(py);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawTrackAtmosphere(ctx, width, height, stage) {
    const [c0, c1, c2] = stage.palette;
    const bg = ctx.createRadialGradient(
      width * 0.5,
      height * 0.46,
      30,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    bg.addColorStop(0, c1);
    bg.addColorStop(0.58, c0);
    bg.addColorStop(1, "#020406");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = c2;
    for (let i = 0; i < 9; i += 1) {
      const y = (i / 8) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  render(
    ctx,
    width,
    height,
    { selectedLane = null, reveal = 0, showLabels = true } = {},
  ) {
    const frame = this.frame();
    if (!frame.stage) return frame;
    const stage = frame.stage;
    this._drawTrackAtmosphere(ctx, width, height, stage);
    const tx = this._viewTransform(width, height);

    for (const entity of frame.entities) this._drawEntity(ctx, entity, tx);

    const labelQueue = [];
    for (const snap of frame.tokens) {
      const x = tx.sx(snap.x),
        y = tx.sy(snap.y);
      const r = clamp(snap.radius * tx.scale, 12, 30);
      const selected =
        selectedLane === null || snap.token.lane === selectedLane;
      const alpha = selected ? 1 : Math.max(0.1, 1 - reveal * 0.86);
      const base =
        selectedLane !== null && selected && reveal > 0.15
          ? "#ffd166"
          : colorForLane(snap.token.lane ?? 0);

      if (snap.trail?.length > 1) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.18;
        ctx.strokeStyle = base;
        ctx.lineWidth = Math.max(1.5, r * 0.15);
        ctx.lineCap = "round";
        ctx.beginPath();
        snap.trail.forEach((p, i) => {
          const px = tx.sx(p.x),
            py = tx.sy(p.y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(snap.angle);
      if (selectedLane !== null && selected && reveal > 0.2) {
        ctx.shadowColor = "rgba(255,209,102,.95)";
        ctx.shadowBlur = 24;
      } else {
        ctx.shadowColor = base;
        ctx.shadowBlur = 10;
      }
      const g = ctx.createRadialGradient(
        -r * 0.34,
        -r * 0.38,
        r * 0.08,
        0,
        0,
        r,
      );
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.17, base);
      g.addColorStop(0.72, base);
      g.addColorStop(1, "#09121b");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeStyle =
        selected && reveal > 0.2 ? "#fff0b8" : "rgba(230,244,255,.58)";
      ctx.stroke();
      ctx.restore();

      if (showLabels) labelQueue.push({ snap, x, y, r, alpha, selected, base });
    }

    for (const item of labelQueue) {
      const { snap, x, y, r, alpha, selected } = item;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.font = `800 ${snap.token.count > 1 ? 12 : 13}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.82)";
      ctx.fillStyle = selected ? "#f6fbff" : "#aab3bd";
      const label = String(snap.token.label || "");
      const short = label.length > 12 ? `${label.slice(0, 11)}…` : label;
      ctx.strokeText(short, x, y - r - 10);
      ctx.fillText(short, x, y - r - 10);
      if ((snap.token.count ?? 1) > 1) {
        ctx.font = "800 10px system-ui, sans-serif";
        ctx.fillStyle = "#d5e5f2";
        ctx.fillText(`${snap.token.count}명`, x, y + 4);
      }
      ctx.restore();
    }

    return frame;
  }
}
