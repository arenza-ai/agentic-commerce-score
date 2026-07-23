import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSnapshot } from '../src/scoring.js';
import { buildFeedInfo } from '../src/checks/feed.js';
import type { StoreSnapshot, FetchedPage } from '../src/types.js';

const PRODUCT_LD = `<script type="application/ld+json">{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Insulated 12oz Steel Bottle",
  "sku": "BTL-12-STL",
  "brand": { "@type": "Brand", "name": "Example" },
  "description": "${'A concrete, quotable description of the bottle. '.repeat(4)}",
  "image": "https://cdn/img.jpg",
  "offers": { "@type": "Offer", "price": "29.00", "priceCurrency": "USD", "availability": "https://schema.org/InStock" },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.7", "reviewCount": "812" }
}</script>`;

function page(html: string, url = 'https://store.example/'): FetchedPage {
  return { url, finalUrl: url, status: 200, html };
}

const RICH_HOME = `<html><head><title>Example Store — insulated bottles</title>
<meta name="description" content="${'d'.repeat(80)}">
<link rel="canonical" href="https://store.example/">
<meta property="og:title" content="x"><meta property="og:description" content="y">
<script src="https://cdn.shopify.com/x.js"></script>
</head><body><h1>Store</h1>${'word '.repeat(500)}</body></html>`;

const PRODUCT_HTML = `<html><head><title>Bottle — 12oz</title>${PRODUCT_LD}</head><body>
<h1>Bottle</h1><img src="/a.jpg" alt="Steel bottle front"><img src="/b.jpg" alt="Steel bottle lid">
${'word '.repeat(400)}</body></html>`;

function goodProducts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    title: `Insulated 12oz Steel Bottle ${i}`,
    handle: `bottle-${i}`,
    vendor: 'Example',
    body_html: `<p>${'Concrete quotable substance about the bottle. '.repeat(5)}</p>`,
    product_type: 'vacuum insulated water bottle',
    tags: ['bottle', 'steel'],
    images: [{ src: 'https://cdn/img.jpg' }, { src: 'https://cdn/img2.jpg' }],
    variants: [{ price: '29.00', available: true, sku: `BTL-${i}`, compare_at_price: '39.00' }],
  }));
}

function richSnapshot(): StoreSnapshot {
  return {
    domain: 'store.example',
    homepage: page(RICH_HOME),
    robotsTxt: 'User-agent: *\nDisallow: /cart\nSitemap: https://store.example/sitemap.xml',
    llmsTxt: true,
    sitemapOk: true,
    feed: buildFeedInfo('https://store.example/products.json?limit=100', goodProducts(50)),
    productPages: [page(PRODUCT_HTML, 'https://store.example/products/bottle-1')],
    productSource: 'feed',
    shipping: { found: true, verified: true },
    returns: { found: true, verified: true, hasWindow: true },
    fetchErrors: [],
  };
}

test('rich Shopify-style store scores high and is agent-buyable', () => {
  const r = scoreSnapshot(richSnapshot());
  assert.ok(r.score >= 85, `expected ≥85, got ${r.score}`);
  assert.equal(r.grade, 'A');
  assert.equal(r.agentBuyable, true);
  assert.equal(r.rubricVersion, '0.2');
  assert.equal(r.platform.name, 'shopify');
});

test('v0.2 weights sum to 100 across the three pillars', () => {
  const r = scoreSnapshot(richSnapshot());
  const total = r.pillars.reduce((s, p) => s + p.weight, 0);
  assert.equal(total, 100);
  const perPillar = r.pillars.map((p) => p.checks.reduce((s, c) => s + c.weight, 0));
  assert.deepEqual(perPillar, [30, 45, 25]);
});

test('title_quality was removed in v0.2', () => {
  const ids = scoreSnapshot(richSnapshot()).pillars.flatMap((p) => p.checks).map((c) => c.id);
  assert.ok(!ids.includes('title_quality'));
  assert.ok(ids.includes('product_identifiers'));
  assert.ok(ids.includes('rating_schema'));
  assert.ok(ids.includes('image_alt'));
  assert.ok(ids.includes('variant_availability'));
});

