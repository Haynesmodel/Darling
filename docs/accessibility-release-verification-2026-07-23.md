# Accessibility release verification — July 23, 2026

This record supersedes the July 16 release snapshot for the eight-tab shell, League Pulse, and the data-freshness disclosure. Automated results are evidence, not a substitute for the manual assistive-technology gates below.

## Automated evidence

| Surface | Environment | Result | Evidence | Owner | Follow-up |
| --- | --- | --- | --- | --- | --- |
| All eight tabs, light and dark | Playwright Chromium + Axe 4.12.1 | Pass | `test/ui/accessibility.spec.js` runs every tab in both themes | @Haynesmodel | None |
| Live Pulse, light and dark | Playwright Chromium + Axe 4.12.1, 390×844 | Pass | Active live snapshot scans and document-overflow assertions | @Haynesmodel | None |
| Tab activation and focus | Playwright Chromium keyboard suite | Pass | Manual activation, roving focus, Home/End, Enter/Space | @Haynesmodel | None |
| Freshness disclosure | Playwright Chromium keyboard + forced colors | Pass | Native disclosure focus, logical order, reload naming, warning state | @Haynesmodel | None |
| Time-only reassessment | Playwright Chromium fake clock | Pass | No assertive region or duplicate freshness summary after reassessment | @Haynesmodel | None |
| Narrow layout | Playwright Chromium, 320/375/390/768 widths | Pass | Pulse and disclosure do not clip or overflow | @Haynesmodel | None |
| WebKit smoke | Playwright WebKit | Blocked locally | Playwright does not ship WebKit for the local macOS 13 ARM64 host; the required six-test production-preview lane remains enforced in hosted CI | @Haynesmodel | Confirm the required PR check |

## Manual environment gates

These rows remain open until exercised by a person in the named environment. A pending row is not a release-gate pass.

| Environment | Version/device | Result | Evidence | Owner | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Safari on macOS, keyboard only | Current stable Safari/macOS | Pending | Not available to the automated Chromium/WebKit harness | @Haynesmodel | Run all flows below before release |
| VoiceOver + Safari | Current stable macOS | Pending | Screen-reader announcements, rotor order, and names require manual verification | @Haynesmodel | Run all flows below before release |
| VoiceOver + Chrome | Current stable macOS, where practical | Pending | Cross-browser screen-reader spot check not yet recorded | @Haynesmodel | Run Pulse and freshness flows |
| Browser zoom | Safari and Chrome at 200% | Pending | Automated narrow viewports do not prove browser zoom behavior | @Haynesmodel | Check all eight tabs and disclosure |
| Increase Contrast | macOS current stable | Pending | Forced-colors automation is not equivalent to macOS Increase Contrast | @Haynesmodel | Check Pulse and freshness warning states |
| Physical narrow touch device | Owner-selected current phone | Pending owner decision | No physical device was available in this implementation session | @Haynesmodel | Test or record an explicit owner-approved deferral |
| Windows High Contrast + NVDA | Current supported Windows/NVDA | Unavailable | No Windows/NVDA environment was available | @Haynesmodel | Assign an available verifier or approve a dated deferral |

## Manual flow checklist

| Flow | Automated status | Manual status | Required manual evidence |
| --- | --- | --- | --- |
| Bare route announces League Pulse as selected tab and panel | Pass | Pending | VoiceOver announcement and rotor order |
| Pulse hero, matchups, movement, standings, and quick links have meaningful order and names | Pass | Pending | VoiceOver reading order and link-name spot check |
| Arrow navigation does not activate a tab until Enter/Space | Pass | Pending | Safari keyboard confirmation |
| Freshness status is understandable without color | Pass | Pending | VoiceOver + Increase Contrast confirmation |
| Freshness disclosure opens/closes and focus remains predictable | Pass | Pending | Safari and VoiceOver focus confirmation |
| Partial/stale copy and reload action are understandable | Pass | Pending | VoiceOver name and description confirmation |
| Time reassessment avoids repeated noisy announcements | Pass | Pending | Long-open VoiceOver observation |
| Mobile tab strip, freshness, theme controls, and hero do not overlap | Pass | Pending | Physical touch-device confirmation |
| All eight tab panels remain reachable and named | Pass | Pending | Safari/VoiceOver traversal |

No manual row is marked complete by this document. Failures must link to a fix; deferrals require an explicit dated owner decision.
