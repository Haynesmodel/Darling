import type { Collection, Effect, Entry, LoreScope } from './lore-types';
import './lore-presentation.css';

let openDialog: HTMLDialogElement | null = null;
let restoreFocus: HTMLElement | null = null;
let openDocument: Document | null = null;
let openScope: LoreScope | null = null;
let openOverlay: HTMLElement | null = null;
const p = (doc: Document, value: string) => Object.assign(doc.createElement('p'), { textContent: value });
const seed = (value: string) => [...value].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7);
function decorate(doc: Document, overlay: HTMLElement, effect: Effect, target: Entry | Collection, reducedMotion: boolean) {
  const name = effect.presentation;
  const count = name === 'bagel-shower' ? 14 : name === 'flies' ? 9 : name === 'chairs' ? 2 : name === 'target' ? 3 : 1;
  const base = seed(`${target.id}:${name}`);
  for (let index = 0; index < count; index += 1) {
    const part = doc.createElement('span');
    part.className = `lore-decoration lore-decoration-${name}`;
    part.setAttribute('aria-hidden', 'true');
    part.textContent = name === 'chairs' ? '🪑' : name === 'target' ? (index === 0 ? '🎯' : '◉') : name === 'ticket' ? '🎟️' : name === 'blank-document' ? '▧' : index === 0 ? effect.symbol : effect.symbol;
    const x = (base + index * 47) % 88 + 6;
    const y = (base >>> 3 ^ index * 29) % 72 + 10;
    part.style.setProperty('--lore-x', `${x}%`);
    part.style.setProperty('--lore-y', `${y}%`);
    part.style.setProperty('--lore-delay', `${(index * 73) % 500}ms`);
    overlay.append(part);
  }
  overlay.dataset.loreCount = String(count);
  if (reducedMotion) overlay.classList.add('lore-effect-static');
}
function close() { const doc = openDocument || openDialog?.ownerDocument; const scope = openScope; openScope = null; if (openDialog?.open) openDialog.close(); openDialog?.remove(); openOverlay?.remove(); openOverlay = null; openDialog = null; scope?.clear(); if (doc) doc.body.classList.remove('lore-dialog-open'); restoreFocus?.focus(); restoreFocus = null; openDocument = null; }
export function showLore(target: Entry | Collection, entries: Map<string, Entry>, effect: Effect | null, options: { scope?: LoreScope; opener?: HTMLElement | null; reducedMotion?: boolean; context?: Record<string, unknown> } = {}) {
  close(); const doc = options.opener?.ownerDocument || document; openDocument = doc; openScope = options.scope || null; restoreFocus = options.opener || null;
  options.scope?.onClear(close);
  const dialog = doc.createElement('dialog'); openDialog = dialog; dialog.className = `lore-dialog lore-tone-${effect?.tone || 'informational'}`; dialog.setAttribute('aria-labelledby', 'lore-dialog-title');
  const button = doc.createElement('button'); button.type = 'button'; button.textContent = 'Close'; button.setAttribute('aria-label', 'Close league lore'); button.addEventListener('click', close); dialog.append(button);
  const title = doc.createElement('h2'); title.id = 'lore-dialog-title'; title.tabIndex = -1; title.textContent = target.title; dialog.append(title);
  dialog.append(p(doc, 'entry_ids' in target ? target.summary : target.teaser));
  const facts = options.context?.facts;
  if (facts && typeof facts === 'object') {
    const list = doc.createElement('dl'); list.className = 'lore-canonical-facts';
    Object.entries(facts as Record<string, unknown>).forEach(([label, value]) => {
      if (value === null || value === undefined || value === '') return;
      const term = doc.createElement('dt'); term.textContent = label.replaceAll('_', ' ');
      const detail = doc.createElement('dd'); detail.textContent = String(value); list.append(term, detail);
    });
    if (list.children.length) dialog.append(list);
  }
  if ('entry_ids' in target) target.entry_ids.forEach(id => { const entry = entries.get(id); if (entry) dialog!.append(p(doc, `${entry.title}: ${entry.teaser}`)); }); else target.body.forEach(value => dialog!.append(p(doc, value)));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(node => !node.hasAttribute('disabled'));
    if (!focusables.length) return;
    const first = focusables[0]; const last = focusables[focusables.length - 1];
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  doc.body.append(dialog); doc.body.classList.add('lore-dialog-open');
  if (effect && effect.presentation !== 'dialog' && effect.presentation !== 'static') {
    const presentation = effect.presentation.replace(/[^a-z0-9-]/g, '-');
    const overlay = doc.createElement('div'); overlay.className = `lore-overlay lore-effect-overlay lore-effect-${presentation}${options.reducedMotion ? ' lore-effect-static' : ''}`; overlay.dataset.lorePresentation = presentation; overlay.setAttribute('aria-hidden', 'true'); overlay.setAttribute('role', 'presentation'); decorate(doc, overlay, effect, target, Boolean(options.reducedMotion)); doc.body.append(overlay); openOverlay = overlay; options.scope?.add(overlay);
    (options.scope?.timer || ((callback: () => void, duration: number) => window.setTimeout(callback, Math.min(2500, Math.max(0, duration)))))(() => { if (openOverlay === overlay) openOverlay = null; overlay.remove(); }, effect.duration_ms);
  }
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); title.focus(); options.scope?.add(dialog);
}
export function disposeLorePresentation() { close(); }
export function setReducedMotion(reduced: boolean) { if (reduced) { openOverlay?.remove(); openOverlay = null; } }
