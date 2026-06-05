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
  root.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  root.querySelectorAll('.page').forEach(p => p.classList.remove('visible'));
  const tab = root.getElementById(`tab${id[0].toUpperCase()}${id.slice(1)}Btn`) || root.getElementById('tabHistoryBtn');
  const page = root.getElementById(`page-${id}`) || root.getElementById('page-history');
  if (tab) tab.classList.add('active');
  if (page) page.classList.add('visible');
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
  const { prefix = 'f' } = opts;
  const allId = `${prefix}-all-option`;
  return `
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
`;
}

function buildFacetControl(containerId, values, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const container = root.getElementById(containerId);
  if (!container) return;
  const { prefix = 'f', onChange = null } = opts;

  container.innerHTML = facetControlHtml(values, { prefix });
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
