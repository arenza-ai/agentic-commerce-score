/**
 * Terminal rendering. Plain by design: aligned text, unicode bars, ANSI color
 * only when stdout is a TTY and NO_COLOR is unset.
 */

import type { Check, ScoreResult } from './types.js';

const useColor = (): boolean => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function paint(code: string, s: string): string {
  return useColor() ? `[${code}m${s}[0m` : s;
}
const bold = (s: string) => paint('1', s);
const dim = (s: string) => paint('2', s);
const green = (s: string) => paint('32', s);
const yellow = (s: string) => paint('33', s);
const red = (s: string) => paint('31', s);
const cyan = (s: string) => paint('36', s);

function bar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function statusMark(c: Check): string {
  switch (c.status) {
    case 'pass':
      return green('✓');
    case 'warn':
      return yellow('!');
    case 'fail':
      return red('✗');
    case 'na':
      return dim('–');
  }
}

export function renderReport(r: ScoreResult): string {
  const lines: string[] = [];
  const gradeColor = r.score >= 70 ? green : r.score >= 55 ? yellow : red;
  lines.push('');
  lines.push(`  ${bold('Agentic Commerce Score')} ${dim(`v${r.rubricVersion}`)}  ·  ${cyan(r.domain)}`);
  lines.push('');
  lines.push(`  ${gradeColor(bold(`${r.score}/100`))}  grade ${gradeColor(bold(r.grade))}   ${r.agentBuyable ? green('agent-buyable ✓') : red('not agent-buyable ✗')}   ${dim(`platform: ${r.platform.name}`)}`);
  lines.push('');
  for (const p of r.pillars) {
    lines.push(`  ${bold(String(p.score).padStart(3))}  ${bar(p.score)}  ${p.label} ${dim(`(${p.weight}%)`)}`);
  }
  lines.push('');
  for (const p of r.pillars) {
    for (const c of p.checks) {
      lines.push(`  ${statusMark(c)} ${c.label}`);
      lines.push(`      ${dim(c.detail)}`);
    }
  }
  if (r.fixes.length > 0) {
    lines.push('');
    lines.push(`  ${bold('Top fixes')}`);
    r.fixes.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`));
  }
  if (r.fetchErrors.length > 0) {
    lines.push('');
    lines.push(dim(`  fetch notes: ${r.fetchErrors.join(' · ')}`));
  }
  lines.push('');
  lines.push(dim(`  Rubric: SCORE.md (v${r.rubricVersion}) · https://arenza.ai/agentic-commerce-score`));
  lines.push('');
  return lines.join('\n');
}
