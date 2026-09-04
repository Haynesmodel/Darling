const DRAFT_WEEKEND_START = '2026-09-04';
const DRAFT_WEEKEND_END = '2026-09-08';

function newYorkDateParts(value: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  return {
    year: parts.find(part => part.type === 'year')?.value || '',
    month: parts.find(part => part.type === 'month')?.value || '',
    day: parts.find(part => part.type === 'day')?.value || '',
  };
}

export function newYorkDateKey(value: Date): string {
  const { year, month, day } = newYorkDateParts(value);
  return `${year}-${month}-${day}`;
}

/** The welcome is live from Friday morning through the end of Labor Day Monday. */
export function isDraftWeekendActive(value: Date = new Date()): boolean {
  const dateKey = newYorkDateKey(value);
  return dateKey >= DRAFT_WEEKEND_START && dateKey < DRAFT_WEEKEND_END;
}

export const DRAFT_WEEKEND_DISMISS_KEY = 'darling.draft-weekend-welcome.dismissed.2026';
