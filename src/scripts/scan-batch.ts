/**
 * Batch scanner — powers the State of Agentic Commerce dataset.
 *
 *   node dist/scripts/scan-batch.js --input stores.txt --output data/scan.ndjson
 *
 * Resumable: domains already present in the output NDJSON are skipped, so an
 * interrupted run continues where it stopped. Concurrency-capped and jittered
 * to stay polite (≤ ~9 GETs per store, one store at a time per worker).
 */

import { parseArgs } from 'node:util';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { runScore } from '../index.js';
import type { ScoreResult } from '../types.js';

interface ScanRecord {
  domain: string;
  ok: boolean;
  error?: string;
  scannedAt: string;
  result?: Omit<ScoreResult, 'feed'> & {
    feed: (Omit<NonNullable<ScoreResult['feed']>, 'sampledProducts'> & { sampledProducts?: undefined }) | null;
  };
}

function stripResult(r: ScoreResult): ScanRecord['result'] {
  const feed = r.feed ? { ...r.feed, sampledProducts: undefined } : null;
  return { ...r, feed } as ScanRecord['result'];
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
      concurrency: { type: 'string', default: '12' },
      limit: { type: 'string' },
      timeout: { type: 'string', default: '9000' },
    },
  });
  if (!values.input || !values.output) {
    console.error('Usage: scan-batch --input <domains.txt> --output <out.ndjson> [--concurrency 12] [--limit N]');
    process.exitCode = 2;
    return;
  }

  const domains = readFileSync(values.input, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#'));
  const unique = [...new Set(domains)];

  const done = new Set<string>();
  if (existsSync(values.output)) {
    for (const line of readFileSync(values.output, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        done.add((JSON.parse(line) as ScanRecord).domain);
      } catch {
        /* skip corrupt line */
      }
    }
  }

  let queue = unique.filter((d) => !done.has(d));
  const limit = values.limit ? Number(values.limit) : undefined;
  if (limit && Number.isFinite(limit)) queue = queue.slice(0, limit);

  const timeoutMs = Number(values.timeout) || 9000;
  const concurrency = Math.max(1, Math.min(24, Number(values.concurrency) || 12));
  console.log(`scan-batch: ${queue.length} to scan (${done.size} already done), concurrency ${concurrency}`);

  let scanned = 0;
  let idx = 0;
  const worker = async (workerId: number): Promise<void> => {
    await sleep(workerId * 150); // stagger start
    for (;;) {
      const i = idx++;
      if (i >= queue.length) return;
      const domain = queue[i]!;
      let record: ScanRecord;
      try {
        const result = await runScore(domain, { timeoutMs });
        record = { domain, ok: true, scannedAt: result.scannedAt, result: stripResult(result) };
      } catch (err) {
        record = {
          domain,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          scannedAt: new Date().toISOString(),
        };
      }
      appendFileSync(values.output!, JSON.stringify(record) + '\n');
      scanned++;
      if (scanned % 25 === 0) console.log(`  ${scanned}/${queue.length} scanned…`);
      await sleep(100 + Math.random() * 200);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, (_, w) => worker(w)));
  console.log(`scan-batch: done. ${scanned} new records → ${values.output}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
