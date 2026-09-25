# modular-software-factory

## Quick install

**Claude Code:**

```
/plugin marketplace add seretos-agents/modular-software-factory
/plugin install <plugin-name>@modular-software-factory
```

The agent fetches the plugin from its own repo at the version pinned here.

## What's inside

The full list of plugins is in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) (Claude Code) and [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) (Codex). Both registries describe the same plugins in the format each host expects. Each entry points at its own repository, where the plugin's own README explains what it does and how to use it.

## Alternative installs

If your agent doesn't support marketplaces yet, install any plugin directly from its own repo:

1. Open `.claude-plugin/marketplace.json` and find the plugin entry.
2. Note the `source.repo` and `source.ref`.
3. Follow the install instructions in that plugin's README.

For a one-off install of a specific version without touching the marketplace:

```
/plugin install <owner>/<repo>@<ref>
```

## How plugins get added

Plugin repos publish via GitHub `repository_dispatch` → CI opens a PR against this repo (see [AGENTS.md](AGENTS.md)) → a maintainer reviews and merges → the registry entry is live. Hand-curated PRs are also welcome.

## Status

This registry starts empty — it replaces the old `Seretos/agent-marketplace`, but its existing entries have not been migrated over yet (deliberately, as a separate follow-up). App downloads and a GitHub Pages catalog site, both part of the old marketplace, are also out of scope for now.
