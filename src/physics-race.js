const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const SAMPLE_STEP = 0.01;

// The fair draw is authoritative. Before anything is displayed, assign its
// qualifiers to the qualifying paths of one real Box2D simulation. All path
// bodies are identical; names and group population never affect collisions.
// The assignment is immutable during playback, including pause and retry.
export async function preparePhysicsRace(
  engine,
  stageId,
  tokens,
  advancingIds,
  { minimumDuration = 18, seed = 0 } = {},
) {
  const ids = new Set(tokens.map((t) => t.id));
  const advancing = new Set(advancingIds);
  if (
    ids.size !== tokens.length ||
    !advancing.size ||
    advancing.size !== advancingIds.length ||
    [...advancing].some((id) => !ids.has(id))
  )
    throw new Error("골인 대상과 참가 공이 일치하지 않습니다.");
  const paths = tokens.map((_, i) => ({
    id: `path-${seed}-${i}`,
    lane: i % 2,
    count: 1,
  }));
  let frame = await engine.start(stageId, paths);
  const stage = frame.stage;
  const entities = frame.entities;
  const radii = frame.tokens.map((t) => t.radius);
  const compact = (f) => ({
    tokens: f.tokens.map((t) => [t.x, t.y, t.angle]),
    angles: f.entities.map((e) => e.angle),
    camera: { ...f.camera },
    timeScale: f.timeScale,
  });
  const samples = [compact(frame)];
  const crossings = new Map();
  // Bounded preparation; a bad course falls back transparently, never fabricates
  // a finish or changes the committed draw. Yield so the loading UI can paint.
  for (let step = 1; step <= 6000 && crossings.size < advancing.size; step++) {
    const previous = frame;
    frame = engine.step(SAMPLE_STEP);
    samples.push(compact(frame));
    frame.tokens.forEach((token, i) => {
      if (crossings.has(i) || token.y < stage.goalY) return;
      const y0 = previous.tokens[i].y;
      const fraction = clamp(
        (stage.goalY - y0) / Math.max(1e-10, token.y - y0),
        0,
        1,
      );
      crossings.set(i, (step - 1 + fraction) * SAMPLE_STEP);
    });
    if (step % 250 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (crossings.size < advancing.size) {
    engine.dispose();
    throw new Error("코스 준비 시간 안에 골인 경로를 확보하지 못했습니다.");
  }
  const order = [...crossings].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const qualifiedPaths = order.slice(0, advancing.size);
  const qualifiers = tokens.filter((t) => advancing.has(t.id));
  const rest = tokens.filter((t) => !advancing.has(t.id));
  const assigned = new Array(tokens.length);
  qualifiedPaths.forEach(([index], i) => {
    assigned[index] = { ...qualifiers[i] };
  });
  for (let i = 0, next = 0; i < assigned.length; i++)
    if (!assigned[i]) assigned[i] = { ...rest[next++] };
  const finishTime = qualifiedPaths.at(-1)[1];
  const duration = Math.max(minimumDuration, finishTime);
  engine.dispose();
  return {
    duration,
    finishTime,
    stage,
    assignment: assigned.map((t) => t.id),
    sample(elapsed) {
      const simulationTime = clamp(elapsed / duration, 0, 1) * finishTime;
      const index = Math.min(
        samples.length - 2,
        Math.floor(simulationTime / SAMPLE_STEP),
      );
      const mix = clamp(simulationTime / SAMPLE_STEP - index, 0, 1);
      const a = samples[index],
        b = samples[index + 1];
      const arrivedIds = qualifiedPaths
        .filter(([, time]) => time <= simulationTime + 1e-8)
        .map(([i]) => assigned[i].id);
      const positions = assigned.map((token, i) => ({
        token,
        radius: radii[i],
        x: lerp(a.tokens[i][0], b.tokens[i][0], mix),
        y: lerp(a.tokens[i][1], b.tokens[i][1], mix),
        angle: lerp(a.tokens[i][2], b.tokens[i][2], mix),
        arrived: arrivedIds.includes(token.id),
        trail: [Math.max(0, index - 12), Math.max(0, index - 6), index].map(
          (j) => ({
            x: samples[j].tokens[i][0],
            y: samples[j].tokens[i][1],
          }),
        ),
      }));
      return {
        stage,
        tokens: positions,
        entities: entities.map((e, i) => ({
          ...e,
          angle: lerp(a.angles[i], b.angles[i], mix),
        })),
        camera: Object.fromEntries(
          ["x", "y", "zoom"].map((k) => [
            k,
            lerp(a.camera[k], b.camera[k], mix),
          ]),
        ),
        timeScale: lerp(a.timeScale, b.timeScale, mix),
        stats: {
          progress: Math.max(...positions.map((t) => t.y)) / stage.goalY,
        },
        arrivedIds,
        complete: elapsed >= duration,
      };
    },
  };
}
