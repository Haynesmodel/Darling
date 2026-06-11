# Implementation Plan

Status: complete.

Current architecture:
- `js/app.js` is now a thin bootstrap that starts the history page.
- `js/history-controller.js` owns history-page state, data loading, caching, render orchestration, and export.
- `js/history-controls.js` owns history facet building, reading, reset, dropdown toggles, and count text updates.
- `js/data-helpers.js`, `js/state-helpers.js`, `js/history-renderers.js`, and `js/league-renderers.js` hold the reusable pure logic and markup builders.

Next work:
- keep any future history-page changes inside the controller and control modules instead of growing `js/app.js`
- add new page-specific controllers the same way if the UI expands beyond the current History page
- prefer small helper modules with explicit render keys and test coverage when extracting more behavior
