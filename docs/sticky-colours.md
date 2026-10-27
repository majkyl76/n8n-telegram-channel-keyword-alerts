# Sticky note colour numbers

The Sticky Note node (`n8n-nodes-base.stickyNote`) stores `color` as a number. The editor
renders each number with the CSS class `sticky-color-<n>`, which maps to a background variant.

Evidence from the installed editor build
`/workspace/n8n-local/node_modules/n8n-editor-ui/dist/assets/app-CU_fYePl.css`:

```
.sticky-color-1 { --sticky--color--background: var(--sticky--color--background--variant-1) }  /* variant-1: var(--color--yellow-...) */
.sticky-color-2 { ... variant-2: var(--color--gold-...) }
.sticky-color-3 { ... variant-3: var(--color--red-...) }
.sticky-color-4 { ... variant-4: var(--color--green-...) }
.sticky-color-5 { ... variant-5: var(--color--blue-...) }
.sticky-color-6 { ... variant-6: var(--color--purple-...) }
.sticky-color-7 { ... variant-7: var(--color--neutral-...) }
```

The Sticky Note node definition
`/workspace/n8n-local/node_modules/n8n-nodes-base/dist/nodes/StickyNote/StickyNote.node.js`
sets the default colour `#FFD233` (yellow) with `default: 1`.

Colour numbers used in this template:

- **1 = yellow** (variant-1). The one main overview sticky.
- **3 = red** (variant-3). The single warning sticky on the Telegram node.
- **7 = white/neutral** (variant-7, neutral background). The white section stickies.
