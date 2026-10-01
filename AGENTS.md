# modular-software-factory

No plugin source, no plugin binaries live here — Claude Code (and other compatible agent CLIs) read this repo's marketplace registry when a user runs `/plugin marketplace add seretos-agents/modular-software-factory`. The repo does host one small build/test pipeline of its own: the static GitHub Pages site under `site/` (see "GitHub Pages site" below).

## Layout

```
.claude-plugin/marketplace.json   # the plugin registry, single source of truth
.agents/plugins/marketplace.json  # Codex's mirror of the same plugins
.github/ISSUE_TEMPLATE/           # shared ecosystem issue forms (bug/feature/task/epic)
.github/workflows/
  update-registry.yml             # thin receiver: repository_dispatch -> shared action, mode: pr
  ci.yml                          # runs `npm test` on every PR
  deploy-pages.yml                # builds and deploys site/ to GitHub Pages
design/                           # Pages-site design reference (see "GitHub Pages site")
site/                             # the GitHub Pages site's source (plain HTML/CSS/JS)
package.json                      # test tooling for site/ only (jsdom + node --test)
README.md                         # user-facing
AGENTS.md                         # this file
```

The upsert / commit / PR logic itself is **not** implemented here — it's shared with the staging marketplace and lives once in [`modular-software-factory-dev`](https://github.com/seretos-agents/modular-software-factory-dev)'s `.github/actions/update-registry`. This repo's `update-registry.yml` just forwards the `repository_dispatch` payload to that action with `mode: pr`.

## Two marketplaces, one shared action

- **This repo (main):** `mode: pr` — a registered plugin opens a review PR; nothing is published without a human merging it.
- **[modular-software-factory-staging](https://github.com/seretos-agents/modular-software-factory-staging):** `mode: direct` — a registered plugin is committed straight to `main`, no review gate.

Both repos' `update-registry.yml` are near-identical thin wrappers; only the `mode` (and, for staging, the omission of `pull-requests: write`) differs. See the shared action's `action.yml` for the full upsert/commit/PR contract (schema, `icon`/`description_url`/`tags`/`changelog` semantics, idempotency).

## marketplace.json schema

Each plugin entry uses Claude Code's **object** source format:

```json
{
  "name": "some-plugin",
  "description": "...",
  "source": {
    "source": "github",
    "repo":   "seretos-agents/some-plugin",
    "ref":    "v0.0.1"
  },
  "category": "mcp",
  "version": "0.0.1"
}
```

- `source.ref` points at the plugin's git tag. `version` and `source.ref` are kept in lockstep by the shared action (`ref = v{version}` unless the dispatch overrides it).
- A **bare string** source is **not** accepted by Claude Code — it interprets strings as local relative paths only. The object form is required for any remote git plugin.
- `icon`, `description_url`, `tags` are optional, catalog-only, gradual-rollout fields — Claude registry only, never written to `.agents/plugins/marketplace.json`. See the shared action's `action.yml` for the exact preserve-on-omit rules.

## How entries get added

```
plugin repo, release.yml after a successful build:
  POST /repos/seretos-agents/modular-software-factory/dispatches
  event_type: plugin-release
  client_payload: { name, repo, version, category, description, icon?, description_url?, tags?, changelog? }

this repo, update-registry.yml triggered by repository_dispatch:
  forwards the payload to seretos-agents/modular-software-factory-dev's
  update-registry action with mode: pr
    1. patches .claude-plugin/marketplace.json and .agents/plugins/marketplace.json
    2. force-pushes branch plugin-update/{name}-v{version}
    3. opens a PR if one isn't already open (changelog rendered into the body)

human review + merge -> entry is live
```

Manual PRs against `.claude-plugin/marketplace.json` are equally valid for hand-curated entries.

## GitHub repo settings that matter

- `secrets.ECOSYSTEM_TOKEN` must exist and carry `repo` scope. It authenticates every write in the shared action -- both `gh pr create` and the plain `git push` (via `actions/checkout`'s `token:` input) -- so the "Allow GitHub Actions to create and approve pull requests" setting that a GITHUB_TOKEN-based PR flow needs does **not** apply here: the PR is created as the PAT's identity, not as `github-actions[bot]`.
- `update-registry.yml` still declares `permissions.pull-requests: write` and `permissions.contents: write` at the job level as least-privilege documentation, even though the actual writes go through the PAT, not the job's own GITHUB_TOKEN.

## Deliberately out of scope (for now)

- **Migrating the old `Seretos/agent-marketplace` entries.** Both new registries start empty. A separate follow-up.
- **App registry** (`app-marketplace.json`, `app-release` dispatch). The old marketplace tracked downloadable apps separately; not needed here yet.
- **The [Agent Plugins 1.0](https://agent-plugins.org/) open standard** as a third registry format. Worth adding once the sender-side payload contract is extended for it.
- **Updating the sender templates** in `agent-plugins` (the three scaffolds that currently `repository_dispatch` to `Seretos/agent-marketplace`) to point at this repo and staging. A separate, later step.

## GitHub Pages site

`site/` is deployed to `https://seretos-agents.github.io/modular-software-factory/` by `deploy-pages.yml` (push to `main` touching `site/**`, or manual `workflow_dispatch`). It is a plain HTML/CSS/JS static site, no framework, no build step.

`design/mockup.html` (+ `design/README.md`) is the site's design reference: the original mockup's HTML/CSS with all JavaScript stripped out on purpose. Match its layout, colors and structure when extending the site — but write new interactivity from scratch rather than porting logic from elsewhere; the point of stripping the script was to force that.

`ci.yml` runs `npm test` (Node's built-in test runner + jsdom, see `site/*.test.js`) on every pull request only — it never runs on `push` or `workflow_dispatch`, so it can't gate anything other than a PR review.

Currently shipped: the sticky header with the two top-level tabs ("The System" / "Plugins", switching via URL hash) and a DE/EN language switcher, plus the left column of each tab's hero (headline, pitch, two CTAs). Translation lives in `site/i18n.js`: one flat dictionary per language (`MESSAGES`), elements tagged `data-i18n="<key>"` (English copy stays inline as the no-JS fallback; a test keeps it equal to `MESSAGES.en`), the choice persisted in `localStorage` (`msf-lang`). New translatable strings: add the key to both dictionaries and tag the element. The Plugins hero's right column is the install panel (`#hostbox`): a host switcher (Claude Code / Codex) showing the marketplace-add and plugin-install commands with copy buttons. Hosts are data — add one by adding an entry to the `HOSTS` array in `site/hosts.js` (`id`, `label`, `addCommand`, `installCommand`, optional `note` i18n key); its labels live in `site/i18n.js` (`install.*` keys). Still future work: the System hero's right-hand panel, the process-line board and the plugin catalog.
