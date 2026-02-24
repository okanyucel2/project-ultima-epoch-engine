// =============================================================================
// AEGISSupervisor Tests — Cognitive Intervention based on Infestation Level
// =============================================================================

import { AEGISSupervisor } from '../src/services/aegis-supervisor';

describe('AEGISSupervisor', () => {
  let supervisor: AEGISSupervisor;

  beforeEach(() => {
    supervisor = new AEGISSupervisor();
  });

  // ---------------------------------------------------------------------------
  // ALLOW — below 50
  // ---------------------------------------------------------------------------
  test('allows any action when infestation < 50', () => {
    supervisor.updateInfestationLevel(0);
    const result = supervisor.evaluateAction('command', 0.9, 'npc-1');
    expect(result.decision).toBe('allow');
    expect(result.vetoedByAegis).toBe(false);
    expect(result.message).toBeUndefined();
  });

  test('allows at infestation level 49', () => {
    supervisor.updateInfestationLevel(49);
    const result = supervisor.evaluateAction('punishment', 0.8);
    expect(result.decision).toBe('allow');
    expect(result.vetoedByAegis).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // WHISPER — 50-99 (advisory, doesn't block)
  // ---------------------------------------------------------------------------
  test('whispers at infestation level 50', () => {
    supervisor.updateInfestationLevel(50);
    const result = supervisor.evaluateAction('command', 0.9, 'npc-2');
    expect(result.decision).toBe('whisper');
    expect(result.vetoedByAegis).toBe(false);
    expect(result.message).toContain('AEGIS Advisory');
    expect(result.message).toContain('50/100');
  });

  test('whispers at infestation level 75', () => {
    supervisor.updateInfestationLevel(75);
    const result = supervisor.evaluateAction('punishment', 0.9);
    expect(result.decision).toBe('whisper');
    expect(result.vetoedByAegis).toBe(false);
    expect(result.message).toContain('HIGH');
  });

  test('whispers at infestation level 99', () => {
    supervisor.updateInfestationLevel(99);
    const result = supervisor.evaluateAction('command', 0.8);
    expect(result.decision).toBe('whisper');
    expect(result.vetoedByAegis).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // VETO — 100 + aggressive action
  // ---------------------------------------------------------------------------
  test('vetoes aggressive command at plague heart (100)', () => {
    supervisor.updateInfestationLevel(100);
    const result = supervisor.evaluateAction('command', 0.9, 'npc-3');
    expect(result.decision).toBe('veto');
    expect(result.vetoedByAegis).toBe(true);
    expect(result.message).toContain('AEGIS VETO');
    expect(result.message).toContain('Plague Heart');
    expect(result.message).toContain('npc-3');
  });

  test('vetoes aggressive punishment at plague heart (100)', () => {
    supervisor.updateInfestationLevel(100);
    const result = supervisor.evaluateAction('punishment', 0.7);
    expect(result.decision).toBe('veto');
    expect(result.vetoedByAegis).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Non-aggressive at plague heart → whisper (not veto)
  // ---------------------------------------------------------------------------
  test('whispers for non-aggressive action at plague heart (100)', () => {
    supervisor.updateInfestationLevel(100);
    const result = supervisor.evaluateAction('dialogue', 0.9);
    expect(result.decision).toBe('whisper');
    expect(result.vetoedByAegis).toBe(false);
    expect(result.message).toContain('CRITICAL');
  });

  test('whispers for reward action at plague heart (100)', () => {
    supervisor.updateInfestationLevel(100);
    const result = supervisor.evaluateAction('reward', 0.5);
    expect(result.decision).toBe('whisper');
    expect(result.vetoedByAegis).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Low intensity at plague heart → whisper (not veto)
  // ---------------------------------------------------------------------------
  test('whispers for low-intensity command at plague heart (100)', () => {
    supervisor.updateInfestationLevel(100);
    // intensity 0.3 < 0.5 threshold → not aggressive
    const result = supervisor.evaluateAction('command', 0.3);
    expect(result.decision).toBe('whisper');
    expect(result.vetoedByAegis).toBe(false);
  });

  test('whispers for exactly threshold intensity (0.5) command at plague heart', () => {
    supervisor.updateInfestationLevel(100);
    // intensity must be > 0.5, not >= 0.5
    const result = supervisor.evaluateAction('command', 0.5);
    expect(result.decision).toBe('whisper');
    expect(result.vetoedByAegis).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // isAggressiveAction helper
  // ---------------------------------------------------------------------------
  test('identifies aggressive actions correctly', () => {
    expect(supervisor.isAggressiveAction('command', 0.8)).toBe(true);
    expect(supervisor.isAggressiveAction('punishment', 0.6)).toBe(true);
    expect(supervisor.isAggressiveAction('command', 0.3)).toBe(false);
    expect(supervisor.isAggressiveAction('dialogue', 0.9)).toBe(false);
    expect(supervisor.isAggressiveAction('reward', 0.9)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Level clamping
  // ---------------------------------------------------------------------------
  test('clamps infestation level to 0-100 range', () => {
    supervisor.updateInfestationLevel(-10);
    expect(supervisor.getInfestationLevel()).toBe(0);

    supervisor.updateInfestationLevel(150);
    expect(supervisor.getInfestationLevel()).toBe(100);
  });
});
