import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRobots } from '../src/checks/site.js';

test('no robots.txt → nothing blocked', () => {
  const r = analyzeRobots(null);
  assert.equal(r.found, false);
  assert.deepEqual(r.blockedAgents, []);
});

test('specific AI-agent root blocks are detected, case-insensitively', () => {
  const r = analyzeRobots('User-Agent: gptbot\nDisallow: /\n\nUser-agent: *\nDisallow: /checkout');
  assert.deepEqual(r.blockedAgents, ['GPTBot']);
  assert.equal(r.wildcardRootBlock, false);
});

test('wildcard root block blocks every AI agent by default', () => {
  const r = analyzeRobots('User-agent: *\nDisallow: /');
  assert.equal(r.wildcardRootBlock, true);
  assert.ok(r.blockedAgents.length >= 10);
});

test('specific allow overrides wildcard root block', () => {
  const r = analyzeRobots('User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /cart');
  assert.ok(!r.blockedAgents.includes('GPTBot'));
  assert.ok(r.blockedAgents.includes('PerplexityBot'));
});

test('stacked user-agent lines share one rule group', () => {
  const r = analyzeRobots('User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /');
  assert.ok(r.blockedAgents.includes('GPTBot'));
  assert.ok(r.blockedAgents.includes('ClaudeBot'));
  assert.ok(!r.blockedAgents.includes('PerplexityBot'));
});

test('sitemap declarations are collected', () => {
  const r = analyzeRobots('Sitemap: https://x.example/sitemap.xml\nUser-agent: *\nDisallow:');
  assert.deepEqual(r.sitemapUrls, ['https://x.example/sitemap.xml']);
});

test('path-level disallows never count as root blocks', () => {
  const r = analyzeRobots('User-agent: GPTBot\nDisallow: /admin\nDisallow: /cart');
  assert.deepEqual(r.blockedAgents, []);
});
