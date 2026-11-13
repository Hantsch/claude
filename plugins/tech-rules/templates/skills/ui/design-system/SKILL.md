---
name: design-system
description: "Build every user interface from the project's design system, and give a project one before its UI grows without it. Use when: creating or changing a screen, page, window, panel, dialog, form, list, menu, navigation or any visible component; writing or changing styles, colours, fonts, spacing, sizes or icons; showing text a user or an agent wrote; asking the user something in the UI (confirm, rename, discard); refining or planning a story that changes what the user sees; reviewing a UI diff or screenshots for consistency; a project has a UI but no design-system document, no tokens or no component kit. DO NOT USE FOR: backend, CLI or library code without a visual surface; generating images or icons (the project's art workflow); the Tailwind wiring of tokens (design-tokens)."
---

<!-- tech-rules:managed <tech-rules-version> -->

# Design System First

A screen is built from the project's design system while it is written, not made consistent
afterwards. The design system is the document that says how the product looks (tokens, components,
screen archetypes, states, voice) plus the code that implements it (a token block, a component kit)
plus a reference that shows it (a page, a story book, screenshots). This skill says how to use one
and how to start one. It is advisory, like every skill: what actually gates is the project's scan,
its kit-adoption test and the workflow's review (ai-scrum's `design-system` and `design-scan` keys).

Measured in one project: a component kit existed and was used by a handful of windows. Four sprints
later 35 files still styled their own buttons and inputs, the client used 17 font sizes and 60
hard-coded colours, 11 questions were browser popups, and three windows showed agents' answers as
raw Markdown. Nobody chose that: each implementer simply did not look for the kit, and the kit was
enforced only for the files a test happened to list.

## 1. Find it — before the first line of UI code

Look, cheaply and in this order, and stop at the first hit:

1. `design-system:` in `.claude/ai-scrum.md`; a design pointer in `CLAUDE.md`.
2. A design document: `docs/design/`, `docs/design-system*`, `DESIGN.md`, a `design` section in
   the docs index.
3. Code that is one: a token block (CSS custom properties, `tokens.*`, a Tailwind theme), a kit
   module or folder (`ui/kit.*`, `components/ui/`, `atoms/`), a Storybook or styleguide page.

Found → section 2. Nothing found, but the project has a UI → section 4, before building the screen.
A token block or a kit without a document is a design system without rules: use what is there
(section 2) and propose the document (section 4) in the same breath.

## 2. Build from it

Before writing the screen:

1. **Read what applies:** the token and component rules, the archetype the screen belongs to, and
   its reference screen. Name the archetype ("a reading window", "a settings form"). If none fits,
   stop and ask: a new archetype is a design decision, not an implementation detail.
2. **List need → component** for everything the screen shows or asks, using the design system's
   own map (a table of needs and components, if it has one). Write the list down in the
   deliverable or the plan; it is what the review compares against.
3. **A missing component goes into the kit first,** with its states, then the screen uses it. Never
   into the screen's own styles, never "just this once": the second screen copies the first.
4. **Values only through tokens.** No literal colour, font size, radius, shadow or font family
   outside the token block. A value the tokens lack is a new token or the nearest step, never a
   one-off.
5. **Text follows the voice rules** (address, wording, date and number format). Names of people
   and places come from the data, never from the code.

Done means, before you report it:

- **It looks like its reference.** Render the screen and the reference side by side at the widths
  the design system names (desktop and phone if the product runs on phones) and compare structure
  first (header, layout, where the actions sit), then details (sizes, spacing, states). If the
  screen cannot be rendered in this session, say so in the result instead of claiming it.
- **The scan is clean** where you worked: the design system's drift scan (if it has one) reports
  no hit in the lines you changed or added.
- **Enforcement includes it:** a file you reworked onto the kit joins the kit-adoption list or lint
  scope, so it cannot drift back.

## 3. Rules that hold unless the design system says otherwise

- **No own look for a kit control.** A screen never styles a button, input, select, textarea,
  table, tab or card itself and never shows a browser-default control; it adds layout only.
- **No browser dialogs.** `alert`, `confirm` and `prompt` are not the product's UI: a question
  before an action is the design system's dialog — the question as title, one sentence on what
  happens, buttons named by their verb ("Delete", never "OK"), cancel as the quiet one, the focus
  on cancel when the action is destructive.
