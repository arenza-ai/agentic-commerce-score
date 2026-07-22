/**
 * Single-page HTML analysis (homepage + one representative product page).
 * Regex-level by design: no DOM parser, no dependency — coarse but
 * deterministic, the same trade the answer engines' fetchers make on a first
 * pass. Product JSON-LD (Product + Offer + AggregateRating) is the machine
 * layer a shopping agent trusts before it quotes price or rating.
 */

export interface PageFacts {
  https: boolean;
  title: string;
  titleOk: boolean;
  metaDescriptionLength: number;
  canonical: 'self' | 'elsewhere' | 'missing';
  hasOgTags: boolean;
  robotsNoindex: boolean;
  visibleWords: number;
  spaShellRisk: boolean;
  jsonLdBlockCount: number;
  jsonLdTypes: string[];
  productSchema: {
    hasProduct: boolean;
    hasOffer: boolean;
    offerHasPrice: boolean;
    offerHasCurrency: boolean;
    offerHasAvailability: boolean;
    hasAggregateRating: boolean;
  };
}

export function visibleWordCount(html: string): number {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
  const tokens = stripped.match(/[A-Za-z0-9À-ɏ一-鿿]+/g);
  return tokens ? tokens.length : 0;
}

function collectTypes(node: unknown, out: Set<string>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  if (typeof t === 'string') out.add(t);
  if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') out.add(x);
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'hasOfferCatalog']) {
    if (obj[key]) collectTypes(obj[key], out);
  }
}

function findNodesOfType(node: unknown, type: string, out: unknown[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) findNodesOfType(item, type, out);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  const matches = (typeof t === 'string' && t.toLowerCase() === type.toLowerCase()) ||
    (Array.isArray(t) && t.some((x) => typeof x === 'string' && x.toLowerCase() === type.toLowerCase()));
  if (matches) out.push(obj);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') findNodesOfType(value, type, out);
  }
}

export function extractJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]!.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Tolerate common breakage: trailing commas / HTML comments inside the block.
      try {
        blocks.push(JSON.parse(raw.replace(/<!--[\s\S]*?-->/g, '').replace(/,\s*([}\]])/g, '$1')));
      } catch {
        /* unparseable block — skip */
      }
    }
  }
  return blocks;
}

export function analyzePage(html: string, finalUrl: string): PageFacts {
  let https = false;
  try {
    https = new URL(finalUrl).protocol === 'https:';
  } catch {
    https = false;
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
  const titleOk = title.length >= 10 && title.length <= 70;

  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]*>/i);
  let metaDescriptionLength = 0;
  if (descMatch) {
    const c = descMatch[0].match(/content=["']([^"']*)["']/i);
    metaDescriptionLength = c?.[1] ? c[1].trim().length : 0;
  }

  const canonMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  let canonical: PageFacts['canonical'] = 'missing';
  if (canonMatch) {
    const href = canonMatch[0].match(/href=["']([^"']*)["']/i)?.[1] ?? '';
    if (!href) {
      canonical = 'self';
    } else {
      try {
        canonical = new URL(href, finalUrl).href.replace(/\/$/, '') === finalUrl.replace(/\/$/, '')
          ? 'self'
          : 'elsewhere';
      } catch {
        canonical = 'missing';
      }
    }
  }

  const hasOgTags =
    /<meta[^>]+property=["']og:title["']/i.test(html) && /<meta[^>]+property=["']og:description["']/i.test(html);

  const robotsMeta = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i);
  const robotsNoindex = robotsMeta ? /noindex/i.test(robotsMeta[0]) : false;

  const visibleWords = visibleWordCount(html);
  const frameworkShell = /id=["'](root|app|__next)["']/i.test(html);
  const spaShellRisk = visibleWords < 100 && frameworkShell;

  const blocks = extractJsonLd(html);
  const types = new Set<string>();
  for (const b of blocks) collectTypes(b, types);

  const productNodes: unknown[] = [];
  for (const b of blocks) findNodesOfType(b, 'Product', productNodes);
  let hasOffer = false;
  let offerHasPrice = false;
  let offerHasCurrency = false;
  let offerHasAvailability = false;
  let hasAggregateRating = false;
  for (const p of productNodes) {
    const obj = p as Record<string, unknown>;
    const offers: unknown[] = [];
    findNodesOfType(obj.offers, 'Offer', offers);
    findNodesOfType(obj.offers, 'AggregateOffer', offers);
    if (obj.offers) hasOffer = hasOffer || offers.length > 0 || typeof obj.offers === 'object';
    for (const o of offers.length > 0 ? offers : [obj.offers]) {
      if (!o || typeof o !== 'object') continue;
      const off = o as Record<string, unknown>;
      if (off.price != null || off.lowPrice != null) offerHasPrice = true;
      if (typeof off.priceCurrency === 'string' && off.priceCurrency) offerHasCurrency = true;
      if (off.availability != null) offerHasAvailability = true;
    }
    if (obj.aggregateRating && typeof obj.aggregateRating === 'object') hasAggregateRating = true;
  }

  return {
    https,
    title,
    titleOk,
    metaDescriptionLength,
    canonical,
    hasOgTags,
    robotsNoindex,
    visibleWords,
    spaShellRisk,
    jsonLdBlockCount: blocks.length,
    jsonLdTypes: [...types].sort(),
    productSchema: {
      hasProduct: productNodes.length > 0,
      hasOffer,
      offerHasPrice,
      offerHasCurrency,
      offerHasAvailability,
      hasAggregateRating,
    },
  };
}
