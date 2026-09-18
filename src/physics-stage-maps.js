const PI = Math.PI;

const box = (x, y, hw, hh, angle = 0, opts = {}) => ({
  kind: "box",
  x,
  y,
  hw,
  hh,
  angle,
  bodyType: opts.bodyType || "static",
  angularVelocity: opts.angularVelocity || 0,
  restitution: opts.restitution ?? 0.34,
  friction: opts.friction ?? 0.22,
  tone: opts.tone || "steel",
});

const circle = (x, y, radius, opts = {}) => ({
  kind: "circle",
  x,
  y,
  radius,
  bodyType: opts.bodyType || "static",
  angularVelocity: opts.angularVelocity || 0,
  restitution: opts.restitution ?? 0.72,
  friction: opts.friction ?? 0.14,
  tone: opts.tone || "steel",
});

const line = (points, opts = {}) => ({
  kind: "polyline",
  points,
  bodyType: "static",
  restitution: opts.restitution ?? 0.26,
  friction: opts.friction ?? 0.2,
  tone: opts.tone || "rail",
});

const spinner = (x, y, length = 2.8, speed = 1.8, angle = 0, opts = {}) =>
  box(x, y, length, opts.thickness ?? 0.12, angle, {
    ...opts,
    bodyType: "kinematic",
    angularVelocity: speed,
    restitution: opts.restitution ?? 0.72,
    tone: opts.tone || "kinetic",
  });

function walls(width, goalY) {
  return [
    line(
      [
        [1.0, -4],
        [1.0, goalY + 2],
      ],
      { tone: "wall", restitution: 0.18 },
    ),
    line(
      [
        [width - 1.0, -4],
        [width - 1.0, goalY + 2],
      ],
      { tone: "wall", restitution: 0.18 },
    ),
    line(
      [
        [1.0, goalY + 1],
        [width - 1.0, goalY + 1],
      ],
      { tone: "finish", restitution: 0.15 },
    ),
  ];
}

function alternatingRails(width, ys, gap = 5.2, angle = 0.12) {
  const cx = width / 2;
  // Extend the outer ends into the wall; a narrow gap there traps marbles.
  const hw = (cx - gap / 2 - 0.7) / 2;
  const leftX = 0.7 + hw;
  const rightX = width - 0.7 - hw;
  const out = [];
  ys.forEach((y, i) => {
    const mag = Math.max(0.2, Math.abs(angle));
    if (i % 2 === 0) {
      out.push(
        box(leftX, y, hw, 0.12, mag, {
          restitution: 0.34,
          friction: 0.035,
          tone: "rail",
        }),
      );
    } else {
      out.push(
        box(rightX, y, hw, 0.12, -mag, {
          restitution: 0.34,
          friction: 0.035,
          tone: "rail",
        }),
      );
    }
  });
  return out;
}

function pegField({
  width,
  startY,
  rows,
  cols,
  xMargin = 3.0,
  rowGap = 2.05,
  radius = 0.29,
  restitution = 0.82,
}) {
  const out = [];
  const usable = width - xMargin * 2;
  for (let r = 0; r < rows; r += 1) {
    const offset = r % 2 ? usable / Math.max(1, cols - 1) / 2 : 0;
    for (let c = 0; c < cols; c += 1) {
      const x = xMargin + (usable * c) / Math.max(1, cols - 1) + offset;
      if (x > width - xMargin + 0.15) continue;
      out.push(
        circle(x, startY + r * rowGap, radius, { restitution, tone: "peg" }),
      );
    }
  }
  return out;
}

function ellipticalPegRing(cx, cy, rx, ry, count, gapIndex = -1, opts = {}) {
  const out = [];
  const gaps = Array.isArray(gapIndex) ? gapIndex : [gapIndex];
  for (let i = 0; i < count; i += 1) {
    if (
      gaps.some(
        (gap) =>
          gap >= 0 &&
          Math.min(Math.abs(i - gap), count - Math.abs(i - gap)) <= 1,
      )
    )
      continue;
    const a = (i / count) * PI * 2;
    out.push(
      circle(
        cx + Math.cos(a) * rx,
        cy + Math.sin(a) * ry,
        opts.radius ?? 0.28,
        {
          restitution: opts.restitution ?? 0.76,
          tone: opts.tone || "moonPeg",
        },
      ),
    );
  }
  return out;
}

