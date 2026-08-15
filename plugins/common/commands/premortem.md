---
description: Imagine the plan has already failed, then work backward to the causes, the early warning signs and the preventions.
argument-hint: [what is being attempted, or a path to the plan]
---

# Pre-Mortem Analysis

Imagine the plan has completely failed, then work backward to identify what went wrong and how
to prevent it.

## Step 0 - get the plan in front of you

A pre-mortem on a plan you had to guess at is worthless. Before writing anything, establish what
is actually being attempted:

1. If `$ARGUMENTS` names a file (a concept, a spec, an ADR, a sprint plan), read it. If it names
   a directory, read the documents in it that describe intent, not implementation.
2. If `$ARGUMENTS` is prose, take it as the plan and look for the artefacts it implies - the
   feature docs, the deployment script, the migration, the issue.
3. If `$ARGUMENTS` is empty, use the plan from this conversation. If there is none, ask what the
   initiative is and stop; do not invent one.
4. Then check the plan against the repository: does the code it assumes exist? Are the
   dependencies, deploy path and data stores what the plan thinks they are? Note every mismatch -
   these are usually the strongest failure causes you will find.

State the plan and its success criteria back in three sentences before continuing. If you cannot
name a success criterion, say so - a plan without one is already the first finding.

## Instructions

Set the scene: "It's [timeframe] in the future. This initiative was a complete disaster. Looking
back, what happened?"

Generate failure scenarios without filtering for likelihood - get everything on the table first,
then prioritize.

### Output Format

**The Plan**
Summarize what's being attempted and the success criteria.

**Time Jump**
"It's [X months] later. This has failed completely. The outcome: [describe the disaster vividly]."

**What Went Wrong**

Generate 8-12 plausible failure causes across categories:

| Category    | Failure Mode  | How It Played Out  |
| ----------- | ------------- | ------------------ |
| Execution   | [What failed] | [The story of how] |
| External    | [What failed] | [The story of how] |
| People      | [What failed] | [The story of how] |
| Technical   | [What failed] | [The story of how] |
| Assumptions | [What failed] | [The story of how] |

**Risk Prioritization**

| Failure Mode | Likelihood   | Impact       | Priority |
| ------------ | ------------ | ------------ | -------- |
| ...          | High/Med/Low | High/Med/Low | 1-5      |

**Top 3 Risks & Mitigations**

For each top risk:

- **Risk**: [Description]
- **Early Warning Signs**: What would indicate this is happening?
- **Prevention**: How to reduce likelihood
- **Mitigation**: How to reduce impact if it occurs
- **Owner**: Who's responsible for watching this?

**Pre-Mortem Insights**
What did this exercise reveal that wasn't obvious before?

**Revised Confidence**
After this analysis, how confident are you in success? What would increase confidence?

## Guidelines

- Be vivid and specific - "the database corrupted" not "something went wrong"
- Include uncomfortable possibilities (key person leaves, competitor moves, we were wrong)
- Don't filter for "that won't happen" - the point is to surface hidden concerns
- Assign real owners to mitigations
- Look for single points of failure
- Prefer failure causes you found in step 0 over ones you can imagine. A mismatch between the
  plan and the repository is evidence; a generic risk is filler.

$ARGUMENTS
