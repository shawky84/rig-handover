import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('digest reader', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28')!;
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const byJob = Object.fromEntries(night.rows.map((r) => [r.job, r]));
    expect(byJob['fixtures/refresh']).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(byJob['lane/sync']).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', firstAt: '2026-10-28T23:00:06+01:00' });
    expect(byJob['notes/backup']).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
    expect(byJob['digest/render']).toMatchObject({ owner: null, lastError: null });
  });

  it('returns null for a night with no file or a night that is not a date', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('renders an empty night as no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-11-01.jsonl'), '');
    expect(readNight(dir, '2026-11-01')).toEqual({ night: '2026-11-01', rows: [], badLines: 0 });
  });
});
