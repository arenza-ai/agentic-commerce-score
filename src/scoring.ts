/**
 * Pure scoring layer: StoreSnapshot in → ScoreResult out. Deterministic —
 * same snapshot always yields the same score (unit-testable with zero network).
 * Weights + thresholds are the normative rubric; SCORE.md documents them and
 * MUST be updated in the same commit as any change here (rubricVersion bump).
 *
 * v0.2 (see SCORE.md changelog) fixes three structural defects found by
 * auditing the v0.1 dataset:
 *   1. Page-level checks used to go n/a whenever a store had no open feed, so
 *      ONE check decided a 40-point pillar. Product pages are now discovered
 *      from the sitemap too, and pillars report `evidenceCoverage`.
 *   2. Over half the v0.1 scale was a near-constant on Shopify storefronts
 *      (checkout_rail alone passed 100% of the time, contributing zero
 *      information for 10 points). Constants are down-weighted and replaced
 *      with checks stores actually differ on.
 *   3. `title_quality` warned 73% of stores and failed none — an unfalsifiable
 *      check masquerading as a measurement. Removed.
 */

import type { Check, Grade, PillarResult, ScoreResult, StoreSnapshot } from './types.js';
import { analyzeRobots } from './checks/site.js';
import { analyzePage, type PageFacts } from './checks/page.js';
import { detectPlatform } from './checks/platform.js';
import { buildProductEvidence } from './checks/product-page.js';

export const RUBRIC_VERSION = '0.2';

const FIX_HINTS: Record<string, string> = {
  robots_ai_access:
    'Unblock AI shopping crawlers in robots.txt (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended…) — blocked agents cannot see, cite, or sell your products.',
  llms_txt: 'Add /llms.txt — a short markdown map of your key pages for AI systems (llmstxt.org).',
  sitemap: 'Publish /sitemap.xml (and declare it in robots.txt) so agents can enumerate your catalog.',
  homepage_renders:
    'Serve real HTML without JavaScript: agent fetchers read the raw response. Pre-render or SSR your storefront.',
  catalog_machine_readable:
    'Give agents a machine-readable catalog: keep an open product feed (on Shopify, /products.json) or at minimum ship complete Product JSON-LD on crawlable product pages.',
  catalog_required_fields:
    'Fill the four required catalog fields on every product: title, image, price, description — a product missing one drops out of agent answers.',
  description_depth: 'Bring product descriptions to 120+ chars of concrete, quotable substance.',
  product_schema:
    'Add complete Product JSON-LD on product pages: an Offer with price + priceCurrency + availability.',
  product_identifiers:
    'Publish brand plus a product identifier (sku / gtin / mpn) in Product JSON-LD — agents match, dedupe and price-compare products by identifier; without one your listing is an orphan.',
  rating_schema:
    'Expose reviews as AggregateRating in Product JSON-LD (ratingValue + reviewCount) — agents quote ratings when ranking options, and skip products that have none they can read.',
  image_alt:
    'Write descriptive alt text on product images — it is the only thing a text-mode agent can read about your photography.',
  checkout_rail:
    'Move onto (or integrate) an agentic-checkout rail: Shopify stores ride ChatGPT checkout + Google catalog rails; custom stacks need a direct ACP integration.',
  machine_price_availability:
    'Expose machine-readable price AND availability per product (feed fields or Offer schema) — agents will not guess stock.',
  variant_availability:
    'Expose stock per variant (size/colour), not just per product — an agent that cannot tell which variant is in stock will not complete the order.',
  policies:
    'Publish shipping and returns policies as real pages with concrete terms (state the return window in days) — agentic checkout surfaces merchant policies before completing a purchase.',
};

interface CheckSpec {
  id: string;
  label: string;
  pillar: Check['pillar'];
  weight: number;
  status: Check['status'];
  detail: string;
}

function toCheck(spec: CheckSpec): Check {
  const earned = spec.status === 'pass' ? spec.weight : spec.status === 'warn' ? spec.weight / 2 : 0;
  return { ...spec, earned };
}

function gradeFor(score: number): Grade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/** pass ≥ hi · warn ≥ lo · else fail. */
function band(value: number, hi: number, lo: number): Check['status'] {
  return value >= hi ? 'pass' : value >= lo ? 'warn' : 'fail';
}

