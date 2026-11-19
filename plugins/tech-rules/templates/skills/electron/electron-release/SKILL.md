---
name: electron-release
description: "Build, package and release an Electron app on a CI runner from a release job that already works, instead of designing one fresh. Use when: creating or changing a release, package or deploy workflow of an Electron app; touching the electron-builder config, a package or release script, the version source, an installer or the auto-update setup; writing or changing a test that runs against the packaged or installed app; planning the first release of an Electron app; a package or release job is red on the runner and green locally. DO NOT USE FOR: which test belongs in which lane (test-gates); driving the app for screenshots and flows (ui-verify); main/preload/renderer layering (electron-arch); server or container deployments."
---

<!-- tech-rules:managed <tech-rules-version> -->

# Electron release

A release job is the one piece of a project that cannot be tried on the machine it is written on.
It runs on a clean runner: no `node_modules`, no downloaded Electron binary, no logged-in desktop,
`CI=true`, and a token in the environment. Every one of those differences is invisible locally,
and each one costs a red release when it is found there.

Measured: four Electron apps of one owner, four release pipelines built by hand. The fourth took
five merges into the release branch to ship its first version - four red runs, one cause each.
Three of the four causes were already solved in the other three apps, two of them with a comment
that names the trap. Nobody had opened those files. The pipeline's other half, a server
deployment, had been copied from a working one and was green on its first run.

So the first rule is not about Electron at all.

## Rule 1 - start from a release job that works

Nothing in a release workflow is designed fresh. Before the first line:

1. **Find the reference**, in this order: a release or package workflow this repository already
   has; one in a sibling project that releases an Electron app (ask the user which, or look next
   to this repository: `../*/.github/workflows/`, `../*/electron-builder.yml`); the skeleton below.
2. **Read it completely**, comments included - the comments are where the earlier red runs are
   written down - together with the files it calls (the composite action, the package and release
   scripts, the builder config).
3. **Copy it, then change only what this project needs.** Write every difference down with its
   reason - in the story, the pull request or a comment at the changed line. A difference without
   a reason is a guess.
4. **Check the result against the trap table below**, line by line. It is the list of what the
   reference already paid for.

A reference that is two versions old still beats a fresh design: its traps are the same.

## Rule 2 - every job starts with the same two steps

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: ./.github/actions/setup-node-electron   # Node, npm ci, the Electron binary
```

`.github/actions/setup-node-electron/action.yml` is a one-time file `/tech-rules:setup` offers
(Node from the version file with the npm cache, `npm ci`, then the Electron binary from a
version-keyed cache; `electron: 'false'` for a job that never starts or packages the app,
`directory` for an app in a subfolder). **No step that runs project code comes before it** - not
a "read the version" one-liner, not a notes script: on the runner the script's first `import` of
a dependency fails, and locally it never does.

## Rule 3 - publishing has exactly one owner

Either the workflow publishes (`gh release create` with the built files) or electron-builder
does. Never both, and never "whoever notices the token first":

- **The workflow publishes** (the usual shape): every `electron-builder` call carries
  `--publish never`. With an auto-updater the `publish:` block stays in the builder config - it
  is what makes electron-builder write `latest.yml` and `app-update.yml` - and the flag keeps it
  from uploading. Without an updater: `publish: null` in the config and no block at all.
- The step that publishes is the only step that gets the token, and it is the last one.
- An unsigned app sets `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` on every packaging step.

## The skeleton

For a project with no reference. Triggers, the version source and the script names (`package`,
`test:package`, `release.mjs`) are the project's; the order of the steps is not.

```yaml
name: release

on:
  push:
    branches: [main]          # or workflow_dispatch only, when a release is always started by hand
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Build and smoke-test, but do not tag or publish'
        type: boolean
        default: false

permissions:
  contents: write

