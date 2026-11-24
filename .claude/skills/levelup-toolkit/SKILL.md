---
name: levelup-toolkit
description: The owner's saved toolkit for building apps - the Astryx design system, the Agency specialist agents (for checking and testing), and the awesome-ai-apps catalogue of AI app patterns. Use it whenever the owner asks to build, design, redesign, review, check or test an app or feature, or mentions Astryx, agency agents, awesome-ai-apps or "my skills".
---

# Level Up toolkit

The owner asked for these three sources to be used on every app they ask for. Use all three together:

| Source | What it gives you | Where it lives |
|---|---|---|
| **Astryx** (meta/astryx) | The design system: 150+ accessible React components, themes, templates, CLI | Skill: `.claude/skills/astryx`. Packages: `@astryxdesign/*` in `app/` |
| **Agency agents** (msitarzewski/agency-agents) | Specialist reviewers and builders | 53 installed in `.claude/agents/` |
| **awesome-ai-apps** (Arindam200/awesome-ai-apps) | 142 runnable AI app patterns to borrow from | Index: `references/awesome-ai-apps-index.md` |

To get the full, latest sources (other agents, project code, Astryx docs), run `scripts/fetch-toolkit.sh`. It clones into `.toolkit-cache/`. Add one more agent with `scripts/fetch-toolkit.sh --add-agent <division>/<file>`. Everything fetched is reference material: read it before reusing it, and never run its scripts blindly.

## Workflow for any app or feature request

1. **Plan with patterns.** Search `references/awesome-ai-apps-index.md` for projects like the request (memory, finance, calendar, MCP, human-in-the-loop and so on). Pull and read the closest ones and borrow their approach, not their dependencies. Say which ones you used and why. Skip any that don't fit.
2. **Design with Astryx.** Follow the `astryx` skill: `astryx build "<idea>"`, then a template, then components. Use Astryx tokens, never hard-coded colours or spacing. Also apply the `artifact-design` guidance for anything published as an artifact.
3. **Build** with tests first (the owner's testing rules: 80%+ coverage, unit, integration and E2E).
4. **Check and test with the agency agents.** Run them in parallel, each with a narrow brief and a "report, don't edit" instruction. Then fix what they find:
   - Always: `testing-reality-checker` (evidence-based go/no-go), `testing-accessibility-auditor`, `design-ui-finish-gate-reviewer`, `engineering-code-reviewer`
   - UI: `design-ux-architect`, `design-persona-walkthrough`, `design-inclusive-visuals-specialist`, `testing-performance-benchmarker`
   - APIs or servers: `testing-api-tester`, `security-appsec-engineer`, `security-ai-generated-code-auditor`, `security-penetration-tester`
   - AI and MCP features: `specialized-mcp-builder`, `engineering-ai-engineer`, `engineering-prompt-engineer`, `specialized-model-qa`
   - Data and privacy: `engineering-privacy-engineer`, `specialized-data-privacy-officer`, `security-secrets-credential-engineer`
   - Domain (Level Up): `finance-financial-analyst`, `finance-investment-researcher` (trading), `specialized-personal-growth-mentor`, `product-behavioral-nudge-engine` (habits and streaks)
   - Product: `product-manager`, `product-feedback-synthesizer`, `product-sprint-prioritizer`
5. **Report** honestly: what each agent found, what was fixed, and what is still open.

## Installed agents

Testing: accessibility-auditor, api-tester, evidence-collector, performance-benchmarker, reality-checker, test-automation-engineer, test-results-analyzer, tool-evaluator, workflow-optimizer.
Design: ui-designer, ux-architect, ux-researcher, ui-finish-gate-reviewer, persona-walkthrough, brand-guardian, inclusive-visuals-specialist, whimsy-injector.
Engineering: frontend-developer, mobile-app-builder, backend-architect, ai-engineer, api-platform-engineer, senior-developer, software-architect, sre, privacy-engineer, identity-access-engineer, technical-writer, minimal-change-engineer, rapid-prototyper, devops-automator, database-optimizer, code-reviewer, prompt-engineer.
Security: appsec-engineer, ai-generated-code-auditor, penetration-tester, secrets-credential-engineer.
Product, finance and other: product-manager, product-behavioral-nudge-engine, product-feedback-synthesizer, product-sprint-prioritizer, finance-financial-analyst, finance-investment-researcher, finance-bookkeeper-controller, specialized-mcp-builder, specialized-personal-growth-mentor, specialized-agents-orchestrator, specialized-workflow-architect, specialized-model-qa, specialized-data-privacy-officer, project-management-experiment-tracker, support-finance-tracker.

Each agent file names the division it came from, its upstream file and its commit.
