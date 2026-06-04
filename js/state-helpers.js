(function (global) {
  function emptyUniverse() {
    return { seasons: [], weeks: [], opponents: [], types: [], rounds: [] };
  }

  function asSet(value) {
    return value instanceof Set ? value : new Set(value || []);
  }

  function defaultIsRestrictive(selSet, uniArr) {
    if (!uniArr.length) return false;
    if (selSet.size === 0) return false;
    if (selSet.size === uniArr.length) return false;
    return true;
  }

  function coreFn(name, fallback) {
    const fn = global[name];
    if (typeof fn === 'function') return fn;
    if (fallback) return fallback;
    throw new Error(`state-helpers.js requires core-helpers.js before it (${name})`);
  }

  function parseUrlState(search) {
    const qs = typeof search === 'string'
      ? search
      : (typeof window !== 'undefined' ? window.location.search : '');
    const params = new URLSearchParams(qs);
    const parseList = (key) => {
      const v = params.get(key);
      if (!v) return null;
      return v.split(',').map(s => decodeURIComponent(s)).filter(Boolean);
    };
    const seasons = parseList('seasons')?.map(n => +n).filter(n => Number.isFinite(n));
    const weeks = parseList('weeks')?.map(n => +n).filter(n => Number.isFinite(n));
    const opps = parseList('opps');
    const types = parseList('types');
    const rounds = parseList('rounds');
    const team = params.get('team') || null;
    const hasAny = !!(team || (seasons && seasons.length) || (weeks && weeks.length) || (opps && opps.length) || (types && types.length) || (rounds && rounds.length));
    return {
      team,
      seasons: seasons ? new Set(seasons) : null,
      weeks: weeks ? new Set(weeks) : null,
      opps: opps ? new Set(opps) : null,
      types: types ? new Set(types) : null,
      rounds: rounds ? new Set(rounds) : null,
      hasAny,
    };
  }

  function setFacetSelections(containerId, prefix, valuesSet, doc) {
    const root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root) return;
    const container = root.getElementById(containerId);
    if (!container) return;
    const all = container.querySelector(`.${prefix}-all`);
    const cbs = [...container.querySelectorAll(`.${prefix}-cb`)];
    if (!valuesSet || valuesSet.size === 0) {
      if (all) all.checked = true;
      cbs.forEach(cb => cb.checked = false);
      return;
    }
    let any = false;
    cbs.forEach(cb => {
      const raw = decodeURIComponent(cb.dataset.value);
      const val = (prefix === 'season' || prefix === 'week') ? +raw : raw;
      if (valuesSet.has(val)) {
        cb.checked = true;
        any = true;
      } else {
        cb.checked = false;
      }
    });
    if (all) all.checked = !any;
  }

  function buildUrlFromState(opts = {}) {
    const allTeams = opts.allTeams || '__ALL__';
    const selectedTeam = Object.prototype.hasOwnProperty.call(opts, 'selectedTeam') ? opts.selectedTeam : allTeams;
    const selectedSeasons = asSet(opts.selectedSeasons);
    const selectedWeeks = asSet(opts.selectedWeeks);
    const selectedOpponents = asSet(opts.selectedOpponents);
    const selectedTypes = asSet(opts.selectedTypes);
    const selectedRounds = asSet(opts.selectedRounds);
    const universe = opts.universe || emptyUniverse();
    const isRestrictiveFn = opts.isRestrictiveFn || coreFn('isRestrictive', defaultIsRestrictive);
    const pathname = opts.pathname || (typeof window !== 'undefined' ? window.location.pathname : '');

    const params = new URLSearchParams();
    if (selectedTeam && selectedTeam !== allTeams) params.set('team', selectedTeam);
    const setIf = (key, set, uni) => { if (isRestrictiveFn(set, uni)) params.set(key, [...set].join(',')); };
    setIf('seasons', selectedSeasons, universe.seasons || []);
    setIf('weeks', selectedWeeks, universe.weeks || []);
    setIf('opps', selectedOpponents, universe.opponents || []);
    setIf('types', selectedTypes, universe.types || []);
    setIf('rounds', selectedRounds, universe.rounds || []);
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ''}`;
  }

  function updateUrlFromState(opts = {}) {
    const isApplyingUrlState = !!opts.isApplyingUrlState;
    if (isApplyingUrlState) return buildUrlFromState(opts);
    const next = buildUrlFromState(opts);
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', next);
    }
    return next;
  }

  function applyFacetFilters(allGames, opts = {}) {
    const allTeams = opts.allTeams || '__ALL__';
    const selectedTeam = Object.prototype.hasOwnProperty.call(opts, 'selectedTeam') ? opts.selectedTeam : allTeams;
    const selectedSeasons = asSet(opts.selectedSeasons);
    const selectedWeeks = asSet(opts.selectedWeeks);
    const selectedOpponents = asSet(opts.selectedOpponents);
    const selectedTypes = asSet(opts.selectedTypes);
    const selectedRounds = asSet(opts.selectedRounds);
    const universe = opts.universe || emptyUniverse();
    const normTypeFn = opts.normTypeFn || coreFn('normType', (t) => (t && t.trim()) ? t : 'Regular');
    const normRoundFn = opts.normRoundFn || coreFn('normRound', (r) => r || '');
    const sidesForTeamFn = opts.sidesForTeamFn || coreFn('sidesForTeam');
    const isRestrictiveFn = opts.isRestrictiveFn || coreFn('isRestrictive', defaultIsRestrictive);

    return allGames.filter(g => {
      if (selectedTeam !== allTeams && !(g.teamA === selectedTeam || g.teamB === selectedTeam)) return false;

      const t = normTypeFn(g.type);
      const r = normRoundFn(g.round);
      const season = +g.season;

      if (isRestrictiveFn(selectedSeasons, universe.seasons || []) && !selectedSeasons.has(season)) return false;

      if (selectedTeam !== allTeams) {
        if (isRestrictiveFn(selectedWeeks, universe.weeks || [])) {
          const w = (g._weekByTeam && g._weekByTeam[selectedTeam]) || null;
          if (!w || !selectedWeeks.has(w)) return false;
        }
        if (isRestrictiveFn(selectedOpponents, universe.opponents || [])) {
          const opp = sidesForTeamFn(g, selectedTeam)?.opp;
          if (!opp || !selectedOpponents.has(opp)) return false;
        }
      }

      if (isRestrictiveFn(selectedTypes, universe.types || []) && !selectedTypes.has(t)) return false;
      if (isRestrictiveFn(selectedRounds, universe.rounds || [])) {
        if (!r || !selectedRounds.has(r)) return false;
      }

      return true;
    });
  }

  function buildHistoryCsvText(games, opts = {}) {
    const allTeams = opts.allTeams || '__ALL__';
    const selectedTeam = Object.prototype.hasOwnProperty.call(opts, 'selectedTeam') ? opts.selectedTeam : allTeams;
    const selectedWeeks = asSet(opts.selectedWeeks);
    const universeWeeks = opts.universeWeeks || [];
    const normTypeFn = opts.normTypeFn || coreFn('normType', (t) => (t && t.trim()) ? t : 'Regular');
    const normRoundFn = opts.normRoundFn || coreFn('normRound', (r) => r || '');
    const sidesForTeamFn = opts.sidesForTeamFn || coreFn('sidesForTeam');
    const isRestrictiveFn = opts.isRestrictiveFn || coreFn('isRestrictive', defaultIsRestrictive);
    const isRegularGameFn = opts.isRegularGameFn || coreFn('isRegularGame');
    const csvEscapeFn = opts.csvEscapeFn || coreFn('csvEscape');
    const expectedWinForGameFn = opts.expectedWinForGameFn || (() => null);

    const header = ['date', 'season', 'team', 'opponent', 'result', 'pf', 'pa', 'type', 'round', 'week', 'xw'];
    const quoteRow = (values) => values.map(csvEscapeFn).map(v => `"${v}"`).join(',');
    const lines = [header.join(',')];

    if (selectedTeam === allTeams) {
      const useWeek = isRestrictiveFn(selectedWeeks, universeWeeks);
      for (const g of games) {
        const sides = [
          { team: g.teamA, opp: g.teamB, pf: g.scoreA, pa: g.scoreB, res: g.scoreA > g.scoreB ? 'W' : g.scoreA < g.scoreB ? 'L' : 'T' },
          { team: g.teamB, opp: g.teamA, pf: g.scoreB, pa: g.scoreA, res: g.scoreB > g.scoreA ? 'W' : g.scoreB < g.scoreA ? 'L' : 'T' },
        ];
        for (const s of sides) {
          const w = (g._weekByTeam && g._weekByTeam[s.team]) || null;
          if (useWeek && (!w || !selectedWeeks.has(w))) continue;
          const xw = isRegularGameFn(g) ? expectedWinForGameFn(s.team, g) : null;
          lines.push(quoteRow([g.date, g.season, s.team, s.opp, s.res, s.pf.toFixed(2), s.pa.toFixed(2), normTypeFn(g.type), normRoundFn(g.round), w ?? '', xw ?? '']));
        }
      }
      return lines.join('\n');
    }

    for (const g of games) {
      const s = sidesForTeamFn(g, selectedTeam);
      if (!s) continue;
      const w = (g._weekByTeam && g._weekByTeam[selectedTeam]) || '';
      const xw = isRegularGameFn(g) ? expectedWinForGameFn(selectedTeam, g) : null;
      lines.push(quoteRow([g.date, g.season, selectedTeam, s.opp, s.result, s.pf.toFixed(2), s.pa.toFixed(2), normTypeFn(g.type), normRoundFn(g.round), w, xw ?? '']));
    }
    return lines.join('\n');
  }

  const api = {
    parseUrlState,
    setFacetSelections,
    buildUrlFromState,
    updateUrlFromState,
    applyFacetFilters,
    buildHistoryCsvText,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  Object.assign(global, api);
})(typeof globalThis !== 'undefined' ? globalThis : window);
