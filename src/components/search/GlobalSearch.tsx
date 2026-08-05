import { useEffect, useRef, useState } from 'preact/hooks';
import type { DarlingSearchRuntime } from '../../search/search-types';
import SearchTrigger from './SearchTrigger';
import { lockBodyScroll, setApplicationInert, unlockBodyScroll } from '../../accessibility/focus';

interface GlobalSearchProps {
  runtime: DarlingSearchRuntime;
  portal: any;
}

type CommandPaletteComponent = typeof import('./CommandPalette').default;

let commandPaletteRequest: Promise<CommandPaletteComponent> | null = null;
let commandPaletteRetryUrl = '', commandPaletteRetries = 0;

function loadCommandPalette(): Promise<CommandPaletteComponent> {
  if (!commandPaletteRequest) {
    commandPaletteRequest = (commandPaletteRetryUrl
      ? import(/* @vite-ignore */ `${commandPaletteRetryUrl}#${++commandPaletteRetries}`)
      : import('./CommandPalette'))
      .then(module => {
        if (typeof module.default !== 'function') {
          throw new Error('Command Palette did not expose its component contract');
        }
        return module.default;
      })
      .catch(error => {
        commandPaletteRetryUrl ||= performance.getEntriesByType('resource')
          .reverse()
          .find(entry =>
            import.meta.env.DEV
              ? entry.name.includes('/CommandPalette.tsx')
              : entry.name.endsWith('.js'),
          )?.name || '';
        commandPaletteRequest = null;
        throw error;
      });
  }
  return commandPaletteRequest;
}

function isEditable(target: EventTarget | null): boolean {
  return !!(target as any)?.closest?.('input, textarea, select, [contenteditable="true"]');
}

export default function GlobalSearch({ runtime, portal }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(runtime.getSnapshot());
  const [palette, setPalette] = useState<CommandPaletteComponent | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const triggerRef = useRef<any>(null);
  const openRef = useRef(false);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const returnFocusRef = useRef<any>(null);
  const focusSequenceRef = useRef(0);

  const rememberFocus = () => {
    focusSequenceRef.current += 1;
    returnFocusRef.current = document.activeElement;
  };
  const restoreFocus = () => {
    const sequence = focusSequenceRef.current;
    const target = returnFocusRef.current;
    requestAnimationFrame(() => {
      if (sequence !== focusSequenceRef.current) return;
      if (target?.isConnected && typeof target.focus === 'function') target.focus();
      else triggerRef.current?.focus();
      returnFocusRef.current = null;
    });
  };

  useEffect(() => runtime.subscribe(setSnapshot), [runtime]);
  useEffect(() => () => {
    mountedRef.current = false;
    if (!openRef.current) return;
    openRef.current = false;
    setApplicationInert(false);
    unlockBodyScroll();
  }, []);
  const openSearch = async (opener: any = triggerRef.current) => {
    if (openRef.current || loadingRef.current || document.querySelector('dialog[open]')) return;
    focusSequenceRef.current += 1;
    const sequence = focusSequenceRef.current;
    returnFocusRef.current = opener;
    loadingRef.current = true;
    setLoading(true);
    setLoadError('');
    try {
      const component = await loadCommandPalette();
      if (!mountedRef.current || sequence !== focusSequenceRef.current) return;
      setPalette(() => component);
      openRef.current = true;
      setApplicationInert(true);
      lockBodyScroll();
      setOpen(true);
    } catch {
      if (mountedRef.current && sequence === focusSequenceRef.current) {
        setLoadError('Search could not be loaded. Try again.');
      }
    } finally {
      loadingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };
  useEffect(() => {
    const onShortcut = (event: any) => {
      if (event.key === 'Escape' && openRef.current) {
        event.preventDefault();
        openRef.current = false;
        setApplicationInert(false);
        unlockBodyScroll();
        setOpen(false);
        restoreFocus();
        return;
      }
      const commandK = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditable(event.target);
      if (!commandK && !slash) return;
      if (openRef.current || loadingRef.current) {
        event.preventDefault();
        return;
      }
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      if (snapshot.hydrated) {
        const opener = document.activeElement;
        rememberFocus();
        void openSearch(opener);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [snapshot.hydrated]);

  const close = () => {
    if (!openRef.current) return;
    openRef.current = false;
    setApplicationInert(false);
    unlockBodyScroll();
    setOpen(false);
    restoreFocus();
  };

  const CommandPalette = palette;

  return (
    <>
      <SearchTrigger
        busy={loading}
        disabled={!snapshot.hydrated}
        onOpen={() => { void openSearch(); }}
        triggerRef={triggerRef}
      />
      {loadError && <span class="visually-hidden" role="alert">{loadError}</span>}
      {CommandPalette
        ? <CommandPalette open={open} runtime={runtime} onClose={close} portal={portal} />
        : null}
    </>
  );
}
