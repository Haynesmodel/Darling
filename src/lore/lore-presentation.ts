import type { Collection, Effect, Entry, LoreScope } from './lore-types';
import './lore-presentation.css';

let openDialog: HTMLDialogElement | null = null;
let restoreFocus: HTMLElement | null = null;
const p = (doc: Document, value: string) => Object.assign(doc.createElement('p'), { textContent: value });
function close() { if (openDialog?.open) openDialog.close(); openDialog?.remove(); openDialog = null; document.body.classList.remove('lore-dialog-open'); restoreFocus?.focus(); restoreFocus = null; }
export function showLore(target: Entry | Collection, entries: Map<string, Entry>, effect: Effect | null, options: { scope?: LoreScope; opener?: HTMLElement | null; reducedMotion?: boolean } = {}) {
  close(); const doc = options.opener?.ownerDocument || document; restoreFocus = options.opener || null;
  const dialog = doc.createElement('dialog'); openDialog = dialog; dialog.className = `lore-dialog lore-tone-${effect?.tone || 'informational'}`; dialog.setAttribute('aria-labelledby', 'lore-dialog-title');
  const button = doc.createElement('button'); button.type = 'button'; button.textContent = 'Close'; button.setAttribute('aria-label', 'Close league lore'); button.addEventListener('click', close); dialog.append(button);
  const title = doc.createElement('h2'); title.id = 'lore-dialog-title'; title.tabIndex = -1; title.textContent = target.title; dialog.append(title);
  dialog.append(p(doc, 'entry_ids' in target ? target.summary : target.teaser));
  if ('entry_ids' in target) target.entry_ids.forEach(id => { const entry = entries.get(id); if (entry) dialog!.append(p(doc, `${entry.title}: ${entry.teaser}`)); }); else target.body.forEach(value => dialog!.append(p(doc, value)));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }); doc.body.append(dialog); doc.body.classList.add('lore-dialog-open');
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); title.focus(); options.scope?.add(dialog);
}
export function disposeLorePresentation() { close(); }
