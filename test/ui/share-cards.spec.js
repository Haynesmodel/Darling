import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './coverage-fixture.js';
import { expectNoViolations } from './accessibility-helpers.js';

const preview = process.env.PLAYWRIGHT_SERVER === 'preview';
const manifest = preview
  ? JSON.parse(fs.readFileSync(path.join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))
  : {};
const runtimeEntry = manifest['src/share/share-card-runtime.ts'];
const runtimePattern = preview ? `**/${runtimeEntry.file}` : '**/src/share/share-card-runtime.ts*';

async function waitForFeature(page, id) {
  const panel = page.locator(`#page-${id}`);
  await expect(panel).toHaveAttribute('data-feature-state', 'ready');
  await expect(panel.locator('[data-feature-message]')).toHaveCount(0);
}

async function openNewspaperCard(page) {
  await page.goto('/');
  await waitForFeature(page, 'pulse');
  const newspaper = page.getByRole('region', { name: 'The League Newspaper', exact: true });
  await newspaper.getByRole('button', { name: 'Share card', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share card preview', exact: true });
  await expect(dialog).toBeVisible();
  return { dialog, newspaper };
}

async function svgText(dialog) {
  return dialog.locator('.share-card-preview').evaluate(async image => (
    fetch(image.src).then(response => response.text())
  ));
}

test('coverage build exercises the share-card validation failures in authored coordinates', async ({ page }) => {
  test.skip(!process.env.COLLECT_COVERAGE, 'The source module is available only from the instrumented development server.');
  await page.goto('/');
  expect(await page.evaluate(async () => {
    const { validateShareCardSpec } = await import('/src/share/share-card-spec.ts');
    const { renderShareCardSvg } = await import('/js/share-card-svg.js');
    const environment = { origin: 'http://127.0.0.1:8000', basePath: '/' };
    const candidate = {
      schemaVersion: 1,
      id: 'coverage-card',
      kind: 'matchup',
      eyebrow: 'Coverage',
      title: 'Alpha vs Beta',
      subtitle: 'Final',
      metrics: [
        { label: 'Alpha', value: '120' },
        { label: 'Beta', value: '100' },
      ],
      canonicalUrl: 'http://127.0.0.1:8000/?tab=current',
      sourceLabel: 'Current Season',
      dataVersion: 'coverage',
      altText: 'Alpha defeated Beta.',
      accent: 'red',
      filename: 'darling-coverage-card.png',
    };
    const glyphCandidate = {
      ...candidate,
      metrics: [
        { label: 'Digits', value: '00000000000', detail: 'Eleven zeroes' },
        { label: 'Em dash', value: '2014—2025', detail: 'Range' },
        { label: 'Plus', value: '+123.45', detail: 'Positive result' },
        { label: 'Mixed', value: 'W0+—', detail: 'Wide glyphs' },
      ],
    };
    const glyphResult = validateShareCardSpec(glyphCandidate, environment);
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
    if (glyphResult.ok) host.innerHTML = renderShareCardSvg(glyphResult.spec);
    document.body.append(host);
    const overflow = [...host.querySelectorAll('g')].flatMap(group => {
      const rect = group.querySelector('rect');
      if (!rect) return [];
      const left = Number(rect.getAttribute('x')) + 22;
      const right = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) - 22;
      return [...group.querySelectorAll('text')].flatMap(node => {
        const bounds = node.getBBox();
        return bounds.x < left || bounds.x + bounds.width > right
          ? [{ text: node.textContent, left: bounds.x, right: bounds.x + bounds.width }]
          : [];
      });
    });
    host.remove();
    return {
      valid: validateShareCardSpec(candidate, environment).ok,
      unsupported: validateShareCardSpec({ ...candidate, kind: 'unknown' }, environment).code,
      incomplete: validateShareCardSpec({ ...candidate, metrics: candidate.metrics.slice(0, 1) }, environment).code,
      invalidText: validateShareCardSpec({ ...candidate, title: 'bad\ntext' }, environment).code,
      invalidAccent: validateShareCardSpec({ ...candidate, accent: 'orange' }, environment).code,
      invalidUrl: validateShareCardSpec({
        ...candidate,
        canonicalUrl: 'https://attacker.example/card',
      }, environment).code,
      overflowingZeroes: validateShareCardSpec({
        ...glyphCandidate,
        metrics: glyphCandidate.metrics.map((metric, index) => (
          index === 0 ? { ...metric, value: '0'.repeat(13) } : metric
        )),
      }, environment).code,
      glyphCandidate: glyphResult.ok,
      overflow,
    };
  })).toEqual({
    valid: true,
    unsupported: 'UNSUPPORTED_KIND',
    incomplete: 'INCOMPLETE_DATA',
    invalidText: 'INVALID_TEXT',
    invalidAccent: 'INVALID_TEXT',
    invalidUrl: 'INVALID_URL',
    overflowingZeroes: 'INVALID_TEXT',
    glyphCandidate: true,
    overflow: [],
  });
});

test('coverage build exercises internal share lifecycle and empty Draft branches', async ({ page }) => {
  test.skip(!process.env.COLLECT_COVERAGE, 'Authored module contracts are available only from the instrumented development server.');
  await page.goto('/');
  expect(await page.evaluate(async () => {
    const actions = await import('/src/share/share-card-actions.ts');
    const adapters = await import('/src/share/share-card-feature-adapters.ts');
    const { buildShareCard } = await import('/src/share/share-card-builders.ts');
    const runtime = await import('/src/share/share-card-runtime.ts');
    runtime.closeShareCardPreview();
    const host = document.createElement('div');
    document.body.append(host);
    const unavailable = actions.mountShareCardAction({
      host,
      result: { ok: false, code: 'INCOMPLETE_DATA', message: 'Card unavailable.' },
    });
    const unavailableState = {
      role: host.getAttribute('role'),
      state: host.getAttribute('data-share-state'),
    };
    unavailable.dispose();
    const cleaned = !host.hasAttribute('role') && !host.hasAttribute('data-share-state');
    const copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { copied.push(value); } },
    });
    const copy = actions.mountCopyLinkAction(host, location.href);
    host.querySelector('button').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const copiedStatus = host.querySelector('[aria-live]')?.textContent;
    copy.dispose();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const failedCopy = actions.mountCopyLinkAction(host, location.href);
    host.querySelector('button').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const selectedFallback = !host.querySelector('input')?.hidden;
    failedCopy.dispose();

    const root = document.createElement('div');
    const rowHost = document.createElement('div');
    rowHost.dataset.shareTeamA = 'A';
    rowHost.dataset.shareTeamB = 'B';
    root.append(rowHost);
    const emptyCurrent = adapters.mountCurrentMatchupCards(
      null, { matchups: [] }, location.pathname, 'fixture', window,
    );
    const missingRow = adapters.mountCurrentMatchupCards(
      root, { matchups: [], season: 2030, week: 1 }, location.pathname, 'fixture', window,
    );
    const pending = adapters.mountCurrentMatchupCards(root, {
      season: 2030,
      week: 1,
      matchups: [{ teamA: 'A', teamB: 'B', completed: false }],
    }, location.pathname, 'fixture', window);
    pending.forEach(controller => controller.dispose());
    const noRivalry = adapters.mountRivalryCard(
      host,
      { teamA: 'A', teamB: 'B', summary: { overall: { g: 0 } } },
      location.pathname,
      'fixture',
      window,
    );
    const noTrophy = adapters.mountTrophyCard(host, {}, location.pathname, 'fixture', window);
    const noDynasty = adapters.mountDynastyCard(host, null, location.pathname, 'fixture', window);
    const incomplete = buildShareCard('matchup', {
      id: 'coverage',
      eyebrow: 'Coverage',
      title: 'A vs B',
      metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '0' }],
      canonicalHref: location.href,
      sourceLabel: 'Coverage',
      dataVersion: 'fixture',
      altText: 'Coverage card.',
      complete: false,
    }, { origin: location.origin, basePath: '/' });
    const valid = buildShareCard('matchup', {
      id: 'coverage-valid',
      eyebrow: 'Coverage',
      title: 'A vs B',
      metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '0' }],
      canonicalHref: location.href,
      sourceLabel: 'Coverage',
      dataVersion: 'fixture',
      altText: 'Coverage card.',
    }, { origin: location.origin, basePath: '/' });
    const preview = actions.mountShareCardAction({ host, result: valid });
    const previewButton = host.querySelector('button');
    previewButton.click();
    previewButton.click();
    for (let attempt = 0; attempt < 100 && previewButton.disabled; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    runtime.closeShareCardPreview(previewButton);
    previewButton.click();
    for (let attempt = 0; attempt < 100 && previewButton.disabled; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    preview.dispose();
    host.remove();

    const [pageModule, draftModel, asset] = await Promise.all([
      import('/src/features/draft-spot/DraftSpotPage.tsx'),
      import('/src/features/draft-spot/draft-spot-model.ts'),
      fetch('/assets/DraftSpot.json').then(response => response.json()),
    ]);
    const emptyAsset = {
      ...asset,
      rows: [],
      pick_summary: [],
      zone_summary: [],
      owner_recommendations: [],
      team_seasons: 0,
    };
    const emptyModel = draftModel.buildDraftSpotModel(emptyAsset);
    const emptyDraft = pageModule.buildDraftShareResult(emptyModel, 'fixture', window);
    const serverDraft = pageModule.buildDraftShareResult(emptyModel, 'fixture', null);

    return {
      unavailableState,
      cleaned,
      copied: copied.length,
      copiedStatus,
      selectedFallback,
      emptyCurrent: emptyCurrent.length,
      missingRow: missingRow.length,
      noRivalry,
      noTrophy,
      noDynasty,
      incomplete: incomplete.code,
      emptyDraft: emptyDraft?.ok,
      serverDraft,
    };
  })).toEqual({
    unavailableState: { role: 'alert', state: 'unavailable' },
    cleaned: true,
    copied: 1,
    copiedStatus: 'Link copied.',
    selectedFallback: true,
    emptyCurrent: 0,
    missingRow: 0,
    noRivalry: null,
    noTrophy: null,
    noDynasty: null,
    incomplete: 'INCOMPLETE_DATA',
    emptyDraft: false,
    serverDraft: null,
  });
});

