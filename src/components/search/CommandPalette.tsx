import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DarlingSearchRuntime, SearchResult } from '../../search/search-types';
import { focusableElements } from '../../accessibility/focus';
import SearchResultRow from './SearchResultRow';

interface CommandPaletteProps {
  open: boolean;
  runtime: DarlingSearchRuntime;
  onClose(): void;
}

export default function CommandPalette({ open, runtime, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<any>(null);
  const dialogRef = useRef<any>(null);
  const runtimeSnapshot = runtime.getSnapshot();
  const results = useMemo(() => runtime.search(query), [runtime, query, runtimeSnapshot.documents, runtimeSnapshot.recentCount]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
  }, [results.length, activeIndex]);

  if (!open) return null;

  const execute = (result: SearchResult) => {
    onClose();
    window.setTimeout(() => runtime.execute(result), 0);
  };

  const onKeyDown = (event: any) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => results.length ? (index + 1) % results.length : 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => results.length ? (index - 1 + results.length) % results.length : 0);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, results.length - 1));
      return;
    }
    if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      execute(results[activeIndex]);
      return;
    }
    if (event.key === 'Tab') {
      const focusable = focusableElements(dialogRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div class="search-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        id="global-search-dialog"
        ref={dialogRef}
        class="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
        onKeyDown={onKeyDown}
      >
        <div class="search-dialog-header">
          <div class="search-dialog-heading">
            <h2 id="global-search-title">Search The Darling</h2>
            <button type="button" class="search-close" aria-label="Close search" onClick={onClose}>×</button>
          </div>
          <label class="search-input-wrap">
            <span class="visually-hidden">Search owners, seasons, rivalries, and league records</span>
            <span aria-hidden="true">⌕</span>
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="global-search-results"
              aria-activedescendant={results[activeIndex] ? `global-search-option-${activeIndex}` : undefined}
              placeholder="Try “Joe 2021” or “biggest loss”"
              value={query}
              onInput={event => { setQuery(event.currentTarget.value); setActiveIndex(0); }}
            />
          </label>
        </div>
        <div id="global-search-results" class="search-results" role="listbox" aria-label="Search results">
          {results.length ? results.map((result, index) => (
            <SearchResultRow
              key={result.id}
              result={result}
              index={index}
              active={index === activeIndex}
              onActivate={setActiveIndex}
              onExecute={execute}
            />
          )) : (
            <div class="search-empty" role="status">
              <strong>No precise match for “{query}”</strong>
              <span>Try an owner, season, rivalry, feature, or score threshold.</span>
            </div>
          )}
        </div>
        <div class="search-dialog-footer">
          {!query && runtimeSnapshot.recentCount > 0 ? (
            <button type="button" class="search-clear-recent" onClick={() => runtime.clearRecent()}>Clear recent</button>
          ) : null}
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span class="search-result-count" aria-live="polite">{results.length} {results.length === 1 ? 'result' : 'results'}</span>
        </div>
      </div>
    </div>
  );
}
