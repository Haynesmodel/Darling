const DRAFT_WEEKEND_START = '2026-09-04';
const DRAFT_WEEKEND_END = '2026-09-08';

const newYorkCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The welcome is live from Friday morning through the end of Labor Day Monday. */
export function isDraftWeekendActive(value: Date = new Date()): boolean {
  const dateKey = newYorkCalendar.format(value);
  return dateKey >= DRAFT_WEEKEND_START && dateKey < DRAFT_WEEKEND_END;
}

export const DRAFT_WEEKEND_DISMISS_KEY = 'darling.draft-weekend-welcome.dismissed.2026';
