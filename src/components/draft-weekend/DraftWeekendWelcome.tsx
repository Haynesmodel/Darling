import { useEffect, useState } from 'preact/hooks';
import { DRAFT_WEEKEND_DISMISS_KEY, isDraftWeekendActive } from '../../draft-weekend/draft-weekend-window';

const honors = [
  { label: 'Reigning Champ', owner: 'Zook', icon: '🏆', tone: 'gold' },
  { label: 'Reigning Saunders', owner: 'Connor', icon: '⚡', tone: 'violet' },
  { label: 'VPC', owner: 'Shap', icon: '🎯', tone: 'green' },
  { label: 'Commish', owner: 'Plotnick', icon: '📣', tone: 'blue' },
] as const;

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DRAFT_WEEKEND_DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function DraftWeekendWelcome() {
  const [active, setActive] = useState(() => isDraftWeekendActive());
  const [dismissed, setDismissed] = useState(wasDismissed);

  useEffect(() => {
    const interval = window.setInterval(() => setActive(isDraftWeekendActive()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!active || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DRAFT_WEEKEND_DISMISS_KEY, 'true');
    } catch {
      // The welcome should remain dismissible when storage is unavailable.
    }
  };

  return <section class="draft-weekend-welcome" aria-labelledby="draftWeekendWelcomeTitle">
    <div class="draft-weekend-glow draft-weekend-glow-one" aria-hidden="true"></div>
    <div class="draft-weekend-glow draft-weekend-glow-two" aria-hidden="true"></div>
    <div class="draft-weekend-ball draft-weekend-ball-one" aria-hidden="true">🏈</div>
    <div class="draft-weekend-ball draft-weekend-ball-two" aria-hidden="true">🏈</div>
    <div class="draft-weekend-content">
      <div class="draft-weekend-kicker"><span class="draft-weekend-live-dot" aria-hidden="true"></span> Draft agent is online</div>
      <div class="draft-weekend-heading-row">
        <div>
          <p class="draft-weekend-eyebrow">The league is on the clock</p>
          <h2 id="draftWeekendWelcomeTitle">Welcome to Draft Weekend, 2026</h2>
          <p class="draft-weekend-intro">The rosters are fresh, the takes are spicy, and one Sunday stands between you and glory.</p>
        </div>
        <div class="draft-weekend-whistle" aria-hidden="true">🏈</div>
      </div>
      <div class="draft-weekend-honors" aria-label="Draft Weekend league honors">
        {honors.map(honor => <article class={`draft-weekend-honor draft-weekend-honor-${honor.tone}`} key={honor.label} aria-label={`${honor.label}: ${honor.owner}`}>
          <span class="draft-weekend-honor-icon" aria-hidden="true">{honor.icon}</span>
          <span class="draft-weekend-honor-label">{honor.label}:</span>
          <strong>{honor.owner}</strong>
        </article>)}
      </div>
      <div class="draft-weekend-footer">
        <p><span aria-hidden="true">🏟️</span> Good luck, managers. May your sleepers sleep and your rivals panic.</p>
        <button type="button" class="draft-weekend-dismiss" onClick={dismiss}>Enter the league <span aria-hidden="true">→</span></button>
      </div>
    </div>
  </section>;
}