test('Newspaper preview loads once, produces a fixed PNG, and restores focus', async ({ page }) => {
  test.skip(!preview, 'production manifest assertions require the preview build');
  const requested = [];
  page.on('response', response => requested.push(new URL(response.url()).pathname));
  await page.goto('/');
  await waitForFeature(page, 'pulse');
  const newspaper = page.getByRole('region', { name: 'The League Newspaper', exact: true });
  const opener = newspaper.getByRole('button', { name: 'Share card', exact: true });
  expect(requested.some(url => url.endsWith(runtimeEntry.file))).toBe(false);
  for (const css of runtimeEntry.css || []) expect(requested.some(url => url.endsWith(css))).toBe(false);

  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Share card preview', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Card ready.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Download PNG', exact: true })).toHaveAttribute('download', /\.png$/);
  await expect(dialog.getByRole('textbox', { name: 'Canonical source link', exact: true })).toHaveValue(/currentSeason=2025&currentWeek=14/);
  await expect.poll(() => dialog.locator('.share-card-preview').evaluate(image => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))).toEqual({ width: 1200, height: 630 });
  const signature = await dialog.getByRole('link', { name: 'Download PNG', exact: true }).evaluate(async link => (
    [...new Uint8Array(await (await fetch(link.href)).arrayBuffer()).slice(0, 8)]
  ));
  expect(signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const svg = await svgText(dialog);
  expect(svg).toContain('width="1200" height="630"');
  expect(svg).toContain('<title id="title">2025 Week 14 Recap</title>');
  expect(requested.filter(url => url.endsWith(runtimeEntry.file))).toHaveLength(1);
  for (const css of runtimeEntry.css || []) expect(requested.filter(url => url.endsWith(css))).toHaveLength(1);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog).toBeVisible();
  expect(requested.filter(url => url.endsWith(runtimeEntry.file))).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Close share card preview', exact: true }).click();
  await expect(page.locator('body')).not.toHaveClass(/no-scroll/);
});

