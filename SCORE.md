# The Agentic Commerce Score (ACS) — Rubric v0.2

**The Agentic Commerce Score (ACS) is a 0–100 measure of whether AI shopping agents — ChatGPT, Google AI Mode / Gemini, Perplexity, Claude, and the buying agents built on them — can find, evaluate, and buy from an online store.** It is computed exclusively from public, externally verifiable signals, so any store can be scored by anyone, and two people scoring the same store on the same day get the same number.

Canonical spec: this file. Human-readable home: <https://arenza.ai/agentic-commerce-score>. Reference implementation: this repository (`npx agentic-commerce-score <domain>`).

## Design principles

1. **Public data only.** Every check reads robots.txt, llms.txt, sitemap.xml, the open product feed (`/products.json` on platforms that expose one), or the HTML + JSON-LD of the homepage, up to three sampled product pages, and the policy pages. Nothing requires merchant credentials.
2. **Prerequisites, not enrollment.** Whether a store has *enrolled* in an agentic-checkout program (e.g. ChatGPT checkout via ACP — the OpenAI/Stripe Agentic Commerce Protocol — or a Google UCP catalog surface) is private state. ACS scores the externally verifiable *prerequisites* for those rails and says so; it never claims to verify enrollment.
3. **Deterministic.** Same inputs → same score. No LLM in the scoring path. All thresholds are in this file.
4. **Never punish the unverifiable — but never hide it either.** A check that cannot run is marked `n/a` and its weight redistributes within its pillar. When a pillar loses more than half its weight to `n/a`, it is flagged `insufficientEvidence` so nobody mistakes a thin score for a measured one.
5. **Every check must be falsifiable and discriminating.** A check that no store can fail (or that nearly every store warns on) measures nothing and is removed — see the v0.2 changelog.

## Pillars

| Pillar | Weight | Question |
|---|---|---|
| **Discover** | 30 | Can agents fetch and read the store at all? |
| **Evaluate** | 45 | Can agents parse, trust, and compare the products? |
| **Transact** | 25 | Can an agent complete a purchase? |

Pillar score = earned points ÷ possible points of its non-`n/a` checks × 100. Total = Σ (pillar score × pillar weight) ÷ 100. `pass` earns full weight, `warn` earns half, `fail` earns zero.

## Checks

### Discover (30 points)

| id | wt | pass | warn | fail |
|---|---|---|---|---|
| `robots_ai_access` | 12 | No AI shopping crawler is root-blocked (`Disallow: /`) in robots.txt (no robots.txt = open = pass) | 1–3 AI agents root-blocked | Wildcard root block, or >3 AI agents root-blocked |
| `homepage_renders` | 10 | ≥300 visible words of real HTML over HTTPS, no `noindex` | <300 visible words | Unfetchable, `noindex`, empty JS shell (<100 words + framework root div), or no HTTPS |
| `sitemap` | 5 | Sitemap found (robots-declared or `/sitemap.xml`) | — | None found |
| `llms_txt` | 3 | `/llms.txt` present and non-HTML | Absent (emerging convention — soft gap) | — |

AI agents evaluated in `robots_ai_access`: `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-User`, `PerplexityBot`, `Perplexity-User`, `Google-Extended`, `Applebot-Extended`, `Amazonbot`, `meta-externalagent`. Only **root** blocks count; path-level rules are never scored against a store.

### Evaluate (45 points)

Product-page checks sample up to **three** product pages, discovered from the feed when one exists and from the sitemap when it does not (URLs taken at a fixed stride, so the sample is spread across the catalog and reproducible).

| id | wt | pass | warn | fail |
|---|---|---|---|---|
| `catalog_required_fields` | 12 | Avg coverage of title + image + price + description ≥90% (feed products, or Product JSON-LD across sampled pages) | ≥60% | <60% |
| `product_schema` | 10 | Every sampled page carries Product JSON-LD with an Offer holding price + priceCurrency + availability | ≥50% of sampled pages | <50% |
| `product_identifiers` | 6 | Every sampled page exposes **brand AND** an identifier (`sku` / `gtin*` / `mpn`) | ≥50% of sampled pages | <50% |
| `catalog_machine_readable` | 5 | Open, parseable product feed | No feed, but ≥50% of sampled product pages carry complete Product JSON-LD | Neither |
| `rating_schema` | 5 | Every sampled page exposes `AggregateRating` | ≥50% of sampled pages | <50% |
| `image_alt` | 4 | ≥80% of content images on sampled pages carry non-empty alt text | ≥40% | <40% |
| `description_depth` | 3 | ≥70% of products have ≥120-char descriptions | ≥40% | <40% |

### Transact (25 points)

