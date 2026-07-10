interface SearchTriggerProps {
  disabled: boolean;
  onOpen(): void;
  triggerRef: { current: any };
}

export default function SearchTrigger({ disabled, onOpen, triggerRef }: SearchTriggerProps) {
  return (
    <button
      ref={triggerRef}
      type="button"
      class="tab search-trigger"
      aria-haspopup="dialog"
      aria-controls="global-search-dialog"
      disabled={disabled}
      onClick={onOpen}
    >
      <span aria-hidden="true">⌕</span>
      <span>Search</span>
    </button>
  );
}
