# Wave 26A — WebSocket Latency Benchmark Report

**Date:** 2026-02-24T17:30:11.682Z
**Agent:** MAX (project-ultima-epoch-engine-worker)
**Mode:** Local dispatch (pure parse + export latency, no network)

## Results

| Rate (ev/s) | Sent | Received | Dropped | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) | Throughput (ev/s) |
|-------------|------|----------|---------|----------|----------|----------|----------|----------|-------------------|
| 100 | 300 | 300 | 0 | 0.041 | 0.028 | 0.081 | 0.205 | 1.032 | 100.3 |
| 500 | 1500 | 1500 | 0 | 0.011 | 0.009 | 0.025 | 0.046 | 0.130 | 500.3 |
| 1000 | 3000 | 3000 | 0 | 0.008 | 0.006 | 0.016 | 0.034 | 0.786 | 1000.5 |

## Pipeline

```
RebellionAlert JSON -> EpochDispatcher.processMessage()
  -> Zod schema validation (RebellionAlertSchema)
  -> UE5Exporter.onRebellionAlert()
    -> Niagara VFX triggers
    -> Material parameter updates
  -> UE5Frame callback
```

## Analysis

- Sub-millisecond average latency achieved at all tested rates
- Zero event drops across all load levels
- UE5 Exporter pipeline handles 1000 events/sec at peak load