test('root-blocking AI crawlers fails discover and kills agent-buyable', () => {
  const snap = richSnapshot();
  snap.robotsTxt = [
    'User-agent: GPTBot', 'Disallow: /',
    'User-agent: OAI-SearchBot', 'Disallow: /',
    'User-agent: PerplexityBot', 'Disallow: /',
    'User-agent: ClaudeBot', 'Disallow: /',
    'User-agent: *', 'Allow: /',
  ].join('\n');
  const r = scoreSnapshot(snap);
  assert.equal(r.pillars[0]!.checks.find((c) => c.id === 'robots_ai_access')!.status, 'fail');
  assert.equal(r.agentBuyable, false);
});

test('no feed but sitemap-discovered product pages still score the Evaluate pillar', () => {
  const snap = richSnapshot();
  snap.feed = null;
  snap.productSource = 'sitemap';
  snap.productPages = [
    page(PRODUCT_HTML, 'https://store.example/products/a'),
    page(PRODUCT_HTML, 'https://store.example/products/b'),
  ];
  const r = scoreSnapshot(snap);
  const evaluate = r.pillars.find((p) => p.key === 'evaluate')!;
  // v0.1 regression: this pillar used to collapse to 0 with one runnable check.
  assert.ok(evaluate.score > 60, `expected Evaluate > 60 from page evidence, got ${evaluate.score}`);
  assert.equal(evaluate.insufficientEvidence, false);
  assert.equal(evaluate.evidenceCoverage, 100);
  assert.equal(r.productSampling.source, 'sitemap');
});

test('no feed and no product page → pillar flagged insufficient evidence, not silently redistributed', () => {
  const snap = richSnapshot();
  snap.feed = null;
  snap.productPages = [];
  snap.productSource = 'none';
  const r = scoreSnapshot(snap);
  const evaluate = r.pillars.find((p) => p.key === 'evaluate')!;
  assert.equal(evaluate.insufficientEvidence, true);
  assert.ok(evaluate.evidenceCoverage < 50);
  assert.equal(r.agentBuyable, false);
});

test('policies without an explicit return window warn rather than pass', () => {
  const snap = richSnapshot();
  snap.returns = { found: true, verified: true, hasWindow: false };
  const r = scoreSnapshot(snap);
  const policies = r.pillars.find((p) => p.key === 'transact')!.checks.find((c) => c.id === 'policies')!;
  assert.equal(policies.status, 'warn');
  assert.equal(r.agentBuyable, false, 'buyable now requires a readable returns window');
});

test('link-only policy detection is not treated as verified', () => {
  const snap = richSnapshot();
  snap.shipping = { found: true, verified: false };
  snap.returns = { found: true, verified: false, hasWindow: false };
  const policies = scoreSnapshot(snap).pillars.find((p) => p.key === 'transact')!.checks.find((c) => c.id === 'policies')!;
  assert.equal(policies.status, 'warn');
});

test('missing identifiers and ratings cost points without failing the store', () => {
  const snap = richSnapshot();
  const bare = `<html><head><title>P</title><script type="application/ld+json">{"@type":"Product","name":"P","image":"i","description":"${'x'.repeat(150)}","offers":{"@type":"Offer","price":"1","priceCurrency":"USD","availability":"InStock"}}</script></head><body><img src="a.jpg"><h1>P</h1>${'w '.repeat(300)}</body></html>`;
  snap.productPages = [page(bare, 'https://store.example/products/p')];
  const r = scoreSnapshot(snap);
  const ev = r.pillars.find((p) => p.key === 'evaluate')!;
  assert.equal(ev.checks.find((c) => c.id === 'product_identifiers')!.status, 'fail');
  assert.equal(ev.checks.find((c) => c.id === 'rating_schema')!.status, 'fail');
  assert.equal(ev.checks.find((c) => c.id === 'image_alt')!.status, 'fail');
  assert.ok(r.score < scoreSnapshot(richSnapshot()).score);
  assert.equal(r.agentBuyable, true, 'these are quality gaps, not checkout blockers');
});

test('empty/unreachable store lands in F territory', () => {
  const r = scoreSnapshot({
    domain: 'dead.example',
    homepage: null,
    robotsTxt: null,
    llmsTxt: false,
    sitemapOk: false,
    feed: null,
    productPages: [],
    productSource: 'none',
    shipping: { found: false, verified: false },
    returns: { found: false, verified: false },
    fetchErrors: ['https://dead.example/: timeout'],
  });
  assert.ok(r.score < 40, `expected <40, got ${r.score}`);
  assert.equal(r.grade, 'F');
  assert.equal(r.agentBuyable, false);
});