function crossSpinner(x, y, length, speed, opts = {}) {
  return [
    spinner(x, y, length, speed, 0, opts),
    spinner(x, y, length, speed, PI / 2, opts),
  ];
}

function steelDrop() {
  const width = 24,
    goalY = 46;
  const entities = [
    ...walls(width, goalY),
    circle(3.25, 3.8, 0.42, { restitution: 0.58, tone: "entryBumper" }),
    circle(width - 3.25, 3.8, 0.42, { restitution: 0.58, tone: "entryBumper" }),
    ...alternatingRails(width, [6, 12, 19, 35], 5.4, 0.22),
    ...pegField({
      width,
      startY: 9.0,
      rows: 2,
      cols: 6,
      xMargin: 3.6,
      rowGap: 2.1,
      radius: 0.25,
      restitution: 0.66,
    }),
    ...pegField({
      width,
      startY: 31.0,
      rows: 1,
      cols: 6,
      xMargin: 3.6,
      rowGap: 2.05,
      radius: 0.24,
      restitution: 0.62,
    }),
    spinner(12, 16.1, 3.1, 1.45, 0.22),
    spinner(12, 24.0, 2.55, -1.55, -0.18),
    spinner(12, 39.2, 2.8, 1.95, 0.0),
    box(5.2, 43.2, 3.2, 0.13, 0.2, { friction: 0.04, tone: "finishRail" }),
    box(18.8, 43.2, 3.2, 0.13, -0.2, { friction: 0.04, tone: "finishRail" }),
  ];
  return stage("steel-drop", width, goalY, entities, {
    gravity: 10.3,
    palette: ["#07101a", "#18344c", "#7e9cb5"],
    cameraLead: 1.2,
  });
}

function moonOrbit() {
  const width = 24,
    goalY = 43;
  const entities = [...walls(width, goalY)];
  [10, 21.5, 33].forEach((cy, i) => {
    entities.push(
      ...ellipticalPegRing(12, cy, 7.8 - i * 0.6, 3.15, 22, i % 2 ? 6 : 17, {
        radius: 0.27,
        restitution: 0.78,
      }),
    );
    entities.push(
      ...crossSpinner(12, cy, 3.0 - i * 0.2, i % 2 ? -1.25 : 1.35, {
        tone: "moonBlade",
        restitution: 0.68,
      }),
    );
  });
  entities.push(...alternatingRails(width, [15.5, 27.3, 38.0], 6.4, 0.09));
  return stage("moon-orbit", width, goalY, entities, {
    gravity: 7.8,
    palette: ["#05070c", "#18243e", "#d0c179"],
    cameraLead: 0.8,
  });
}

function pinballGrid() {
  const width = 24,
    goalY = 50;
  const entities = [
    ...walls(width, goalY),
    ...pegField({
      width,
      startY: 6.0,
      rows: 8,
      cols: 7,
      xMargin: 3.0,
      rowGap: 3.25,
      radius: 0.3,
      restitution: 0.91,
    }),
    ...crossSpinner(7.0, 18.0, 2.0, 2.2, {
      tone: "electric",
      restitution: 0.88,
    }),
    ...crossSpinner(17.0, 28.0, 2.0, -2.35, {
      tone: "electric",
      restitution: 0.88,
    }),
    spinner(12, 38.0, 3.0, 2.55, 0, { tone: "electric", restitution: 0.92 }),
    box(5.2, 46.4, 3.9, 0.13, 0.22, { restitution: 0.56, friction: 0.04 }),
    box(18.8, 46.4, 3.9, 0.13, -0.22, { restitution: 0.56, friction: 0.04 }),
  ];
  return stage("pinball-grid", width, goalY, entities, {
    gravity: 10.7,
    palette: ["#06101d", "#0e4162", "#64d9ff"],
    cameraLead: 1.0,
  });
}

