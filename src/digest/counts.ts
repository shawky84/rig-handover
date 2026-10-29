import { parseLine } from './read.js';
import type { RunStatus } from './types.js';

export type Counts = Record<RunStatus, number>;

// Counts run LINES per status. Bad lines are not counted.
export function countLines(text: string): Counts {
  const counts: Counts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split('\n')) {
    const line = raw.trim() === '' ? null : parseLine(raw);
    if (line) counts[line.status]++;
  }
  return counts;
}
