/** Integer cents -> "$12.34" — every money value in this app is integer cents end to end (root CLAUDE.md financial rules), formatted only here at the display boundary. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' });
}

/** For a <input type="date"> value (YYYY-MM-DD) — local calendar day, not a UTC ISO instant. */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}
