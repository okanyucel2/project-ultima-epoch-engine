import { z } from 'zod';
import { UnitFloat } from './common';

// =============================================================================
// SIMULATION TICKS CHANNEL — Periodic world state snapshot
// =============================================================================

const ResourceSchema = z.object({
  quantity: z.number(),
  productionRate: z.number(),
  consumptionRate: z.number(),
});

const InfestationSchema = z.object({
  counter: z.number().min(0).max(100),
  isPlagueHeart: z.boolean(),
  throttleMultiplier: z.number().min(0).max(1),
});

export const SimulationTickSchema = z.object({
  tickNumber: z.number().int().nonnegative(),
  resources: z.object({
    sim: ResourceSchema,
    rapidlum: ResourceSchema,
    mineral: ResourceSchema,
  }),
  facilities: z.object({
    refineries: z.number().int().nonnegative(),
    mines: z.number().int().nonnegative(),
  }),
  population: z.object({
    activeNPCs: z.number().int().nonnegative(),
    overallRebellionProbability: UnitFloat,
  }),
  infestation: InfestationSchema,
});

export type SimulationTick = z.infer<typeof SimulationTickSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Infestation = z.infer<typeof InfestationSchema>;
