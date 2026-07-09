import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DarlingSearchRuntime } from '../../search/search-types';
import CommandPalette from './CommandPalette';
import SearchTrigger from './SearchTrigger';
import './search.css';

interface GlobalSearchProps {
  runtime: DarlingSearchRuntime;
  portal: any;
}

function isEditable(target: EventTarget | null): boolean {
  return !!(target as any)?.closest?.('input, textarea, select, [contenteditable="true"]');
}

export default function GlobalSearch({ runtime, portal }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(runtime.getSnapshot());
  const triggerRef = useRef<any>(null);
  const openRef = useRef(false);

  useEffect(() => runtime.subscribe(setSnapshot), [runtime]);
  useEffect(() => {
    const onShortcut = (event: any) => {
      if (event.key === 'Escape' && openRef.current) {
        event.preventDefault();
        openRef.current = false;
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      const commandK = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditable(event.target);
      if (!commandK && !slash) return;
      event.preventDefault();
      if (snapshot.hydrated) {
        openRef.current = true;
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [snapshot.hydrated]);

  const openSearch = () => {
    openRef.current = true;
    setOpen(true);
  };

  const close = () => {
    openRef.current = false;
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <SearchTrigger disabled={!snapshot.hydrated} onOpen={openSearch} triggerRef={triggerRef} />
      {createPortal(<CommandPalette open={open} runtime={runtime} onClose={close} />, portal)}
    </>
  );
}
