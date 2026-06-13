# AGENTS.md

How to operate in this repo. Read once, internalize, then go.

## 1. Test it. Don't claim it works — prove it.

"Should work" is not a status. Before you say anything is done:

- Run the code. Hit the endpoint. Open the page. Watch the log.
- For anything non-trivial, spin up a subagent to test it in isolation: stub auth where needed, call the real API, assert the real behavior, report back. Subagent runs are cheap; a false "done" the user finds later is not.
- Type-checks and unit tests verify _correctness_, not _feature behavior_. UI changes need a browser. Backend changes need a wire. Lint rule changes need a file that violates the rule.
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
- Look at sibling templates here (`frontend/`, `go-backend/`, `python-backend/`) and the source repos they were distilled from (`~/Projects/factorbacktest`, `~/Projects/holocron`, `~/Projects/friday`) — patterns we've already validated.
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

## 5. Generality is the contract.

This repo is templates, not apps. Anything you put in a template ships into every project that starts from it:

- No app-specific names, brands, URLs, ports, or business logic. If a value is a sensible default, make it overridable (env var, config, prop). If it isn't, leave it out.
- Add dependencies only when there's a concrete reason every consuming app will want them. "Nice to have" belongs in the README as a recommendation, not in `package.json` / `go.mod` / `requirements.txt`.
- A new pattern earns its place by being the second project to need it, not the first. Distill from real apps; don't speculate.
- Every template's gates (`lint`, `typecheck`, `build`, `test`) must pass on a clean clone with no manual setup beyond `install`. CI-equivalent on the user's laptop, every time.

If a change only makes sense for one downstream app, it doesn't belong here — push it back to that app.

---

When in doubt about any of these, ask. One clarifying question beats a wrong assumption.
