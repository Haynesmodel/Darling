import './gauntlet.entry.css';
import { teamSeasonId } from '../../../js/gauntlet-data.js';
import { headToHeadContext } from '../../../js/shared/head-to-head-context.js';
import { buildGauntletControls, resolveGauntletInitialState } from '../../../js/gauntlet-controls.js';
import { gauntletModelLabel, gauntletNarrativeText, renderGauntlet } from '../../../js/gauntlet-renderers.js';
import { simulateMatchup } from '../../../js/gauntlet-simulator.js';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let state: any = null;
  let active = false;

  const copyText = (a: any, b: any, result: any, h2h: any) => {
    if (!a || !b || !result) return '';
    const lines = [
      `${a.owner} ${a.season} vs ${b.owner} ${b.season}`,
      `Model: ${gauntletModelLabel(result.model, result.includePostseason)}`,
      `Simulations: ${result.simulations.toLocaleString()}`,
      `Win probability: ${a.owner} ${(result.pctA * 100).toFixed(1)}% (${Math.round(result.actualWinsA || 0).toLocaleString()} wins) | ${b.owner} ${(result.pctB * 100).toFixed(1)}% (${Math.round(result.actualWinsB || 0).toLocaleString()} wins)`,
      `Average score: ${result.avgA.toFixed(1)} - ${result.avgB.toFixed(1)}`,
      `Average margin: ${result.avgMargin >= 0 ? '+' : ''}${result.avgMargin.toFixed(1)}`,
      `Median margin: ${result.medianMargin >= 0 ? '+' : ''}${result.medianMargin.toFixed(1)}`,
    ];
    if (h2h?.allTime?.games) lines.push(`All-time head-to-head: ${h2h.allTime.recordA} across ${h2h.allTime.games} games`);
    if (h2h?.selected?.games) lines.push(`Selected seasons: ${h2h.selected.recordA} across ${h2h.selected.games} games`);
    lines.push(`Current URL: ${context.window.location.href}`);
    return lines.join('\n');
  };

  const draw = () => {
    if (!active || !state) return;
    const seasons = context.selectors.teamSeasons(state.selectedIncludePostseason) as any[];
    const a = seasons.find(item => item.id === teamSeasonId(state.selectedOwnerA, state.selectedSeasonA)) || null;
    const b = seasons.find(item => item.id === teamSeasonId(state.selectedOwnerB, state.selectedSeasonB)) || null;
    const title = a && b ? `${a.owner} ${a.season} vs ${b.owner} ${b.season} — Historical Matchup` : 'Historical Matchup';
    context.header.feature('Historical Matchup', null, title);
    context.theme.rivalry(a?.owner, b?.owner, state.selectedIncludePostseason ? 'postseason' : 'regular');
    if (!a || !b) {
      renderGauntlet({ teamSeasonA: a, teamSeasonB: b, result: null, context: null, narrative: 'No matchup selected.', copyText: '' }, { doc: context.document });
      return;
    }
    const result = simulateMatchup(a, b, { model: state.selectedModel, simulations: state.selectedSimulations, seed: state.seed, includePostseason: state.selectedIncludePostseason });
    const h2h = headToHeadContext(a.owner, b.owner, context.data.leagueGames, [a.season, b.season]);
    renderGauntlet({ teamSeasonA: a, teamSeasonB: b, result, context: h2h, narrative: gauntletNarrativeText(result, a, b, h2h), copyText: copyText(a, b, result, h2h) }, { doc: context.document });
    context.router.update({
      tab: 'gauntlet',
      selectedGauntletA: teamSeasonId(a.owner, a.season),
      selectedGauntletB: teamSeasonId(b.owner, b.season),
      selectedGauntletModel: state.selectedModel,
      selectedGauntletIncludePostseason: state.selectedIncludePostseason,
      selectedGauntletSimulations: state.selectedSimulations,
      selectedGauntletSeed: state.seed,
    });
  };

  const change = (next: any) => {
    if (!active) return;
    const derivedSeed = `${teamSeasonId(next.selectedOwnerA, next.selectedSeasonA)}|${teamSeasonId(next.selectedOwnerB, next.selectedSeasonB)}|${next.selectedModel}|${next.selectedIncludePostseason ? 'postseason' : 'regular'}|${next.selectedSimulations}`;
    const explicit = next.seedSource === 'explicit' || state?.seedSource === 'explicit';
    state = { ...next, seed: explicit ? (next.seed || state?.seed || derivedSeed) : derivedSeed, seedSource: explicit ? 'explicit' : 'derived' };
    draw();
  };

  return {
    id: 'gauntlet',
    mount(nextContext) {
      context = nextContext;
      const copy = context.document.getElementById('gauntletCopyBtn');
      copy?.addEventListener('click', async () => {
        const field = context.document.getElementById('gauntletCopyText') as HTMLTextAreaElement | null;
        if (!field?.value) return;
        const clipboard = context.window.navigator.clipboard;
        if (typeof clipboard?.writeText === 'function') {
          try {
            await clipboard.writeText(field.value);
            return;
          } catch {
            // Fall through to a selectable text field when permission is denied.
          }
        }
        field.focus();
        field.select();
      });
    },
    activate(input: FeatureActivation) {
      active = !input.signal.aborted;
      state = resolveGauntletInitialState({
        teamSeasons: context.selectors.teamSeasons() as any[],
        urlState: input.route.hasGauntlet ? input.route : null,
        currentState: input.route.hasGauntlet ? null : state,
      });
      state = buildGauntletControls({ doc: context.document, teamSeasons: context.selectors.teamSeasons() as any[], selectedState: state, onChange: change });
      draw();
    },
    deactivate() { active = false; },
  };
}
