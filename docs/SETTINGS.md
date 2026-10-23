# SETTINGS.md — site settings admins change without code changes

Admin → Settings (`/admin/settings`) lists every site setting in its group. A setting's default
is the site's usual behaviour, so nothing changes until an admin changes it (decided
2026-10-23).

## How settings work

- **Where**: each group's settings are defined in `server/src/settings/groups/<group>.js`,
  gathered by `definitions.js`: kind, label, one-line explanation, unit, default and the rules a
  value must meet, with the reason for each bound beside it.
- **Kinds** (`server/src/settings/types.js`): on/off, whole number (from a minimum to a maximum,
  both included), short text (one line, at most a length, optionally a rule of its own) and a
  choice from a list.
- **Who**: admins only, with 2FA like every admin route (`/api/admin/settings`). Every change is
  audited (`setting.change`, with the old and the new value).
- **When**: a value is read at its use and kept in memory per database; a change drops it, so it
  takes effect at the next use, without a restart (`server/src/settings/store.js`).
- **Stored**: only changed values, as text in `site_settings`. Nothing else is stored there by
  this mechanism; the approved embedding sites and the weekly recap's last week share the table
  under their own keys.
- **The page**: one section per group (Chat, Other sites, Calls, Accounts, Home, Weekly recap,
  Site banner; empty groups are left out), one card per setting with its explanation, bounds and
  default, saved on its own (`client/src/admin/AdminSettingsPage.jsx`, `SettingForm.jsx`).

## The settings

| Group | Setting (key)                                           | Kind         | Default | Bounds | Effect                                                                         |
| ----- | ------------------------------------------------------- | ------------ | ------- | ------ | ------------------------------------------------------------------------------ |
| Calls | Speakers on stage at most (`calls.maxSpeakers`)         | whole number | 10      | 1–25   | how many can speak at once in one call                                         |
| Calls | Participants per call at most (`calls.maxParticipants`) | whole number | 250     | 2–1000 | speakers and listeners together; the call service's UDP range is sized for 250 |