- **Rich text through its component.** Text a user or an agent wrote — answers, results, reports,
  notes, files — is shown through the project's Markdown/rich-text component. Raw text with
  `white-space: pre-wrap` shows `**` and `##` on screen; that is always a finding.
- **One primary action per view.** Other actions are secondary or quiet; destructive ones wear the
  danger look and ask first.
- **Every state is designed:** empty (one sentence: what will appear and how to start it), loading,
  error at the field and for the whole view, disabled (and why), unsaved.
- **Selected means one thing per kind:** where am I (tab, navigation), which item is chosen (row),
  which menu is open — each with its own, documented look.
- **Navigation does not grow by itself.** A new feature joins an existing menu group or section;
  a new top-level entry is the product owner's decision.
- **Phone, if the product runs on one:** touch targets at least 44 px, nothing cut off or
  off-screen, no information only on hover.

## 4. No design system yet — start one before the UI grows

The direction is the user's decision; the inventory and the proposal are yours. Do not invent a
look silently and do not build the next screen ad hoc while waiting.

1. **Inventory, read-only.** List the screens and their files, the tokens and kit that exist, and
   count the drift: distinct colours, font sizes and radii in use, files with their own control
   styles, native controls, browser dialogs, raw rich text, mixed forms of address. If the app can
   run, screenshot every screen at desktop and phone width.
2. **Ask** (one question each, with a recommendation): keep the current look and unify it
   (recommended when there is a look worth keeping) or design a new one; where the reference lives
   — a dev-only page built from the real components (recommended: it cannot drift from the code),
   a design tool, or wireframes in the document.
3. **Write the document** (`docs/design/README.md` unless the project has a place), every rule with
   an id (`DS-T1`) and a status mark — in code, partly, planned:
   - decisions and how to use it (ids, marks, the checks)
   - tokens: colour roles, a type scale of five or six sizes, spacing, radius, borders and shadow,
     control and touch sizes, layers
   - components: the kit (builder → use), the planned parts (part → use → what it replaces), and
     the map need → component
   - screen archetypes: the shared chrome, then per archetype its use, desktop size, phone form and
     the screens that follow it
   - states; navigation and app states (menu structure and groups, phone navigation, online and
     offline if the product has them, and which feature runs where); icons; overlays
   - copy and voice; phone
   - open questions, and an inventory: screen → file → archetype → kit status → gaps
   A small product needs only tokens, the component map and one reference screen; grow it when a
   second archetype appears.
4. **Build the reference:** a dev-only page that is never part of the production build, renders the
   real components and one reference screen per archetype (desktop and phone), and opens each
   screen alone by URL so a review can screenshot it. Planned parts live there, marked as planned,
   until a story moves them into the kit.
5. **Add drift detection:** a scan for literal values, native controls, browser dialogs, raw rich
   text and the wrong address that prints its metrics, so each later review can say what improved.
   Wire it as the narrow gate where the workflow has one (ai-scrum: `design-scan`).
6. **Baseline review:** findings per screen with rule id, severity, cause (`file:line`) and fix,
   grouped into proposed stories, highest severity first.
7. **Point to it:** one line in `CLAUDE.md` where the project's truth is listed, and the profile
   key `design-system` if the project uses ai-scrum.

## 5. Review checklist

- [ ] The screen's archetype is named and the screen matches its reference (structure, then
      details), at desktop and phone width where the product has both
- [ ] Every need uses the component the design system names; no hand-built list, tab row, status
      word, empty line or modal box where one exists
- [ ] No own style for a kit control; no browser-default control
- [ ] No literal colour, size, radius or font outside the token block
- [ ] No `alert` / `confirm` / `prompt`; questions use the design system's dialog
- [ ] Text a user or an agent wrote goes through the rich-text component; no raw Markdown on screen
- [ ] One primary action; destructive actions ask first
- [ ] Empty, loading, error and disabled states exist and follow the rules
- [ ] Voice and wording follow the rules; names come from the data
- [ ] A new component went into the kit, and the reworked files joined its enforcement
- [ ] The drift scan has no hit in the changed lines
