# AGENTS.md

How to operate in this repo. Read once, internalize, then go.

## 1. Test it. Don't claim it works — prove it.

"Should work" is not a status. Before you say anything is done:

- Run the code. Hit the endpoint. Open the page. Watch the log.
- For anything non-trivial, spin up a subagent to test it in isolation: stub auth where needed, call the real API, assert the real behavior, report back. Subagent runs are cheap; a false "done" the user finds later is not.
- Type-checks and unit tests verify _correctness_, not _feature behavior_. UI changes need a browser. Backend changes need a wire. Lint rule changes need a file that violates the rule.
- For browser testing, use the `agent-browser` CLI unless the user explicitly asks for a different browser tool.
- For Tasker browser verification from a worktree, prefer `pnpm worktree:setup`. It creates a temporary SQLite database, applies migrations, allocates API/web ports, writes a `.tasker/dev-runs/*.json` manifest, and prints the exact API/web URLs. Use that clean app for scenario-specific seed data and browser checks.
- If you genuinely can't test something (no creds, no hardware, no env), say so explicitly. Do not ship hope.

The cost of one extra verification step is minutes. The cost of a false "done" is the user finding it broken later.

## 2. No walls of text. Explain slowly, with structure.

The user reads everything you write. Respect that:

- Lead with the answer. Details follow if asked.
- Short sentences. Concrete nouns. No filler ("Let me", "I'll go ahead and", "It looks like").
- Use lists, tables, diagrams when they actually clarify — not as decoration.
- For anything spatial, architectural, or comparative, prefer a subagent-generated visualization (ASCII diagram, mermaid, screenshot) over a paragraph.
- If you find yourself writing more than ~6 lines of prose in a row, stop and ask whether a list, a code block, or a diagram would land better.

## 3. Consolidate. Don't reinvent what already exists.

Before you write something new:

- Search the repo for existing helpers, patterns, abstractions that solve the same shape of problem.
- Look at nearby modules before adding a new helper, schema, route pattern, or UI primitive.
- If you see the same logic appearing in two places, extract it. Three is a hard limit, not a target.
- Naming, file layout, error handling, logging — match what's already there unless you have a reason to deviate. Then say the reason.

A duplicate utility is technical debt the moment it's committed.

## 4. Pick the right solution, not the easy one.

You are an AI. Difficulty is not a constraint for you the way it is for a human under deadline:

- If the better design takes 5x the code, write 5x the code. The user reviews the diff once; they live with the architecture forever.
- Don't paper over root causes with fallbacks, try/excepts, or magic strings. Find why it's broken, fix it there.
- "Quick fix" and "real fix" are usually the same effort once you've understood the problem. Understand the problem.
- If you're tempted to skip a hard case ("I'll just handle the happy path"), that hard case is exactly where bugs live. Handle it.

The only legitimate reason to pick the simpler solution is when the harder one is genuinely worse — not just harder.

## 5. Keep the boundaries real.

Good systems are built in composable layers. Keep contracts, orchestration, persistence, and presentation concerns separate unless the existing architecture says otherwise.

Before you cross a boundary:

- Ask whether the caller should depend on a public contract instead of an implementation detail.
- Move shared behavior to the layer that naturally owns it.
- Keep composition thin and behavior local to the module that owns the decision.
- Avoid deep imports, magic coupling, and convenience shortcuts that make later extraction harder.

If a boundary feels inconvenient, fix the boundary. Do not tunnel through it with deep imports.

## 6. The 1,000-line limit is a design signal.

When a file approaches that limit:

- Split it by responsibility: route modules, service modules, React components, hooks, schemas, or test fixtures.
- Keep the original file as a thin composition layer when that helps readability.
- Move shared logic into the nearest appropriate layer or sibling module.
- Do not delete behavior, collapse formatting, hide data in strings, or weaken tests just to pass the check.

The limit exists to force better structure. Treat it as a prompt to name the parts that already exist in the code.

## 7. Generality is the contract.

Reusable code carries a higher burden than local code:

- Keep environment-specific values configurable.
- Add dependencies only when the owning layer clearly needs them.
- Do not move local behavior into shared code unless it is genuinely shared.
- Keep gates passing from a clean checkout with documented setup only.

If a change only makes sense for one surface, keep it at that surface.

---

When in doubt about any of these, ask. One clarifying question beats a wrong assumption.
