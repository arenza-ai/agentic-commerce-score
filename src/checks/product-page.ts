/**
 * Product-page evidence: what an agent learns by fetching product pages
 * directly (the path it takes when there is no open feed, and the path it uses
 * to verify price/availability even when there is one).
 *
 * v0.2 samples up to 3 product pages and aggregates, so a single unusual
 * template can no longer swing a store's score.
 */

import { analyzePage, extractJsonLd, type PageFacts } from './page.js';
import type { FetchedPage } from '../types.js';

export interface ProductPageEvidence {
  /** Pages actually fetched + parsed. */
  sampled: number;
  urls: string[];
  /** Pages carrying Product JSON-LD. */
  withProductSchema: number;
  /** Pages whose Offer carries price + priceCurrency + availability. */
  withCompleteOffer: number;
  /** Pages with AggregateRating. */
  withRating: number;
  /** Pages exposing brand AND a product identifier (sku / gtin* / mpn). */
  withIdentifiers: number;
  /** Pages where brand is present (subset signal for the fix hint). */
  withBrand: number;
  /** Mean share of content images carrying non-empty alt text, 0-100. */
  imageAltPct: number;
  /** Pages whose JSON-LD description reaches the quotable bar (120+ chars). */
  withDeepDescription: number;
  /** Required-field presence (name/image/price/description) from JSON-LD, 0-100. */
  requiredFieldPct: number;
}

const GTIN_KEYS = ['gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14', 'sku', 'mpn', 'productid'];

function findProductNodes(node: unknown, out: Record<string, unknown>[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const x of node) findProductNodes(x, out);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  const isProduct =
    (typeof t === 'string' && t.toLowerCase() === 'product') ||
    (Array.isArray(t) && t.some((x) => typeof x === 'string' && x.toLowerCase() === 'product'));
  if (isProduct) out.push(obj);
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') findProductNodes(v, out);
  }
}

function hasIdentifier(p: Record<string, unknown>): boolean {
  for (const k of Object.keys(p)) {
    if (GTIN_KEYS.includes(k.toLowerCase())) {
      const v = p[k];
      if (typeof v === 'string' ? v.trim().length > 0 : v != null) return true;
    }
  }
  return false;
}

function hasBrand(p: Record<string, unknown>): boolean {
  const b = p.brand;
  if (!b) return false;
  if (typeof b === 'string') return b.trim().length > 0;
  if (typeof b === 'object') {
    const name = (b as Record<string, unknown>).name;
    return typeof name === 'string' && name.trim().length > 0;
  }
  return false;
}

/** Share of content <img> carrying non-empty alt. Tracking pixels excluded. */
export function imageAltCoverage(html: string): number | null {
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const content = imgs.filter((tag) => {
    if (/\b(width|height)\s*=\s*["']?1["']?/i.test(tag)) return false; // 1px pixel
    return /\bsrc\s*=/i.test(tag);
  });
  if (content.length === 0) return null;
  const withAlt = content.filter((tag) => {
    const m = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
    return m ? m[1]!.trim().length > 0 : false;
  }).length;
  return Math.round((100 * withAlt) / content.length);
}

function jsonLdDescription(p: Record<string, unknown>): string {
  const d = p.description;
  return typeof d === 'string' ? d.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function jsonLdRequiredScore(p: Record<string, unknown>, facts: PageFacts): number {
  let have = 0;
  if (typeof p.name === 'string' && p.name.trim()) have += 1;
  if (p.image) have += 1;
  if (facts.productSchema.offerHasPrice) have += 1;
  if (jsonLdDescription(p).length > 0) have += 1;
  return (100 * have) / 4;
}

export function buildProductEvidence(pages: FetchedPage[]): ProductPageEvidence {
  const ev: ProductPageEvidence = {
    sampled: pages.length,
    urls: pages.map((p) => p.finalUrl),
    withProductSchema: 0,
    withCompleteOffer: 0,
    withRating: 0,
    withIdentifiers: 0,
    withBrand: 0,
    imageAltPct: 0,
    withDeepDescription: 0,
    requiredFieldPct: 0,
  };
  if (pages.length === 0) return ev;

  const altSamples: number[] = [];
  const requiredSamples: number[] = [];

  for (const page of pages) {
    const facts = analyzePage(page.html, page.finalUrl);
    const nodes: Record<string, unknown>[] = [];
    for (const block of extractJsonLd(page.html)) findProductNodes(block, nodes);
    const primary = nodes[0];

    if (facts.productSchema.hasProduct) ev.withProductSchema += 1;
    if (
      facts.productSchema.hasProduct &&
      facts.productSchema.offerHasPrice &&
      facts.productSchema.offerHasCurrency &&
      facts.productSchema.offerHasAvailability
    ) {
      ev.withCompleteOffer += 1;
    }
    if (facts.productSchema.hasAggregateRating) ev.withRating += 1;

    if (primary) {
      const brand = hasBrand(primary);
      if (brand) ev.withBrand += 1;
      if (brand && hasIdentifier(primary)) ev.withIdentifiers += 1;
      if (jsonLdDescription(primary).length >= 120) ev.withDeepDescription += 1;
      requiredSamples.push(jsonLdRequiredScore(primary, facts));
    } else {
      requiredSamples.push(0);
    }

    const alt = imageAltCoverage(page.html);
    if (alt !== null) altSamples.push(alt);
  }

  ev.imageAltPct = altSamples.length
    ? Math.round(altSamples.reduce((s, x) => s + x, 0) / altSamples.length)
    : 0;
  ev.requiredFieldPct = requiredSamples.length
    ? Math.round(requiredSamples.reduce((s, x) => s + x, 0) / requiredSamples.length)
    : 0;
  return ev;
}
