import { useMemo, useState } from 'preact/hooks';
import {
  deleteView,
  readSavedViews,
  renameView,
  saveView,
} from '../../tables/table-saved-views';
import type {
  PortableTableState,
  SavedTableView,
  TableContext,
  TableRegistryEntry,
  TableUrlState,
} from '../../tables/table-types';

interface SavedViewsMenuProps {
  registry: TableRegistryEntry;
  context: TableContext;
  state: PortableTableState;
  urlState?: TableUrlState;
  onApplyState(state: PortableTableState): void;
  onApplySavedView(view: SavedTableView): void;
}

export default function SavedViewsMenu({ registry, context, state, urlState, onApplyState, onApplySavedView }: SavedViewsMenuProps) {
  const [name, setName] = useState('');
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const views = useMemo(
    () => readSavedViews().filter(view => view.tableId === registry.id),
    [registry.id, revision],
  );

  const handleSave = (event: Event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage('Enter a name and try again.');
      return;
    }
    const existing = views.find(view => view.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
    if (existing) {
      const confirmed = (globalThis as any).confirm?.(`Replace the saved view “${existing.name}”?`) === true;
      if (!confirmed) {
        setMessage(`Kept the existing “${existing.name}” view.`);
        return;
      }
    }
    const saved = saveView(registry.id, trimmed, state, context, undefined, { replaceExisting: !!existing, urlState });
    setMessage(saved ? `Saved “${saved.name}”.` : 'Enter a name and try again.');
    if (saved) {
      setName('');
      setRevision(value => value + 1);
    }
  };

  const handleRename = (view: SavedTableView) => {
    const next = globalThis.prompt?.('Rename saved view', view.name)?.trim();
    if (next) {
      if (renameView(view.id, next)) {
        setMessage(`Renamed to “${next}”.`);
        setRevision(value => value + 1);
      } else {
        setMessage(`A “${next}” view already exists for this table.`);
      }
    }
  };

  const handleDelete = (view: SavedTableView) => {
    if (deleteView(view.id)) {
      setMessage(`Deleted “${view.name}”.`);
      setRevision(value => value + 1);
    }
  };

  return (
    <details class="table-view-menu table-menu">
      <summary class="btn">Views{views.length ? ` (${views.length})` : ''}</summary>
      <div class="table-menu-panel">
        {registry.builtInViews?.length ? (
          <div class="table-view-list">
            <strong>Built in</strong>
            {registry.builtInViews.map(view => (
              <button
                type="button"
                key={view.name}
                onClick={() => onApplyState({ ...state, ...view.state })}
              >
                {view.name}
              </button>
            ))}
          </div>
        ) : null}
        {views.length ? (
          <div class="table-view-list">
            <strong>Saved</strong>
            {views.map(view => (
              <div class="table-view-row" key={view.id}>
                <button type="button" onClick={() => onApplySavedView(view)}>{view.name}</button>
                <button type="button" class="table-icon-button" aria-label={`Rename ${view.name}`} onClick={() => handleRename(view)}>✎</button>
                <button type="button" class="table-icon-button" aria-label={`Delete ${view.name}`} onClick={() => handleDelete(view)}>×</button>
              </div>
            ))}
          </div>
        ) : null}
        <form class="table-save-view" onSubmit={handleSave}>
          <label>
            <span>Save current setup</span>
            <input value={name} maxLength={60} onInput={event => setName((event.currentTarget as any).value)} placeholder="View name" />
          </label>
          <button type="submit" class="btn primary">Save</button>
        </form>
        <p class="table-menu-message" aria-live="polite">{message}</p>
      </div>
    </details>
  );
}
