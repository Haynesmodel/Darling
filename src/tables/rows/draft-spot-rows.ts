import type { DraftSpotRow } from '../../data/generated/asset-types';
import type { DarlingTableRow, TableContext } from '../table-types';

function outcome(row: DraftSpotRow): string {
  if (row.champion) return 'Champion';
  if (row.saunders) return 'Saunders';
  if (row.made_playoffs) return row.top_three ? 'Top 3' : 'Playoffs';
  return 'Missed playoffs';
}

export function adaptDraftSpotRows(rows: unknown[], _context: TableContext): DarlingTableRow[] {
  return (rows as DraftSpotRow[]).map(row => ({
    id: `${row.season}:${row.owner}:${row.draft_pick}`,
    season: row.season,
    owner: row.owner,
    draftPick: row.draft_pick,
    draftPercentile: row.draft_percentile,
    zone: row.zone,
    finish: row.finish,
    record: row.ties ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`,
    pointsFor: row.points_for,
    pointsZ: row.points_z,
    winsAboveAvg: row.wins_above_avg,
    outcome: outcome(row),
    champion: row.champion,
    madePlayoffs: row.made_playoffs,
    saunders: row.saunders,
    lowSample: false,
    rowClass: row.champion ? 'draft-row-champion' : row.saunders ? 'draft-row-saunders' : undefined,
    details: [
      { label: 'Team count', value: String(row.team_count) },
      { label: 'Points against', value: row.points_against.toFixed(1) },
      { label: 'Win percentage', value: `${(row.win_pct * 100).toFixed(1)}%` },
      { label: 'Draft percentile', value: `${(row.draft_percentile * 100).toFixed(1)}%` },
    ],
  }));
}
