# Agentic Commerce Score

**Can AI shopping agents find, evaluate, and buy from your store?**

One command, ~12 GET requests, a deterministic 0–100 answer:

```bash
npx agentic-commerce-score your-store.com
```

Real output (allbirds.com, scanned 2026-07-23 with rubric v0.2 — rerun it yourself, it's deterministic):

```text
  Agentic Commerce Score v0.2  ·  allbirds.com

  78/100  grade B   not agent-buyable ✗   platform: shopify

  100  ████████████████████  Discover — can agents fetch + read the store? (30%)
   60  ████████████░░░░░░░░  Evaluate — can agents parse + trust the products? (45%)
   82  ████████████████░░░░  Transact — can an agent complete a purchase? (25%)

  ✓ AI crawlers allowed (robots.txt)
  ✓ Homepage readable without JavaScript
      Homepage serves ~17291 visible words of real HTML (no JS needed).
  ✓ Required fields (title/image/price/description)
      Coverage over 100 feed products: title 100% · image 100% · price 100% · description 100% (avg 100%).
  ✗ Brand + product identifier (sku/gtin/mpn)
      0/3 sampled product pages expose both brand and an identifier.
  ✗ AggregateRating in Product JSON-LD
      0/3 sampled product pages expose machine-readable review ratings.
  …

  Top fixes
  1. Publish brand plus a product identifier (sku / gtin / mpn) in Product JSON-LD — agents match,
     dedupe and price-compare products by identifier; without one your listing is an orphan.
  2. Expose reviews as AggregateRating in Product JSON-LD (ratingValue + reviewCount)…
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

`data/` carries periodic ACS scans of leading DTC storefronts. **2026-07 (rubric
v0.2):** of 857 Shopify-detected storefronts (from 955 public-list candidates),
only **63% are agent-buyable** — more than 1 in 3 cannot complete a sale to an
AI agent. The widest gaps are machine-readable review ratings (**73% fail**),
product identifiers such as sku/gtin/mpn (**43% fail** — agents cannot match or
dedupe those products), and image alt text (32% fail). Mean 84, median 87, and
105 stores score a grade A yet still miss the buyable bar. Full methodology +
per-store breakdowns: <https://arenza.ai/agentic-commerce-score/report>. PRs
adding stores to the candidate list are welcome.

## Contributing

- Bug reports and check-implementation fixes: PRs welcome, any size.
- **Scoring changes** (new checks, weights, thresholds): open an issue first; they ship only with a rubric version bump in [SCORE.md](./SCORE.md).
- Run tests: `npm test` (offline, fixture-based).

## Maintained by

[**Arenza**](https://arenza.ai) — measurement-first AI-commerce optimization. ACS is the open prerequisite layer; Arenza's platform measures whether AI assistants actually recommend and sell your products, then prescribes and verifies the fixes. MIT licensed.
