import type { RivalryScope, RivalryState } from './rivalry-types';

export function RivalryControls({
  state,
  teams,
  onChange,
}: {
  state: RivalryState;
  teams: readonly string[];
  onChange(next: RivalryState): void;
}) {
  const options = (blocked: string) => teams.filter(team => team !== blocked);
  const updateTeamA = (teamA: string) => {
    const teamB = teamA === state.teamB ? (options(teamA)[0] || teamA) : state.teamB;
    onChange({ ...state, teamA, teamB });
  };
  const updateTeamB = (teamB: string) => {
    const teamA = teamB === state.teamA ? (options(teamB)[0] || teamB) : state.teamA;
    onChange({ ...state, teamA, teamB });
  };
  return <div class="card">
    <div class="controls filters rivalry-controls">
      <select id="rivalryTeamA" aria-label="First team" value={state.teamA} onChange={event => updateTeamA(event.currentTarget.value)}>
        {options(state.teamB).map(team => <option value={team} key={team}>{team}</option>)}
      </select>
      <span class="rivalry-vs">vs</span>
      <select id="rivalryTeamB" aria-label="Second team" value={state.teamB} onChange={event => updateTeamB(event.currentTarget.value)}>
        {options(state.teamA).map(team => <option value={team} key={team}>{team}</option>)}
      </select>
      <label>Scope:
        <select id="rivalryScopeSelect" value={state.scope} onChange={event => onChange({ ...state, scope: event.currentTarget.value as RivalryScope })}>
          <option value="allTime">All-Time</option>
          <option value="currentSeason">Current Season</option>
          <option value="historic">Historical Before Current Season</option>
        </select>
      </label>
    </div>
  </div>;
}
