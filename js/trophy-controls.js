import { escapeHtml } from './render-helpers.js';
import { teamOptions } from './facet-helpers.js';

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function resolveInitialOwner(owners, selectedOwner) {
  if (Array.isArray(owners) && owners.includes(selectedOwner)) {
    return selectedOwner;
  }
  if (Array.isArray(owners) && owners.includes('Joe')) {
    return 'Joe';
  }
  if (Array.isArray(owners) && owners.length) {
    return owners[0];
  }
  return selectedOwner || 'Joe';
}

function buildTrophyControls({
  doc,
  leagueGames,
  seasonSummaries,
  selectedOwner,
  onChange,
  allTeams = '__ALL__',
}) {
  const root = docOrDefault(doc);
  if (!root) {
    return { selectedOwner };
  }

  const ownerSelect = root.getElementById('trophyOwnerSelect');
  if (!ownerSelect) {
    return { selectedOwner };
  }

  const owners = teamOptions(seasonSummaries, leagueGames, allTeams)
    .filter(team => team.value !== allTeams)
    .map(team => team.value);
  const resolvedOwner = resolveInitialOwner(owners, selectedOwner);

  ownerSelect.innerHTML = owners
    .map(owner => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`)
    .join('');
  ownerSelect.value = resolvedOwner;

  const emitChange = () => {
    if (typeof onChange === 'function') {
      onChange({
        selectedOwner: ownerSelect.value,
      });
    }
  };

  if (!ownerSelect.dataset.bound) {
    ownerSelect.addEventListener('change', emitChange);
    ownerSelect.dataset.bound = '1';
  }

  emitChange();

  return {
    selectedOwner: ownerSelect.value,
  };
}

export {
  buildTrophyControls,
  resolveInitialOwner,
};
