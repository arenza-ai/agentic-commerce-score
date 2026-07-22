# The Agentic Commerce Score (ACS) — Rubric v0.1

**The Agentic Commerce Score (ACS) is a 0–100 measure of whether AI shopping agents — ChatGPT, Google AI Mode / Gemini, Perplexity, Claude, and the buying agents built on them — can find, evaluate, and buy from an online store.** It is computed exclusively from public, externally verifiable signals, so any store can be scored by anyone, and two people scoring the same store on the same day get the same number.

Canonical spec: this file. Human-readable home: <https://arenza.ai/agentic-commerce-score>. Reference implementation: this repository (`npx agentic-commerce-score <domain>`).

## Design principles

1. **Public data only.** Every check reads robots.txt, llms.txt, sitemap.xml, the open product feed (`/products.json` on platforms that expose one), or the HTML + JSON-LD of the homepage and one representative product page. Nothing requires merchant credentials.
2. **Prerequisites, not enrollment.** Whether a store has *enrolled* in an agentic-checkout program (e.g. ChatGPT checkout via ACP — the OpenAI/Stripe Agentic Commerce Protocol — or a Google UCP catalog surface) is private state. ACS scores the externally verifiable *prerequisites* for those rails and says so; it never claims to verify enrollment.
3. **Deterministic.** Same inputs → same score. No LLM in the scoring path. All thresholds are in this file.
4. **Never punish the unverifiable.** A check that cannot run (e.g. no open feed to sample) is marked `n/a` and its weight is redistributed within its pillar — it is not scored as a failure. What *is* scored as a failure is the absence of any machine-readable alternative.

## Pillars

| Pillar | Weight | Question |
|---|---|---|
| **Discover** | 35 | Can agents fetch and read the store at all? |
| **Evaluate** | 40 | Can agents parse, trust, and compare the products? |
| **Transact** | 25 | Can an agent complete a purchase? |

Pillar score = earned points ÷ possible points of its non-`n/a` checks × 100. Total = Σ (pillar score × pillar weight) ÷ 100. `pass` earns full weight, `warn` earns half, `fail` earns zero.

## Checks

### Discover (35 points)

| id | wt | pass | warn | fail |
|---|---|---|---|---|
| `robots_ai_access` | 12 | No AI shopping crawler is root-blocked (`Disallow: /`) in robots.txt (no robots.txt = open = pass) | 1–3 AI agents root-blocked | Wildcard root block, or >3 AI agents root-blocked |
| `llms_txt` | 5 | `/llms.txt` present and non-HTML | Absent (emerging convention — soft gap) | — |
| `sitemap` | 6 | Sitemap found (robots-declared or `/sitemap.xml`) | — | None found |
| `homepage_renders` | 12 | Homepage serves ≥300 visible words of real HTML over HTTPS, no `noindex` | <300 visible words | Unfetchable, `noindex`, empty JS shell (<100 words + framework root div), or no HTTPS |

AI agents evaluated in `robots_ai_access` (v0.1): `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-User`, `PerplexityBot`, `Perplexity-User`, `Google-Extended`, `Applebot-Extended`, `Amazonbot`, `meta-externalagent`. Only **root** blocks count; path-level rules are never scored against a store.

### Evaluate (40 points)

| id | wt | pass | warn | fail |
|---|---|---|---|---|
| `open_feed` | 10 | Open product feed parseable (e.g. `/products.json`) | No feed, but Product JSON-LD found on the product page | No feed and no Product JSON-LD |
| `catalog_required_fields` | 12 | Avg coverage of title + image + price + description ≥90% over sampled products (≤100) | ≥60% | <60% |
| `title_quality` | 6 | <10% fluff titles and ≥15% literal/spec titles | 10–24% fluff, or <15% literal | ≥25% of titles are marketing slogans |
| `description_depth` | 4 | ≥70% of products have ≥120-char descriptions | ≥40% | <40% |
| `product_schema` | 8 | Product JSON-LD with Offer carrying price + priceCurrency + availability | Product JSON-LD present but Offer incomplete | No Product JSON-LD |

### Transact (25 points)

| id | wt | pass | warn | fail |
|---|---|---|---|---|
| `checkout_rail` | 10 | Platform with a native agentic-checkout rail detected (v0.1: Shopify — ChatGPT checkout + Google catalog rails) | Platform with partial/integration-path rails (WooCommerce, BigCommerce) | No known rail — needs a direct protocol integration |
| `machine_price_availability` | 7 | Feed exposes price and availability on ≥90% of products (or complete Offer schema when no feed) | ≥60% (or partial schema) | Below |
| `policies` | 8 | Shipping AND returns/refund policies discoverable at stable URLs | One of the two | Neither |

## "Agent-buyable" (the headline binary)

A store counts as **agent-buyable** when ALL of:

1. `robots_ai_access` is not `fail` (AI agents may fetch the store),
2. an open, parseable product feed exists,
3. required-field coverage (title/image/price/description) averages ≥80%,
4. the platform has a native or partial agentic-checkout rail,
5. both shipping and returns policies are discoverable.

This is deliberately strict: it approximates the minimum a shopping agent needs to *find a product, trust its data, and hand off a compliant checkout*. A store can score a B and still not be agent-buyable (e.g. missing policies).

## Grades

A ≥85 · B 70–84 · C 55–69 · D 40–54 · F <40.

## Known limitations (v0.1)

- **Enrollment is not verified** (see principle 2). A Shopify store scored `pass` on `checkout_rail` may still have agentic surfaces toggled off in its admin.
- **One product page is sampled** for schema checks — a store with inconsistent per-template schema may over/under-score by a few points.
- **Path-level robots rules are ignored**; only root blocks count.
- **Currency correctness isn't validated**, only machine-readability.
- **Region eligibility** (protocol rollouts are US-led as of mid-2026) is out of scope.
- Feed sampling caps at 100 products; very large catalogs are scored on that sample.
- **Stores without an open feed get no product-page sample in v0.1** (the product URL comes from the feed), so their page-level schema is reported as unverified — never claimed absent. Sitemap-based product-URL discovery is planned for v0.2.

## Versioning

The rubric is versioned (`rubricVersion` in every result). Checks, weights, and thresholds only change with a version bump and a changelog entry here. Comparing scores across rubric versions is invalid.

- **v0.1** (2026-07-23) — initial public rubric.

## Maintained by

[Arenza](https://arenza.ai) — the AI-commerce measurement company. ACS covers the *prerequisite* side (can agents technically buy from you); Arenza's platform measures the *outcome* side — whether AI assistants actually recommend, cite, and sell your products — and prescribes + verifies fixes. Issues and PRs against this rubric are welcome; scoring changes require a version bump.