test('complete, partial, and season Newspaper editions fail closed without changing URL', async ({ page }) => {
  await page.goto('/');
  await waitForFeature(page, 'pulse');
  const initialUrl = page.url();
  const newspaper = page.getByRole('region', { name: 'The League Newspaper', exact: true });
  await newspaper.getByRole('combobox', { name: 'Season', exact: true }).selectOption('2015');
  await newspaper.getByRole('combobox', { name: 'Edition', exact: true }).selectOption('weekly:2015:7');
  await expect(newspaper.getByText('Partial archive — 4 of 5 games recorded.', { exact: true })).toBeVisible();
  await expect(newspaper.getByRole('button', { name: 'Share card', exact: true })).toHaveCount(0);
  await expect(newspaper.getByRole('link', { name: 'Open source', exact: true })).toHaveAttribute('href', /tab=history/);
  expect(page.url()).toBe(initialUrl);

  await newspaper.getByRole('combobox', { name: 'Type', exact: true }).selectOption('season');
  await expect(newspaper.getByText('Final', { exact: true })).toBeVisible();
  const share = newspaper.getByRole('button', { name: 'Share card', exact: true });
  await expect(share).toBeVisible();
  await share.click();
  const dialog = page.getByRole('dialog', { name: 'Share card preview', exact: true });
  await expect(dialog).toBeVisible();
  const seasonSvg = await svgText(dialog);
  expect(seasonSvg).toContain('2015 Season Recap');
  const metricCells = [...seasonSvg.matchAll(/<g>.*?<\/g>/g)].map(match => match[0]);
  const championCell = metricCells.find(cell => cell.includes('>Champion<'));
  const runnerUpCell = metricCells.find(cell => cell.includes('>Runner-up<'));
  expect(championCell).toContain('>Zook<');
  expect(championCell).toContain('>148.3 points<');
  expect(championCell).not.toContain('111.5');
  expect(runnerUpCell).toContain('>Zubs<');
  expect(runnerUpCell).toContain('>111.5 points<');
  expect(runnerUpCell).not.toContain('148.3');
  await dialog.getByRole('button', { name: 'Close share card preview', exact: true }).click();
  expect(page.url()).toBe(initialUrl);
});

