# Revealed Thesis Engine: Challenge Decisions & Architecture

## Core Pitch
"Revealed Thesis: deal sourcing from what you actually invest in, not what you say you do."

## Primary User & Workflows
- **Primary User:** Sourcing analysts and associates at small European Seed to Series A funds (<10 people), plus partners/investors via a simplified rapid triage view.
- **Core Workflows:**
  1. **Deal Sourcing:** Enter a fund name (or 3 to 5 admired companies for new funds) to compute the revealed thesis and a ranked 10 to 20 startup shortlist.
  2. **Competitor / Market Intelligence:** Analyse any indexed European fund without login to compare website claims against actual deal history.
  3. **Warm Intro Pathfinding:** Surface co-investor links ("co-invested with Fund Z 3 times, Z led this startup's pre-seed") and an interactive capped relationship map (<=100 nodes).
  4. **Point-in-Time Backtesting:** Prove scoring quality by hiding the last 12 months of deals, stripping post-deal data, and measuring Top 15 / Top 50 recall.

## Architectural Guardrails
1. **Zero-Filter Layer 1 + Tactical Layer 2:** Compute deterministic 0 to 100 Suitability Scores from actual deal behaviour first; apply user filters or natural-language refinements afterward.
2. **Untapped Discovery Mode:** Prevent early startups without prior institutional co-investors from being buried by offering an Untapped Discovery weighting mode alongside Balanced Fit and Warmest Intro.
3. **Strict Fact-ID Grounding:** Every generated explanation references a verified Cala fact source ID. Coverage holes (private revenue, burn rate, individual cheque size, personal LinkedIn network) explicitly surface as `"Not found in Cala"`.
4. **Fast vs. Lazy On-Demand Pipeline:** Keep initial shortlist execution fast via pre-indexed European Seed to Series A data or structured endpoints (`Entity Search`, `Retrieve Entity`, `Query`), and load deep `Knowledge Search` briefs lazily on demand.
