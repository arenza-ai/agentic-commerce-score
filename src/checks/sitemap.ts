/**
 * Product-URL discovery via sitemap.
 *
 * v0.1 could only sample a product page when the store exposed an open feed —
 * so a store with a closed feed had every page-level check marked n/a, and the
 * n/a redistribution let ONE check decide a whole pillar. Discovering product
 * URLs from the sitemap makes those checks runnable for feed-less stores, which
 * is both fairer and far more discriminating.
 */

import { fetchText } from '../fetch.js';

const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
/** Sub-sitemaps worth following when the root is an index. */
const PRODUCT_SITEMAP_HINT = /product/i;
const PRODUCT_URL_RE = /\/products?\//i;

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  LOC_RE.lastIndex = 0;
  while ((m = LOC_RE.exec(xml)) !== null) {
    const loc = m[1]!.trim();
    if (loc) out.push(loc.replace(/&amp;/g, '&'));
  }
  return out;
}

export interface SitemapDiscovery {
  /** Sitemap resolved (root or robots-declared). */
  found: boolean;
  /** Product page URLs discovered (capped). */
  productUrls: string[];
}

/**
 * Resolve the sitemap and pull up to `limit` product URLs.
 *
 * Handles both shapes seen in the wild:
 *   - <sitemapindex> → follow the product-looking sub-sitemap (one hop)
 *   - <urlset> flat list → filter /products/ URLs directly
 */
export async function discoverFromSitemap(
  domain: string,
  declaredSitemaps: string[],
  limit = 3,
  timeoutMs?: number,
): Promise<SitemapDiscovery> {
  const candidates = [...declaredSitemaps, `https://${domain}/sitemap.xml`];
  for (const url of candidates.slice(0, 3)) {
    const res = await fetchText(url, timeoutMs);
    if (!res.ok || !/<(urlset|sitemapindex)[\s>]/i.test(res.text)) continue;

    const locs = extractLocs(res.text);
    // Flat urlset: product URLs are right here.
    const direct = locs.filter((u) => PRODUCT_URL_RE.test(u));
    if (direct.length > 0) {
      return { found: true, productUrls: spread(direct, limit) };
    }

    // Sitemap index: follow the first product-looking sub-sitemap (one hop).
    const sub = locs.find((u) => PRODUCT_SITEMAP_HINT.test(u));
    if (sub) {
      const subRes = await fetchText(sub, timeoutMs);
      if (subRes.ok) {
        const subUrls = extractLocs(subRes.text).filter((u) => PRODUCT_URL_RE.test(u));
        if (subUrls.length > 0) return { found: true, productUrls: spread(subUrls, limit) };
      }
    }
    return { found: true, productUrls: [] };
  }
  return { found: false, productUrls: [] };
}

/**
 * Take `n` URLs spread across the list rather than the first n — the head of a
 * sitemap is often one product family, which would make the sample unrepresentative.
 * Deterministic (fixed stride), so scores stay reproducible.
 */
function spread(urls: string[], n: number): string[] {
  if (urls.length <= n) return urls;
  const stride = Math.floor(urls.length / n);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(urls[i * stride]!);
  return out;
}
