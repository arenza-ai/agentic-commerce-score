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
import { discoverFromSitemap } from './checks/sitemap.js';
import { visibleWordCount } from './checks/page.js';
import { scoreSnapshot } from './scoring.js';
import type { FetchedPage, PolicyEvidence, ScoreResult, StoreSnapshot } from './types.js';

export * from './types.js';
export { scoreSnapshot, RUBRIC_VERSION } from './scoring.js';
export { analyzePage, extractJsonLd } from './checks/page.js';
export { analyzeRobots, AI_AGENTS } from './checks/site.js';
export { detectPlatform } from './checks/platform.js';
export { buildFeedInfo } from './checks/feed.js';
export { buildProductEvidence, imageAltCoverage } from './checks/product-page.js';
export { discoverFromSitemap } from './checks/sitemap.js';
export { normalizeDomain } from './fetch.js';

export interface RunScoreOptions {
  timeoutMs?: number;
  /** Product pages to sample (default 3). Higher = slower, more representative. */
  productSamples?: number;
}

/** An explicit return window ("within 30 days", "60-day returns") is what an agent can act on. */
const RETURN_WINDOW_RE = /\b(\d{1,3})\s*[- ]?\s*(calendar\s+|business\s+|working\s+)?(day|days|week|weeks|month|months)\b/i;

async function fetchPage(url: string, timeoutMs: number): Promise<{ page: FetchedPage | null; error?: string }> {
  const res = await fetchText(url, timeoutMs);
  if (!res.ok || !res.text) return { page: null, error: res.error ? `${url}: ${res.error}` : `${url}: HTTP ${res.status}` };
  return { page: { url, finalUrl: res.finalUrl, status: res.status, html: res.text } };
}

/** Detect a policy link in homepage HTML (fallback when no canonical path exists). */
function linkPresent(html: string | undefined, re: RegExp): boolean {
  if (!html) return false;
  const hrefs = html.match(/href=["'][^"']+["']/gi) ?? [];
  return hrefs.some((h) => re.test(h));
}

async function fetchPolicy(
  url: string,
  timeoutMs: number,
  wantWindow: boolean,
): Promise<PolicyEvidence | null> {
  const res = await fetchText(url, timeoutMs);
  if (!res.ok) return null;
  const text = res.text;
  if (visibleWordCount(text) <= 100) return null;
  const evidence: PolicyEvidence = { found: true, verified: true };
  if (wantWindow) {
    const body = text.replace(/<[^>]*>/g, ' ');
    evidence.hasWindow = RETURN_WINDOW_RE.test(body);
  }
  return evidence;
}

export async function collectSnapshot(inputDomain: string, opts: RunScoreOptions = {}): Promise<StoreSnapshot> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sampleCount = Math.max(1, Math.min(5, opts.productSamples ?? 3));
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

  // ── product pages ────────────────────────────────────────────────────────
  // Prefer feed handles; otherwise discover real product URLs from the sitemap
  // so page-level checks still run for feed-less stores (v0.2 — v0.1 marked
  // them n/a, which let one check decide a whole pillar).
  let productUrls: string[] = [];
  let productSource: StoreSnapshot['productSource'] = 'none';
  const feedProducts = feedRes.feed?.sampledProducts ?? [];
  if (feedProducts.length > 0) {
    const usable = feedProducts.filter((p) => p.handle);
    const stride = Math.max(1, Math.floor(usable.length / sampleCount));
    for (let i = 0; i < usable.length && productUrls.length < sampleCount; i += stride) {
      productUrls.push(`https://${domain}/products/${usable[i]!.handle}`);
    }
    if (productUrls.length > 0) productSource = 'feed';
  }
  if (productUrls.length === 0) {
    const discovered = await discoverFromSitemap(domain, robots.sitemapUrls, sampleCount, timeoutMs);
    if (discovered.productUrls.length > 0) {
      productUrls = discovered.productUrls;
      productSource = 'sitemap';
    }
  }

  const productPages: FetchedPage[] = [];
  for (const url of productUrls) {
    const r = await fetchPage(url, timeoutMs);
    if (r.page) productPages.push(r.page);
    else if (r.error) fetchErrors.push(r.error);
  }
  if (productPages.length === 0) productSource = 'none';

  // ── policies ─────────────────────────────────────────────────────────────
  let shipping: PolicyEvidence = { found: false, verified: false };
  let returns: PolicyEvidence = { found: false, verified: false, hasWindow: false };
  const isShopifyish = feedRes.feed !== null || /cdn\.shopify\.com/i.test(homepageRes.page?.html ?? '');
  if (isShopifyish) {
    const [ship, ret] = await Promise.all([
      fetchPolicy(`https://${domain}/policies/shipping-policy`, timeoutMs, false),
      fetchPolicy(`https://${domain}/policies/refund-policy`, timeoutMs, true),
    ]);
    if (ship) shipping = ship;
    if (ret) returns = ret;
  }
  // Link-only fallback: counted as found but NOT verified (scored as warn).
  if (!shipping.found && linkPresent(homepageRes.page?.html, /(shipping|delivery)/i)) {
    shipping = { found: true, verified: false };
  }
  if (!returns.found && linkPresent(homepageRes.page?.html, /(return|refund)/i)) {
    returns = { found: true, verified: false, hasWindow: false };
  }

  return {
    domain,
    homepage: homepageRes.page,
    robotsTxt,
    llmsTxt,
    sitemapOk,
    feed: feedRes.feed,
    productPages,
    productSource,
    shipping,
    returns,
    fetchErrors,
  };
}

/** Fetch + score one store. The only function most callers need. */
export async function runScore(domain: string, opts: RunScoreOptions = {}): Promise<ScoreResult> {
  const snapshot = await collectSnapshot(domain, opts);
  return scoreSnapshot(snapshot);
}
