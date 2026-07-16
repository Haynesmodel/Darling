# Accessibility release verification — 2026-07-16

Environment: macOS workspace, Chromium through Playwright 1.60, Node 20-compatible project runtime. This record covers the roadmap remediation branch with seven tabs and Draft Spot.

| Check | Result | Evidence / follow-up |
| --- | --- | --- |
| Chrome keyboard-only | Pass | `npm run test:keyboard`; includes wrapping tabs, manual activation, Draft Spot spatial pick navigation, disclosures, dialogs, skip link, and focus restoration. |
| Light/dark automated WCAG A/AA | Pass | `npm run test:a11y`; all seven pages, Search, Dynasty dialog, mobile disclosure, and expanded table. |
| 320/375/390/768 responsive layouts | Pass | Playwright responsive matrix; Search remains visible and no document-level horizontal overflow. |
| 200% zoom equivalent | Pass in automated narrow/reflow coverage | Final physical-browser 200% visual review remains release-owner verification. |
| Reduce Motion | Pass | Playwright emulation confirms decorative effects are skipped and motion transitions collapse. |
| Forced colors | Pass in CSS/semantic implementation | Selected Draft Spot controls have forced-colors outlines; final Windows high-contrast hardware review remains release-owner verification. |
| Safari keyboard-only | Not executable in the automated Chromium workspace | Owner: release maintainer. Removal condition: run the checklist in current Safari before production promotion. |
| VoiceOver + Safari | Not executable from the automated test process | Owner: release maintainer. Removal condition: confirm tab/panel announcements, Draft Spot pressed state, chart names, table controls, and status messages before production promotion. |
| VoiceOver + Chrome | Not executable from the automated test process | Owner: release maintainer. Removal condition: repeat the core navigation and Draft Spot flow where practical. |
| Increase Contrast | Not directly controllable by Playwright | Owner: release maintainer. Removal condition: verify focus, selected, champion, Saunders, and low-sample states remain distinct. |
| Narrow physical-device touch | Not available in the workspace | Owner: release maintainer. Removal condition: verify tab-strip controls, Search, pick cards, and table toolbar on a physical narrow device. |

No automated accessibility blockers remain. The manual items above are explicit release gates and must not be marked complete without device/assistive-technology execution.
