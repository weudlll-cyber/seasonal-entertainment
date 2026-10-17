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

## Shell

`client/src/app/Layout.jsx`: the shell is exactly the viewport (`height: 100dvh`); `html`, `body`
and `#root` never scroll. Only the **main column** scrolls (`overflow: auto`) when its page is
taller. `client/e2e/layout.spec.js` checks this on every main page at 1440 x 900, 1280 x 720 and
1920 x 1080: nothing overflows the window, including content that would be clipped.

**From 760px wide** (the shell's one breakpoint): two columns.

1. **Sidebar**, 232px (`--sidebar-width`): logo with the "SEASONAL / ENTERTAINMENT" wordmark; nav
   items with stroke icons (Home, Games, Events, Chat, Seasonal Tokens = the info section); a
   divider and Admin for admins only (as before; `staffNavFor` in `navigation.js`); at the bottom
   the account card (initial, name, role, linking to /account) or, for guests, "Log in" and
   "Register", with the theme toggle; then the legal links (Imprint, Privacy). The active item
   has the active background, bold text and `aria-current="page"`.
2. **Main column**: the routed page.

**Below 760px**: the sidebar becomes a top bar (logo, theme toggle, menu button). The menu opens
the same navigation as a drawer from the left, over a scrim: closed by its close button, Escape,
the scrim, or following a link; focus moves into it and back to the menu button.

**Pages** sit on the background; their content blocks are cards (`--color-surface`, 20px radius):
forms, admin tables, info text, game cards, event days. Controls have a 12px radius and at least
the 44px hit target; keyboard focus always shows a ring in the accent colour.

**Home** is a bento grid that fits the main column at 1280 x 720 without scrolling: the greeting
(with the username when signed in), the featured game (the first game of the games data, a
"Coming soon" badge only when its status says so), "Up next" with the next two events
(`upcomingOccurrences`, shared), and Seasonal Tokens with the four season marks linking to the
info section. Real data only. Below 1000px the cards stack and the main column scrolls.

**Chat page**: the full chat fills the main column, rooms on its left; only the message list
scrolls and the composer stays at the bottom.