test('each story family opens the shared renderer with its selected facts', async ({ page }) => {
  const cases = [
    {
      id: 'current',
      route: '/?tab=current&currentSeason=2025&currentWeek=17&currentView=matchups',
      host: '[data-share-team-a][data-share-team-b]',
      title: 'Connor vs Shemer',
    },
    {
      id: 'rivalry',
      route: '/?tab=rivalry&rivalryTeamA=Singer&rivalryTeamB=Zook',
      host: '[data-share-rivalry="1"]',
      title: 'Singer vs Zook',
    },
    {
      id: 'trophy',
      route: '/?tab=trophy&trophyOwner=Zook',
      host: '[data-share-trophy="1"]',
      title: 'Zook',
    },
    {
      id: 'dynasty',
      route: '/?tab=dynasty&dynastyOwner=Zook',
      host: '[data-share-dynasty="1"]',
      title: 'Zook Dynasty Score',
    },
    {
      id: 'draft',
      route: '/?tab=draft',
      host: '.draft-hero .share-card-action-host',
      title: 'Draft',
    },
  ];
  for (const item of cases) {
    await page.goto(item.route);
    await waitForFeature(page, item.id);
    const buttons = page.locator(`${item.host} button`);
    await expect(buttons.first(), `${item.id} share action`).toBeVisible();
    await buttons.first().click();
    const dialog = page.getByRole('dialog', { name: 'Share card preview', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Card ready.', { exact: true })).toBeVisible();
    expect(await svgText(dialog)).toContain(item.title);
    await dialog.getByRole('button', { name: 'Close share card preview', exact: true }).click();
  }
});

test('native file share cancellation and rejection keep recovery actions usable', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__shareMode = 'cancel';
    globalThis.__shareCalls = [];
    globalThis.__copiedLinks = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { globalThis.__copiedLinks.push(value); } },
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: value => Boolean(value?.files?.length),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async value => {
        globalThis.__shareCalls.push({
          files: value.files?.map(file => ({ name: file.name, size: file.size, type: file.type })) || [],
          title: value.title,
          text: value.text,
          url: value.url,
        });
        if (globalThis.__shareMode === 'cancel') throw new DOMException('Canceled', 'AbortError');
        throw new DOMException('Denied', 'NotAllowedError');
      },
    });
  });
  const { dialog } = await openNewspaperCard(page);
  await expect(dialog.getByText('Card ready.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(dialog.getByText('Link copied.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__copiedLinks)).toEqual([
    expect.stringContaining('currentWeek=14'),
  ]);
  const share = dialog.getByRole('button', { name: 'Share image', exact: true });
  await share.click();
  await expect(dialog.getByText('Share canceled.', { exact: true })).toBeVisible();
  const call = await page.evaluate(() => globalThis.__shareCalls[0]);
  expect(call.files).toHaveLength(1);
  expect(call.files[0]).toMatchObject({ name: expect.stringMatching(/\.png$/), type: 'image/png' });
  expect(call.files[0].size).toBeGreaterThan(8);
  expect(call.url).toContain('currentWeek=14');

  await page.evaluate(() => { globalThis.__shareMode = 'deny'; });
  await share.click();
  await expect(dialog.getByText('Share failed; copy or download remains available.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copy link', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('link', { name: 'Download PNG', exact: true })).toBeVisible();
});

