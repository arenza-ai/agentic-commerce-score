# Agentic Commerce Score

**Can AI shopping agents find, evaluate, and buy from your store?**

One command, ~8 GET requests, a deterministic 0–100 answer:

```bash
npx agentic-commerce-score your-store.com
```

```text
  Agentic Commerce Score v0.1  ·  your-store.com

  72/100  grade B   not agent-buyable ✗   platform: shopify

   83  ████████████████░░░░  Discover — can agents fetch + read the store? (35%)
   74  ██████████████░░░░░░  Evaluate — can agents parse + trust the products? (40%)
   55  ███████████░░░░░░░░░  Transact — can an agent complete a purchase? (25%)

  ✗ Product JSON-LD (Offer: price/currency/availability)
      Product schema present but incomplete — missing: availability; no AggregateRating.
  ! llms.txt present
      No /llms.txt (emerging convention — counted as a soft gap, not a blocker).
  ✗ Shipping + returns policies discoverable
      Shipping policy found · returns/refund policy not found.
  …

  Top fixes
  1. Add complete Product JSON-LD on product pages: Offer with price + priceCurrency + availability…
  2. Publish shipping + returns policy pages at stable URLs…
```

## Why this exists

Shopping is moving into AI assistants. ChatGPT checks out orders inside chat (via ACP, the OpenAI/Stripe **Agentic Commerce Protocol**); Google AI Mode and Gemini surface catalogs through **UCP**; Perplexity, Claude, and Amazon's agents fetch and compare products on a buyer's behalf. This is **agent-led growth**: external AI agents discovering, recommending, and transacting your products for a shopper who may never visit your site first.

Most stores were built for human eyeballs and Googlebot — not for buying agents. They block AI crawlers in robots.txt, hide their catalog behind JavaScript, ship half-empty product schema, and bury the policies an agent needs before it completes a checkout. Each of those silently drops the store out of AI shopping answers.

**ACS makes that visible.** It scores the store the way an agent experiences it, across three pillars:

| Pillar | Question | Checks |
|---|---|---|
| **Discover** (35) | Can agents fetch + read the store? | robots.txt AI-crawler access · llms.txt · sitemap · renders without JS |
| **Evaluate** (40) | Can agents parse + trust the products? | open product feed · required fields (title/image/price/description) · title quality · description depth · Product JSON-LD with complete Offer |
| **Transact** (25) | Can an agent complete a purchase? | agentic-checkout rail (platform prerequisite) · machine-readable price + availability · shipping & returns policies |

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

## Dataset

`data/` carries the **State of Agentic Commerce** scans — periodic ACS runs over leading DTC storefronts (methodology in the dataset README, summary at <https://arenza.ai/agentic-commerce-score>). PRs adding stores to the candidate list are welcome.

## Contributing

- Bug reports and check-implementation fixes: PRs welcome, any size.
- **Scoring changes** (new checks, weights, thresholds): open an issue first; they ship only with a rubric version bump in [SCORE.md](./SCORE.md).
- Run tests: `npm test` (offline, fixture-based).

## Maintained by

[**Arenza**](https://arenza.ai) — measurement-first AI-commerce optimization. ACS is the open prerequisite layer; Arenza's platform measures whether AI assistants actually recommend and sell your products, then prescribes and verifies the fixes. MIT licensed.
