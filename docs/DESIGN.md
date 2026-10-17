# DESIGN.md — the "Arena" look

The site's design direction ("Arena", chosen 2026-10-17): dark-capable, a left sidebar, no
page-level scrolling, and the chat one button away on every page. This file holds the rules;
the values live in `client/src/styles/tokens.css`, the single source of tokens.

## Tokens

Components use custom properties only; no component hard-codes a colour. Light is the default
set on `:root`; `:root[data-theme='dark']` replaces the colours.

| Token                     | Light     | Dark      | Use                                             |
| ------------------------- | --------- | --------- | ----------------------------------------------- |
| `--color-background`      | `#f4f6f9` | `#0b0e13` | behind everything (main column)                 |
| `--color-sidebar`         | `#ffffff` | `#0f131a` | sidebar / top bar                               |
| `--color-surface`         | `#ffffff` | `#151a22` | cards, panels, the chat drawer                  |
| `--color-surface-2`       | `#f1f3f6` | `#1c222c` | inset areas inside a surface                    |
| `--color-active-bg`       | `#eaf6fe` | `#1c2532` | the active navigation item                      |
| `--color-text`            | `#12161c` | `#eef1f5` | body text                                       |
| `--color-text-muted`      | `#56606c` | `#a1aab6` | secondary text                                  |
| `--color-border`          | `#e2e6ec` | `#252c38` | hairlines                                       |
| `--color-border-strong`   | `#b8bec7` | `#4a5466` | field outlines                                  |
| `--color-danger`          | `#b42318` | `#ff8a80` | errors                                          |
| `--color-success`         | `#1d7a46` | `#4acb8a` | confirmations                                   |
| `--color-warning-surface` | `#fff4d6` | `#3a2e10` | the staff 2FA banner                            |
| `--shadow-raised`         | soft      | deeper    | drawers, the chat button                        |
| `--color-on-season`       | `#12161c` | `#12161c` | icons/text on a season colour (9.2:1 on autumn) |

Season colours (`--color-spring/summer/autumn/winter`) are the same in both themes. Dark values
were chosen so every text colour keeps WCAG AA (4.5:1) on every surface of its set: lowest pairs
are muted text on the active background (dark 6.57:1) and success on surface-2 (light 4.81:1).

Shape: `--radius` 12px for controls, `--radius-card` 20px for cards, `--hit-target` 44px for the
smallest clickable control.

## Theme logic

1. A **stored choice** (`localStorage` key `se.theme`, `light` or `dark`) wins.
2. Otherwise the **system setting** (`prefers-color-scheme`), followed **live** while nothing is
   stored.
3. The toggle flips light/dark and stores the choice.

Every storage access is in `try/catch` (`client/src/app/storage.js`): with storage blocked the
site follows the system setting and the toggle still works for the visit.

**No flash of the wrong theme**: `client/public/theme-init.js` is a small external script loaded
synchronously in `index.html`'s `<head>` (the strict CSP forbids inline scripts, and it stays
strict). It sets `data-theme` on `<html>` before the first paint; `color-scheme` (in the tokens)
makes form controls and scrollbars match. React then takes over (`client/src/theme/`): one
`ThemeProvider` keeps `<html data-theme>` in step for every toggle. `theme.test.jsx` checks
that the early script and the module resolve the same theme in every case.