test('native URL-only share omits the prepared file', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__shareCall = null;
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => { throw new DOMException('Unsupported', 'NotSupportedError'); },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async value => {
        globalThis.__shareCall = {
          hasFiles: 'files' in value,
          title: value.title,
          text: value.text,
          url: value.url,
        };
      },
    });
  });
  const { dialog } = await openNewspaperCard(page);
  await expect(dialog.getByText('Card ready.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Share link', exact: true }).click();
  await expect(dialog.getByText('Shared.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__shareCall)).toMatchObject({
    hasFiles: false,
    title: '2025 Week 14 Recap',
    url: expect.stringContaining('currentWeek=14'),
  });
});

test('SVG decode failure preserves the original SVG download', async ({ page }) => {
  await page.addInitScript(() => {
    Image.prototype.decode = async () => {
      throw new DOMException('Decode failed', 'EncodingError');
    };
  });
  const { dialog } = await openNewspaperCard(page);
  await expect(dialog.getByText('PNG creation failed; download the SVG card.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Download SVG', exact: true })).toHaveAttribute('download', /\.svg$/);
  await expect(dialog.getByRole('button', { name: 'Copy link', exact: true })).toBeEnabled();
});

test('PNG download remains when native File construction is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'File', {
      configurable: true,
      value: function UnsupportedFile() {
        throw new DOMException('File unavailable', 'NotSupportedError');
      },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {},
    });
  });
  const { dialog } = await openNewspaperCard(page);
  await expect(dialog.getByText('Card ready.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Download PNG', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Share link', exact: true })).toBeVisible();
});

test('Clipboard denial selects the canonical URL and Canvas failure offers SVG', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
    });
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback) { callback(null); };
  });
  const { dialog } = await openNewspaperCard(page);
  await expect(dialog.getByText('PNG creation failed; download the SVG card.', { exact: true })).toBeVisible();
  const svg = dialog.getByRole('link', { name: 'Download SVG', exact: true });
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute('download', /\.svg$/);
  expect(await svg.evaluate(async link => fetch(link.href).then(response => response.text()))).toContain('width="1200" height="630"');
  await dialog.getByRole('button', { name: 'Copy link', exact: true }).click();
  const field = dialog.getByRole('textbox', { name: 'Canonical source link', exact: true });
  await expect(field).toBeFocused();
  const length = (await field.inputValue()).length;
  await expect.poll(() => field.evaluate(element => ({
    start: element.selectionStart,
    end: element.selectionEnd,
  }))).toEqual({ start: 0, end: length });
});

test('a preview import failure exposes the source URL and retries on the next click', async ({ page }) => {
  let attempts = 0;
  await page.route(runtimePattern, async route => {
    attempts += 1;
    if (attempts === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.goto('/');
  await waitForFeature(page, 'pulse');
  const newspaper = page.getByRole('region', { name: 'The League Newspaper', exact: true });
  const opener = newspaper.getByRole('button', { name: 'Share card', exact: true });
  await opener.click();
  await expect(newspaper.getByText('Share card could not be loaded.', { exact: true })).toBeVisible();
  await expect(newspaper.getByRole('textbox', { name: 'Canonical story link', exact: true })).toBeFocused();
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Share card preview', exact: true })).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
});

test('preview remains accessible and contained at mobile width and dark theme', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await waitForFeature(page, 'pulse');
  await page.locator('[data-theme-preference="dark"]').click();
  const newspaper = page.getByRole('region', { name: 'The League Newspaper', exact: true });
  const opener = newspaper.getByRole('button', { name: 'Share card', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Share card preview', exact: true });
  await expect(dialog).toBeVisible();
  await expectNoViolations(page, '.share-card-dialog');
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true);
  const close = dialog.getByRole('button', { name: 'Close share card preview', exact: true });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