| id | wt | pass | warn | fail |
|---|---|---|---|---|
| `policies` | 9 | Shipping **and** returns pages fetched with substantive content, and the returns page states an explicit window (e.g. "within 30 days") | Both found but unverified or no explicit window; or only one of the two | Neither found |
| `machine_price_availability` | 6 | Price and availability both readable on ≥90% of products (feed) or on every sampled page (Offer schema) | ≥60% (feed) / ≥50% (pages) | Below |
| `variant_availability` | 5 | ≥90% of products expose an availability flag on **every** variant | ≥60%; or (no feed) product-level availability only | No per-variant stock exposed |
| `checkout_rail` | 5 | Platform with a native agentic-checkout rail (v0.2: Shopify) | Platform with an integration path (WooCommerce, BigCommerce) | No known rail — needs a direct protocol integration |

## "Agent-buyable" (the headline binary)

A store counts as **agent-buyable** when ALL of:

1. `robots_ai_access` is not `fail` (AI agents may fetch the store),
2. `catalog_machine_readable` is not `fail` (a feed, or product pages with complete schema),
3. required-field coverage (title/image/price/description) is measurable and averages ≥80%,
4. the platform has a native or partial agentic-checkout rail,
5. price and availability are machine-readable (`machine_price_availability` not `fail`/`n/a`),
6. `policies` **passes** — both policies verified, with a readable return window.

This is deliberately strict: it approximates the minimum a shopping agent needs to find a product, trust its data, and hand off a compliant checkout. A store can score a B and still not be agent-buyable.

## Grades

A ≥85 · B 70–84 · C 55–69 · D 40–54 · F <40.

## Known limitations (v0.2)

- **Enrollment is not verified** (see principle 2). A Shopify store passing `checkout_rail` may still have agentic surfaces switched off in its admin.
- **Three product pages are sampled**, not the whole catalog; stores with inconsistent per-template schema may vary by a few points between scans.
- **Path-level robots rules are ignored**; only root blocks count.
- **Currency correctness isn't validated**, only machine-readability.
- **Region eligibility** (protocol rollouts are US-led as of mid-2026) is out of scope.
- **Policy detection outside Shopify** falls back to homepage link detection, which is counted as found-but-unverified (a `warn`, never a `pass`).
- Feed sampling caps at 100 products; very large catalogs are scored on that sample.
- Storefronts behind aggressive bot protection may intermittently refuse a declared agent user-agent. The feed fetch retries once on transport/5xx/429 failures, but a hard block is scored as what an agent actually experiences.

## Versioning

The rubric is versioned (`rubricVersion` in every result). Checks, weights, and thresholds only change with a version bump and a changelog entry here. **Comparing scores across rubric versions is invalid.**

### v0.2 (2026-07-23)

Prompted by auditing the v0.1 dataset (857 Shopify storefronts), which exposed three structural defects: the score was effectively a re-encoding of one binary (feed open / feed closed: mean 94.1 with a feed vs 53.0 without, two barely-overlapping clusters), 52 of the 100 points were near-constants on Shopify storefronts, and one check could decide a 40-point pillar.

**Structural fixes**
- **Sitemap-based product discovery.** Product-page checks now run for stores with no open feed (v0.1 marked them all `n/a`, which let a single check set a whole pillar to zero). Up to 3 pages are sampled at a fixed stride.
- **Multi-page sampling** (1 → 3 pages), so one unusual template cannot swing a store.
- **`insufficientEvidence` flag + `evidenceCoverage`** on every pillar: redistribution is now visible instead of silent.
- **Feed fetch retries once** on transport/429/5xx failures — a false "no feed" verdict was the most expensive error the scanner could make.

**Check changes**
- **Removed `title_quality`** (was 6 pts): it warned 73% of stores and failed none — an unfalsifiable check masquerading as a measurement.
- **Added `product_identifiers`** (6 pts): brand + `sku`/`gtin*`/`mpn` in Product JSON-LD. Agents match, dedupe and price-compare by identifier.
- **Added `rating_schema`** (5 pts): `AggregateRating`, split out of `product_schema` where it was only a footnote.
- **Added `image_alt`** (4 pts): alt-text coverage — the only thing a text-mode agent can read about product photography.
- **Added `variant_availability`** (5 pts): per-variant stock, not just per-product.
- **`policies` upgraded** (8 → 9 pts): existence is no longer enough; the returns page must state an explicit window, and homepage-link-only detection now warns instead of passing.
- **`checkout_rail` down-weighted** (10 → 5 pts): it passed 100% of Shopify storefronts, contributing zero information for 10 points. It still discriminates across platforms.
- **`open_feed` renamed `catalog_machine_readable`** (10 → 5 pts) and reframed: page-level schema is a legitimate, if weaker, catalog surface.
- Pillar weights rebalanced 35/40/25 → **30/45/25**.
- `agent-buyable` tightened: policies must now *pass* (verified + explicit return window), and the feed requirement became "a machine-readable catalog surface".

### v0.1 (2026-07-23)

Initial public rubric.

## Maintained by

[Arenza](https://arenza.ai) — the AI-commerce measurement company. ACS covers the *prerequisite* side (can agents technically buy from you); Arenza's platform measures the *outcome* side — whether AI assistants actually recommend, cite, and sell your products — and prescribes + verifies fixes. Issues and PRs against this rubric are welcome; scoring changes require a version bump.
