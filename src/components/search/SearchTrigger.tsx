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
      aria-label="Search The Darling"
      title="Search The Darling"
      disabled={disabled}
      onClick={onOpen}
    >
      <span class="search-trigger-icon" aria-hidden="true">⌕</span>
      <span class="search-trigger-label">Search</span>
    </button>
  );
}
