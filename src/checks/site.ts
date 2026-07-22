/**
 * Site-level artifacts: robots.txt AI-crawler access, llms.txt, sitemap.
 * These are the front door — a store that blocks AI shopping crawlers is
 * invisible to agent-led commerce no matter how good its catalog is.
 */

import { fetchText, urlExists } from '../fetch.js';

/**
 * Buyer-side AI user agents (crawl/answer/shop). Names as they appear in
 * robots.txt groups. Sources: vendor crawler docs (OpenAI, Anthropic, Google,
 * Perplexity, Meta, Apple, Amazon).
 */
export const AI_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
  'meta-externalagent',
] as const;

export interface RobotsAnalysis {
  found: boolean;
  /** AI agents whose robots group (specific or *) disallows the site root. */
  blockedAgents: string[];
  /** True when a wildcard group blocks "/" (blocks everyone incl. AI). */
  wildcardRootBlock: boolean;
  sitemapUrls: string[];
}

/**
 * Minimal robots.txt evaluation. We only judge ROOT blocks ("Disallow: /") —
 * path-level rules are out of scope for v0.1 and never counted against a store.
 */
export function analyzeRobots(robotsTxt: string | null): RobotsAnalysis {
  if (robotsTxt === null) {
    return { found: false, blockedAgents: [], wildcardRootBlock: false, sitemapUrls: [] };
  }
  const groups = new Map<string, string[]>(); // ua(lowercase) → disallow rules
  const sitemapUrls: string[] = [];
  let currentAgents: string[] = [];
  let lastWasAgent = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) currentAgents = [];
      currentAgents.push(value.toLowerCase());
      lastWasAgent = true;
      for (const a of currentAgents) if (!groups.has(a)) groups.set(a, []);
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap' && value) sitemapUrls.push(value);
    if (key === 'disallow') {
      for (const a of currentAgents) groups.get(a)!.push(value);
    }
  }

  const rootBlocked = (ua: string): boolean | null => {
    const rules = groups.get(ua);
    if (!rules) return null;
    return rules.some((r) => r === '/' );
  };

  const wildcardRootBlock = rootBlocked('*') === true;
  const blockedAgents: string[] = [];
  for (const agent of AI_AGENTS) {
    const specific = rootBlocked(agent.toLowerCase());
    const blocked = specific !== null ? specific : wildcardRootBlock;
    if (blocked) blockedAgents.push(agent);
  }
  return { found: true, blockedAgents, wildcardRootBlock, sitemapUrls };
}

export async function fetchRobots(domain: string, timeoutMs?: number): Promise<string | null> {
  const res = await fetchText(`https://${domain}/robots.txt`, timeoutMs);
  if (!res.ok) return null;
  // Some CDNs serve an HTML error page with 200 — robots must be plain text.
  if (/^\s*</.test(res.text)) return null;
  return res.text;
}

export async function checkLlmsTxt(domain: string, timeoutMs?: number): Promise<boolean> {
  const res = await fetchText(`https://${domain}/llms.txt`, timeoutMs);
  if (!res.ok) return false;
  const t = res.text.trim();
  // Must look like markdown/text, not an HTML soft-404.
  return t.length > 0 && !/^\s*<(!doctype|html)/i.test(t);
}

export async function checkSitemap(domain: string, declared: string[], timeoutMs?: number): Promise<boolean> {
  if (declared.length > 0) {
    const first = declared[0]!;
    if (await urlExists(first, timeoutMs)) return true;
  }
  const res = await fetchText(`https://${domain}/sitemap.xml`, timeoutMs);
  return res.ok && /<(urlset|sitemapindex)[\s>]/i.test(res.text);
}
