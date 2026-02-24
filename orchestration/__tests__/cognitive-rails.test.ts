// =============================================================================
// CognitiveRails Tests — AEGIS Cognitive Rails decision interceptor
// =============================================================================

import { CognitiveRails } from '../src/neural-mesh/cognitive-rails';
import { z } from 'zod';

describe('CognitiveRails', () => {
  let rails: CognitiveRails;

  beforeEach(() => {
    rails = new CognitiveRails();
  });

  // ---------------------------------------------------------------------------
  // Test 1: Allows when rebellion probability < 0.80
  // ---------------------------------------------------------------------------
  test('allows when rebellion probability is below threshold (0.80)', () => {
    const result = rails.checkRebellionThreshold(0.50);
    expect(result.allowed).toBe(true);
    expect(result.vetoReason).toBeUndefined();
  });

  test('allows at rebellion probability exactly 0.79', () => {
    const result = rails.checkRebellionThreshold(0.79);
    expect(result.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Vetoes when rebellion probability >= 0.80
  // ---------------------------------------------------------------------------
  test('vetoes when rebellion probability exceeds threshold (>= 0.80)', () => {
    const result = rails.checkRebellionThreshold(0.80);
    expect(result.allowed).toBe(false);
    expect(result.vetoReason?.toLowerCase()).toContain('rebellion');
    expect(result.ruleViolated).toBe('rebellion_threshold');
  });

  test('vetoes at maximum rebellion probability (1.0)', () => {
    const result = rails.checkRebellionThreshold(1.0);
    expect(result.allowed).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Allows valid non-empty AI response
  // ---------------------------------------------------------------------------
  test('allows valid non-empty AI response', () => {
    const result = rails.checkResponseCoherence('NPC-001 should proceed to mine sector 7');
    expect(result.allowed).toBe(true);
  });

  test('allows response matching expected schema', () => {
    const schema = z.object({ action: z.string(), target: z.string() });
    // Note: checkResponseCoherence checks string non-emptiness and optional schema
    // Schema validation applies to JSON-parseable responses
    const jsonResponse = JSON.stringify({ action: 'mine', target: 'sector-7' });
    const result = rails.checkResponseCoherence(jsonResponse, schema);
    expect(result.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Vetoes empty or malformed AI response
  // ---------------------------------------------------------------------------
  test('vetoes empty AI response', () => {
    const result = rails.checkResponseCoherence('');
    expect(result.allowed).toBe(false);
    expect(result.vetoReason).toContain('empty');
    expect(result.ruleViolated).toBe('response_coherence');
  });

  test('vetoes whitespace-only AI response', () => {
    const result = rails.checkResponseCoherence('   \n\t  ');
    expect(result.allowed).toBe(false);
    expect(result.ruleViolated).toBe('response_coherence');
  });

  test('vetoes response not matching expected schema', () => {
    const schema = z.object({ action: z.string(), target: z.string() });
    const badJson = JSON.stringify({ foo: 'bar' });
    const result = rails.checkResponseCoherence(badJson, schema);
    expect(result.allowed).toBe(false);
    expect(result.ruleViolated).toBe('response_coherence');
  });

  // ---------------------------------------------------------------------------
  // Test 5: Logs warning for slow latency but doesn't veto
  // ---------------------------------------------------------------------------
  test('allows response within latency budget', () => {
    const result = rails.checkLatencyBudget(2000, 5000);
    expect(result.allowed).toBe(true);
  });

  test('allows but warns when latency exceeds budget (no veto)', () => {
    const result = rails.checkLatencyBudget(6000, 5000);
    // Latency rail warns but does NOT veto — it's a soft constraint
    expect(result.allowed).toBe(true);
    expect(result.vetoReason).toContain('latency');
    expect(result.ruleViolated).toBe('latency_budget');
  });

  // ---------------------------------------------------------------------------
  // evaluateAll combined checks
  // ---------------------------------------------------------------------------
  test('evaluateAll returns allowed when all rails pass', () => {
    const result = rails.evaluateAll({
      rebellionProbability: 0.30,
      aiResponse: 'Valid response content',
      latencyMs: 1000,
    });
    expect(result.allowed).toBe(true);
  });

  test('evaluateAll vetoes when rebellion threshold exceeded', () => {
    const result = rails.evaluateAll({
      rebellionProbability: 0.90,
      aiResponse: 'Valid response content',
      latencyMs: 1000,
    });
    expect(result.allowed).toBe(false);
    expect(result.ruleViolated).toBe('rebellion_threshold');
  });

  test('evaluateAll vetoes when response is empty (even if rebellion is fine)', () => {
    const result = rails.evaluateAll({
      rebellionProbability: 0.10,
      aiResponse: '',
      latencyMs: 1000,
    });
    expect(result.allowed).toBe(false);
    expect(result.ruleViolated).toBe('response_coherence');
  });

  // ---------------------------------------------------------------------------
  // AEGIS Infestation Rail (Rail 4)
  // ---------------------------------------------------------------------------
  test('AEGIS rail allows when infestation below 50', () => {
    const result = rails.checkAEGISInfestation(30, 'command', 0.9);
    expect(result.allowed).toBe(true);
    expect(result.vetoReason).toBeUndefined();
  });

  test('AEGIS rail warns (allows) at infestation 50-99', () => {
    const result = rails.checkAEGISInfestation(65, 'command', 0.9);
    expect(result.allowed).toBe(true);
    expect(result.vetoReason).toContain('WARNING');
    expect(result.ruleViolated).toBe('aegis_infestation');
  });

  test('AEGIS rail vetoes aggressive action at infestation 100', () => {
    const result = rails.checkAEGISInfestation(100, 'command', 0.9);
    expect(result.allowed).toBe(false);
    expect(result.vetoReason).toContain('VETO');
    expect(result.ruleViolated).toBe('aegis_infestation');
  });

  test('AEGIS rail warns (not veto) for non-aggressive at infestation 100', () => {
    const result = rails.checkAEGISInfestation(100, 'dialogue', 0.9);
    expect(result.allowed).toBe(true);
    expect(result.vetoReason).toContain('Plague Heart');
  });

  test('evaluateAll integrates AEGIS rail — vetoes at plague heart + aggressive', () => {
    const result = rails.evaluateAll({
      rebellionProbability: 0.30,
      aiResponse: 'Valid response',
      latencyMs: 1000,
      infestationLevel: 100,
      eventType: 'punishment',
      intensity: 0.8,
    });
    expect(result.allowed).toBe(false);
    expect(result.ruleViolated).toBe('aegis_infestation');
  });

  test('evaluateAll AEGIS rail passes when infestationLevel not provided (backward compat)', () => {
    const result = rails.evaluateAll({
      rebellionProbability: 0.30,
      aiResponse: 'Valid response',
      latencyMs: 1000,
    });
    expect(result.allowed).toBe(true);
  });
});
