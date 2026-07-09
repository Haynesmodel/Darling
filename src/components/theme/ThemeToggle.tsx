import { useEffect, useState } from 'preact/hooks';
import type { DarlingThemeRuntime } from '../../theme/apply-theme';
import type { ColorSchemePreference, ThemeContext } from '../../theme/theme-types';

const OPTIONS: Array<{ value: ColorSchemePreference; label: string; title: string }> = [
  { value: 'system', label: 'Auto', title: 'Use system color scheme' },
  { value: 'light', label: 'Light', title: 'Use light mode' },
  { value: 'dark', label: 'Dark', title: 'Use dark mode' },
];

interface ThemeToggleProps {
  runtime: DarlingThemeRuntime;
}

export default function ThemeToggle({ runtime }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeContext>(() => runtime.getSnapshot());

  useEffect(() => runtime.subscribe(setTheme), [runtime]);

  return (
    <div class="theme-toggle" role="group" aria-label="Color scheme">
      {OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          class={theme.colorSchemePreference === option.value ? 'theme-toggle-option active' : 'theme-toggle-option'}
          aria-pressed={theme.colorSchemePreference === option.value}
          title={option.title}
          onClick={() => runtime.setColorSchemePreference(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
