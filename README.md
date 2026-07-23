# Agentic Commerce Score

**Can AI shopping agents find, evaluate, and buy from your store?**

One command, ~8 GET requests, a deterministic 0–100 answer:

```bash
npx agentic-commerce-score your-store.com
```

Real output (allbirds.com, scanned 2026-07-23 with rubric v0.2 — rerun it yourself, it's deterministic):

```text
  Agentic Commerce Score v0.2  ·  allbirds.com

  82/100  grade B   agent-buyable ✓   platform: shopify

  100  ████████████████████  Discover — can agents fetch + read the store? (30%)
   60  ████████████░░░░░░░░  Evaluate — can agents parse + trust the products? (45%)
  100  ████████████████████  Transact — can an agent complete a purchase? (25%)

  ✓ AI crawlers allowed (robots.txt)
  ✓ Homepage readable without JavaScript
      Homepage serves ~17291 visible words of real HTML (no JS needed).
  ✓ Required fields (title/image/price/description)
      Coverage over 100 feed products: title 100% · image 100% · price 100% · description 100% (avg 100%).
  ✗ Product JSON-LD (Offer: price/currency/availability)
      0/3 sampled product pages carry Product JSON-LD with a complete Offer.
  ✗ Brand + product identifier (sku/gtin/mpn)
  ✓ Machine-readable price + availability
      Feed exposes price on 100% and availability on 100% of products.
  …

  Top fixes
  1. Add complete Product JSON-LD on product pages: an Offer with price + priceCurrency + availability.
  2. Publish brand plus a product identifier (sku / gtin / mpn) — agents match and dedupe by identifier…
```

## Why this exists

Shopping is moving into AI assistants. ChatGPT checks out orders inside chat (via ACP, the OpenAI/Stripe **Agentic Commerce Protocol**); Google AI Mode and Gemini surface catalogs through **UCP**; Perplexity, Claude, and Amazon's agents fetch and compare products on a buyer's behalf. This is **agent-led growth**: external AI agents discovering, recommending, and transacting your products for a shopper who may never visit your site first.

Most stores were built for human eyeballs and Googlebot — not for buying agents. They block AI crawlers in robots.txt, hide their catalog behind JavaScript, ship half-empty product schema, and bury the policies an agent needs before it completes a checkout. Each of those silently drops the store out of AI shopping answers.

**ACS makes that visible.** It scores the store the way an agent experiences it, across three pillars:

| Pillar | Question | Checks |
|---|---|---|
| **Discover** (30) | Can agents fetch + read the store? | robots.txt AI-crawler access · renders without JS · sitemap · llms.txt |
| **Evaluate** (45) | Can agents parse + trust the products? | required fields (title/image/price/description) · Product JSON-LD with complete Offer · brand + identifier (sku/gtin/mpn) · machine-readable catalog · AggregateRating · image alt text · description depth |
| **Transact** (25) | Can an agent complete a purchase? | shipping + returns policies **with terms** · machine-readable price + availability · per-variant stock · agentic-checkout rail |

Product-page checks sample **3 pages**, discovered from the feed or — when the feed is closed — from the sitemap, so a locked-down catalog is scored on real evidence instead of collapsing to zero.

Full rubric with every threshold: **[SCORE.md](./SCORE.md)**. Deterministic and honest by construction: public data only, no LLM in the scoring path, prerequisites — never claimed "enrollment".

## Usage

```bash
# Human-readable report
npx agentic-commerce-score allbirds.com

# JSON (pipe into anything)
npx agentic-commerce-score allbirds.com --json | jq '.score, .agentBuyable'

# CI gate: fail the build if the score drops below 70
npx agentic-commerce-score your-store.com --threshold 70
```

As a library:

```ts
import { runScore } from 'agentic-commerce-score';

const result = await runScore('your-store.com');
console.log(result.score, result.grade, result.fixes);
```

Zero runtime dependencies. Node ≥ 18.17.

### GitHub Action

```yaml
- uses: arenza-ai/agentic-commerce-score@main
  with:
    domain: your-store.com
    threshold: "70"
```

## What ACS is not

- **Not a visibility tracker.** ACS scores whether agents *can* buy from you (the prerequisite side). Whether AI assistants actually *recommend and cite* you is the outcome side — that requires probing the assistants themselves at scale.
- **Not an enrollment checker.** Protocol enrollment is private merchant state; ACS scores the externally verifiable prerequisites and says so (see SCORE.md, principle 2).
- **Not SEO advice.** Several checks overlap with classic SEO hygiene, but the lens is strictly "what does a buying agent need".

## Dataset — State of Agentic Commerce

`data/` carries periodic ACS scans of leading DTC storefronts. **2026-07:** of
857 Shopify-detected storefronts (from 955 public-list candidates), **81% are
agent-buyable**; the top gaps are incomplete Product JSON-LD (13% fail),
closed/absent product feeds (10%), and thin descriptions (8%). Mean score 90,
median 97 — the failing tail includes household names. Full methodology +
per-store breakdowns: <https://arenza.ai/agentic-commerce-score/report>. PRs
adding stores to the candidate list are welcome.

## Contributing

- Bug reports and check-implementation fixes: PRs welcome, any size.
- **Scoring changes** (new checks, weights, thresholds): open an issue first; they ship only with a rubric version bump in [SCORE.md](./SCORE.md).
- Run tests: `npm test` (offline, fixture-based).

## Maintained by

[**Arenza**](https://arenza.ai) — measurement-first AI-commerce optimization. ACS is the open prerequisite layer; Arenza's platform measures whether AI assistants actually recommend and sell your products, then prescribes and verifies the fixes. MIT licensed.
