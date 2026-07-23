# State of Agentic Commerce — datasets

Periodic Agentic Commerce Score scans of leading DTC storefronts. Human-readable
summary + per-store pages: <https://arenza.ai/agentic-commerce-score/report>.

## 2026-07 (rubric v0.2)

`state-of-agentic-commerce-2026-07.ndjson` — one JSON record per scanned domain
(the `ScanRecord` shape emitted by `scripts/scan-batch.ts`: full `ScoreResult`
minus the per-product sample array).

Headline numbers (Shopify-detected storefronts only):

- **955** unique candidate domains scanned · **857** Shopify storefronts detected
- **544 / 857 (63%) are agent-buyable** — more than 1 in 3 cannot complete a sale
  to an AI agent (machine-readable catalog + ≥80% required-field coverage +
  checkout rail + readable price/availability + verified policies with a stated
  return window + AI crawlers allowed)
- Mean score **84**, median **87**, sd 13.7 · grades: A 541 · B 236 · C 27 · D 31 · F 22
- **105 stores score a grade A and still miss the buyable bar** — one hard blocker is enough
- Widest gaps: `rating_schema` **73% fail** (n=806) · `product_identifiers` **43%**
  · `image_alt` 32% · `product_schema` 15% · `description_depth` 11%
- Why the 313 fail (overlapping): policies unverified or no stated return window
  (270) · price/availability unreadable (57) · no machine-readable catalog (51) ·
  robots.txt blocks AI crawlers (15)
- 50 stores with a closed feed were still scored from sitemap-discovered product
  pages (a v0.2 capability); 51 pillars are flagged `insufficientEvidence`
- llms.txt is near-universal on Shopify storefronts (91%) because the platform
  auto-serves an agent-instructions document — itself a 2026 finding

Candidate list provenance: [`candidate-sources-2026-07.md`](./candidate-sources-2026-07.md)
(public best-of-Shopify / DTC roundups + a canonical well-known-brand set; the
scan itself verifies platform, so non-Shopify candidates are excluded from the
headline stats).

Reproduce / rescan:

```bash
npm run build
node dist/scripts/scan-batch.js --input your-domains.txt --output rescan.ndjson
```

Scores are point-in-time (scanned 2026-07-23) and change as stores change.
Comparing scores across rubric versions is invalid — see [SCORE.md](../SCORE.md).
This dataset supersedes the v0.1 scan of the same 955 domains; v0.1 numbers are
not comparable (its 0-100 was dominated by a single feed-open/closed binary,
which is exactly what v0.2 fixes).
