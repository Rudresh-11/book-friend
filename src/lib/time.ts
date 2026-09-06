const UNITS: [string, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

/** "3 hours ago", "2 days ago", falling back to "just now" for anything under a minute. */
export function timeAgo(ms: number, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return 'just now';
  for (const [label, secondsPerUnit] of UNITS) {
    const value = Math.floor(seconds / secondsPerUnit);
    if (value >= 1) return `${value} ${label}${value === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}
