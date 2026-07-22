import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePage, extractJsonLd } from '../src/checks/page.js';

const FULL_PRODUCT = `<html><head>
<title>Trail Runner 5 — men's lightweight running shoe</title>
<meta name="description" content="Lightweight trail shoe with 4mm drop, machine-washable, free 30-day returns.">
<link rel="canonical" href="https://shoes.example/products/trail-runner-5">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Trail Runner 5",
"offers":{"@type":"Offer","price":"140.00","priceCurrency":"USD","availability":"https://schema.org/InStock"},
"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.6","reviewCount":"1204"}}]}
</script>
</head><body><h1>Trail Runner 5</h1>${'word '.repeat(700)}</body></html>`;

test('full product JSON-LD is recognized (incl. @graph nesting)', () => {
  const f = analyzePage(FULL_PRODUCT, 'https://shoes.example/products/trail-runner-5');
  assert.equal(f.productSchema.hasProduct, true);
  assert.equal(f.productSchema.hasOffer, true);
  assert.equal(f.productSchema.offerHasPrice, true);
  assert.equal(f.productSchema.offerHasCurrency, true);
  assert.equal(f.productSchema.offerHasAvailability, true);
  assert.equal(f.productSchema.hasAggregateRating, true);
  assert.equal(f.canonical, 'self');
  assert.ok(f.visibleWords > 600);
});

test('SPA shell is flagged', () => {
  const f = analyzePage('<html><head><title>App</title></head><body><div id="root"></div></body></html>', 'https://spa.example/');
  assert.equal(f.spaShellRisk, true);
});

test('canonical pointing elsewhere is detected', () => {
  const html = '<html><head><link rel="canonical" href="https://other.example/page"><title>T</title></head><body>hi</body></html>';
  const f = analyzePage(html, 'https://this.example/page');
  assert.equal(f.canonical, 'elsewhere');
});

test('broken JSON-LD blocks are tolerated', () => {
  const blocks = extractJsonLd('<script type="application/ld+json">{"@type":"Product",}</script>');
  assert.equal(blocks.length, 1);
});

test('noindex robots meta is detected', () => {
  const f = analyzePage('<html><head><meta name="robots" content="noindex,nofollow"><title>T</title></head><body>x</body></html>', 'https://x.example/');
  assert.equal(f.robotsNoindex, true);
});
