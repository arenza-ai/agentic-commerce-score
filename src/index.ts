/**
 * agentic-commerce-score — public API.
 *
 *   import { runScore } from 'agentic-commerce-score';
 *   const result = await runScore('example-store.com');
 *
 * `collectSnapshot` (network) and `scoreSnapshot` (pure) are exported
 * separately so servers/tests can split fetch from scoring.
 */

import { fetchText, isPublicHostname, normalizeDomain, DEFAULT_TIMEOUT_MS } from './fetch.js';
import { fetchFeed } from './checks/feed.js';
import { analyzeRobots, checkLlmsTxt, checkSitemap, fetchRobots } from './checks/site.js';
import { visibleWordCount } from './checks/page.js';
import { scoreSnapshot } from './scoring.js';
import type { FetchedPage, ScoreResult, StoreSnapshot } from './types.js';

export * from './types.js';
export { scoreSnapshot, RUBRIC_VERSION } from './scoring.js';
export { analyzePage, extractJsonLd } from './checks/page.js';
export { analyzeRobots, AI_AGENTS } from './checks/site.js';
export { detectPlatform } from './checks/platform.js';
export { buildFeedInfo } from './checks/feed.js';
export { normalizeDomain } from './fetch.js';

export interface RunScoreOptions {
  timeoutMs?: number;
}

async function fetchPage(url: string, timeoutMs: number): Promise<{ page: FetchedPage | null; error?: string }> {
  const res = await fetchText(url, timeoutMs);
  if (!res.ok || !res.text) return { page: null, error: res.error ? `${url}: ${res.error}` : `${url}: HTTP ${res.status}` };
  return { page: { url, finalUrl: res.finalUrl, status: res.status, html: res.text } };
}

/** Detect a shipping/returns link in homepage HTML (fallback for non-Shopify). */
function linkPresent(html: string | undefined, re: RegExp): boolean {
  if (!html) return false;
  const hrefs = html.match(/href=["'][^"']+["']/gi) ?? [];
  return hrefs.some((h) => re.test(h));
}

export async function collectSnapshot(inputDomain: string, opts: RunScoreOptions = {}): Promise<StoreSnapshot> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const domain = normalizeDomain(inputDomain);
  if (!domain || !isPublicHostname(domain)) {
    throw new Error(`Not a scannable public hostname: "${inputDomain}"`);
  }
  const fetchErrors: string[] = [];

  const [robotsTxt, llmsTxt, homepageRes, feedRes] = await Promise.all([
    fetchRobots(domain, timeoutMs),
    checkLlmsTxt(domain, timeoutMs),
    fetchPage(`https://${domain}/`, timeoutMs),
    fetchFeed(domain, timeoutMs),
  ]);
  if (homepageRes.error) fetchErrors.push(homepageRes.error);
  if (feedRes.error) fetchErrors.push(feedRes.error);

  const robots = analyzeRobots(robotsTxt);
  const sitemapOk = await checkSitemap(domain, robots.sitemapUrls, timeoutMs);

  // One representative product page: prefer a product with image + price.
  let productPage: FetchedPage | null = null;
  const candidates = feedRes.feed?.sampledProducts ?? [];
  const pick = candidates.find((p) => p.imageCount > 0 && p.price !== null && p.handle) ?? candidates.find((p) => p.handle);
  if (pick?.handle) {
    const r = await fetchPage(`https://${domain}/products/${pick.handle}`, timeoutMs);
    productPage = r.page;
    if (r.error) fetchErrors.push(r.error);
  }

  // Policies: Shopify exposes stable /policies/* URLs; otherwise look for links.
  let shippingPolicyFound = false;
  let returnsPolicyFound = false;
  const isShopifyish = feedRes.feed !== null || /cdn\.shopify\.com/i.test(homepageRes.page?.html ?? '');
  if (isShopifyish) {
    const [ship, ret] = await Promise.all([
      fetchText(`https://${domain}/policies/shipping-policy`, timeoutMs),
      fetchText(`https://${domain}/policies/refund-policy`, timeoutMs),
    ]);
    shippingPolicyFound = ship.ok && visibleWordCount(ship.text) > 100;
    returnsPolicyFound = ret.ok && visibleWordCount(ret.text) > 100;
  }
  if (!shippingPolicyFound) {
    shippingPolicyFound = linkPresent(homepageRes.page?.html, /(shipping|delivery)/i);
  }
  if (!returnsPolicyFound) {
    returnsPolicyFound = linkPresent(homepageRes.page?.html, /(return|refund)/i);
  }

  return {
    domain,
    homepage: homepageRes.page,
    robotsTxt,
    llmsTxt,
    sitemapOk,
    feed: feedRes.feed,
    productPage,
    shippingPolicyFound,
    returnsPolicyFound,
    fetchErrors,
  };
}

/** Fetch + score one store. The only function most callers need. */
export async function runScore(domain: string, opts: RunScoreOptions = {}): Promise<ScoreResult> {
  const snapshot = await collectSnapshot(domain, opts);
  return scoreSnapshot(snapshot);
}
