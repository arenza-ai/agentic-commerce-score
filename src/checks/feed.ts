/**
 * Product-feed checks. Where the platform exposes an open catalog endpoint
 * (Shopify's /products.json), that feed is exactly what a shopping agent — or
 * the pipeline feeding one — can parse without private credentials, so its
 * field coverage is the store's floor for agent-readable product data.
 */

import { fetchText } from '../fetch.js';
import type { FeedInfo, PublicProduct } from '../types.js';

/** Literal, matchable descriptors (vs marketing names an agent can't map to a query). */
const LITERAL_DESCRIPTOR = [
  'lightweight', 'waterproof', 'water-resistant', 'wireless', 'cordless', 'rechargeable',
  'stainless', 'insulated', 'breathable', 'adjustable', 'portable', 'noise-cancel',
  'organic', 'cotton', 'leather', 'ceramic', 'quick-dry', 'non-stick', 'reusable',
];
/** Spec/measurement tokens are inherently literal (e.g. "40-hour", "12oz"). */
const SPEC_PATTERN = /\b\d+\s?(oz|ml|l|cm|mm|in|inch|"|kg|g|lb|w|wh|mah|gb|tb|hour|hr|pack|pc|ply)\b/i;
const MARKETING_FLUFF = [
  'experience the', 'unleash', 'redefine', 'game-chang', 'next-level', 'elevate your',
  'feel the', 'pure essence', 'luxury redefined', 'ultimate', 'revolutionary',
];

const DESCRIPTION_MIN_CHARS = 120;

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface RawProduct {
  title?: unknown;
  handle?: unknown;
  body_html?: unknown;
  product_type?: unknown;
  tags?: unknown;
  images?: unknown;
  variants?: unknown;
}

function normalizeProduct(raw: RawProduct): PublicProduct {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const handle = typeof raw.handle === 'string' ? raw.handle : '';
  const descriptionText = typeof raw.body_html === 'string' ? stripHtml(raw.body_html) : '';
  const productType = typeof raw.product_type === 'string' ? raw.product_type.trim() : '';
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string')
    : typeof raw.tags === 'string'
      ? raw.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
  const images = Array.isArray(raw.images) ? raw.images : [];
  const variants = Array.isArray(raw.variants) ? (raw.variants as Array<Record<string, unknown>>) : [];

  let price: number | null = null;
  let available: boolean | null = null;
  let hasCompareAtDiscount = false;
  for (const v of variants) {
    const p = typeof v.price === 'string' || typeof v.price === 'number' ? Number(v.price) : NaN;
    if (Number.isFinite(p) && p > 0 && (price === null || p < price)) price = p;
    if (typeof v.available === 'boolean') available = available === true ? true : v.available;
    const cmp = v.compare_at_price;
    const cmpN = typeof cmp === 'string' || typeof cmp === 'number' ? Number(cmp) : NaN;
    if (Number.isFinite(cmpN) && Number.isFinite(p) && cmpN > p) hasCompareAtDiscount = true;
  }

  return {
    title,
    handle,
    descriptionText,
    productType,
    tags,
    imageCount: images.length,
    price,
    available,
    hasCompareAtDiscount,
  };
}

export function titleIsLiteral(title: string): boolean {
  const t = title.toLowerCase();
  return LITERAL_DESCRIPTOR.some((d) => t.includes(d)) || SPEC_PATTERN.test(title);
}

export function titleHasFluff(title: string): boolean {
  const t = title.toLowerCase();
  return MARKETING_FLUFF.some((d) => t.includes(d));
}

export function buildFeedInfo(url: string, rawProducts: RawProduct[]): FeedInfo | null {
  const products = rawProducts.map(normalizeProduct).filter((p) => p.title || p.handle);
  if (products.length === 0) return null;
  const n = products.length;
  const pct = (k: number) => Math.round((k / n) * 100);
  const availKnown = products.filter((p) => p.available !== null);
  return {
    url,
    productCount: n,
    coverage: {
      title: pct(products.filter((p) => p.title.length > 0).length),
      image: pct(products.filter((p) => p.imageCount > 0).length),
      price: pct(products.filter((p) => p.price !== null).length),
      description: pct(products.filter((p) => p.descriptionText.length > 0).length),
      productType: pct(products.filter((p) => p.productType.length > 0).length),
    },
    titleLiteralPct: pct(products.filter((p) => titleIsLiteral(p.title)).length),
    titleFluffPct: pct(products.filter((p) => titleHasFluff(p.title)).length),
    descriptionDepthPct: pct(products.filter((p) => p.descriptionText.length >= DESCRIPTION_MIN_CHARS).length),
    availabilityPct: pct(availKnown.filter((p) => p.available === true || p.available === false).length),
    sampledProducts: products,
  };
}

/** Fetch + parse the open product feed. Returns null when absent/unparseable. */
export async function fetchFeed(domain: string, timeoutMs?: number): Promise<{ feed: FeedInfo | null; error?: string }> {
  const url = `https://${domain}/products.json?limit=100`;
  const res = await fetchText(url, timeoutMs);
  if (!res.ok) return { feed: null, error: res.error ? `products.json: ${res.error}` : undefined };
  try {
    const data = JSON.parse(res.text) as { products?: RawProduct[] };
    if (!Array.isArray(data.products)) return { feed: null };
    return { feed: buildFeedInfo(url, data.products) };
  } catch {
    // 200 but HTML (password page, bot wall) — not a feed.
    return { feed: null };
  }
}
