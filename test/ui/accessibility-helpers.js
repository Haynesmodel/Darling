import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function expectNoViolations(page, include) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  expect(
    results.violations,
    results.violations.map(violation => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
}
