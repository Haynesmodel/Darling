export interface DisclosureSection {
  id: string;
  label: string;
  details: HTMLDetailsElement;
  available?: boolean;
  defaultOpen?: boolean;
  onVisible?: () => void;
}

export interface SectionDisclosureController {
  update(input: { signature: string; sections: DisclosureSection[]; preserveFocusedSection?: boolean }): void;
  reveal(sectionId: string): boolean;
  setOpen(sectionId: string, open: boolean): boolean;
  dispose(): void;
}

interface BoundSection extends DisclosureSection {
  summary: HTMLElement;
  available: boolean;
  onToggle: () => void;
}

function scheduleVisible(section: BoundSection): void {
  if (!section.onVisible || !section.details.open || !section.available) return;
  const run = () => {
    if (!section.details.open || !section.available) return;
    const width = section.details.getBoundingClientRect?.().width ?? section.details.clientWidth;
    if (width > 0) section.onVisible?.();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}

export function createSectionDisclosure(input: {
  doc: Document;
  mount: HTMLElement;
  featureId: string;
  featureLabel: string;
}): SectionDisclosureController {
  const memory = new Map<string, Map<string, boolean>>();
  let signature = '';
  let sections = new Map<string, BoundSection>();
  let disposed = false;

  const nav = input.doc.createElement('nav');
  nav.className = 'feature-section-nav';
  nav.setAttribute('aria-label', `${input.featureLabel} sections`);
  const label = input.doc.createElement('label');
  const labelText = input.doc.createElement('span');
  labelText.textContent = 'Jump to section';
  const select = input.doc.createElement('select');
  select.id = `${input.featureId}-section-jump`;
  select.name = select.id;
  label.htmlFor = select.id;
  label.append(labelText, select);
  nav.append(label);
  input.mount.replaceChildren(nav);

  const stateForSignature = () => {
    let state = memory.get(signature);
    if (!state) {
      state = new Map();
      memory.set(signature, state);
    }
    return state;
  };

  const focusSummary = (section: BoundSection) => {
    section.summary.focus({ preventScroll: true });
    section.summary.scrollIntoView({ block: 'start' });
  };

  const setOpen = (sectionId: string, open: boolean): boolean => {
    const section = sections.get(sectionId);
    if (!section || !section.available) return false;
    if (!open && section.details.contains(input.doc.activeElement)) {
      section.summary.focus({ preventScroll: true });
    }
    stateForSignature().set(sectionId, open);
    const changed = section.details.open !== open;
    section.details.open = open;
    if (open && !changed) scheduleVisible(section);
    return true;
  };

  const reveal = (sectionId: string): boolean => {
    const section = sections.get(sectionId);
    if (!section || !section.available) return false;
    setOpen(sectionId, true);
    select.value = sectionId;
    focusSummary(section);
    return true;
  };

  const onSelectChange = () => {
    if (select.value) reveal(select.value);
  };
  select.addEventListener('change', onSelectChange);

  const unbindSections = () => {
    for (const section of sections.values()) {
      section.details.removeEventListener('toggle', section.onToggle);
    }
    sections.clear();
  };

  return {
    update(next) {
      if (disposed) return;
      unbindSections();
      signature = next.signature;
      const state = stateForSignature();
      const options: HTMLOptionElement[] = [];

      for (const definition of next.sections) {
        const summary = definition.details.querySelector<HTMLElement>('summary');
        if (!summary) continue;
        summary.textContent = definition.label;
        const available = definition.available !== false;
        definition.details.hidden = !available;
        definition.details.dataset.sectionId = definition.id;
        summary.id ||= `${definition.id}-summary`;
        const stored = state.get(definition.id);
        const requestedOpen = stored ?? Boolean(definition.defaultOpen);
        const preservesFocusedSection = Boolean(next.preserveFocusedSection)
          && available
          && definition.details.open
          && definition.details.contains(input.doc.activeElement);
        const open = preservesFocusedSection || requestedOpen;
        if (!state.has(definition.id) || preservesFocusedSection) state.set(definition.id, open);
        const openChanged = definition.details.open !== (available && open);
        definition.details.open = available && open;

        let bound: BoundSection;
        const onToggle = () => {
          if (!bound.available || sections.get(bound.id) !== bound) return;
          if (!bound.details.open && bound.details.contains(input.doc.activeElement)) {
            bound.summary.focus({ preventScroll: true });
          }
          stateForSignature().set(bound.id, bound.details.open);
          if (bound.details.open) scheduleVisible(bound);
        };
        bound = { ...definition, available, summary, onToggle };
        sections.set(definition.id, bound);
        definition.details.addEventListener('toggle', onToggle);

        if (available) {
          const option = input.doc.createElement('option');
          option.value = definition.id;
          option.textContent = definition.label;
          options.push(option);
          if (definition.details.open && !openChanged) scheduleVisible(bound);
        }
      }

      select.replaceChildren(...options);
      const firstOpen = [...sections.values()].find(section => section.available && section.details.open);
      select.value = firstOpen?.id || options[0]?.value || '';
      input.mount.hidden = options.length === 0;
    },
    reveal,
    setOpen,
    dispose() {
      if (disposed) return;
      disposed = true;
      unbindSections();
      select.removeEventListener('change', onSelectChange);
      input.mount.replaceChildren();
    },
  };
}
