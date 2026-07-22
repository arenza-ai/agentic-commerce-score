import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSnapshot } from '../src/scoring.js';
import { buildFeedInfo } from '../src/checks/feed.js';
import type { StoreSnapshot, FetchedPage } from '../src/types.js';

const PRODUCT_LD = `<script type="application/ld+json">{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Insulated 12oz Steel Bottle",
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
</head><body><h1>Store</h1>${'word '.repeat(500)}
<a href="/policies/shipping-policy">Shipping</a><a href="/policies/refund-policy">Returns</a>
</body></html>`;

function goodProducts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    title: `Insulated 12oz Steel Bottle ${i}`,
    handle: `bottle-${i}`,
    body_html: `<p>${'Concrete quotable substance about the bottle. '.repeat(5)}</p>`,
    product_type: "vacuum insulated water bottle",
    tags: ['bottle', 'steel', 'gift'],
    images: [{ src: 'https://cdn/img.jpg' }, { src: 'https://cdn/img2.jpg' }],
    variants: [{ price: '29.00', available: true, compare_at_price: '39.00' }],
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
    productPage: page(`<html><head><title>Bottle — 12oz</title>${PRODUCT_LD}</head><body><h1>Bottle</h1>${'word '.repeat(400)}</body></html>`, 'https://store.example/products/bottle-1'),
    shippingPolicyFound: true,
    returnsPolicyFound: true,
    fetchErrors: [],
  };
}

test('rich Shopify-style store scores high and is agent-buyable', () => {
  const r = scoreSnapshot(richSnapshot());
  assert.ok(r.score >= 85, `expected ≥85, got ${r.score}`);
  assert.equal(r.grade, 'A');
  assert.equal(r.agentBuyable, true);
  assert.equal(r.platform.name, 'shopify');
  const ids = r.pillars.flatMap((p) => p.checks).map((c) => c.id);
  assert.ok(ids.includes('robots_ai_access') && ids.includes('product_schema') && ids.includes('policies'));
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
  const robots = r.pillars[0]!.checks.find((c) => c.id === 'robots_ai_access')!;
  assert.equal(robots.status, 'fail');
  assert.equal(r.agentBuyable, false);
  assert.ok(r.score < scoreSnapshot(richSnapshot()).score);
});

test('no feed → feed-dependent checks are na, score still computes', () => {
  const snap = richSnapshot();
  snap.feed = null;
  const r = scoreSnapshot(snap);
  assert.ok(Number.isFinite(r.score));
  const naIds = r.pillars.flatMap((p) => p.checks).filter((c) => c.status === 'na').map((c) => c.id);
  assert.ok(naIds.includes('catalog_required_fields'));
  assert.equal(r.agentBuyable, false); // feed is required for buyable
});

test('empty/unreachable store lands in F territory', () => {
  const r = scoreSnapshot({
    domain: 'dead.example',
    homepage: null,
    robotsTxt: null,
    llmsTxt: false,
    sitemapOk: false,
    feed: null,
    productPage: null,
    shippingPolicyFound: false,
    returnsPolicyFound: false,
    fetchErrors: ['https://dead.example/: timeout'],
  });
  assert.ok(r.score < 40, `expected <40, got ${r.score}`);
  assert.equal(r.grade, 'F');
  assert.equal(r.agentBuyable, false);
});

test('warn earns half credit: partial policies score between none and both', () => {
  const both = scoreSnapshot(richSnapshot());
  const one = richSnapshot();
  one.returnsPolicyFound = false;
  const none = richSnapshot();
  none.shippingPolicyFound = false;
  none.returnsPolicyFound = false;
  const rOne = scoreSnapshot(one);
  const rNone = scoreSnapshot(none);
  assert.ok(both.score > rOne.score && rOne.score > rNone.score);
});
