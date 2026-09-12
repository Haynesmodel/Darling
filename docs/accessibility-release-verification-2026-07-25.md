# Accessibility release verification — July 25, 2026

This record supersedes the July 23 snapshot for analytical-page progressive disclosure. Automated evidence covers all eight destinations; the manual assistive-technology and physical-device rows remain explicitly open.

## Automated evidence

| Surface | Environment | Result | Evidence |
| --- | --- | --- | --- |
| All eight destinations, light and dark | Playwright Chromium + Axe 4.12.1 | Pass | `test/ui/accessibility.spec.js` |
| Analytical compact defaults | Playwright Chromium at 390×844 | Pass | Route-specific height ceilings and primary-section maps in `test/ui/navigation-progressive-disclosure.spec.js` |
| Responsive disclosure layout | Playwright Chromium at 320/390/768/1280/1440 | Pass | Every analytical route in light and dark without document overflow |
| Native disclosure keyboard and focus | Playwright Chromium keyboard suite | Pass | Summary activation, jump focus, focus-safe close, History deep links, Draft spatial navigation, and Dynasty modal restoration |
| Signature memory and URL isolation | Playwright Chromium | Pass | Owner/signature reset and restore; section changes leave the product URL byte-identical |
| Deferred charts | Playwright Chromium | Pass | Closed supporting charts contain no SVG; reveal and repeated reopen produce one nonzero-width accessible SVG |
| Tables and copy parity | Playwright Chromium | Pass | Open-all close/reopen preserves table output, saved-view interaction, Gauntlet copy, and canonical URLs |
| Reduced motion and forced colors | Playwright Chromium | Pass | Existing motion suppression plus native-control/outline coverage |
| Production build and bundle | Node 24.14.0, npm 11, Vite 8.1.4 | Pass | Generated drift, typecheck, CSS, architecture, asset audit, and unchanged bundle ceilings |

## Manual environment gates

Automation is not evidence that these environments were exercised. No row below is marked complete.

| Environment | Result | Required evidence / follow-up |
| --- | --- | --- |
| Safari on macOS, keyboard only | Pending | Traverse every section jump and native summary; confirm sticky chrome does not cover focused summaries |
| VoiceOver + Safari | Pending | Confirm page/summary announcements, jump option order, expanded/collapsed state, and History deep-link focus |
| VoiceOver + Chrome | Pending | Spot-check the same disclosure and Dynasty dialog paths where practical |
| Browser zoom at 200% | Pending | Check all eight destinations, open table menus, and verify focused summaries remain visible |
| macOS Increase Contrast | Pending | Confirm disclosure borders, focus indicators, charts, and selected Draft cards remain distinguishable |
| Physical narrow touch device | Pending | Check 320–390-equivalent layout, sticky jump controls, touch targets, tables, and modal scrolling |
| Windows High Contrast + NVDA | Unavailable | Assign an available verifier or record an explicit dated owner deferral |

## Manual flow checklist

- Open and close every native section using keyboard and touch.
- Use each “Jump to section” control and confirm focus lands on the named summary without a URL change.
- Follow `focus=games` and `focus=curses` History links and confirm the target is announced after its disclosure opens.
- Change Head to Head teams/scope, Trophy owner, Dynasty mode/range, Draft mode/pick/zone, and Gauntlet matchup; confirm primary defaults reset only for the new context.
- Switch back to a prior context and confirm its remembered open choices return.
- Open table Views/Filters/Columns menus inside disclosures at 200% zoom and narrow widths.
- Open and close a Dynasty window dialog from Best Windows and Slumps; confirm focus restores to the original opener.
- Reveal every supporting chart, close/reopen it, and confirm a single named graphic plus its textual fallback.
- Copy a Gauntlet result before and after disclosure changes and confirm the text and canonical URL are unchanged.

Pending rows must be completed by a person with the named environment or explicitly deferred by the release owner. Automated passes do not close them.
