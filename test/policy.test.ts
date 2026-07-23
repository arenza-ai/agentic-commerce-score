import test from 'node:test';
import assert from 'node:assert/strict';
import { hasReturnWindow } from '../src/index.js';

test('real return windows are detected', () => {
  assert.equal(hasReturnWindow('<p>Items may be returned within 30 days of purchase.</p>'), true);
  assert.equal(hasReturnWindow('<p>Orders are eligible for a return or exchange within 21 days from delivery.</p>'), true);
  assert.equal(hasReturnWindow('<p>We offer a 60-day refund guarantee.</p>'), true);
});

test('a time span unrelated to returns is not a return window', () => {
  // Real false positive found on a live store: a subscription plan in JSON.
  assert.equal(
    hasReturnWindow('<script>{"sellingPlans":[{"name":"Delivery every 2 weeks"}]}</script><p>All sales final.</p>'),
    false,
  );
  assert.equal(hasReturnWindow('<p>Standard shipping takes 5 days.</p><p>All sales are final.</p>'), false);
});

test('a returns page with no stated window is not a window', () => {
  assert.equal(hasReturnWindow('<p>To start a return, contact support. Refunds are issued to the original payment method.</p>'), false);
});
