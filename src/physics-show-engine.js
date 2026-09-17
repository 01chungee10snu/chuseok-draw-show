import Box2DFactory from "box2d-wasm";

const PHYSICS_STAGE_IDS = new Set(["steel-drop", "pinball-grid", "last-marble"]);

export function isPhysicsStage(stageId) {
  return PHYSICS_STAGE_IDS.has(stageId);
}

const WORLD_W = 20;
const WORLD_H = 12;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export class PhysicsShowEngine {
  constructor() {
    this.Box2D = null;
    this.readyPromise = null;
    this.world = null;
    this.bodies = [];
    this.stageId = null;
    this.elapsed = 0;
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

  _createStaticBox(x, y, hw, hh, angle = 0, restitution = 0.35) {
    const B = this.Box2D;
    const def = new B.b2BodyDef();
    def.set_type(B.b2_staticBody);
    def.set_position(this._vec(x, y));
    def.set_angle(angle);
    const body = this.world.CreateBody(def);
    const shape = new B.b2PolygonShape();
    shape.SetAsBox(hw, hh, this._vec(0, 0), 0);
    const fixture = new B.b2FixtureDef();
    fixture.set_shape(shape);
    fixture.set_density(1);
    fixture.set_friction(0.24);
    fixture.set_restitution(restitution);
    body.CreateFixture(fixture);
    return body;
  }

  _createStaticCircle(x, y, radius, restitution = 0.7) {
    const B = this.Box2D;
    const def = new B.b2BodyDef();
    def.set_type(B.b2_staticBody);
    def.set_position(this._vec(x, y));
    const body = this.world.CreateBody(def);
    const shape = new B.b2CircleShape();
    shape.set_m_radius(radius);
    const fixture = new B.b2FixtureDef();
    fixture.set_shape(shape);
    fixture.set_density(1);
    fixture.set_friction(0.16);
    fixture.set_restitution(restitution);
    body.CreateFixture(fixture);
    return body;
  }

  _createDynamicBall(group, index, total, stageId) {
    const B = this.Box2D;
    const def = new B.b2BodyDef();
    def.set_type(B.b2_dynamicBody);
    let x;
    let y;
    if (stageId === "last-marble") {
      x = total === 1 ? 10 : 6.2 + (index / Math.max(1, total - 1)) * 7.6;
      y = 1.35 + (index % 2) * 0.12;
    } else {
      x = 3.0 + (index / Math.max(1, total - 1)) * 14.0;
      y = 0.9 + (index % 2) * 0.42;
    }
    def.set_position(this._vec(x, y));
    def.set_linearDamping(0.04);
    def.set_angularDamping(0.02);
    def.set_bullet(true);
    const body = this.world.CreateBody(def);
    const shape = new B.b2CircleShape();
    const radius = clamp(0.46 + Math.sqrt(Math.max(1, group.count)) * 0.026, 0.50, 0.78);
    shape.set_m_radius(radius);
    const fixture = new B.b2FixtureDef();
    fixture.set_shape(shape);
    fixture.set_density(1);
    fixture.set_friction(0.18);
    fixture.set_restitution(stageId === "pinball-grid" ? 0.72 : 0.46);
    body.CreateFixture(fixture);
    if (stageId === "last-marble") {
      const impulseX = index % 2 ? -0.22 : 0.22;
      body.ApplyLinearImpulseToCenter(this._vec(impulseX, 0), true);
    }
    return { body, group, radius };
  }

  _buildWalls() {
    this._createStaticBox(0.30, WORLD_H / 2, 0.30, WORLD_H / 2, 0, 0.25);
    this._createStaticBox(WORLD_W - 0.30, WORLD_H / 2, 0.30, WORLD_H / 2, 0, 0.25);
    this._createStaticBox(WORLD_W / 2, WORLD_H - 0.25, WORLD_W / 2, 0.25, 0, 0.25);
  }

  _buildSteelDrop() {
    this._buildWalls();
    const ramps = [
      [5.0, 3.0, 3.4, 0.16, 0.16],
      [15.0, 4.7, 3.4, 0.16, -0.16],
      [5.2, 6.4, 3.5, 0.16, 0.14],
      [14.8, 8.1, 3.5, 0.16, -0.14],
    ];
    ramps.forEach(([x, y, hw, hh, a]) => this._createStaticBox(x, y, hw, hh, a, 0.38));
    this._createStaticCircle(10, 4.1, 0.55, 0.72);
    this._createStaticCircle(10, 7.2, 0.55, 0.72);
  }

  _buildPinballGrid() {
    this._buildWalls();
    for (let row = 0; row < 5; row += 1) {
      const y = 2.6 + row * 1.55;
      const offset = row % 2 ? 1.55 : 0;
      for (let x = 2.8 + offset; x <= 17.2; x += 3.1) {
        this._createStaticCircle(x, y, 0.32, 0.88);
      }
    }
    this._createStaticBox(5.0, 10.05, 3.1, 0.13, -0.18, 0.62);
    this._createStaticBox(15.0, 10.05, 3.1, 0.13, 0.18, 0.62);
  }

  _buildLastMarble() {
    this._buildWalls();
    this._createStaticBox(5.0, 2.7, 4.2, 0.15, 0.14, 0.42);
    this._createStaticBox(15.0, 4.15, 4.2, 0.15, -0.14, 0.42);
    this._createStaticCircle(10, 5.2, 0.62, 0.78);
    this._createStaticBox(5.0, 7.15, 3.4, 0.15, -0.12, 0.48);
    this._createStaticBox(15.0, 8.55, 3.4, 0.15, 0.12, 0.48);
  }

  async start(stageId, groups) {
    if (!isPhysicsStage(stageId)) throw new Error(`Physics stage not enabled: ${stageId}`);
    await this.ready();
    const B = this.Box2D;
    const gravity = stageId === "last-marble" ? 8.8 : stageId === "pinball-grid" ? 10.4 : 9.8;
    this.world = new B.b2World(this._vec(0, gravity));
    this.stageId = stageId;
    this.elapsed = 0;
    if (stageId === "steel-drop") this._buildSteelDrop();
    else if (stageId === "pinball-grid") this._buildPinballGrid();
    else this._buildLastMarble();
    this.bodies = groups.map((group, index) => this._createDynamicBall(group, index, groups.length, stageId));
    return this.snapshot();
  }

  step(seconds) {
    if (!this.world) return [];
    const dt = clamp(seconds, 0, 0.05);
    let remaining = dt;
    while (remaining > 0) {
      const h = Math.min(1 / 120, remaining);
      this.world.Step(h, 8, 3);
      remaining -= h;
    }
    this.elapsed += dt;
    return this.snapshot();
  }

  snapshot() {
    return this.bodies.map(({ body, group, radius }, index) => {
      const p = body.GetPosition();
      const v = body.GetLinearVelocity();
      return {
        index,
        group,
        radius,
        x: clamp(p.x, -2, WORLD_W + 2),
        y: clamp(p.y, -2, WORLD_H + 2),
        vx: v.x,
        vy: v.y,
        angle: body.GetAngle(),
      };
    });
  }

  static worldToCanvas(position, width, height) {
    return {
      x: (position.x / WORLD_W) * width,
      y: (position.y / WORLD_H) * height,
      radiusScale: Math.min(width / WORLD_W, height / WORLD_H),
    };
  }
}
