# Sleeper AI Team Manager Product Plan

## Product Direction

Build a self-hosted fantasy football assistant that starts with Sleeper and grows into an AI-first team manager. The product should help with drafts, lineup decisions, waiver planning, roster construction, trade thinking, and weekly strategy.

The product is not a paid SaaS clone and should not depend on browser scraping for the MVP. It should run locally, use Sleeper's free read-only API first, and keep AI integrations behind a backend provider boundary.

## Core Principle

The AI should be the primary manager experience. Deterministic code should prepare context, enforce safety, perform repeatable calculations, and catch obvious mistakes. It should not try to fully replace model judgment with a handcrafted fantasy football optimizer.

This means:

- AI explains recommendations, asks clarifying questions, compares options, and plans strategy.
- The backend gathers Sleeper state, projections, rankings, roster settings, injury flags, schedules, and historical decisions into compact context.
- Deterministic scoring provides guardrails such as projected points, roster gaps, positional scarcity, bye conflicts, ADP value, and risk flags.
- The UI exposes both the AI answer and the supporting evidence so decisions are inspectable.

## Target User

Primary user: one fantasy football manager who uses Sleeper and wants a private, local assistant rather than another subscription draft or lineup product.

The user wants:

- live draft help during Sleeper drafts;
- weekly start/sit and lineup advice;
- waiver and free-agent planning;
- roster diagnosis;
- trade analysis;
- natural-language Q&A over league/team context;
- control over data sources and AI providers.

## Product Shape

Start as a standalone local web app:

- local frontend in browser;
- local backend that talks to Sleeper and AI providers;
- SQLite cache for Sleeper data, imported rankings/projections, user decisions, and AI context snapshots;
- no Chrome extension/userscript for MVP.

An overlay or extension can come later if the local app works and the only remaining pain is convenience inside Sleeper's UI.

## MVP: Sleeper Live Draft Assistant

The first useful product is a live Sleeper draft room companion.

MVP capabilities:

- connect by Sleeper username, league ID, or draft ID;
- load league settings, draft settings, rosters, users, draft order, picks, traded picks, and player metadata;
- cache Sleeper player map locally and refresh it sparingly;
- poll live draft picks;
- identify the user's roster and upcoming picks;
- ingest/import a rankings or projections file;
- maintain available player pool;
- show AI-generated pick recommendations with evidence;
- answer draft questions such as:
  - "Who should I take here?"
  - "What positions can I wait on?"
  - "Compare these three players."
  - "What is my roster missing?"
  - "What is likely to make it back to me?"
  - "Should I reach for a QB/TE here?"
- produce a short draft recap after each pick.

MVP non-goals:

- making picks on Sleeper;
- scraping Sleeper's web UI;
- supporting ESPN/Yahoo/NFL.com;
- fully automating team management;
- paid SaaS deployment;
- relying on OpenAI API billing as the only AI option.

## Expansion: Weekly Team Manager

After the draft MVP, expand into weekly management:

- lineup setting assistant;
- bench and flex comparisons;
- waiver-wire recommendations;
- drop candidate analysis;
- bye-week and injury planning;
- trade analyzer;
- weekly matchup summary;
- rest-of-season roster plan;
- post-week review of decisions and misses.

Some of these require data beyond Sleeper:

- projections;
- injury/news data;
- depth charts;
- schedule strength;
- betting lines or implied totals;
- expert rankings;
- historical usage.

The system should allow manual imports first, then add optional provider adapters later.

## AI-First Management Model

The assistant should operate like an analyst with tools:

1. Collect current context.
2. Compute deterministic signals.
3. Build a concise AI context packet.
4. Ask the AI for recommendation, rationale, uncertainty, and alternatives.
5. Render the answer with the supporting signals.
6. Record the user's decision for later review.

AI output should be structured where possible:

- recommendation;
- confidence;
- top alternatives;
- evidence bullets;
- risks;
- what would change the decision;
- suggested next action.

The model can reason over messy tradeoffs better than a handcrafted algorithm, but the app should still make the model's inputs visible and reproducible.

## Trust And Safety

The product should avoid pretending it has certainty it does not have.

Every recommendation should distinguish:

- known Sleeper facts;
- imported projection/ranking facts;
- deterministic calculations;
- AI inference;
- missing data or assumptions.

For now, all actions are advisory. The user manually acts in Sleeper.

## Success Criteria

Draft MVP is successful when:

- the app can follow a live Sleeper draft without manual refresh;
- it can generate useful recommendations within pick-clock timing;
- it can explain recommendations with visible context;
- it keeps working if AI is disabled by showing deterministic signals;
- AI provider failures do not break draft tracking;
- the app can be run locally from a fresh checkout.

