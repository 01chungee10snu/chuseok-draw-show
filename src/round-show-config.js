export const ROUND_SHOW_STAGES = [
  {
    id: "steel-drop",
    title: "STEEL DROP",
    subtitle: "Gravity Launch",
    phaseStart: "MAGNET RELEASE",
    phaseRun: "STEEL DROP",
    phaseTension: "GATE APPROACH",
    phaseLock: "LANE LOCKED",
    accent: "steel",
  },
  {
    id: "moon-orbit",
    title: "MOON ORBIT",
    subtitle: "Orbital Survival",
    phaseStart: "ORBIT IGNITION",
    phaseRun: "FULL ORBIT",
    phaseTension: "DECAYING ORBIT",
    phaseLock: "ORBIT LOCKED",
    accent: "moon",
  },
  {
    id: "pinball-grid",
    title: "PINBALL GRID",
    subtitle: "Impact Matrix",
    phaseStart: "BALL RELEASE",
    phaseRun: "IMPACT RUN",
    phaseTension: "FINAL BOUNCE",
    phaseLock: "SLOT LOCKED",
    accent: "electric",
  },
  {
    id: "furnace-split",
    title: "FURNACE SPLIT",
    subtitle: "Heat Gate",
    phaseStart: "FURNACE ON",
    phaseRun: "HEAT RUN",
    phaseTension: "MELT ZONE",
    phaseLock: "STEEL GATE LOCKED",
    accent: "furnace",
  },
  {
    id: "last-gate",
    title: "LAST GATE",
    subtitle: "Final Group Trial",
    phaseStart: "FINAL GATE OPEN",
    phaseRun: "GROUP COLLISION",
    phaseTension: "LAST CHANCE",
    phaseLock: "FINAL GROUP LOCK",
    accent: "gold",
  },
];

export function stageForRound(roundNo = 1) {
  const n = Math.max(1, Number.parseInt(roundNo, 10) || 1);
  return ROUND_SHOW_STAGES[Math.min(n, ROUND_SHOW_STAGES.length) - 1];
}

export const FINAL_SHOW_STAGES = {
  four: {
    id: "spotlight-cut",
    title: "SPOTLIGHT CUT",
    subtitle: "Finalists under pressure",
    phaseStart: "LIGHTS ON",
    phaseRun: "SPOTLIGHT RUN",
    phaseTension: "LIGHTS CLOSING",
    phaseLock: "FINAL FOUR LOCKED",
  },
  two: {
    id: "twin-orbit",
    title: "TWIN ORBIT",
    subtitle: "Two seats remain",
    phaseStart: "TWIN LAUNCH",
    phaseRun: "ORBIT DUEL",
    phaseTension: "ORBIT COLLAPSE",
    phaseLock: "FINAL TWO LOCKED",
  },
  one: {
    id: "last-marble",
    title: "LAST MARBLE",
    subtitle: "One name remains",
    phaseStart: "FINAL RELEASE",
    phaseRun: "LAST RUN",
    phaseTension: "SLOW MOTION",
    phaseLock: "THE LAST ONE",
  },
};

export function finalStageForTarget(target) {
  if (target <= 1) return FINAL_SHOW_STAGES.one;
  if (target <= 2) return FINAL_SHOW_STAGES.two;
  return FINAL_SHOW_STAGES.four;
}
