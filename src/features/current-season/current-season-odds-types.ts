export interface CurrentSeasonScoringDistribution {
  owner: string;
  currentSample: number;
  historicalSample: number;
  currentWeight: number;
  historicalWeight: number;
  leagueWeight: number;
  mean: number;
  standardDeviation: number;
  floor: number;
  ceiling: number;
}

export interface CurrentSeasonOddsRow {
  owner: string;
  playoffOdds: number;
  byeOdds: number;
  saundersOdds: number;
  seedProbabilities: Record<string, number>;
}

export interface CurrentSeasonOddsMovementRow extends CurrentSeasonOddsRow {
  previousPlayoffOdds: number;
  previousByeOdds: number;
  previousSaundersOdds: number;
  playoffChange: number;
  byeChange: number;
  saundersChange: number;
}

export interface CurrentSeasonOddsModel {
  status: 'ready' | 'unavailable' | 'error';
  modelVersion: string;
  modelLabel: string;
  simulations: number;
  seed: string;
  liveMode: string;
  methodology: string;
  durationMs: number;
  rows: CurrentSeasonOddsRow[];
  movement: CurrentSeasonOddsMovementRow[];
  ifScoresHold: CurrentSeasonOddsRow[];
  selectedOwnerScenario: {
    owner: string;
    win: CurrentSeasonOddsRow;
    loss: CurrentSeasonOddsRow;
  } | null;
  distributions: CurrentSeasonScoringDistribution[];
  error?: string;
}
