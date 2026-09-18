const TAU = Math.PI * 2;

// The same continuous trajectory drives the colliding body and its visible pose.
// Time is simulated Box2D time, so obstacles also slow down at the finish.
export function obstaclePose(def, time) {
  const motion = def.motion;
  const phase = motion ? (TAU * time) / motion.period + (motion.phase ?? 0) : 0;
  return {
    x: (def.x ?? 0) + (motion?.x ?? 0) * Math.sin(phase),
    y:
      (def.y ?? 0) +
      (motion?.y ?? 0) *
        (motion?.kind === "orbit" ? Math.cos(phase) : Math.sin(phase)),
    angle:
      (def.angle ?? 0) +
      (def.angularVelocity ?? 0) * time +
      (motion?.swing ?? 0) * Math.sin(phase),
  };
}
