# Design reference: SE style (owner approved 2026-10-20)

Reference mockups for SE-REDESIGN-1. They are design-canvas sources, not site code:
the markup between `<x-dc>` tags is HTML with inline styles; `{{t.*}}` values are the
light/dark tokens defined in each file's `renderVals()` script at the bottom.

**Historical** (noted 2026-10-23): the mockups stay as approved and are not edited. The site has
moved on in two places: headings use Luxora Grotesk Bold (weight 700, `--font-weight-heading`)
instead of the mockups' 900 since 2026-10-21, and no page uses "best buy" wording (the mockups'
"Which season is the best buy today?") since 2026-10-23. docs/DESIGN.md is the current state.

- `StyleBlocks2.dc.html` — home, light
- `StyleBlocks2Dark.dc.html` — home, dark (same file, dark by default)
- `StyleSubpages.dc.html` — Games / Events / Chat / Calls, light (page switched by the `page` value)
- `StyleSubpagesDark.dc.html` — the same, dark

Image references (`/_blob/<id>`) map to these files:

| blob id | image |
|---|---|
| 6739952da0c2eedbf425239afa33e01f | logo emblem (the round four-quarter part, without lettering) |
| 3ae1e6204d61b61f0717bd16c3d6370d | logo quarter top-left: controller (Games, featured game) |
| 55d394202480898b9929b67e9ca0e304 | logo quarter top-right: circle of people (Chat, Community) |
| 92880af55dddce3f7003bc94ddb9c4cf | logo quarter bottom-left: football + basketball (Events, Up next) |
| debf0ace13d2b5e396c1723d1b578809 | logo quarter bottom-right: play button with sound waves (Calls) |
| 1d4ba3317079ca76c847b5e5b9bf4759 | Spring icon |
| 4e21fc91cd4a97b2c085762340791287 | Summer icon |
| 3fc12c7f497c7ec428af4c2c780626a5 | Autumn icon |
| 37a26c8126ca6626883042b5dbbbc3a9 | Winter icon |
| 8e6d69bf29e996eb895154571ee130b5 | placeholder game image (Seasonal Race card) |
| a2400192…, 1ab8a0de…, 379c050c…, f9b2a633… | Luxora font weights 400/500/700/900 |

Source of the logo: the owner's file `C:\Users\weudl\OneDrive\Seasonal Token\Seasonal Entertainment logo.png`
(1254×1254, transparent background). Crop boxes in that file's pixels:
emblem = (0, 0, 1254, 1000) trimmed to content; quarters: top-left (0, 0, 620, 537),
top-right (632, 0, 1254, 537), bottom-left (0, 545, 620, 1000), bottom-right (632, 545, 1254, 1000),
each trimmed to content.
