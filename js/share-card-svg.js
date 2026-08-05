const accents = {
  gold: '#f4c95d',
  red: '#ff6b6b',
  blue: '#60a5fa',
  green: '#34d399',
  purple: '#a78bfa',
};

function escapeShareCardXml(value) {
  return String(value).replace(/[&<>"']/g, value => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[value]
  ));
}

const SHARE_CARD_TEXT_STYLES = Object.freeze({
  title: Object.freeze({ fontSize: 56, fontWeight: 900, letterSpacing: 0 }),
  subtitle: Object.freeze({ fontSize: 24, fontWeight: 400, letterSpacing: 0 }),
  label: Object.freeze({ fontSize: 16, fontWeight: 800, letterSpacing: 1.4 }),
  metric: Object.freeze({ fontSize: 26, fontWeight: 900, letterSpacing: 0 }),
  detail: Object.freeze({ fontSize: 16, fontWeight: 400, letterSpacing: 0 }),
});
const SHARE_CARD_WIDTH_SAFETY_FACTOR = 1.03;

/** @typedef {{ fontSize: number, fontWeight: number, letterSpacing: number }} ShareCardTextStyle */

// Conservative system-ui bounds measured at the rendered 400, 800, and 900 weights.
// Unlisted glyphs consume a full em, and every estimate receives the safety factor above.
function characterWidthEm(character) {
  if (character === ' ') return 0.34;
  if (/[W@%]/.test(character)) return 1;
  if (/[M—]/.test(character)) return 0.9;
  if (character === 'm') return 0.88;
  if (character === 'w') return 0.82;
  if (character === '&') return 0.74;
  if (/[A-Z]/.test(character)) return 0.74;
  if (/[0-9]/.test(character)) return 0.67;
  if (/[bdgpq]/.test(character)) return 0.61;
  if (/[hnuo]/.test(character)) return 0.6;
  if (/[eackyvx]/.test(character)) return 0.57;
  if (/[sz]/.test(character)) return 0.54;
  if (/[iljI.,:;|'`!·‘’]/.test(character)) return 0.35;
  if (/[frt]/.test(character)) return 0.4;
  if (/[()\[\]{}]/.test(character)) return 0.44;
  if (/[–+]/.test(character)) return 0.7;
  if (/[-/\\]/.test(character)) return 0.46;
  return 1;
}

/** @param {unknown} value @param {ShareCardTextStyle} [style] */
function measureShareCardText(value, style = SHARE_CARD_TEXT_STYLES.detail) {
  const characters = [...String(value)];
  const weightFactor = Number(style.fontWeight) >= 700 ? 1.04 : 1;
  const glyphWidth = characters.reduce((total, character) => total + characterWidthEm(character), 0)
    * Number(style.fontSize)
    * weightFactor
    * SHARE_CARD_WIDTH_SAFETY_FACTOR;
  return glyphWidth + Math.max(0, characters.length - 1) * Number(style.letterSpacing || 0);
}

/** @param {unknown} value @param {number} width @param {ShareCardTextStyle} [style] */
function wrapShareCardText(value, width, style = SHARE_CARD_TEXT_STYLES.detail) {
  const output = [];
  let line = '';
  for (const word of String(value).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measureShareCardText(next, style) > width) {
      output.push(line);
      line = word;
    } else line = next;
  }
  if (line) output.push(line);
  return output;
}

/** @param {unknown} value @param {number} width @param {number} maximum @param {ShareCardTextStyle} [style] */
function shareCardTextFits(value, width, maximum, style = SHARE_CARD_TEXT_STYLES.detail) {
  const output = wrapShareCardText(value, width, style);
  return output.length <= maximum && output.every(line => measureShareCardText(line, style) <= width);
}

function shareCardMetricTextWidths(count) {
  const columnWidth = (1104 - (count - 1) * 16) / count;
  const contentWidth = columnWidth - 44;
  return {
    columnWidth,
    label: contentWidth,
    value: contentWidth,
    detail: contentWidth,
  };
}

function lines(value, x, y, size, width, className, style) {
  return wrapShareCardText(value, width, style).map((text, index) => (
    `<text x="${x}" y="${y + index * Math.round(size * 1.18)}" font-size="${size}" class="${className}">${escapeShareCardXml(text)}</text>`
  )).join('');
}

function renderShareCardSvg(spec) {
  const accent = accents[spec.accent];
  const count = spec.metrics.length;
  const metricWidths = shareCardMetricTextWidths(count);
  const width = metricWidths.columnWidth;
  const metrics = spec.metrics.map((metric, index) => {
    const x = 48 + index * (width + 16);
    return `<g><rect x="${x}" y="392" width="${width}" height="132" rx="18" class="cell"/><text x="${x + 22}" y="423" class="label">${escapeShareCardXml(metric.label)}</text>${lines(metric.value, x + 22, 464, 26, metricWidths.value, 'metric', SHARE_CARD_TEXT_STYLES.metric)}${metric.detail ? lines(metric.detail, x + 22, 497, 16, metricWidths.detail, 'soft', SHARE_CARD_TEXT_STYLES.detail) : ''}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc"><title id="title">${escapeShareCardXml(spec.title)}</title><desc id="desc">${escapeShareCardXml(spec.altText)}</desc><rect width="1200" height="630" fill="#07101f"/><path d="M0 0h1200v12H0z" fill="${accent}"/><style>text{font-family:system-ui,sans-serif;fill:#f8fafc}.brand{font-size:28px;font-weight:900;letter-spacing:3px}.eye,.label{font-size:16px;font-weight:800;letter-spacing:1.4px}.eye{fill:${accent}}.title,.metric{font-weight:900}.soft,.foot{fill:#b8c4d8}.cell{fill:#111b32;stroke:#30405f}.foot{font-size:15px}</style><text x="48" y="72" class="brand">THE DARLING</text><text x="48" y="126" class="eye">${escapeShareCardXml(spec.eyebrow)}</text>${lines(spec.title, 48, 190, 56, 1104, 'title', SHARE_CARD_TEXT_STYLES.title)}${spec.subtitle ? lines(spec.subtitle, 48, 326, 24, 1104, 'soft', SHARE_CARD_TEXT_STYLES.subtitle) : ''}${metrics}<text x="48" y="584" class="foot">${escapeShareCardXml(spec.sourceLabel)}</text><text x="1152" y="584" text-anchor="end" class="foot">Snapshot ${escapeShareCardXml(String(spec.dataVersion).replace(/^sha256:/, '').slice(0, 12))}</text></svg>`;
}

export {
  SHARE_CARD_TEXT_STYLES,
  escapeShareCardXml,
  measureShareCardText,
  renderShareCardSvg,
  shareCardMetricTextWidths,
  shareCardTextFits,
  wrapShareCardText,
};
