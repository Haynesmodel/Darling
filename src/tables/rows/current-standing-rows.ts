import type { DarlingTableRow, TableContext } from '../table-types';

export function adaptCurrentStandingRows(rows: unknown[], context: TableContext = {}): DarlingTableRow[] {
  const picture = Array.isArray(context.playoffPicture) ? context.playoffPicture as Array<Record<string, any>> : [];
  const status = new Map(picture.map(row => [row.owner, row]));
  return rows.map((input, index) => {
    const row = input as Record<string, any>;
    const playoff = status.get(row.owner) || {};
    return {
      ...row,
      id: `${context.season}:${row.owner}:${index}`,
      rank: Number(row.rank) || index + 1,
      winPct: Number(row.pct) || 0,
      pointsFor: Number(row.pointsFor) || 0,
      pointsAgainst: Number(row.pointsAgainst) || 0,
      differential: Number(row.differential) || 0,
      statusKey: playoff.status?.key || '',
      pointsForRank: Number(playoff.pointsForRank) || null,
      rowClass: row.owner === context.selectedOwner ? 'current-owner-focus-row' : '',
      details: [
        { label: 'Playoff status', value: playoff.status?.label || 'In progress' },
        { label: 'Projected seed', value: String(playoff.projectedSeed || '—') },
        { label: 'Playoff gap', value: Number.isFinite(Number(playoff.playoffGap)) ? `${playoff.playoffGap >= 0 ? '+' : ''}${playoff.playoffGap}` : '—' },
      ],
    };
  });
}

export function adaptCurrentProjectedRows(rows: unknown[], context: TableContext = {}): DarlingTableRow[] {
  return rows.map((input, index) => {
    const row = input as Record<string, any>;
    return {
      ...row,
      id: `${context.season}:projected:${row.owner}:${index}`,
      projectedRank: Number(row.projectedRank) || index + 1,
      projectedPointsFor: Number(row.projectedPointsFor) || 0,
      seedChange: Number(row.seedChange) || 0,
      rowClass: row.owner === context.selectedOwner ? 'current-owner-focus-row' : '',
      details: [
        { label: 'Seed movement', value: `${Number(row.seedChange) > 0 ? '+' : ''}${Number(row.seedChange) || 0}` },
        { label: 'Model', value: String(context.modelLabel || 'Current projection') },
      ],
    };
  });
}
