<!-- 
PR Title format: `type: subject` (scope-free, summarizing the ticket as a whole)
-->

## Overview
<!-- Provide a short overview of the PR. -->

## What changed
<!-- State clearly what was implemented, fixed, or modified in this PR. -->


## Reasoning
<!-- 
Explain the *why*, architectural trade-offs, root causes, and any non-obvious context.
Remember our documentation voice rules:
- Justify every decision in product and engineering terms.
- Never invent product facts or constraints (e.g., bandwidth budgets, memory ceilings) to justify a decision.
- Never replace a true reason with a better-sounding one. 
-->


## Verification
<!-- Provide evidence of how these changes were tested and verified. -->


## Checklist
- [ ] PR title is scope-free and follows `type: subject` format.
- [ ] Commits follow `type(scope): subject` (scopes: `domain`, `server`, `console` per ADR-0009).
- [ ] If diff spans multiple axes, commits are split one per axis in dependency order.
- [ ] Commit bodies contain natural, narrative prose explaining the reasoning.
- [ ] No synthetic bot comments or fabricated constraints.

<!-- 
Append `Closes #N` on the final line below to auto-link and resolve the GitHub issue.
Note: If this PR bundles multiple commits for one ticket, only the LAST commit should have `Closes #N` (earlier commits use `Refs #N`).
-->
