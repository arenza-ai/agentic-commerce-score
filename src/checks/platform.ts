/**
 * Platform detection + agentic-checkout rail classification.
 *
 * Honesty rule: ACS reports what is EXTERNALLY VERIFIABLE. Whether a merchant
 * has actually enrolled in ChatGPT checkout (ACP — OpenAI/Stripe) or a Google
 * UCP catalog surface is private state; what we can verify is the PLATFORM the
 * store runs on and whether that platform has an announced agentic-checkout
 * rail the merchant can ride. SCORE.md states this scoping explicitly.
 */

import type { PlatformInfo } from '../types.js';

export function detectPlatform(homepageHtml: string | null, feedDetected: boolean): PlatformInfo {
  const html = homepageHtml ?? '';
  const has = (re: RegExp) => re.test(html);

  if (feedDetected || has(/cdn\.shopify\.com|myshopify\.com|Shopify\.theme|shopify-features/i)) {
    const shopPay = /shop\.app|shop-pay|shopify-payment/i.test(html);
    return {
      name: 'shopify',
      agenticCheckoutRail: 'native',
      evidence: feedDetected
        ? `Open /products.json feed${shopPay ? ' + Shop Pay signals' : ''} — Shopify storefront; platform ships ChatGPT-checkout (ACP) and Google (UCP) catalog rails for eligible stores.`
        : 'Shopify asset/runtime markers in homepage HTML.',
    };
  }
  if (has(/woocommerce|wp-content\/plugins\/woo/i)) {
    return {
      name: 'woocommerce',
      agenticCheckoutRail: 'partial',
      evidence: 'WooCommerce markers — agentic-checkout available via extensions/integrations, not a default rail.',
    };
  }
  if (has(/cdn\d*\.bigcommerce\.com|bigcommerce/i)) {
    return {
      name: 'bigcommerce',
      agenticCheckoutRail: 'partial',
      evidence: 'BigCommerce markers — agentic-checkout via platform integrations.',
    };
  }
  if (has(/mage\/|magento/i)) {
    return { name: 'magento', agenticCheckoutRail: 'none-detected', evidence: 'Magento markers; no default agentic-checkout rail detected.' };
  }
  if (has(/static\.wixstatic\.com|wix\.com/i)) {
    return { name: 'wix', agenticCheckoutRail: 'none-detected', evidence: 'Wix markers; no default agentic-checkout rail detected.' };
  }
  if (has(/squarespace\.com|static1\.squarespace/i)) {
    return { name: 'squarespace', agenticCheckoutRail: 'none-detected', evidence: 'Squarespace markers; no default agentic-checkout rail detected.' };
  }
  return {
    name: 'custom/unknown',
    agenticCheckoutRail: 'none-detected',
    evidence: 'No known platform markers — agentic checkout would need a direct protocol integration (e.g. ACP).',
  };
}
