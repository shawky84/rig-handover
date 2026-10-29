import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { Night } from '../src/digest/types.js';

const made: string[] = [];

// Each case gets its own temp runs dir. runs/ is read-only and never touched here.
function runsWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  made.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

function configFor(runsDir: string): RigConfig {
  return { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
}

const NIGHT = '2026-11-01';

const GOOD_LINES = [
  { at: '2026-11-01T01:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' },
  { at: '2026-11-01T02:00:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' },
  { at: '2026-11-01T02:01:00+01:00', job: 'fixtures/refresh', status: 'ok', owner: 'rook' },
  { at: '2026-11-01T03:00:00+01:00', job: 'notes/backup', status: 'fail', owner: null, error: 'quota exceeded' },
];

const GOOD_TEXT = GOOD_LINES.map((l) => JSON.stringify(l)).join('\n') + '\n';

const GOOD_NIGHT: Night = {
  night: NIGHT,
  rows: [
    {
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-11-01T02:00:00+01:00',
      lastAt: '2026-11-01T02:01:00+01:00',
    },
    {
      job: 'lane/sync',
      owner: 'rook',
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-11-01T01:00:00+01:00',
      lastAt: '2026-11-01T01:00:00+01:00',
    },
    {
      job: 'notes/backup',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      firstAt: '2026-11-01T03:00:00+01:00',
      lastAt: '2026-11-01T03:00:00+01:00',
    },
  ],
  badLines: 0,
};

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('answers 200 with HTML and lists the jobs of the night', async () => {
    const dir = runsWith({ [`${NIGHT}.jsonl`]: GOOD_TEXT });
    const res = await createApp(configFor(dir)).request(`/digest/${NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    for (const row of GOOD_NIGHT.rows) expect(html).toContain(row.job);
  });

  it('answers 404 for a night with no file', async () => {
    const dir = runsWith({});
    const res = await createApp(configFor(dir)).request(`/digest/${NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('answers 200 and says nothing ran for an empty night', async () => {
    const dir = runsWith({ [`${NIGHT}.jsonl`]: '' });
    const res = await createApp(configFor(dir)).request(`/digest/${NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('answers 200, renders the good rows, and says a line did not parse', async () => {
    const dir = runsWith({ [`${NIGHT}.jsonl`]: GOOD_TEXT + 'this is not json\n' });
    const res = await createApp(configFor(dir)).request(`/digest/${NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const row of GOOD_NIGHT.rows) expect(html).toContain(row.job);
    expect(html).toContain('did not parse');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with the Night object from readNight', async () => {
    const dir = runsWith({ [`${NIGHT}.jsonl`]: GOOD_TEXT });
    const res = await createApp(configFor(dir)).request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as Night).toEqual(GOOD_NIGHT);
  });

  it('answers 404 with an error body for a night with no file', async () => {
    const dir = runsWith({});
    const res = await createApp(configFor(dir)).request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('answers the empty night with no rows and no bad lines', async () => {
    const dir = runsWith({ [`${NIGHT}.jsonl`]: '' });
    const res = await createApp(configFor(dir)).request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as Night).toEqual({ night: NIGHT, rows: [], badLines: 0 });
  });

  it('counts a bad line and still returns the good rows', async () => {
    const dir = runsWith({ [`${NIGHT}.jsonl`]: GOOD_TEXT + 'this is not json\n' });
    const res = await createApp(configFor(dir)).request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows).toEqual(GOOD_NIGHT.rows);
  });
});

describe('page and JSON agree', () => {
  it('shows every JSON job in the HTML, in the same order', async () => {
    const dir = runsWith({ [`${NIGHT}.jsonl`]: GOOD_TEXT });
    const app = createApp(configFor(dir));
    const html = await (await app.request(`/digest/${NIGHT}`)).text();
    const body = (await (await app.request(`/api/digest/${NIGHT}`)).json()) as Night;
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
