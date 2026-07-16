# Accessibility and CSS baseline

## Starting point

The July 16, 2026 production baseline used:

- A 2,998-line `css/style.css` plus separate Easter-egg, search, and table styles.
- Class-only primary tab state with every tab in the normal tab sequence.
- Anchored checkbox disclosures with partial Escape handling.
- A custom Dynasty overlay without initial focus, containment, inertness, scroll lock, or opener restoration.
- Reduced-motion handling limited to search CSS.
- Horizontally scrolling mobile navigation with hidden overflow evidence and Search mixed into the tab row.

The data-layer hotfix was confirmed merged as pull request 28 before this work branched from `origin/main` at `41dbb6c`.

## Implemented baseline

- CSS is split into explicit layers and shared/feature ownership; no monolithic compatibility stylesheet remains.
- Shared and feature files pass 350/500-line budgets.
- WAI-ARIA tab semantics, manual keyboard activation, URL/history synchronization, and horizontal active-tab reveal are automated.
- Filter disclosure semantics and keyboard movement are automated.
- Dynasty and Search focus management are automated.
- Reduced-motion behavior is handled in CSS and JavaScript.
- Axe scans pass for all six pages in light/dark themes and for representative overlay/expanded states.
- Responsive checks pass at 320×568, 375×667, 390×844, and 768×1024 without document-level horizontal overflow.

The production CSS bundle is emitted as one deterministic file. The verification build measured about 77.2 KB raw and 14.4 KB gzip while adding the new accessibility and responsive behavior.

Visual characterization was checked for:

- 320×568 History with the mobile season filter sheet.
- 390×844 Dynasty with a long structured modal.
- 1440×900 Trophy Case with the desktop hero and primary navigation.

Manual VoiceOver, Safari, physical-device, and operating-system contrast checks remain release activities and are documented in `docs/accessibility.md`.