function furnaceSplit() {
  const width = 24,
    goalY = 42;
  const entities = [
    ...walls(width, goalY),
    ...alternatingRails(width, [7, 16, 25, 33], 6.2, 0.22),
    ...crossSpinner(12, 11.2, 3.4, 1.55, {
      tone: "furnace",
      restitution: 0.65,
    }),
    ...crossSpinner(12, 21.0, 3.0, -1.85, {
      tone: "furnace",
      restitution: 0.7,
    }),
    ...crossSpinner(12, 31.0, 3.5, 2.05, {
      tone: "furnace",
      restitution: 0.74,
    }),
    ...pegField({
      width,
      startY: 35.0,
      rows: 2,
      cols: 6,
      xMargin: 3.6,
      rowGap: 1.85,
      radius: 0.27,
      restitution: 0.68,
    }),
    box(4.8, 39.4, 3.5, 0.13, 0.22, { friction: 0.04, tone: "furnace" }),
    box(19.2, 39.4, 3.5, 0.13, -0.22, { friction: 0.04, tone: "furnace" }),
  ];
  return stage("furnace-split", width, goalY, entities, {
    gravity: 9.7,
    palette: ["#100604", "#57200e", "#ff9344"],
    cameraLead: 1.0,
  });
}

function lastGate() {
  const width = 24,
    goalY = 42;
  const entities = [...walls(width, goalY)];
  [7.5, 14.5, 21.5, 28.5, 35.5].forEach((y, i) => {
    entities.push(
      spinner(
        12,
        y,
        4.2 - i * 0.25,
        (i % 2 ? -1 : 1) * (1.6 + i * 0.18),
        i % 2 ? 0.35 : -0.35,
        { tone: "gate", restitution: 0.74 },
      ),
    );
    entities.push(
      box(i % 2 ? 5.2 : 18.8, y + 2.0, 2.55, 0.12, i % 2 ? 0.24 : -0.24, {
        friction: 0.035,
        tone: "gate",
      }),
    );
  });
  entities.push(
    ...pegField({
      width,
      startY: 11.9,
      rows: 4,
      cols: 5,
      xMargin: 4.5,
      rowGap: 7.0,
      radius: 0.27,
      restitution: 0.72,
    }),
  );
  return stage("last-gate", width, goalY, entities, {
    gravity: 9.2,
    palette: ["#090705", "#443113", "#ffd166"],
    cameraLead: 0.7,
  });
}

function spotlightCut() {
  const width = 24,
    goalY = 38;
  const entities = [
    ...walls(width, goalY),
    ...ellipticalPegRing(12, 10.5, 8.0, 3.0, 24, 18, {
      radius: 0.25,
      restitution: 0.72,
      tone: "spot",
    }),
    ...ellipticalPegRing(12, 23.0, 7.0, 2.8, 20, 5, {
      radius: 0.25,
      restitution: 0.76,
      tone: "spot",
    }),
    ...crossSpinner(12, 16.5, 3.0, 1.65, { tone: "spot", restitution: 0.76 }),
    ...crossSpinner(12, 29.5, 2.8, -1.9, { tone: "spot", restitution: 0.78 }),
    ...alternatingRails(width, [32.5], 5.6, 0.13),
  ];
  return stage("spotlight-cut", width, goalY, entities, {
    gravity: 8.5,
    palette: ["#050608", "#252016", "#ffe8a3"],
    cameraLead: 0.6,
  });
}

function twinOrbit() {
  const width = 24,
    goalY = 36;
  const entities = [
    ...walls(width, goalY),
    line(
      [
        [12, 5.5],
        [12, 30.5],
      ],
      { tone: "divider", restitution: 0.35 },
    ),
    ...ellipticalPegRing(6.7, 13.0, 3.6, 3.0, 16, [4, 12], {
      radius: 0.25,
      restitution: 0.8,
    }),
    ...ellipticalPegRing(17.3, 13.0, 3.6, 3.0, 16, [4, 12], {
      radius: 0.25,
      restitution: 0.8,
    }),
    ...ellipticalPegRing(6.7, 25.0, 3.4, 2.8, 14, [3, 10], {
      radius: 0.25,
      restitution: 0.82,
    }),
    ...ellipticalPegRing(17.3, 25.0, 3.4, 2.8, 14, [3, 10], {
      radius: 0.25,
      restitution: 0.82,
    }),
    spinner(6.7, 19.2, 2.1, 2.1, 0, { tone: "orbit" }),
    spinner(17.3, 19.2, 2.1, -2.1, 0, { tone: "orbit" }),
  ];
  return stage("twin-orbit", width, goalY, entities, {
    gravity: 7.9,
    palette: ["#06070a", "#1d2640", "#b6c9ff"],
    cameraLead: 0.5,
  });
}

