// =============================================================================
// Cleansing Types — Sheriff Protocol shared types
// =============================================================================

export interface CleansingResult {
  success: boolean;
  successRate: number;
  participantCount: number;
  participantIds: string[];
  rolledValue: number;
  factors: CleansingFactors;
  errorMessage?: string;
}

export interface CleansingFactors {
  base: number;
  avgMorale: number;
  moraleContribution: number;
  avgTrauma: number;
  traumaPenalty: number;
  avgConfidence: number;
  confidenceContribution: number;
}
