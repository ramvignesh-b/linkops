---
description: Log a course-correction to docs/decisions/ai-collaboration.md
---

Append an entry to `docs/decisions/ai-collaboration.md` recording a course-correction.

Context from the user (may be empty — if so, use the most recent exchange in this conversation): $ARGUMENTS

## Steps

1. Read `docs/decisions/ai-collaboration.md` to get the next entry number and match the existing format.
2. Identify the correction being logged. If `$ARGUMENTS` is empty, use the most recent point in this conversation where the user rejected, reversed or amended a proposal of yours.
3. Determine the direction:
   - **`Human → AI`** — the user overrode you. These are what README §12 asks for.
   - **`AI → AI`** — you corrected your own earlier output after verifying a fact.
4. Append an entry using the existing heading shape:

```markdown
### NN — <short title, what changed>

**YYYY-MM-DD · `<direction>` · <area>**

<What was proposed, stated fairly — the strongest version of the original reasoning, not a strawman.>

**Overridden.** / **Resolution:** <what replaced it, and the reasoning. Name the principle at stake where there is one.>

**Consequence:** <only if something downstream actually changed>
```

5. Confirm to the user in one line which entry number was written.

## Rules

- Do not editorialise in the tool's favour. If the user's override was right, the entry should read that way.
- One entry per correction. Don't bundle several into one entry to make the log look tidier.
- If the correction turns out to invalidate something already written elsewhere in the repo — a plan, an ADR, a doc — say so in your reply. Don't silently fix it.
- Never log a correction the user didn't actually make. An empty log is better than a padded one, and the assignment asks the candidate to defend every line.
