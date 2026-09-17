import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUND_SHOW_STAGES, stageForRound, finalStageForTarget } from '../src/round-show-config.js';

test('first four group rounds have distinct show stages', () => {
  const stages = [1, 2, 3, 4].map((n) => stageForRound(n));
  assert.equal(new Set(stages.map((s) => s.id)).size, 4);
  assert.deepEqual(stages.map((s) => s.title), [
    'STEEL DROP',
    'MOON ORBIT',
    'PINBALL GRID',
    'FURNACE SPLIT',
  ]);
});

test('fifth and later group rounds fall back to LAST GATE', () => {
  assert.equal(stageForRound(5).id, 'last-gate');
  assert.equal(stageForRound(99).id, 'last-gate');
});

test('every show stage declares its own tension phases', () => {
  for (const stage of ROUND_SHOW_STAGES) {
    assert.ok(stage.phaseStart);
    assert.ok(stage.phaseRun);
    assert.ok(stage.phaseTension);
    assert.ok(stage.phaseLock);
  }
});

test('final cuts use three distinct stages', () => {
  assert.equal(finalStageForTarget(4).id, 'spotlight-cut');
  assert.equal(finalStageForTarget(2).id, 'twin-orbit');
  assert.equal(finalStageForTarget(1).id, 'last-marble');
});
