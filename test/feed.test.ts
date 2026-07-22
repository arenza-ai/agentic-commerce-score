import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedInfo, titleIsLiteral, titleHasFluff, stripHtml } from '../src/checks/feed.js';

test('coverage percentages are computed over sampled products', () => {
  const feed = buildFeedInfo('https://x/products.json', [
    { title: 'Insulated 12oz Bottle', handle: 'a', body_html: `<p>${'y'.repeat(200)}</p>`, product_type: 'bottle', tags: ['x'], images: [{ src: 'i' }], variants: [{ price: '10.00', available: true }] },
    { title: '', handle: 'b', body_html: '', product_type: '', tags: [], images: [], variants: [] },
  ]);
  assert.ok(feed);
  assert.equal(feed.productCount, 2);
  assert.equal(feed.coverage.title, 50);
  assert.equal(feed.coverage.image, 50);
  assert.equal(feed.coverage.price, 50);
  assert.equal(feed.coverage.description, 50);
  assert.equal(feed.descriptionDepthPct, 50);
});

test('comma-string tags are normalized', () => {
  const feed = buildFeedInfo('u', [
    { title: 'T', handle: 'h', body_html: '', product_type: '', tags: 'a, b, c', images: [], variants: [] },
  ]);
  assert.ok(feed);
  assert.deepEqual(feed.sampledProducts[0]!.tags, ['a', 'b', 'c']);
});

test('compare_at_price discount is detected', () => {
  const feed = buildFeedInfo('u', [
    { title: 'T', handle: 'h', body_html: '', product_type: '', tags: [], images: [], variants: [{ price: '10.00', compare_at_price: '15.00' }] },
  ]);
  assert.ok(feed);
  assert.equal(feed.sampledProducts[0]!.hasCompareAtDiscount, true);
});

test('title heuristics: literal specs pass, fluff flags', () => {
  assert.equal(titleIsLiteral('Insulated 12oz Steel Bottle'), true);
  assert.equal(titleIsLiteral('Waterproof trail jacket'), true);
  assert.equal(titleIsLiteral('Aurora Dream'), false);
  assert.equal(titleHasFluff('Experience the Ultimate Hydration Revolution'), true);
  assert.equal(titleHasFluff('Cotton crew socks 3-pack'), false);
});

test('empty feed returns null', () => {
  assert.equal(buildFeedInfo('u', []), null);
});

test('stripHtml collapses markup to text', () => {
  assert.equal(stripHtml('<p>Hello <b>world</b> &amp; more</p>'), 'Hello world more');
});
