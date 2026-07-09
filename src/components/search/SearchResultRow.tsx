import type { SearchResult } from '../../search/search-types';

interface SearchResultRowProps {
  result: SearchResult;
  index: number;
  active: boolean;
  onActivate(index: number): void;
  onExecute(result: SearchResult): void;
}

export default function SearchResultRow({ result, index, active, onActivate, onExecute }: SearchResultRowProps) {
  return (
    <button
      id={`global-search-option-${index}`}
      type="button"
      role="option"
      aria-selected={active}
      class={active ? 'search-result active' : 'search-result'}
      onMouseEnter={() => onActivate(index)}
      onFocus={() => onActivate(index)}
      onClick={() => onExecute(result)}
    >
      <span class="search-result-copy">
        <strong>{result.title}</strong>
        <span>{result.subtitle}</span>
      </span>
      <span class="search-result-category">{result.category.replace('-', ' ')}</span>
    </button>
  );
}
