# modular-software-factory

Metadata only — no plugin source, no binaries, no build pipeline live here. Claude Code (and other compatible agent CLIs) read this repo when a user runs `/plugin marketplace add seretos-agents/modular-software-factory`.

## Layout

```
.claude-plugin/marketplace.json   # the plugin registry, single source of truth
.agents/plugins/marketplace.json  # Codex's mirror of the same plugins
.github/workflows/
  update-registry.yml             # thin receiver: repository_dispatch -> shared action, mode: pr
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
- **GitHub Pages catalog site.** The old marketplace deployed a static `site/` to Pages; this will be rebuilt separately later.
- **The [Agent Plugins 1.0](https://agent-plugins.org/) open standard** as a third registry format. Worth adding once the sender-side payload contract is extended for it.
- **Updating the sender templates** in `agent-plugins` (the three scaffolds that currently `repository_dispatch` to `Seretos/agent-marketplace`) to point at this repo and staging. A separate, later step.