export function scoreSnapshot(snapshot: StoreSnapshot): ScoreResult {
  const robots = analyzeRobots(snapshot.robotsTxt);
  const homeFacts: PageFacts | null = snapshot.homepage
    ? analyzePage(snapshot.homepage.html, snapshot.homepage.finalUrl)
    : null;
  const evidence = buildProductEvidence(snapshot.productPages);
  const platform = detectPlatform(snapshot.homepage?.html ?? null, snapshot.feed !== null);
  const feed = snapshot.feed;
  const sampled = evidence.sampled;
  const pagePct = (n: number) => (sampled > 0 ? Math.round((100 * n) / sampled) : 0);

  const checks: Check[] = [];

  // ---------------- DISCOVER (30) ----------------
  {
    let status: Check['status'];
    let detail: string;
    if (!robots.found) {
      status = 'pass';
      detail = 'No robots.txt — nothing blocks AI crawlers (open by default).';
    } else if (robots.wildcardRootBlock || robots.blockedAgents.length > 3) {
      status = 'fail';
      detail = robots.wildcardRootBlock
        ? 'robots.txt blocks the site root for all agents ("Disallow: /").'
        : `robots.txt root-blocks ${robots.blockedAgents.length} AI agents: ${robots.blockedAgents.join(', ')}.`;
    } else if (robots.blockedAgents.length > 0) {
      status = 'warn';
      detail = `robots.txt root-blocks: ${robots.blockedAgents.join(', ')}.`;
    } else {
      status = 'pass';
      detail = 'No AI shopping crawler is root-blocked in robots.txt.';
    }
    checks.push(toCheck({ id: 'robots_ai_access', label: 'AI crawlers allowed (robots.txt)', pillar: 'discover', weight: 12, status, detail }));
  }
  {
    let status: Check['status'];
    let detail: string;
    if (!homeFacts) {
      status = 'fail';
      detail = `Homepage fetch failed${snapshot.fetchErrors.length ? ` (${snapshot.fetchErrors[0]})` : ''}.`;
    } else if (homeFacts.robotsNoindex) {
      status = 'fail';
      detail = 'Homepage carries a noindex robots meta — AI systems are told to skip it.';
    } else if (homeFacts.spaShellRisk) {
      status = 'fail';
      detail = `Homepage is an empty JS shell (~${homeFacts.visibleWords} visible words) — invisible to no-JS agent fetchers.`;
    } else if (!homeFacts.https) {
      status = 'fail';
      detail = 'Homepage not served over HTTPS.';
    } else if (homeFacts.visibleWords < 300) {
      status = 'warn';
      detail = `Homepage exposes only ~${homeFacts.visibleWords} visible words without JavaScript.`;
    } else {
      status = 'pass';
      detail = `Homepage serves ~${homeFacts.visibleWords} visible words of real HTML (no JS needed).`;
    }
    checks.push(toCheck({ id: 'homepage_renders', label: 'Homepage readable without JavaScript', pillar: 'discover', weight: 10, status, detail }));
  }
  checks.push(
    toCheck({
      id: 'sitemap',
      label: 'Sitemap discoverable',
      pillar: 'discover',
      weight: 5,
      status: snapshot.sitemapOk ? 'pass' : 'fail',
      detail: snapshot.sitemapOk ? 'Sitemap found.' : 'No sitemap found at /sitemap.xml or declared in robots.txt.',
    }),
  );
  checks.push(
    toCheck({
      id: 'llms_txt',
      label: 'llms.txt present',
      pillar: 'discover',
      weight: 3,
      status: snapshot.llmsTxt ? 'pass' : 'warn',
      detail: snapshot.llmsTxt ? '/llms.txt found.' : 'No /llms.txt (emerging convention — counted as a soft gap, not a blocker).',
    }),
  );

  // ---------------- EVALUATE (45) ----------------
  {
    let status: Check['status'];
    let detail: string;
    const schemaPct = pagePct(evidence.withCompleteOffer);
    if (feed) {
      status = 'pass';
      detail = `Open product feed at ${feed.url} (${feed.productCount} products sampled).`;
    } else if (sampled > 0 && schemaPct >= 50) {
      status = 'warn';
      detail = `No open product feed — agents must crawl page-by-page; ${evidence.withCompleteOffer}/${sampled} sampled product pages carry complete Product JSON-LD.`;
    } else if (sampled > 0) {
      status = 'fail';
      detail = `No open product feed, and only ${evidence.withCompleteOffer}/${sampled} sampled product pages carry complete Product JSON-LD — agents have no reliable catalog surface.`;
    } else {
      status = 'fail';
      detail = 'No open product feed and no product pages discoverable via sitemap — no machine-readable catalog surface found.';
    }
    checks.push(toCheck({ id: 'catalog_machine_readable', label: 'Machine-readable product catalog', pillar: 'evaluate', weight: 5, status, detail }));
  }
  {
    let spec: CheckSpec;
    if (feed) {
      const c = feed.coverage;
      const avg = Math.round((c.title + c.image + c.price + c.description) / 4);
      spec = {
        id: 'catalog_required_fields',
        label: 'Required fields (title/image/price/description)',
        pillar: 'evaluate',
        weight: 12,
        status: band(avg, 90, 60),
        detail: `Coverage over ${feed.productCount} feed products: title ${c.title}% · image ${c.image}% · price ${c.price}% · description ${c.description}% (avg ${avg}%).`,
      };
    } else if (sampled > 0) {
      spec = {
        id: 'catalog_required_fields',
        label: 'Required fields (title/image/price/description)',
        pillar: 'evaluate',
        weight: 12,
        status: band(evidence.requiredFieldPct, 90, 60),
        detail: `No feed; from ${sampled} sampled product page(s), Product JSON-LD carries ${evidence.requiredFieldPct}% of the four required fields on average.`,
      };
    } else {
      spec = { id: 'catalog_required_fields', label: 'Required fields (title/image/price/description)', pillar: 'evaluate', weight: 12, status: 'na', detail: 'No feed and no product page could be sampled.' };
    }
    checks.push(toCheck(spec));
  }
  {
    const pct = pagePct(evidence.withCompleteOffer);
    const spec: CheckSpec = sampled === 0
      ? { id: 'product_schema', label: 'Product JSON-LD (Offer: price/currency/availability)', pillar: 'evaluate', weight: 10, status: 'na', detail: 'No product page could be sampled.' }
      : {
          id: 'product_schema',
          label: 'Product JSON-LD (Offer: price/currency/availability)',
          pillar: 'evaluate',
          weight: 10,
          status: band(pct, 100, 50),
          detail: `${evidence.withCompleteOffer}/${sampled} sampled product page(s) carry Product JSON-LD with a complete Offer (price + priceCurrency + availability); ${evidence.withProductSchema}/${sampled} carry any Product schema.`,
        };
    checks.push(toCheck(spec));
  }
  {
    const pct = pagePct(evidence.withIdentifiers);
    const spec: CheckSpec = sampled === 0
      ? { id: 'product_identifiers', label: 'Brand + product identifier (sku/gtin/mpn)', pillar: 'evaluate', weight: 6, status: 'na', detail: 'No product page could be sampled.' }
      : {
          id: 'product_identifiers',
          label: 'Brand + product identifier (sku/gtin/mpn)',
          pillar: 'evaluate',
          weight: 6,
          status: band(pct, 100, 50),
          detail: `${evidence.withIdentifiers}/${sampled} sampled product page(s) expose both brand and an identifier (sku/gtin/mpn); brand alone on ${evidence.withBrand}/${sampled}.`,
        };
    checks.push(toCheck(spec));
  }
  {
    const pct = pagePct(evidence.withRating);
    const spec: CheckSpec = sampled === 0
      ? { id: 'rating_schema', label: 'AggregateRating in Product JSON-LD', pillar: 'evaluate', weight: 5, status: 'na', detail: 'No product page could be sampled.' }
      : {
          id: 'rating_schema',
          label: 'AggregateRating in Product JSON-LD',
          pillar: 'evaluate',
          weight: 5,
          status: band(pct, 100, 50),
          detail: `${evidence.withRating}/${sampled} sampled product page(s) expose machine-readable review ratings.`,
        };
    checks.push(toCheck(spec));
  }
  {
    const spec: CheckSpec = sampled === 0
      ? { id: 'image_alt', label: 'Product image alt text', pillar: 'evaluate', weight: 4, status: 'na', detail: 'No product page could be sampled.' }
      : {
          id: 'image_alt',
          label: 'Product image alt text',
          pillar: 'evaluate',
          weight: 4,
          status: band(evidence.imageAltPct, 80, 40),
          detail: `${evidence.imageAltPct}% of content images on sampled product page(s) carry non-empty alt text.`,
        };
    checks.push(toCheck(spec));
  }
  {
    let spec: CheckSpec;
    if (feed) {
      spec = {
        id: 'description_depth',
        label: 'Description depth (≥120 chars)',
        pillar: 'evaluate',
        weight: 3,
        status: band(feed.descriptionDepthPct, 70, 40),
        detail: `${feed.descriptionDepthPct}% of feed products have a description agents can quote (≥120 chars).`,
      };
    } else if (sampled > 0) {
      const pct = pagePct(evidence.withDeepDescription);
      spec = {
        id: 'description_depth',
        label: 'Description depth (≥120 chars)',
        pillar: 'evaluate',
        weight: 3,
        status: band(pct, 70, 40),
        detail: `${evidence.withDeepDescription}/${sampled} sampled product page(s) expose a quotable description (≥120 chars) in Product JSON-LD.`,
      };
    } else {
      spec = { id: 'description_depth', label: 'Description depth (≥120 chars)', pillar: 'evaluate', weight: 3, status: 'na', detail: 'No feed and no product page could be sampled.' };
    }
    checks.push(toCheck(spec));
  }

  // ---------------- TRANSACT (25) ----------------
  {
    const status: Check['status'] =
      platform.agenticCheckoutRail === 'native' ? 'pass' : platform.agenticCheckoutRail === 'partial' ? 'warn' : 'fail';
    checks.push(
      toCheck({
        id: 'checkout_rail',
        label: 'Agentic-checkout rail (platform prerequisite)',
        pillar: 'transact',
        weight: 5,
        status,
        detail: `Platform: ${platform.name}. ${platform.evidence}`,
      }),
    );
  }
  {
    let spec: CheckSpec;
    if (feed) {
      const priceOk = feed.coverage.price;
      const availOk = feed.availabilityPct;
      const worst = Math.min(priceOk, availOk);
      spec = {
        id: 'machine_price_availability',
        label: 'Machine-readable price + availability',
        pillar: 'transact',
        weight: 6,
        status: band(worst, 90, 60),
        detail: `Feed exposes price on ${priceOk}% and availability on ${availOk}% of products.`,
      };
    } else if (sampled > 0) {
      const pct = pagePct(evidence.withCompleteOffer);
      spec = {
        id: 'machine_price_availability',
        label: 'Machine-readable price + availability',
        pillar: 'transact',
        weight: 6,
        status: band(pct, 100, 50),
        detail: `No feed; ${evidence.withCompleteOffer}/${sampled} sampled product page(s) expose price + availability via Offer schema.`,
      };
    } else {
      spec = { id: 'machine_price_availability', label: 'Machine-readable price + availability', pillar: 'transact', weight: 6, status: 'na', detail: 'No feed and no product page could be sampled.' };
    }
    checks.push(toCheck(spec));
  }
  {
    let spec: CheckSpec;
    if (feed) {
      spec = {
        id: 'variant_availability',
        label: 'Per-variant stock readable',
        pillar: 'transact',
        weight: 5,
        status: band(feed.variantAvailabilityPct, 90, 60),
        detail: `${feed.variantAvailabilityPct}% of products expose an availability flag on every variant (size/colour level stock).`,
      };
    } else if (sampled > 0) {
      const pct = pagePct(evidence.withCompleteOffer);
      spec = {
        id: 'variant_availability',
        label: 'Per-variant stock readable',
        pillar: 'transact',
        weight: 5,
        status: pct >= 100 ? 'warn' : 'fail',
        detail:
          pct >= 100
            ? 'No feed: product-level availability is readable from Offer schema, but per-variant stock is not exposed.'
            : 'No feed and no per-variant availability exposed — an agent cannot tell which size/colour it can actually order.',
      };
    } else {
      spec = { id: 'variant_availability', label: 'Per-variant stock readable', pillar: 'transact', weight: 5, status: 'na', detail: 'No feed and no product page could be sampled.' };
    }
    checks.push(toCheck(spec));
  }
  {
    const s = snapshot.shipping;
    const r = snapshot.returns;
    let status: Check['status'];
    let detail: string;
    if (s.found && r.found) {
      const bothVerified = s.verified && r.verified;
      if (bothVerified && r.hasWindow) {
        status = 'pass';
        detail = 'Shipping and returns policies fetched, with an explicit return window an agent can read.';
      } else if (bothVerified) {
        status = 'warn';
        detail = 'Shipping and returns policy pages found, but the returns page states no explicit window (e.g. "within 30 days").';
      } else {
        status = 'warn';
        detail = 'Policies linked from the storefront but not verified as substantive pages at stable URLs.';
      }
    } else if (s.found || r.found) {
      status = 'warn';
      detail = `Only one policy found — shipping ${s.found ? 'found' : 'missing'} · returns ${r.found ? 'found' : 'missing'}.`;
    } else {
      status = 'fail';
      detail = 'Neither a shipping nor a returns policy could be found — agentic checkout surfaces these before completing a purchase.';
    }
    checks.push(toCheck({ id: 'policies', label: 'Shipping + returns policies (with terms)', pillar: 'transact', weight: 9, status, detail }));
  }

  // ---------------- aggregate ----------------
  const pillarDefs: { key: PillarResult['key']; label: string; weight: number }[] = [
    { key: 'discover', label: 'Discover — can agents fetch + read the store?', weight: 30 },
    { key: 'evaluate', label: 'Evaluate — can agents parse + trust the products?', weight: 45 },
    { key: 'transact', label: 'Transact — can an agent complete a purchase?', weight: 25 },
  ];
  const pillars: PillarResult[] = pillarDefs.map((def) => {
    const pchecks = checks.filter((c) => c.pillar === def.key);
    const scorable = pchecks.filter((c) => c.status !== 'na');
    const possible = scorable.reduce((s, c) => s + c.weight, 0);
    const totalWeight = pchecks.reduce((s, c) => s + c.weight, 0);
    const earned = scorable.reduce((s, c) => s + c.earned, 0);
    const evidenceCoverage = totalWeight > 0 ? Math.round((100 * possible) / totalWeight) : 0;
    return {
      key: def.key,
      label: def.label,
      weight: def.weight,
      evidenceCoverage,
      insufficientEvidence: evidenceCoverage < 50,
      score: possible > 0 ? Math.round((100 * earned) / possible) : 0,
      checks: pchecks,
    };
  });
  const score = Math.round(pillars.reduce((s, p) => s + (p.score * p.weight) / 100, 0));

  const requiredCheck = checks.find((c) => c.id === 'catalog_required_fields')!;
  const catalogCheck = checks.find((c) => c.id === 'catalog_machine_readable')!;
  const robotsCheck = checks.find((c) => c.id === 'robots_ai_access')!;
  const priceCheck = checks.find((c) => c.id === 'machine_price_availability')!;
  const policiesCheck = checks.find((c) => c.id === 'policies')!;
  const requiredPct = feed
    ? (feed.coverage.title + feed.coverage.image + feed.coverage.price + feed.coverage.description) / 4
    : evidence.requiredFieldPct;

  const agentBuyable =
    robotsCheck.status !== 'fail' &&
    catalogCheck.status !== 'fail' &&
    requiredCheck.status !== 'na' &&
    requiredPct >= 80 &&
    platform.agenticCheckoutRail !== 'none-detected' &&
    priceCheck.status !== 'fail' &&
    priceCheck.status !== 'na' &&
    policiesCheck.status === 'pass';

  const fixes = checks
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === 'fail' ? -1 : 1))
    .map((c) => FIX_HINTS[c.id])
    .filter((f): f is string => Boolean(f))
    .slice(0, 6);

  return {
    rubricVersion: RUBRIC_VERSION,
    domain: snapshot.domain,
    scannedAt: new Date().toISOString(),
    score,
    grade: gradeFor(score),
    agentBuyable,
    pillars,
    platform,
    feed,
    productSampling: { sampled, source: snapshot.productSource },
    fixes,
    fetchErrors: snapshot.fetchErrors,
  };
}
