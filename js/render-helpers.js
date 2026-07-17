import * as core from './core-helpers.js';
function coreFn(name) {
  const fn = core[name];
  if (typeof fn !== 'function') {
    throw new Error(`render-helpers.js requires core-helpers.js before it (${name})`);
  }
  return fn;
}

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function nfmt(x, d = 2) {
  return Number.isFinite(+x) ? (+x).toFixed(d) : '\u2014';
}

function fmtTrimmed(x) {
  const s = (+x).toFixed(2);
  const t = s.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0$/, '$1');
  return t.includes('.') ? t : t + '.';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setAppStatus(kind, message, doc) {
  const root = docOrDefault(doc);
  if (!root) return;
  const el = root.getElementById('appStatus');
  if (!el) return;
  el.hidden = false;
  el.className = `status-banner status-${kind}`;
  el.textContent = message;
}

function clearAppStatus(doc) {
  const root = docOrDefault(doc);
  if (!root) return;
  const el = root.getElementById('appStatus');
  if (!el) return;
  el.hidden = true;
}

function showPage(id, doc) {
  const root = docOrDefault(doc);
  if (!root) return;
  if (
    typeof window !== 'undefined'
    && window.darlingAccessibility?.syncPageState
    && root === document
  ) {
    window.darlingAccessibility.syncPageState(id);
    return;
  }
  const resolvedId = ['history', 'current', 'rivalry', 'trophy', 'dynasty', 'draft', 'gauntlet'].includes(id)
    ? id
    : 'history';
  const activeTabId = `tab${resolvedId[0].toUpperCase()}${resolvedId.slice(1)}Btn`;
  root.querySelectorAll('[role="tab"], .tab').forEach((tab) => {
    const selected = tab.id === activeTabId;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });
  root.querySelectorAll('[role="tabpanel"], .page').forEach((panel) => {
    const visible = panel.id === `page-${resolvedId}`;
    panel.classList.toggle('visible', visible);
    panel.hidden = !visible;
  });
}

function headerBannerHtml(owner, seasonSummaries) {
  const computeRegularSeasonChampYearsFn = coreFn('computeRegularSeasonChampYears');
  const rows = seasonSummaries.filter(r => r.owner === owner);
  const champYears = rows.filter(r => r.champion).map(r => r.season).sort((a, b) => a - b);
  const regYears = computeRegularSeasonChampYearsFn(owner, seasonSummaries);
  return [
    ...champYears.map(y => `<div class="banner champ">&#x1f3c6; ${y}</div>`),
    ...regYears.map(y => `<div class="banner reg">&#x1f947; ${y}</div>`),
  ].join('');
}

function renderHeaderBanners(owner, seasonSummaries, doc) {
  const root = docOrDefault(doc);
  if (!root) return;
  const el = root.getElementById('headerBanners');
  if (!el) return;
  el.innerHTML = headerBannerHtml(owner, seasonSummaries);
}

function updateTeamHeader(team, seasonSummaries, doc) {
  const root = docOrDefault(doc);
  if (!root) return;
  const h2 = root.querySelector('header h2');
  if (h2) h2.textContent = team;
  renderHeaderBanners(team, seasonSummaries, root);
  if (root.title !== undefined) root.title = `${team} \u2014 League History`;
}

function facetControlHtml(values, opts = {}) {
  const { prefix = 'f', label = 'Filter options' } = opts;
  const allId = `${prefix}-all-option`;
  return `
  <fieldset>
    <legend class="visually-hidden">${escapeHtml(label)}</legend>
    <div class="dropdown-sheet-header">
      <strong>${escapeHtml(label)}</strong>
      <button type="button" class="btn dropdown-done" data-dropdown-done="1">Done</button>
    </div>
    <div class="all-row">
      <label for="${allId}">
        <input id="${allId}" type="checkbox" class="${prefix}-all" checked />
        <span>All</span>
      </label>
    </div>
    <div class="grid">
      ${values.map((v, index) => {
        const id = `${prefix}-option-${index}`;
        return `
        <label for="${id}">
          <input id="${id}" type="checkbox" class="${prefix}-cb" data-value="${encodeURIComponent(v)}" />
          <span>${escapeHtml(v)}</span>
        </label>
      `;
      }).join('')}
    </div>
  </fieldset>
`;
}

function buildFacetControl(containerId, values, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const container = root.getElementById(containerId);
  if (!container) return;
  const { prefix = 'f', label = 'Filter options', onChange = null } = opts;
  const active = root.activeElement;
  const focusedValue = active && container.contains(active)
    ? active.dataset?.value ?? (active.matches?.(`input.${prefix}-all`) ? '__ALL__' : null)
    : null;

  container.innerHTML = facetControlHtml(values, { prefix, label });
  if (focusedValue !== null) {
    const nextTarget = focusedValue === '__ALL__'
      ? container.querySelector(`input.${prefix}-all`)
      : [...container.querySelectorAll(`input.${prefix}-cb`)]
        .find(input => input.dataset.value === focusedValue)
        || container.querySelector(`input.${prefix}-all`);
    nextTarget?.focus();
  }
  container.onchange = (e) => {
    if (e.target && e.target.matches(`input.${prefix}-all`)) {
      const allChecked = e.target.checked;
      const cbs = container.querySelectorAll(`input.${prefix}-cb`);
      if (allChecked) cbs.forEach(cb => { cb.checked = false; });
      if (onChange) onChange();
      return;
    }
    if (e.target && e.target.matches(`input.${prefix}-cb`)) {
      const all = container.querySelector(`input.${prefix}-all`);
      const anySpecificChecked = [...container.querySelectorAll(`input.${prefix}-cb`)].some(cb => cb.checked);
      if (all) all.checked = !anySpecificChecked;
      if (onChange) onChange();
    }
  };
}
export {
  nfmt,
  fmtTrimmed,
  escapeHtml,
  setAppStatus,
  clearAppStatus,
  showPage,
  headerBannerHtml,
  renderHeaderBanners,
  updateTeamHeader,
  facetControlHtml,
  buildFacetControl
};
