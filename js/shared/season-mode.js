function seasonModeFromLabels(labels = []) {
  let sawPostseason = false;
  for (const label of labels) {
    const value = String(label || '').trim().toLowerCase();
    if (!value || value === 'regular') continue;
    if (value.includes('saunders')) return 'saunders';
    if (['playoff', 'championship', 'wild card', 'semi final', 'final'].some(token => value.includes(token))) {
      sawPostseason = true;
    }
  }
  return sawPostseason ? 'postseason' : 'regular';
}

export { seasonModeFromLabels };
