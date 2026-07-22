/**
 * Agentic Commerce Score (ACS) — shared types.
 *
 * Everything ACS measures is PUBLIC and externally verifiable: robots.txt,
 * llms.txt, sitemap.xml, the storefront product feed (/products.json where the
 * platform exposes one), and the HTML + JSON-LD of the homepage and one
 * representative product page. ACS never claims to verify private state
 * (protocol enrollment, feed submissions, merchant dashboards) — checks that
 * would require private data are scored as *prerequisites*, and SCORE.md says
 * so explicitly.
 */

/** One atomic check. `id` values are stable across versions (see SCORE.md). */
export interface Check {
  id: string;
  label: string;
  pillar: PillarKey;
  status: 'pass' | 'warn' | 'fail' | 'na';
  /** Human-readable evidence for the status — always concrete, never vague. */
  detail: string;
  /** Max points this check contributes to the 0-100 total. */
  weight: number;
  /** Points earned: pass = weight, warn = weight/2, fail = 0, na = redistributed. */
  earned: number;
}

export type PillarKey = 'discover' | 'evaluate' | 'transact';

export interface PillarResult {
  key: PillarKey;
  label: string;
  /** 0-100 within the pillar. */
  score: number;
  /** Max points of the pillar within the 100-point total. */
  weight: number;
  checks: Check[];
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoreResult {
  /** Schema/rubric version, e.g. "0.1". Bump per SCORE.md changes. */
  rubricVersion: string;
  domain: string;
  scannedAt: string;
  /** 0-100 weighted total. */
  score: number;
  grade: Grade;
  /**
   * The headline binary: an agent can (1) fetch the store, (2) parse a
   * machine-readable catalog with the required fields, (3) ride an
   * agentic-checkout-eligible platform, and (4) find shipping+returns policies.
   * Exact definition in SCORE.md §agent-buyable.
   */
  agentBuyable: boolean;
  pillars: PillarResult[];
  platform: PlatformInfo;
  feed: FeedInfo | null;
  /** Top fixes ordered by (severity, weight). */
  fixes: string[];
  /** Non-fatal fetch errors encountered during the scan (transparency). */
  fetchErrors: string[];
}

export interface PlatformInfo {
  /** 'shopify' | 'woocommerce' | 'bigcommerce' | 'magento' | 'salesforce' | 'wix' | 'squarespace' | 'custom/unknown' */
  name: string;
  /** Whether the platform has an announced agentic-checkout rail (ACP/UCP path). */
  agenticCheckoutRail: 'native' | 'partial' | 'none-detected';
  evidence: string;
}

/** Normalized public product parsed from /products.json (Shopify-style). */
export interface PublicProduct {
  title: string;
  handle: string;
  descriptionText: string;
  productType: string;
  tags: string[];
  imageCount: number;
  price: number | null;
  available: boolean | null;
  hasCompareAtDiscount: boolean;
}

export interface FeedInfo {
  url: string;
  productCount: number;
  /** Field coverage percentages over sampled products (0-100). */
  coverage: {
    title: number;
    image: number;
    price: number;
    description: number;
    productType: number;
  };
  /** Share of titles with a literal descriptor / spec token (0-100). */
  titleLiteralPct: number;
  /** Share of titles carrying marketing-fluff phrasing (0-100). */
  titleFluffPct: number;
  /** Share of descriptions >= 120 chars (0-100). */
  descriptionDepthPct: number;
  /** Share of products exposing machine-readable availability (0-100). */
  availabilityPct: number;
  sampledProducts: PublicProduct[];
}

/** Everything fetched for one store — input to the pure scoring layer. */
export interface StoreSnapshot {
  domain: string;
  homepage: FetchedPage | null;
  robotsTxt: string | null;
  llmsTxt: boolean;
  sitemapOk: boolean;
  feed: FeedInfo | null;
  productPage: FetchedPage | null;
  shippingPolicyFound: boolean;
  returnsPolicyFound: boolean;
  fetchErrors: string[];
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
}
