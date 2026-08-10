# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Fantasy football managers who use Sleeper and want local, private help during a live draft and throughout the season. The primary user is a manager working under a short pick clock who needs a clear recommendation, grounded context, and the ability to challenge or redirect the AI. After the draft, the same manager uses the tool to manage weekly lineups, waivers, roster needs, and related decisions.

## Product Purpose

Sleeper Draft Assistant is a local-first AI fantasy football team manager. It reads Sleeper league, draft, pick, roster, and player data; accepts user-downloaded FantasyPros rankings and projections as grounding evidence; and gives contextual draft and team-management assistance. Success means a manager can connect a Sleeper league, prepare the data and AI provider once, understand the current situation quickly, and make informed decisions without the app pretending that imported evidence is certainty.

## Positioning

The product is AI-first rather than a rankings-only draft board. The AI owns strategy, comparisons, explanations, questions, and user-directed what-if analysis, while imported data and Sleeper state ground its reasoning. It runs locally with the user's ChatGPT/Codex subscription through a backend provider adapter, instead of requiring a paid SaaS account or OpenAI API billing for the first release.

## Operating Context

- Users connect by Sleeper username, league URL/ID, or draft ID and can use a synthetic demo draft for testing.
- Draft preparation asks the user to choose an AI path and import scoring-matched FantasyPros ECR, season projections, and ADP before entering the main workspace.
- During a live draft, the board refreshes from Sleeper, surfaces the current pick and team context, and keeps the AI conversation grounded in the latest board snapshot.
- The user can search the complete available-player pool, prioritize, deprioritize, or exclude players, provide strategy guidance, inspect other rosters, and ask the AI to compare or explain options.
- Team Manager is the post-draft workspace for weekly lineups, waivers, roster needs, activity, and season context. It uses user-provided rest-of-season rankings and weekly projections when available.

## Capabilities and Constraints

- Sleeper is the first and currently only supported fantasy platform.
- Sleeper integration is read-only. The app never submits picks, changes lineups, or modifies a Sleeper account.
- The application is local-first and single-user. The API binds to loopback and uses a per-launch capability token for non-health routes.
- The Electron shell preserves sandboxing, context isolation, navigation restrictions, and CSP protections.
- AI provider-specific behavior stays behind an `AiProvider` boundary. The Codex app-server path is experimental and local; future API-key providers must be swappable without moving provider logic into the renderer.
- Imported FantasyPros files are user-supplied and are not bundled or redistributed by the repository.
- The interface should stay clean, focused, scan-friendly, and progressively disclosed. Live-draft users should see the next useful action without being overwhelmed by every available tool.
- AI assistance must remain transparent about evidence, uncertainty, stale data, provider state, and unavailable upstream services.
- Standard, half-PPR, PPR, FLEX, and superflex roster construction are supported. Custom scoring and TE premium are limited; IDP, auction, and dedicated dynasty strategy are outside the current model.

## Brand Commitments

- Product name: Sleeper Draft Assistant.
- The product should feel like a focused draft room and team workspace: quiet, operational, confident, and information-dense without being noisy.
- Existing logo, dark theme, green readiness accent, blue AI/info accent, amber warning accent, and restrained rounded panel language are established visual commitments.
- Use the product's own language and keep important state visible: data readiness, AI availability, sync health, confidence, and user preferences.

## Evidence on Hand

- Sleeper read-only API data for users, leagues, drafts, picks, rosters, and players.
- User-downloaded FantasyPros ECR, season projection, ADP, rest-of-season, and weekly projection CSV exports.
- Synthetic demo draft data and browser-tested draft workflows in the repository.
- Existing UI implementation, design tokens, logo asset, component library, and screenshots in `apps/web` and `docs/images`.
- No bundled third-party rankings, testimonials, customer claims, or external performance guarantees.

## Product Principles

1. Ground AI in current Sleeper state and user-supplied evidence, while preserving the AI's ability to reason beyond a brittle local ranking.
2. Keep the manager in control: preferences, strategy guidance, and AI-proposed changes require clear user intent.
3. Optimize for the live decision: show the current situation, the next useful action, and uncertainty without forcing users through unnecessary panels.
4. Preserve local privacy and portability: provider communication and stored data remain on the user's machine unless the user explicitly uses an external service.
5. Design the draft and season workflows as connected phases, with Team Manager becoming the primary workspace after the draft.

## Accessibility & Inclusion

Use semantic controls, visible keyboard focus, meaningful accessible names, readable contrast, responsive layouts, reduced-motion support, and clear loading, empty, error, disabled, and stale-data states. Do not rely on color alone to communicate draft state, preference state, or confidence.
