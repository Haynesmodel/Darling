import { DRAFT_METRICS, DRAFT_ZONES } from './draft-spot-model';
import {
  DRAFT_ALL_OWNERS,
  DRAFT_MODES,
  type DraftSpotState,
  type DraftSpotViewModel,
} from './draft-spot-types';

interface Props {
  model: DraftSpotViewModel;
  onChange: (state: Partial<DraftSpotState>) => void;
}

const modeLabels = {
  league: 'League',
  owner: 'Owner',
  pick: 'Pick',
  zone: 'Zone',
};

export default function DraftSpotControls({ model, onChange }: Props) {
  const { state } = model;
  const update = (patch: Partial<DraftSpotState>) => onChange({ ...state, ...patch });
  return (
    <div class="controls filters draft-controls" aria-label="Draft Spot filters">
      <label>
        Mode
        <select
          id="draftModeSelect"
          value={state.mode}
          onChange={event => update({
            mode: event.currentTarget.value as DraftSpotState['mode'],
            selectedPick: null,
            selectedZone: null,
          })}
        >
          {DRAFT_MODES.map(mode => <option value={mode}>{modeLabels[mode]}</option>)}
        </select>
      </label>
      <label>
        Owner
        <select
          id="draftOwnerSelect"
          value={state.owner}
          onChange={event => {
            const owner = event.currentTarget.value;
            update({
              owner,
              mode: owner === DRAFT_ALL_OWNERS ? 'league' : 'owner',
              selectedPick: null,
              selectedZone: null,
            });
          }}
        >
          <option value={DRAFT_ALL_OWNERS}>All Owners</option>
          {model.owners.map(owner => <option value={owner}>{owner}</option>)}
        </select>
      </label>
      <label>
        Start
        <select
          id="draftStartSeason"
          value={state.startSeason || ''}
          onChange={event => update({ startSeason: Number(event.currentTarget.value) })}
        >
          {model.seasons.map(season => <option value={season}>{season}</option>)}
        </select>
      </label>
      <label>
        End
        <select
          id="draftEndSeason"
          value={state.endSeason || ''}
          onChange={event => update({ endSeason: Number(event.currentTarget.value) })}
        >
          {model.seasons.map(season => <option value={season}>{season}</option>)}
        </select>
      </label>
      <label>
        Metric
        <select
          id="draftMetricSelect"
          value={state.metric}
          onChange={event => update({ metric: event.currentTarget.value as DraftSpotState['metric'] })}
        >
          {Object.values(DRAFT_METRICS).map(metric => (
            <option value={metric.key}>{metric.label}</option>
          ))}
        </select>
      </label>
      <label>
        Minimum sample
        <select
          id="draftMinSampleSelect"
          value={state.minSample}
          onChange={event => update({ minSample: Number(event.currentTarget.value) as DraftSpotState['minSample'] })}
        >
          {[1, 2, 3, 5].map(value => <option value={value}>{value}</option>)}
        </select>
      </label>
      <label>
        Zone
        <select
          id="draftZoneSelect"
          value={state.selectedZone || ''}
          onChange={event => {
            const selectedZone = event.currentTarget.value as DraftSpotState['selectedZone'];
            update({
              mode: selectedZone ? 'zone' : state.owner === DRAFT_ALL_OWNERS ? 'league' : 'owner',
              selectedPick: null,
              selectedZone: selectedZone || null,
            });
          }}
        >
          <option value="">All Zones</option>
          {DRAFT_ZONES.map(zone => <option value={zone.key}>{zone.label}</option>)}
        </select>
      </label>
      <label class="checkbox-label draft-normalize-label">
        <input
          id="draftNormalizeToggle"
          type="checkbox"
          checked={state.normalize === 'percentile'}
          onChange={event => update({ normalize: event.currentTarget.checked ? 'percentile' : 'raw' })}
        />
        Draft percentile
      </label>
    </div>
  );
}
