# Accessibility engineering

The Darling targets WCAG 2.2 Level AA as its engineering baseline. Automated checks cover only detectable failures; keyboard, zoom, contrast-preference, and screen-reader review remain part of release verification.

## Interaction contracts

### Primary navigation

- The sticky primary navigation uses ordinary links plus native `details`/`summary` disclosures.
- Its five controls are Home, Season, Owners, Rivalries, and Tools; Search remains a separate utility action.
- Home and Season are direct destinations. Owners exposes My Team first, then Transactions, League History, Trophy Case, and Dynasty Rankings. Rivalries links to Head to Head. Tools exposes Draft Spot and Historical Matchup.
- `Tab` follows visual order, Enter activates links, and Enter or Space toggles the Owners and Tools summaries without custom roving focus.
- Only one grouped disclosure remains open. Escape closes it and restores its summary; an outside activation closes it without moving focus.
- Exactly one destination link exposes `aria-current="page"`. A closed grouped disclosure includes visually hidden text naming its current child.
- Activation synchronizes the current destination, independently named page section, URL state, theme context, browser history, and full/compact hero mode.
- Lazy activation keeps the labelled selected panel visible, marks it `aria-busy="true"`, and uses one polite global status announcement until its controller and CSS are ready.
- Feature import failures use a panel-scoped alert and Retry action; other initialized destinations remain usable and the requested URL is preserved.
- Destination anchors retain canonical `href` values. Modifier clicks, middle clicks, copied links, and direct requests use normal browser navigation; only an unmodified same-origin primary click is intercepted for SPA activation.
- The five controls and Search do not use horizontal scrolling at supported widths.

### History filter disclosures

- Filters keep native checkboxes inside a fieldset and legend.
- Enter or Space opens from the trigger; ArrowDown/ArrowUp opens at the first/last option.
- Arrow keys, Home, and End move option focus.
- Escape closes and restores the trigger.
- Tab exits naturally and closes the disclosure; Shift+Tab from the first option returns to the trigger.
- Rebuilt opponent options restore focus by option value, falling back to All.
- Below 700 pixels, the disclosure becomes a nonmodal fixed bottom sheet with a visible heading and Done button.

### Analytical section disclosures

- Current Season secondary content uses native `details`/`summary`; Enter and Space retain browser-native expanded/collapsed behavior.
- The sticky, feature-labelled “Jump to section” select lists only nonempty sections. Selection opens the target, runs visible-only rendering, focuses its summary, and scrolls below the sticky navigation without changing URL history.
- Existing `focus=standings` and `focus=playoff-picture` links open a containing disclosure before focusing the renderer target.
- Closing through the shared controller while focus is inside moves focus to that section’s summary first. Toggle choices persist only for the matching phase/view signature during the current boot.
- Closed chart sections do not render into zero-width containers. Opening or reopening uses the existing chart renderer without duplicating SVGs or listeners.

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

### Analytical section disclosures

- Transactions, League History, Current Season, Head to Head, Trophy Case, Dynasty Rankings, Draft Spot, and Historical Matchup use native `details`/`summary`.
- Each page exposes a labelled “Jump to section” select in document order. Unavailable sections and their options disappear together.
- Choosing a section opens it, moves focus to its summary, and scrolls it below sticky chrome without changing the URL.
- History `focus=games` and `focus=curses` links open the containing disclosure before moving focus to the existing target.
- Closing a section that contains focus returns focus to its summary. Dynasty modal focus restoration remains tied to an opener in an open section.
- Supporting charts mount only after their section is visible and nonzero-width. Text, tables, copy output, and keyboard grids retain their existing semantics when a section is closed.
- Open choices are remembered per mode/owner/scope signature for the current session; no disclosure preference is encoded in shared links.

### Transaction history

- Six ordered native disclosures expose Overview, Trade Desk, Waiver Wire, Player Journeys, Owner Activity, and Draft & Keepers.
- Filters use labelled native selects. Tables retain captions and scoped headers; player movement uses ordered lists so acquisition and release sequence remains meaningful without visual styling.
- `txId`, `txPlayer`, and owner-scoped links open the relevant disclosure and move focus to a focusable article or section after the lazy asset is verified.
- Loading remains local to the independently labelled Transactions page and uses the shell's concise polite status. Asset or schema failures become the standard feature-scoped alert with Retry.
- Trade outcome text always includes the methodology and status label. Edge, even, incomplete, and too-early states never rely on color.

### Data freshness disclosure

- The shell uses native `details`/`summary`, so the status is keyboard-operable without a custom disclosure state machine.
- Every severity includes a concise text label in addition to the status dot; color is never the only signal.
- Expanded content provides the absolute update time, short snapshot version, verification state, lifecycle explanation, and a clearly named reload action when recovery is useful.
- Fifteen-minute relative-state reassessments are not live-region announcements. Visibility-based reassessment performs no network request and does not move focus.
- The wrapping hero toolbar keeps the disclosure and theme controls available at narrow widths and preserves borders in forced-colors mode.

## Automated checks

Run:

- `npm run test:a11y` for axe WCAG A/AA scans of all ten pages in light and dark themes plus overlay and expanded-table states.
- `npm run test:keyboard` for navigation links/disclosures, filters, dialogs, skip-link, reduced-motion, and responsive interaction checks.
- `npm run test:ui` for the complete browser suite.
- `test/ui/navigation-progressive-disclosure.spec.js` for compact defaults, signature memory, deep-link reveals, responsive route heights, visible-only charts, and open-everything parity.

The axe suite has no global rule exclusions or element exclusions.

The current automated evidence and explicitly pending manual gates are recorded in
[`accessibility-release-verification-2026-07-25.md`](./accessibility-release-verification-2026-07-25.md).

## Adding accessible UI

- Prefer native HTML controls and semantics before adding ARIA.
- Give every control a visible or programmatic name.
- Reuse the global focus ring; do not remove outlines without an equal or stronger replacement.
- Keep live regions concise. Do not make complete tables or feature panels live.
- For a new feature destination, add typed metadata in `src/app/feature-navigation.ts`, a canonical link and independently labelled section in `index.html`, and a literal loader in the feature registry. Route activation through the app controller and test direct/modifier links, slow readiness, import failure, Retry, rapid supersession, and focus-after-ready.
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

Confirm page/navigation names, grouped current-state text, dialog purpose, checkbox state, focus visibility, focus restoration, chart alternatives, and concise status announcements. Record any remaining limitation in an issue with an owner and removal condition.

The current dated record is [accessibility-release-verification-2026-07-16.md](accessibility-release-verification-2026-07-16.md).
