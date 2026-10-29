// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // rendered as `—` when null
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null; // the most recent error seen for the job, even if it later ran ok
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  rows: DigestRow[]; // sorted by job, so the page and the JSON agree by construction
  badLines: number; // lines that did not parse: counted, never thrown
};

// null when runs/<night>.jsonl does not exist, or `night` is not YYYY-MM-DD (the routes answer 404).
export type ReadNight = (runsDir: string, night: string) => Night | null;
