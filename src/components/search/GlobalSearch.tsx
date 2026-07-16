import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DarlingSearchRuntime } from '../../search/search-types';
import CommandPalette from './CommandPalette';
import SearchTrigger from './SearchTrigger';
import { lockBodyScroll, setApplicationInert, unlockBodyScroll } from '../../accessibility/focus';

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
    setApplicationInert(false);
    unlockBodyScroll();
  }, []);
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
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      if (snapshot.hydrated) {
        rememberFocus();
        setApplicationInert(true);
        lockBodyScroll();
        openRef.current = true;
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [snapshot.hydrated]);

  const openSearch = () => {
    if (document.querySelector('dialog[open]')) return;
    focusSequenceRef.current += 1;
    returnFocusRef.current = triggerRef.current;
    setApplicationInert(true);
    lockBodyScroll();
    openRef.current = true;
    setOpen(true);
  };

  const close = () => {
    openRef.current = false;
    setApplicationInert(false);
    unlockBodyScroll();
    setOpen(false);
    restoreFocus();
  };

  return (
    <>
      <SearchTrigger disabled={!snapshot.hydrated} onOpen={openSearch} triggerRef={triggerRef} />
      {createPortal(<CommandPalette open={open} runtime={runtime} onClose={close} />, portal)}
    </>
  );
}
