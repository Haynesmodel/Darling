const groupedFeatures = {
  owner: 'Owners',
  transactions: 'Owners',
  history: 'Owners',
  trophy: 'Owners',
  dynasty: 'Owners',
  draft: 'Tools',
  gauntlet: 'Tools',
};

export function featureDestination(page, id) {
  return page.locator(`[data-feature-id="${id}"]`);
}

export async function activateFeature(page, id) {
  const group = groupedFeatures[id];
  if (group) {
    const details = page.locator(`.primary-nav-group[data-navigation-group="${group.toLowerCase()}"]`);
    if (!(await details.evaluate(element => element.open))) {
      await details.locator('summary').first().click();
    }
  }
  await featureDestination(page, id).click();
}
