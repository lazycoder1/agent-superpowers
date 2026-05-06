# Customizing the palette

The default palette is 6 semantic slots × 2 themes = 12 named colors, in `assets/mermaid-client.ts` as the `lightPalette` and `darkPalette` constants. Each slot is `{ fill, stroke, text }`.

## Default mapping

| Slot | Light fill / stroke / text | Dark fill / stroke / text | Use for |
|---|---|---|---|
| `purple` | `#ece6fa` / `#6e5fc4` / `#2d2466` | `#3d3275` / `#7a6dd8` / `#e8e2ff` | sources, inputs, ingestion |
| `cream` | `#f5efd9` / `#a89065` / `#4d3f1f` | `#2a2418` / `#9d8c5e` / `#e8dfb8` | storage, data, wiki |
| `mint` | `#daf0e6` / `#3da882` / `#1a4a3a` | `#1a3d2f` / `#3da882` / `#dff2ea` | agents, success, verified |
| `peach` | `#f8dcb6` / `#c47138` / `#7a3e15` | `#5a3018` / `#d68c5e` / `#fde8d4` | output, bad, conflict |
| `blue` | `#d9e8f7` / `#4a78b5` / `#1f3a5e` | `#1a2a45` / `#4a78b5` / `#d9e8f7` | decisions, routing |
| `rose` | `#f9d9e2` / `#b85a78` / `#5e2a3a` | `#4a1f2f` / `#b85a78` / `#f9d9e2` | headings, highlights |
| `neutral` | `#ebebeb` / `#9da0a8` / `#343b58` | `#2a2a2a` / `#565f89` / `#c0caf5` | unknown class fallback |

## Class-name → slot map

Defined as `classNameToSlot` in the same file. Common semantic names already mapped:

- **purple**: `src`, `source`, `sources`, `input`, `ing`, `ingestion`, `new`
- **cream**: `store`, `storage`, `data`, `cache`, `db`, `wiki`, `old`, `field`
- **mint**: `agent`, `compute`, `success`, `good`, `pass`, `verified`, `approved`, `surf`, `has`, `out1`
- **peach**: `out`, `output`, `bad`, `error`, `fail`, `conflict`, `catch`, `warn`, `miss`, `out3`
- **blue**: `decision`, `judge`, `route`, `branch`, `rec`, `bsys`, `out2`, `out4`
- **rose**: `heading`, `title`, `highlight`, `important`

Any class name not in the map falls back to `neutral` (a desaturated grey) — visible enough to spot in QA, neutral enough to not break the diagram.

## Adding a new semantic class

Two changes in `assets/mermaid-client.ts`:

1. Add the class name → slot entry:
```ts
const classNameToSlot = {
  ...
  myNewClass: "purple",
};
```

2. If you need a brand-new slot (a 7th color), add it to `PaletteSlot`, `lightPalette`, and `darkPalette`. Pick light + dark variants that meet WCAG AA contrast against your text color.

## Replacing the whole palette

Edit the `lightPalette` and `darkPalette` constants directly. Keep the same structure (`{ fill, stroke, text }` per slot). Aim for:
- **Light variants**: pastel fills (~10-20% saturation), mid-tone borders, dark text
- **Dark variants**: deep saturated fills (~30-40% darker than the slot's hue), mid-tone borders, light text

## Replacing the base theme variables

The `lightTheme` and `darkTheme` objects at the top of `mermaid-client.ts` control everything that's NOT class-scoped: edge colors (`lineColor`), text on unclassed nodes (`textColor`), sequence-diagram colors (`actorBkg`/`signalColor`), timeline colors (`cScale0/1/2`).

Most users will only ever need to tweak `lineColor` (changes edge color) and `fontFamily` (which font mermaid labels use).