function lastMarble() {
  const width = 24,
    goalY = 41;
  const entities = [
    ...walls(width, goalY),
    box(6.4, 6.5, 3.25, 0.12, 0.24, {
      restitution: 0.4,
      friction: 0.03,
      tone: "finalRail",
    }),
    box(17.6, 10.0, 3.25, 0.12, -0.24, {
      restitution: 0.4,
      friction: 0.03,
      tone: "finalRail",
    }),
    spinner(12, 14.0, 3.7, 1.35, 0.15, {
      tone: "finalBlade",
      restitution: 0.72,
    }),
    ...pegField({
      width,
      startY: 18.0,
      rows: 4,
      cols: 6,
      xMargin: 3.6,
      rowGap: 2.5,
      radius: 0.28,
      restitution: 0.84,
    }),
    spinner(12, 29.0, 3.2, -1.55, -0.1, {
      tone: "finalBlade",
      restitution: 0.74,
    }),
    box(6.2, 34.2, 3.0, 0.12, 0.24, {
      restitution: 0.44,
      friction: 0.03,
      tone: "finalRail",
    }),
    box(17.8, 36.8, 3.0, 0.12, -0.24, {
      restitution: 0.44,
      friction: 0.03,
      tone: "finalRail",
    }),
    circle(12, 37.2, 0.56, { restitution: 0.82, tone: "finalPeg" }),
  ];
  return stage("last-marble", width, goalY, entities, {
    gravity: 8.8,
    palette: ["#030405", "#2e210c", "#ffd166"],
    cameraLead: 0.35,
  });
}

function stage(id, width, goalY, entities, opts) {
  const kinematicCount = entities.filter(
    (e) => e.bodyType === "kinematic",
  ).length;
  return {
    id,
    width,
    height: goalY + 2,
    goalY,
    entities,
    fixedStep: 0.01,
    velocityIterations: 8,
    positionIterations: 3,
    stuckDelay: 2.25,
    stuckSpeed: 0.11,
    ...opts,
    // A readable, unhurried race. Slow motion is confined to the finish approach.
    gravity: opts.gravity * 0.85,
    cruiseSpeed: 1,
    minTimeScale: 0.58,
    slowZone: 5,
    zoomY: goalY - 5,
    maxZoom: 1.6,
    quality: {
      entityCount: entities.length,
      kinematicCount,
      courseHeight: goalY,
      cruiseSpeed: 1,
      hasCamera: true,
      hasSlowMotion: true,
      hasStuckWatchdog: true,
    },
  };
}

const BUILDERS = {
  "steel-drop": steelDrop,
  "moon-orbit": moonOrbit,
  "pinball-grid": pinballGrid,
  "furnace-split": furnaceSplit,
  "last-gate": lastGate,
  "spotlight-cut": spotlightCut,
  "twin-orbit": twinOrbit,
  "last-marble": lastMarble,
};

export const PHYSICS_STAGE_IDS = Object.freeze(Object.keys(BUILDERS));

export function getPhysicsStageSpec(stageId) {
  const builder = BUILDERS[stageId];
  if (!builder) throw new Error(`Unknown physics stage: ${stageId}`);
  return builder();
}

export function getPhysicsQualitySummary() {
  return Object.fromEntries(
    PHYSICS_STAGE_IDS.map((id) => {
      const s = getPhysicsStageSpec(id);
      return [
        id,
        {
          ...s.quality,
          fixedStep: s.fixedStep,
          minTimeScale: s.minTimeScale,
          maxZoom: s.maxZoom,
          cruiseSpeed: s.cruiseSpeed,
        },
      ];
    }),
  );
}
