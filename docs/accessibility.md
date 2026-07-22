# Accessibility engineering

The Darling targets WCAG 2.2 Level AA as its engineering baseline. Automated checks cover only detectable failures; keyboard, zoom, contrast-preference, and screen-reader review remain part of release verification.

## Interaction contracts

### Primary navigation

- The sticky primary navigation is a manual-activation ARIA tablist.
- `Tab` enters at the selected tab.
- Left/Right Arrow wrap from first to last and last to first; Home/End move to the edges without changing the page.
- Enter or Space activates the focused tab.
- Activation synchronizes the selected tab, panel visibility, URL state, theme context, browser history, and horizontal reveal.
- Lazy activation keeps the labelled selected panel visible, marks it `aria-busy="true"`, and uses one polite global status announcement until its controller and CSS are ready.
- Feature import failures use a panel-scoped alert and Retry action; other initialized tabs remain usable and the requested URL is preserved.
- Mobile overflow uses visible scroll buttons, a scrollbar, edge state, and automatic active-tab reveal. Search remains a separate utility action.

### History filter disclosures

- Filters keep native checkboxes inside a fieldset and legend.
- Enter or Space opens from the trigger; ArrowDown/ArrowUp opens at the first/last option.
- Arrow keys, Home, and End move option focus.
- Escape closes and restores the trigger.
- Tab exits naturally and closes the disclosure; Shift+Tab from the first option returns to the trigger.
- Rebuilt opponent options restore focus by option value, falling back to All.
- Below 700 pixels, the disclosure becomes a nonmodal fixed bottom sheet with a visible heading and Done button.

### Dialogs

- The Dynasty window uses native `<dialog>` with explicit initial focus, focus containment, body scroll locking, Escape/backdrop close, and opener restoration.
- The command palette makes `#appShell` inert, locks scrolling, shares the canonical focusable-element selector, and restores the exact invoking control.
- Search shortcuts are ignored while another application dialog is open.

### Motion

- `src/accessibility/motion.ts` owns preference reads and live preference updates.
- Reduced motion disables decorative crown, fog, Easter-egg, hover-lift, and scaling effects.
- JavaScript skips creating decorative effect DOM when reduction is requested.
- Programmatic tab and deep-link scrolling changes to instant behavior.

### Draft Spot pick board

- Native buttons expose selected state with `aria-pressed`.
- Left/Right move through available picks with wrapping; Up/Down follow the rendered grid; Home/End move to the first/last available pick.
- Enter/Space use native button activation.
- Empty picks are noninteractive, low samples include text/border treatment, and champion/Saunders states never rely on color alone.

## Automated checks

Run:

- `npm run test:a11y` for axe WCAG A/AA scans of all eight pages in light and dark themes plus overlay and expanded-table states.
- `npm run test:keyboard` for tablist, disclosure, dialog, skip-link, reduced-motion, and responsive interaction checks.
- `npm run test:ui` for the complete browser suite.

The axe suite has no global rule exclusions or element exclusions.

## Adding accessible UI

- Prefer native HTML controls and semantics before adding ARIA.
- Give every control a visible or programmatic name.
- Reuse the global focus ring; do not remove outlines without an equal or stronger replacement.
- Keep live regions concise. Do not make complete tables or feature panels live.
- For a new tab, add the tab and panel relationship in `index.html`, add the tab ID mapping in `src/accessibility/tablist.ts`, and route activation through the app controller/feature registry. Test slow readiness, import failure, Retry, rapid supersession, and focus-after-ready.
- For a new modal, use native `<dialog>` when possible, record the opener, set intentional initial focus, lock scrolling, contain focus, and restore the opener.
- For charts, expose one concise chart name and retain a textual table or list when the graphic contains information not otherwise present.
- Mark decorative emoji and images hidden from assistive technology; provide visible or visually hidden text when the symbol carries meaning.

## Manual release checklist

Automated CI does not replace this checklist:

- Keyboard-only Chrome and Safari.
- VoiceOver with Safari, plus Chrome where practical.
- 200% zoom and equivalent narrow CSS viewports.
- macOS Reduce Motion and Increase Contrast.
- Forced-colors emulation in a supporting browser.
- Touch review on a narrow physical device when available.

Confirm page/tab names, dialog purpose, checkbox state, focus visibility, focus restoration, chart alternatives, and concise status announcements. Record any remaining limitation in an issue with an owner and removal condition.

The current dated record is [accessibility-release-verification-2026-07-16.md](accessibility-release-verification-2026-07-16.md).