# A release that is running finishes: cancelling it can leave a tag without assets.
concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    runs-on: windows-latest   # the NSIS installer needs Windows
    timeout-minutes: 40
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0                 # only when the version comes from tags or history
          ref: ${{ github.ref_name }}    # only when the job pushes a release commit

      - uses: ./.github/actions/setup-node-electron

      - name: Resolve the version, once
        id: plan
        shell: bash
        run: echo "version=$(node scripts/release.mjs --print-version)" >> "$GITHUB_OUTPUT"

      - name: Package
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
        run: npm run package             # ... electron-builder --win --publish never

      - name: Packaged launch smoke
        run: npm run test:package

      - name: Publish
        if: inputs.dry_run != true
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
          VERSION: ${{ steps.plan.outputs.version }}
        run: gh release create "v$VERSION" --title "$VERSION" --target "$GITHUB_SHA" release/"$VERSION"/*
```

`dry_run` is a button on the workflow's page, pressed by a person. It is never wired to a pull
request or a push: a project that wants the package built on every pull request decides that in
its lane map (`test-gates`), not here.

## The traps

Each row has been a red run on a runner while the same commit was green on the developer's
machine. Read a new or changed job against all of them.

| # | Trap | What the runner does | Rule |
| --- | --- | --- | --- |
| T1 | A step runs a project script before the job's `npm ci` | The script's `import` of a dependency fails (`ERR_MODULE_NOT_FOUND`); locally `node_modules` is always there | Rule 2: checkout, the setup action, then everything else |
| T2 | electron-builder runs under CI without `--publish never` | It turns publishing on by itself. With a token in the environment it tries to upload and looks for the repository on its own ("Implicit publishing triggered by CI detection"); without one it stops with "GitHub Personal Access Token is not set" | Rule 3 |
| T3 | Something expects `node_modules/electron/dist/` after `npm ci` | `electron` has no postinstall (seen with 43 and 45): the binary arrives on the first `require('electron')`. A fixed path finds nothing; parallel test files race for the download ("Electron failed to install correctly") | The setup action installs it once; code resolves the binary through `require('electron')`, never through a path |
| T4 | A test asks the desktop instead of the file | `app.getFileIcon` returned the generic icon for the app's exe: a runner has no icon cache and no interactive session | Read what is in the file (the exe's icon resources, the installer's contents). No blocking test depends on shell icons, thumbnails, file associations or a default browser |
| T5 | The artifact name contains a space | electron-builder writes the name with `-` into `latest.yml`, `gh release create` uploads the real name, GitHub turns the space into `.`: the updater asks for a file no asset answers to | `artifactName` without spaces, set explicitly: disk, `latest.yml` and the release asset are one string |
| T6 | The version is derived in two places | The tag says one version, the asset names another | Resolve it once (a plan step or job) and pass it on; a second job builds "at the planned version" |
| T7 | The release pushes a commit to the release branch and the work branch never gets it | The next pull request is checked on the merge: the plan refuses ("tag already exists"), notes land under the shipped version | The last release step fast-forwards the work branch to the release commit, or warns when it cannot |
| T8 | A test compares a temp path as text | The runner's `TEMP` is an 8.3 short path (`C:\Users\RUNNER~1\...`) | Compare real paths (`fs.realpathSync`), on both sides |
| T9 | The job pushes from the default checkout | A push event checks out a detached commit; the release commit cannot be pushed, and a plan that reads tags sees none | `ref: ${{ github.ref_name }}` and `fetch-depth: 0` on the checkout of a job that pushes or reads history |
| T10 | Two workflows release from one repository | Two pushes to the release branch at once; or a second lane's GitHub release becomes "latest" and every installed app's update check fails on its missing `latest.yml` | One concurrency group for every workflow that pushes, `cancel-in-progress: false`; only the app's lane creates GitHub releases |
| T11 | A local check removes the token to be safe | T2 with a token present is then never seen before the release | The builder is told not to publish in the project (rule 3), so the token's presence cannot change the build |

## Before the first release

The first run of a release job happens on a machine it has never seen. There is no local proof
for it - a green local package run answers none of T1 to T4. What there is:

- the reference it was copied from, and the list of differences (rule 1);
- the trap table, read against every job and every script the job calls;
- the workflow's own `dry_run`, if the project has one and the user chooses to press it.

Say which of these stand behind a release job when someone asks whether the release will go
through. "The package builds locally" is not one of them.

## When a package or release job is red on the runner

1. **Classify it against the table first.** A row that fits: apply its rule, and look at the
   other rows before the next run - red runs come one cause at a time, and each costs a merge.
2. **No row fits:** find the difference between the runner and the machine (a file a clean
   checkout lacks, an environment variable, a session, a version), fix the cause, and give it a
   guard where one is cheap (a test that reads the workflow or the config).
3. **Then tell the user it is a new row for this table.** The fix in this project helps this
   project; the row in the rule set (`tech-rules`, skill `electron-release`) is what the next
   project gets. Do not add it to this installed copy.

## Enforcement

This skill enforces nothing. What a project can make binding, each as a small test that reads a
file:

- **Workflow order:** in every job, the setup action (or `npm ci`) comes before the first step
  that runs `node`, `npm run` or `npx`.
- **One publisher:** every `electron-builder` invocation in `package.json` and the scripts has
  `--publish never`, or the builder config has `publish: null`.
- **No fixed Electron path:** no source or test file contains `node_modules/electron/dist`.

## Review checklist

- [ ] The workflow names the reference it was built from, and every difference has a reason.
- [ ] Every job: checkout, the setup action, then the first project command.
- [ ] Every `electron-builder` call has `--publish never` (or the config `publish: null`); the
      token is on the publishing step only.
- [ ] The version is resolved once; artifact names carry no space.
- [ ] No packaged-app test asks the shell or reads a fixed path under `node_modules/electron`.
- [ ] A job that pushes checks out the branch with history; every pushing workflow shares one
      concurrency group.
- [ ] A dry run, if there is one, is started by hand only.
