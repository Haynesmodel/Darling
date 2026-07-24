# Final-topology CI stabilization window

The qualifying ten-run window begins only after the acceptance-coverage and coverage-ratchet changes reach `main`. Runs below that merge are baseline evidence and do not count toward completion.

## Qualification rules

- Count only completed runs using the final workflow topology.
- Reset the window for preview-server connection failures, unexpected server exits, flaky/retry-only accepted success, fewer than 108 Chromium tests, or WebKit skips/failures.
- A deliberately incompatible Dependabot update may be identified separately, but it does not excuse infrastructure failures.
- Record run ID, SHA, event, attempt, conclusion, wall time, Chromium count, WebKit count, retries/flakes, and preview-server errors.
- After ten qualifying runs, calculate the median wall time of the final three clean pull-request runs. It must be at most 6m24s.

## Baseline runs before remediation merge

| Run | SHA | Event | Attempt | Conclusion | Wall time | Eligibility |
| --- | --- | --- | ---: | --- | ---: | --- |
| [30006935266](https://github.com/Haynesmodel/Darling/actions/runs/30006935266) | `7e3a2a5` | push | 1 | Success | 5m32s | Baseline only |
| [30005282960](https://github.com/Haynesmodel/Darling/actions/runs/30005282960) | `800ab17` | pull request | 1 | Success | 5m21s | Baseline only |
| [29977994549](https://github.com/Haynesmodel/Darling/actions/runs/29977994549) | `4f8dc14` | pull request | 1 | Success | 5m55s | Baseline only |
| [29976868347](https://github.com/Haynesmodel/Darling/actions/runs/29976868347) | `4e085e7` | pull request | 1 | Success | 5m38s | Baseline only |
| [29975982270](https://github.com/Haynesmodel/Darling/actions/runs/29975982270) | `256dfde` | pull request | 1 | Success | 6m09s | Baseline only |
| [29973868427](https://github.com/Haynesmodel/Darling/actions/runs/29973868427) | `de72bb3` | pull request | 3 | Success | 20m46s | Ineligible: later attempt |

## Post-merge qualifying window

| # | Run | SHA | Event | Attempt | Conclusion | Wall time | Chromium | WebKit | Retry/flake | Preview errors |
| ---: | --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| 1–10 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

Status: **open**. This window cannot truthfully close until the remediation PR is merged and ten subsequent runs complete.
