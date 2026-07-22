/**
 * Pure scoring layer: StoreSnapshot in → ScoreResult out. Deterministic —
 * same snapshot always yields the same score (unit-testable with zero network).
 * Weights + thresholds are the normative rubric; SCORE.md documents them and
 * MUST be updated in the same commit as any change here (rubricVersion bump).
 */

import type { Check, Grade, PillarResult, ScoreResult, StoreSnapshot } from './types.js';
import { analyzeRobots } from './checks/site.js';
import { analyzePage, type PageFacts } from './checks/page.js';
import { detectPlatform } from './checks/platform.js';

export const RUBRIC_VERSION = '0.1';

const FIX_HINTS: Record<string, string> = {
  robots_ai_access:
    'Unblock AI shopping crawlers in robots.txt (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended…) — blocked agents cannot see, cite, or sell your products.',
  llms_txt: 'Add /llms.txt — a short markdown map of your key pages for AI systems (llmstxt.org).',
  sitemap: 'Publish /sitemap.xml (and declare it in robots.txt) so agents can enumerate your catalog.',
  homepage_renders:
    'Serve real HTML without JavaScript: agent fetchers read the raw response. Pre-render or SSR your storefront.',
  open_feed:
    'Expose a machine-readable product catalog. On Shopify keep /products.json open; elsewhere publish a product feed agents can parse.',
  catalog_required_fields:
    'Fill the four required catalog fields on every product: title, image, price, description — a product missing one drops out of agent answers.',
  title_quality:
    'Rewrite product titles with literal, matchable language ("insulated 12oz steel bottle"), not marketing names; drop ALL-CAPS and slogan phrasing.',
  description_depth: 'Bring product descriptions to 120+ chars of concrete, quotable substance.',
  product_schema:
    'Add complete Product JSON-LD on product pages: Offer with price + priceCurrency + availability, plus AggregateRating when you have reviews.',
  checkout_rail:
    'Move onto (or integrate) an agentic-checkout rail: Shopify stores ride ChatGPT checkout + Google catalog rails; custom stacks need a direct ACP integration.',
  machine_price_availability:
    'Expose machine-readable price AND availability per product (feed fields or Offer schema) — agents will not guess stock.',
  policies:
    'Publish shipping + returns policy pages at stable URLs — agents surface (and protocols require) merchant policies before completing checkout.',
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

export function scoreSnapshot(snapshot: StoreSnapshot): ScoreResult {
  const robots = analyzeRobots(snapshot.robotsTxt);
  const homeFacts: PageFacts | null = snapshot.homepage
    ? analyzePage(snapshot.homepage.html, snapshot.homepage.finalUrl)
    : null;
  const productFacts: PageFacts | null = snapshot.productPage
    ? analyzePage(snapshot.productPage.html, snapshot.productPage.finalUrl)
    : null;
  const platform = detectPlatform(snapshot.homepage?.html ?? null, snapshot.feed !== null);
  const feed = snapshot.feed;

  const checks: Check[] = [];

  // ---------------- DISCOVER ----------------
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
  checks.push(
    toCheck({
      id: 'llms_txt',
      label: 'llms.txt present',
      pillar: 'discover',
      weight: 5,
      status: snapshot.llmsTxt ? 'pass' : 'warn',
      detail: snapshot.llmsTxt ? '/llms.txt found.' : 'No /llms.txt (emerging convention — counted as a soft gap, not a blocker).',
    }),
  );
  checks.push(
    toCheck({
      id: 'sitemap',
      label: 'Sitemap discoverable',
      pillar: 'discover',
      weight: 6,
      status: snapshot.sitemapOk ? 'pass' : 'fail',
      detail: snapshot.sitemapOk ? 'Sitemap found.' : 'No sitemap found at /sitemap.xml or declared in robots.txt.',
    }),
  );
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
    checks.push(toCheck({ id: 'homepage_renders', label: 'Homepage readable without JavaScript', pillar: 'discover', weight: 12, status, detail }));
  }

  // ---------------- EVALUATE ----------------
  {
    let status: Check['status'];
    let detail: string;
    if (feed) {
      status = 'pass';
      detail = `Open product feed at ${feed.url} (${feed.productCount} products sampled).`;
    } else if (productFacts?.productSchema.hasProduct) {
      status = 'warn';
      detail = 'No open product feed — agents must crawl page-by-page (Product JSON-LD found on product page).';
    } else {
      status = 'fail';
      detail = 'No open product feed and no Product JSON-LD found — no machine-readable catalog surface detected.';
    }
    checks.push(toCheck({ id: 'open_feed', label: 'Machine-readable product catalog', pillar: 'evaluate', weight: 10, status, detail }));
  }
  {
    let spec: CheckSpec;
    if (!feed) {
      spec = { id: 'catalog_required_fields', label: 'Catalog required fields (title/image/price/description)', pillar: 'evaluate', weight: 12, status: 'na', detail: 'No open feed to sample.' };
    } else {
      const c = feed.coverage;
      const avg = Math.round((c.title + c.image + c.price + c.description) / 4);
      const status: Check['status'] = avg >= 90 ? 'pass' : avg >= 60 ? 'warn' : 'fail';
      spec = {
        id: 'catalog_required_fields',
        label: 'Catalog required fields (title/image/price/description)',
        pillar: 'evaluate',
        weight: 12,
        status,
        detail: `Coverage over ${feed.productCount} products: title ${c.title}% · image ${c.image}% · price ${c.price}% · description ${c.description}% (avg ${avg}%).`,
      };
    }
    checks.push(toCheck(spec));
  }
  {
    let spec: CheckSpec;
    if (!feed) {
      spec = { id: 'title_quality', label: 'Title quality (literal, matchable)', pillar: 'evaluate', weight: 6, status: 'na', detail: 'No open feed to sample.' };
    } else {
      const status: Check['status'] = feed.titleFluffPct >= 25 ? 'fail' : feed.titleFluffPct >= 10 || feed.titleLiteralPct < 15 ? 'warn' : 'pass';
      spec = {
        id: 'title_quality',
        label: 'Title quality (literal, matchable)',
        pillar: 'evaluate',
        weight: 6,
        status,
        detail: `${feed.titleLiteralPct}% of titles carry a literal descriptor/spec; ${feed.titleFluffPct}% read as marketing slogans.`,
      };
    }
    checks.push(toCheck(spec));
  }
  {
    let spec: CheckSpec;
    if (!feed) {
      spec = { id: 'description_depth', label: 'Description depth (≥120 chars)', pillar: 'evaluate', weight: 4, status: 'na', detail: 'No open feed to sample.' };
    } else {
      const status: Check['status'] = feed.descriptionDepthPct >= 70 ? 'pass' : feed.descriptionDepthPct >= 40 ? 'warn' : 'fail';
      spec = {
        id: 'description_depth',
        label: 'Description depth (≥120 chars)',
        pillar: 'evaluate',
        weight: 4,
        status,
        detail: `${feed.descriptionDepthPct}% of products have a description agents can actually quote (≥120 chars).`,
      };
    }
    checks.push(toCheck(spec));
  }
  {
    let spec: CheckSpec;
    if (!productFacts) {
      spec = { id: 'product_schema', label: 'Product JSON-LD (Offer: price/currency/availability)', pillar: 'evaluate', weight: 8, status: 'na', detail: 'No product page fetched.' };
    } else {
      const ps = productFacts.productSchema;
      const complete = ps.hasProduct && ps.hasOffer && ps.offerHasPrice && ps.offerHasCurrency && ps.offerHasAvailability;
      const status: Check['status'] = complete ? 'pass' : ps.hasProduct ? 'warn' : 'fail';
      const missing: string[] = [];
      if (!ps.hasOffer) missing.push('Offer');
      else {
        if (!ps.offerHasPrice) missing.push('price');
        if (!ps.offerHasCurrency) missing.push('priceCurrency');
        if (!ps.offerHasAvailability) missing.push('availability');
      }
      spec = {
        id: 'product_schema',
        label: 'Product JSON-LD (Offer: price/currency/availability)',
        pillar: 'evaluate',
        weight: 8,
        status,
        detail: !ps.hasProduct
          ? 'No Product JSON-LD on the sampled product page.'
          : complete
            ? `Complete Product schema${ps.hasAggregateRating ? ' incl. AggregateRating' : ''} (rating schema ${ps.hasAggregateRating ? 'present' : 'absent'}).`
            : `Product schema present but incomplete — missing: ${missing.join(', ')}${ps.hasAggregateRating ? '' : '; no AggregateRating'}.`,
      };
    }
    checks.push(toCheck(spec));
  }

  // ---------------- TRANSACT ----------------
  {
    const status: Check['status'] =
      platform.agenticCheckoutRail === 'native' ? 'pass' : platform.agenticCheckoutRail === 'partial' ? 'warn' : 'fail';
    checks.push(
      toCheck({
        id: 'checkout_rail',
        label: 'Agentic-checkout rail (platform prerequisite)',
        pillar: 'transact',
        weight: 10,
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
      const status: Check['status'] = priceOk >= 90 && availOk >= 90 ? 'pass' : priceOk >= 60 && availOk >= 60 ? 'warn' : 'fail';
      spec = {
        id: 'machine_price_availability',
        label: 'Machine-readable price + availability',
        pillar: 'transact',
        weight: 7,
        status,
        detail: `Feed exposes price on ${priceOk}% and availability on ${availOk}% of products.`,
      };
    } else if (productFacts) {
      const ps = productFacts.productSchema;
      const status: Check['status'] = ps.offerHasPrice && ps.offerHasAvailability ? 'pass' : ps.offerHasPrice || ps.offerHasAvailability ? 'warn' : 'fail';
      spec = {
        id: 'machine_price_availability',
        label: 'Machine-readable price + availability',
        pillar: 'transact',
        weight: 7,
        status,
        detail: `Via Offer schema: price=${ps.offerHasPrice}, availability=${ps.offerHasAvailability} (no open feed).`,
      };
    } else {
      spec = { id: 'machine_price_availability', label: 'Machine-readable price + availability', pillar: 'transact', weight: 7, status: 'na', detail: 'No feed or product page available.' };
    }
    checks.push(toCheck(spec));
  }
  {
    const s = snapshot.shippingPolicyFound;
    const r = snapshot.returnsPolicyFound;
    const status: Check['status'] = s && r ? 'pass' : s || r ? 'warn' : 'fail';
    checks.push(
      toCheck({
        id: 'policies',
        label: 'Shipping + returns policies discoverable',
        pillar: 'transact',
        weight: 8,
        status,
        detail: `Shipping policy ${s ? 'found' : 'not found'} · returns/refund policy ${r ? 'found' : 'not found'}.`,
      }),
    );
  }

  // ---------------- aggregate ----------------
  const pillarDefs: { key: PillarResult['key']; label: string; weight: number }[] = [
    { key: 'discover', label: 'Discover — can agents fetch + read the store?', weight: 35 },
    { key: 'evaluate', label: 'Evaluate — can agents parse + trust the products?', weight: 40 },
    { key: 'transact', label: 'Transact — can an agent complete a purchase?', weight: 25 },
  ];
  const pillars: PillarResult[] = pillarDefs.map((def) => {
    const pchecks = checks.filter((c) => c.pillar === def.key);
    const scorable = pchecks.filter((c) => c.status !== 'na');
    const possible = scorable.reduce((s, c) => s + c.weight, 0);
    const earned = scorable.reduce((s, c) => s + c.earned, 0);
    return {
      key: def.key,
      label: def.label,
      weight: def.weight,
      score: possible > 0 ? Math.round((100 * earned) / possible) : 0,
      checks: pchecks,
    };
  });
  const score = Math.round(pillars.reduce((s, p) => s + (p.score * p.weight) / 100, 0));

  const requiredAvg = feed
    ? (feed.coverage.title + feed.coverage.image + feed.coverage.price + feed.coverage.description) / 4
    : 0;
  const robotsCheck = checks.find((c) => c.id === 'robots_ai_access')!;
  const agentBuyable =
    robotsCheck.status !== 'fail' &&
    feed !== null &&
    requiredAvg >= 80 &&
    platform.agenticCheckoutRail !== 'none-detected' &&
    snapshot.shippingPolicyFound &&
    snapshot.returnsPolicyFound;

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
    fixes,
    fetchErrors: snapshot.fetchErrors,
  };
}
