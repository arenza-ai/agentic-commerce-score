#!/usr/bin/env node
/**
 * acs — Agentic Commerce Score CLI.
 *
 *   npx agentic-commerce-score <store-domain>
 *   acs gymshark.com --json
 *   acs mystore.com --threshold 70        # exit 1 below threshold (CI gate)
 */

import { parseArgs } from 'node:util';
import { runScore } from './index.js';
import { renderReport } from './report.js';

const VERSION = '0.2.0';

const HELP = `agentic-commerce-score v${VERSION}
Can AI shopping agents find, evaluate, and buy from your store?

Usage:
  acs <store-domain> [options]

Options:
  --json             Output the full ScoreResult as JSON
  --threshold <n>    Exit with code 1 if score < n (CI gate)
  --timeout <ms>     Per-request timeout (default 10000)
  --version          Print version
  --help             Show this help

Examples:
  npx agentic-commerce-score allbirds.com
  acs gymshark.com --json | jq .score

Rubric: SCORE.md · https://arenza.ai/agentic-commerce-score`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      threshold: { type: 'string' },
      timeout: { type: 'string' },
      version: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.version) {
    console.log(VERSION);
    return;
  }
  const domain = positionals[0];
  if (values.help || !domain) {
    console.log(HELP);
    if (!domain && !values.help) process.exitCode = 2;
    return;
  }

  const timeoutMs = values.timeout ? Number(values.timeout) : undefined;
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    console.error('--timeout must be a positive number of milliseconds');
    process.exitCode = 2;
    return;
  }

  const result = await runScore(domain, { timeoutMs });

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderReport(result));
  }

  if (values.threshold) {
    const t = Number(values.threshold);
    if (Number.isFinite(t) && result.score < t) {
      console.error(`score ${result.score} is below threshold ${t}`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
