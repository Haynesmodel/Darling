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

function lines(value, x, y, size, width, maximum, className) {
  const output = [];
  let line = '';
  for (const word of String(value).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > width) {
      output.push(line);
      line = word;
    } else line = next;
  }
  if (line) output.push(line);
  return output.slice(0, maximum).map((text, index) => (
    `<text x="${x}" y="${y + index * Math.round(size * 1.18)}" font-size="${size}" class="${className}">${escapeShareCardXml(text)}</text>`
  )).join('');
}

function renderShareCardSvg(spec) {
  const accent = accents[spec.accent];
  const count = spec.metrics.length;
  const width = (1104 - (count - 1) * 16) / count;
  const metrics = spec.metrics.map((metric, index) => {
    const x = 48 + index * (width + 16);
    return `<g><rect x="${x}" y="392" width="${width}" height="132" rx="18" class="cell"/><text x="${x + 22}" y="423" class="label">${escapeShareCardXml(metric.label)}</text>${lines(metric.value, x + 22, 464, 28, Math.max(10, Math.floor(width / 17)), 1, 'metric')}${metric.detail ? lines(metric.detail, x + 22, 497, 16, Math.max(12, Math.floor(width / 10)), 1, 'soft') : ''}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc"><title id="title">${escapeShareCardXml(spec.title)}</title><desc id="desc">${escapeShareCardXml(spec.altText)}</desc><rect width="1200" height="630" fill="#07101f"/><path d="M0 0h1200v12H0z" fill="${accent}"/><style>text{font-family:system-ui,sans-serif;fill:#f8fafc}.brand{font-size:28px;font-weight:900;letter-spacing:3px}.eye,.label{font-size:16px;font-weight:800;letter-spacing:1.4px}.eye{fill:${accent}}.title,.metric{font-weight:900}.soft,.foot{fill:#b8c4d8}.cell{fill:#111b32;stroke:#30405f}.foot{font-size:15px}</style><text x="48" y="72" class="brand">THE DARLING</text><text x="48" y="126" class="eye">${escapeShareCardXml(spec.eyebrow)}</text>${lines(spec.title, 48, 190, 56, 34, 2, 'title')}${spec.subtitle ? lines(spec.subtitle, 48, 326, 24, 74, 2, 'soft') : ''}${metrics}<text x="48" y="584" class="foot">${escapeShareCardXml(spec.sourceLabel)}</text><text x="1152" y="584" text-anchor="end" class="foot">Snapshot ${escapeShareCardXml(String(spec.dataVersion).replace(/^sha256:/, '').slice(0, 12))}</text></svg>`;
}

export { escapeShareCardXml, renderShareCardSvg };
