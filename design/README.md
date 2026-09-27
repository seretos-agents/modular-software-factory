# Design reference — read before implementing any page ticket

`mockup.html` is a **visual and structural reference only**. It is the
Claude-artifact mockup for the Modular Software Factory GitHub Pages site,
with its `<script>` block removed on purpose.

## What this file is

- Full `<head>`, Google Fonts links, and the complete `<style>` block
  (CSS custom properties, color tokens for light/dark, layout, breakpoints).
- The full HTML skeleton for both pages: the sticky nav/header with the
  "The System" and "Plugins" tabs, the System page (hero, animated
  process-line board placeholders, stats section), and the Plugins page
  (hero/install box, search + category/tag filters, plugin grid, detail
  modal markup).

## What was deliberately removed

- **All JavaScript.** The original mockup's `<script>` block drove tab
  switching, the animated board/timeline, stats rendering, plugin catalog
  filtering, the plugin detail modal, and hash-based routing. None of that
  logic is here. This is intentional: implementing agents must design and
  write their own interactivity, state handling, and data-fetching code
  rather than porting the mockup's script wholesale.
- Any content that only existed inside that script (copy, sample data,
  computed values) is **not** in this file. Where a ticket needs that
  content, it is spelled out in the ticket body as prose/acceptance
  criteria, sourced from the mockup, by whoever wrote the ticket — not
  left for the implementing agent to reverse-engineer from a script that
  no longer exists.

## What implementing agents should do with it

- Treat the CSS variables, classes, and markup structure as the design
  system to match (colors, spacing, type, component shapes) — do not
  invent new visual language.
- Empty containers (e.g. `#board`, `#kstrip`, `#plist`, `#pmodal`) mark
  where dynamic content mounts; the ticket text describes what goes in
  them and how it behaves.
- Do not copy this file into the shipped site verbatim — extract the
  relevant markup/CSS for the page or component the ticket covers, and
  build the real implementation (including any needed JS) from scratch.
