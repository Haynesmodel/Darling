import { escapeHtml } from './render-helpers.js';

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function isFiniteInput(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value));
}

function availableDynastySeasons(seasonSummaries = []) {
  return [...new Set(
    seasonSummaries
      .map(row => +row.season)
      .filter(Number.isFinite)
  )].sort((a, b) => a - b);
}

function availableDynastyOwners(seasonSummaries = []) {
  return [...new Set(
    seasonSummaries
      .map(row => row.owner)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function clamp(value, min, max) {
  if (!Number.isFinite(+value)) return value;
  return Math.min(max, Math.max(min, +value));
}

function latestSeasonWindow(seasons = [], windowSize = 3) {
  if (!seasons.length) return { startSeason: null, endSeason: null };
  const endSeason = seasons[seasons.length - 1];
  const startSeason = seasons[Math.max(0, seasons.length - windowSize)];
  return { startSeason, endSeason };
}

function normalizeDynastyRange({
  availableSeasons = [],
  startSeason = null,
  endSeason = null,
  requestedStartSeason = startSeason,
  requestedEndSeason = endSeason,
  windowSize = 3,
} = {}) {
  const seasons = [...availableSeasons].filter(Number.isFinite).sort((a, b) => a - b);
  const latest = latestSeasonWindow(seasons, windowSize);
  const defaultStart = latest.startSeason;
  const defaultEnd = latest.endSeason;
  const minSeason = seasons[0] ?? null;
  const maxSeason = seasons[seasons.length - 1] ?? null;

  const requestedStart = isFiniteInput(requestedStartSeason) ? +requestedStartSeason : (isFiniteInput(startSeason) ? +startSeason : defaultStart);
  const requestedEnd = isFiniteInput(requestedEndSeason) ? +requestedEndSeason : (isFiniteInput(endSeason) ? +endSeason : defaultEnd);

  if (!isFiniteInput(requestedStart) || !isFiniteInput(requestedEnd) || minSeason === null || maxSeason === null) {
    return {
      requestedStartSeason: isFiniteInput(requestedStartSeason) ? +requestedStartSeason : null,
      requestedEndSeason: isFiniteInput(requestedEndSeason) ? +requestedEndSeason : null,
      startSeason: null,
      endSeason: null,
    };
  }

  const clampedStart = clamp(requestedStart, minSeason, maxSeason);
  const clampedEnd = clamp(requestedEnd, minSeason, maxSeason);
  const start = Math.min(clampedStart, clampedEnd);
  const end = Math.max(clampedStart, clampedEnd);

  return {
    requestedStartSeason: requestedStart,
    requestedEndSeason: requestedEnd,
    startSeason: start,
    endSeason: end,
  };
}

function resolveDynastyInitialState({
  seasonSummaries = [],
  urlState = {},
  mode = 'calculator',
  owner = null,
  startSeason = null,
  endSeason = null,
  minSeasons = 2,
  includeSaundersPenalty = true,
} = {}) {
  const seasons = availableDynastySeasons(seasonSummaries);
  const owners = availableDynastyOwners(seasonSummaries);
  const defaultOwner = owners.includes('Joe') ? 'Joe' : (owners[0] || '__ALL__');
  const defaultMode = 'calculator';
  const parsedMode = urlState.dynastyMode || mode || defaultMode;
  const parsedOwner = urlState.dynastyOwner || owner;
  const fallbackOwner = parsedMode === 'calculator' ? defaultOwner : '__ALL__';
  const selectedOwner = owners.includes(parsedOwner) ? parsedOwner : (parsedOwner === '__ALL__' ? '__ALL__' : fallbackOwner);
  const range = normalizeDynastyRange({
    availableSeasons: seasons,
    startSeason: isFiniteInput(startSeason) ? +startSeason : null,
    endSeason: isFiniteInput(endSeason) ? +endSeason : null,
    requestedStartSeason: isFiniteInput(urlState.dynastyStart) ? +urlState.dynastyStart : (isFiniteInput(startSeason) ? +startSeason : null),
    requestedEndSeason: isFiniteInput(urlState.dynastyEnd) ? +urlState.dynastyEnd : (isFiniteInput(endSeason) ? +endSeason : null),
  });
  const defaultRange = normalizeDynastyRange({ availableSeasons: seasons });

  return {
    mode: parsedMode,
    owner: selectedOwner,
    startSeason: range.startSeason ?? defaultRange.startSeason,
    endSeason: range.endSeason ?? defaultRange.endSeason,
    requestedStartSeason: range.requestedStartSeason ?? defaultRange.requestedStartSeason,
    requestedEndSeason: range.requestedEndSeason ?? defaultRange.requestedEndSeason,
    minSeasons: isFiniteInput(urlState.dynastyMinSeasons) ? Math.max(1, +urlState.dynastyMinSeasons) : Math.max(1, +minSeasons || 1),
    includeSaundersPenalty: urlState.dynastySaunders == null ? !!includeSaundersPenalty : !!urlState.dynastySaunders,
  };
}

function renderModeOptions(select, mode) {
  const options = [
    ['calculator', 'Individual'],
    ['rolling-3', 'Rolling 3-Year Windows'],
    ['rolling-5', 'Rolling 5-Year Windows'],
    ['selected-range', 'Selected Range Leaderboard'],
    ['all-time', 'All-Time Leaderboard'],
  ];
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('');
  select.value = options.some(([value]) => value === mode) ? mode : 'calculator';
}

function renderOwnerOptions(select, owners, selectedOwner, mode, allTeams = '__ALL__') {
  const includeAllOwners = mode !== 'calculator';
  const options = [
    ...(includeAllOwners ? [[allTeams, 'All Owners']] : []),
    ...owners.map(owner => [owner, owner]),
  ];
  const normalizedOwner = options.some(([value]) => value === selectedOwner)
    ? selectedOwner
    : (includeAllOwners ? allTeams : (owners.includes('Joe') ? 'Joe' : owners[0] || allTeams));
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('');
  select.value = normalizedOwner;
  return normalizedOwner;
}

function renderSeasonOptions(select, seasons, selectedSeason) {
  select.innerHTML = seasons
    .map(season => `<option value="${season}">${season}</option>`)
    .join('');
  if (Number.isFinite(+selectedSeason) && seasons.includes(+selectedSeason)) {
    select.value = `${+selectedSeason}`;
  } else if (seasons.length) {
    select.value = `${seasons[seasons.length - 1]}`;
  }
}

function renderMinSeasonOptions(select, seasons, selectedMinSeasons) {
  const maxOptions = Math.max(1, seasons.length || 1);
  const options = [];
  for (let i = 1; i <= maxOptions; i++) {
    options.push(i);
  }
  select.innerHTML = options
    .map(value => `<option value="${value}">${value}</option>`)
    .join('');
  const value = Math.max(1, Math.min(maxOptions, Number.isFinite(+selectedMinSeasons) ? +selectedMinSeasons : 2));
  select.value = `${value}`;
}

function modeControlState(mode, { allTeams = '__ALL__', previousOwner = null } = {}) {
  const ownerLocked = mode !== 'calculator';
  const rangeLocked = mode === 'all-time';
  const hint = mode === 'calculator'
    ? 'Individual scores one owner across the chosen range. Minimum Seasons to Qualify is the cutoff for being scored, and Saunders penalties stay optional.'
    : mode === 'rolling-3'
      ? 'Rolling 3-Year Windows ignores the owner picker. Start and end bound the search, and every result is a true 3-season stretch inside that range.'
      : mode === 'rolling-5'
        ? 'Rolling 5-Year Windows ignores the owner picker. Start and end bound the search, and every result is a true 5-season stretch inside that range.'
        : mode === 'selected-range'
          ? 'Selected Range Leaderboard ignores the owner picker. Start and end define the league span being ranked.'
          : 'All-Time Leaderboard ignores the owner picker and locks the range to the full history.';

  return {
    hint,
    ownerLocked,
    rangeLocked,
    displayOwner: ownerLocked ? allTeams : previousOwner,
  };
}

function buildDynastyControls({
  doc,
  seasonSummaries,
  selectedState = {},
  urlState = {},
  allTeams = '__ALL__',
  onChange,
} = {}) {
  const root = docOrDefault(doc);
  if (!root) {
    return resolveDynastyInitialState({ seasonSummaries, urlState, ...selectedState });
  }

  const modeSelect = root.getElementById('dynastyModeSelect');
  const ownerSelect = root.getElementById('dynastyOwnerSelect');
  const startSelect = root.getElementById('dynastyStartSeason');
  const endSelect = root.getElementById('dynastyEndSeason');
  const minSeasonSelect = root.getElementById('dynastyMinSeasons');
  const saundersToggle = root.getElementById('dynastySaundersToggle');
  const hintEl = root.getElementById('dynastyControlHint');
  if (!modeSelect || !ownerSelect || !startSelect || !endSelect || !minSeasonSelect || !saundersToggle) {
    return resolveDynastyInitialState({ seasonSummaries, urlState, ...selectedState });
  }

  const seasons = availableDynastySeasons(seasonSummaries);
  const owners = availableDynastyOwners(seasonSummaries);
  const initial = resolveDynastyInitialState({
    seasonSummaries,
    urlState,
    ...selectedState,
  });
  const initialRequestedStart = initial.requestedStartSeason;
  const initialRequestedEnd = initial.requestedEndSeason;
  let rememberedOwner = initial.owner;

  renderModeOptions(modeSelect, initial.mode);
  const normalizedOwner = renderOwnerOptions(ownerSelect, owners, initial.owner, initial.mode, allTeams);
  renderSeasonOptions(startSelect, seasons, initial.startSeason);
  renderSeasonOptions(endSelect, seasons, initial.endSeason);
  renderMinSeasonOptions(minSeasonSelect, seasons, initial.minSeasons);
  saundersToggle.checked = initial.includeSaundersPenalty;
  ownerSelect.disabled = initial.mode !== 'calculator';
  startSelect.disabled = initial.mode === 'all-time';
  endSelect.disabled = initial.mode === 'all-time';
  if (hintEl) hintEl.textContent = modeControlState(initial.mode, { allTeams, previousOwner: initial.owner }).hint;

  function emitChange({ requestedStartSeason, requestedEndSeason } = {}) {
    const nextMode = modeSelect.value;
    const modeState = modeControlState(nextMode, { allTeams, previousOwner: rememberedOwner });
    const ownerSeed = nextMode === 'calculator' ? rememberedOwner : allTeams;
    const nextOwner = renderOwnerOptions(ownerSelect, owners, ownerSeed, nextMode, allTeams);
    const nextStart = Number.isFinite(+startSelect.value) ? +startSelect.value : null;
    const nextEnd = Number.isFinite(+endSelect.value) ? +endSelect.value : null;
    const nextRange = normalizeDynastyRange({
      availableSeasons: seasons,
      requestedStartSeason: requestedStartSeason ?? nextStart,
      requestedEndSeason: requestedEndSeason ?? nextEnd,
      startSeason: nextStart,
      endSeason: nextEnd,
    });

    if (nextMode === 'calculator' && nextOwner === allTeams) {
      const fallback = owners.includes('Joe') ? 'Joe' : (owners[0] || allTeams);
      ownerSelect.value = fallback;
    }
    ownerSelect.disabled = modeState.ownerLocked;
    startSelect.disabled = modeState.rangeLocked;
    endSelect.disabled = modeState.rangeLocked;
    if (hintEl) hintEl.textContent = modeState.hint;
    if (modeState.ownerLocked) {
      ownerSelect.value = allTeams;
    } else {
      rememberedOwner = ownerSelect.value || rememberedOwner;
    }

    const nextState = {
      mode: nextMode,
      owner: modeState.ownerLocked ? rememberedOwner : ownerSelect.value,
      startSeason: nextRange.startSeason,
      endSeason: nextRange.endSeason,
      requestedStartSeason: nextRange.requestedStartSeason,
      requestedEndSeason: nextRange.requestedEndSeason,
      minSeasons: Math.max(1, +minSeasonSelect.value || 1),
      includeSaundersPenalty: saundersToggle.checked,
    };

    if (typeof onChange === 'function') {
      onChange(nextState);
    }
  }

  if (!modeSelect.dataset.bound) {
    modeSelect.addEventListener('change', emitChange);
    modeSelect.dataset.bound = '1';
  }
  if (!ownerSelect.dataset.bound) {
    ownerSelect.addEventListener('change', emitChange);
    ownerSelect.dataset.bound = '1';
  }
  if (!startSelect.dataset.bound) {
    startSelect.addEventListener('change', emitChange);
    startSelect.dataset.bound = '1';
  }
  if (!endSelect.dataset.bound) {
    endSelect.addEventListener('change', emitChange);
    endSelect.dataset.bound = '1';
  }
  if (!minSeasonSelect.dataset.bound) {
    minSeasonSelect.addEventListener('change', emitChange);
    minSeasonSelect.dataset.bound = '1';
  }
  if (!saundersToggle.dataset.bound) {
    saundersToggle.addEventListener('change', emitChange);
    saundersToggle.dataset.bound = '1';
  }

  emitChange({
    requestedStartSeason: initialRequestedStart,
    requestedEndSeason: initialRequestedEnd,
  });

    return {
      mode: modeSelect.value,
      owner: ownerSelect.value || normalizedOwner,
    startSeason: isFiniteInput(startSelect.value) ? +startSelect.value : initial.startSeason,
    endSeason: isFiniteInput(endSelect.value) ? +endSelect.value : initial.endSeason,
    requestedStartSeason: initial.requestedStartSeason,
    requestedEndSeason: initial.requestedEndSeason,
    minSeasons: isFiniteInput(minSeasonSelect.value) ? +minSeasonSelect.value : initial.minSeasons,
    includeSaundersPenalty: saundersToggle.checked,
    availableSeasons: seasons,
    owners,
  };
}

export {
  buildDynastyControls,
  resolveDynastyInitialState,
  availableDynastySeasons,
  normalizeDynastyRange,
};
