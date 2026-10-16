# HomeTiles Korean Edition: working notes and handoff

Fork of [GalusPeres/HomeTiles](https://github.com/GalusPeres/HomeTiles) (MIT) that adds
Hangul text rendering for the **GUITION ESP32-4848S040** office panel. These notes cover
the plan, the status and the next steps, so work can resume in a new session.

Last updated: 2026-10-15.

## Why

The stock firmware fonts (Inter, LVGL bitmap fonts compiled into the firmware) cover
Latin, Latin-1, Latin Extended-A, punctuation, € and (as a fallback) Cyrillic. They have
no Hangul, so Korean media titles from Home Assistant show as blanks. Fonts cannot be
pushed from HA; they have to be in the firmware.

## Design decisions

| Topic | Decision |
|---|---|
| Font | **Noto Sans KR Regular** (SIL OFL: redistribution and conversion are allowed). KoPub World Dotum was rejected because its terms restrict modification. |
| Glyph set | 2,350 KS X 1001 Hangul syllables + compatibility jamo U+3131–318E + U+3000–3003, U+300C–300F + every Hangul syllable/jamo used in `src/core/i18n/i18n.cpp` (the generator scans the file, so the Korean UI is always 100 % covered) |
| Sizes | 12, 14, 16, 20, 24, 28 px, 4 bpp, compressed (`LV_USE_FONT_COMPRESSED 1`) |
| Wiring | LVGL 9 `fallback` chain: Inter → (Cyrillic for 14/16/20/24) → `ui_font_korean_N`. 12 and 28 → Korean directly; 20_semibold → korean_20. `tools/apply-korean-fallback.mjs` is idempotent so it survives upstream font regeneration. |
| Flash budget | App slot 0x680000 = 6.5 MB; stock 4848 bin = 4.45 MB → about 2 MB headroom. Target Korean data ≤ about 1.6 MB. |
| Board | Build matrix trimmed to `guition_esp32_4848s040` only |
| Versioning | Tags `vX.Y.Z-ko`; `FW_VERSION` in version.txt must equal the tag. The firmware's `parseVersion()` ignores the `-ko` suffix, so OTA compares correctly. |
| OTA | `src/core/firmware/github_update.h` `kRepoUrl` → `https://github.com/the2ndday/HomeTiles` (the panel's "update from GitHub" pulls fork releases) |
| Web installer | GitHub Pages at **https://the2ndday.github.io/HomeTiles/installer/** (project-site subpath). `release-helper/prepare-web-installer.mjs` REPOSITORY comes from env, defaulting to the fork. |
| Upstream sync | `.github/workflows/sync-upstream.yml`, daily + manual: rebase `main` onto the newest upstream `vX.Y.Z` tag → re-apply fallback → set FW_VERSION `vX.Y.Z-ko` → push → tag → `gh workflow run firmware.yml --ref <tag>` (a tag pushed with GITHUB_TOKEN does not trigger workflows, but workflow_dispatch does). On a rebase conflict it opens an issue and fails. |

## Status

- [x] Fork created: https://github.com/the2ndday/HomeTiles; local clone `~/src/HomeTiles` (remotes: `origin` = fork, `upstream` = GalusPeres)
- [x] DeepSeek job `dsw_mvabkppm_6wg05j` implemented tasks 1–5 below (5/5 checks passed); host-reviewed. Korean font data is about 1.05 MB of compressed bitmaps (2,453 glyphs × 6 sizes), so the expected firmware is about 5.65 MB of 6.5 MB. Host fix: sync-upstream uses a local `merge=ours` rule for `version.txt` and `src/fonts/ui_font_*.c` so FW_VERSION bumps and upstream font regenerations don't stop every sync (both are re-applied by the workflow).
  1. `tools/generate-korean-fonts.mjs` + `tools/apply-korean-fallback.mjs`, generated `src/fonts/ui_font_korean_*.c`, `ui_fonts.h` declarations, OFL license file, `tools/lib/lvgl-host.mjs` whitelist
  2. Fork self-references: kRepoUrl, prepare-web-installer REPOSITORY, mkdocs `site_url`/`repo_url`, README + docs/index.md note
  3. version.txt `FW_VERSION "v0.9.1-ko"`
  4. firmware.yml matrix trimmed to 4848
  5. sync-upstream.yml; docs.yml gets workflow_dispatch, a neutral git identity, and works under the subpath
- [x] Host review of the diff (check the font data size, the wiring and the workflows)
- [x] Commit to `main`, push to origin
- [x] Repo settings: Actions enabled on the fork; **Settings → Pages → Deploy from branch `gh-pages`** (created by docs.yml on first run); Actions "Read and write" workflow permissions
- [x] Tag `v0.9.1-ko` (or `gh workflow run firmware.yml --ref v0.9.1-ko`) → CI builds → release `hometiles_v0.9.1-ko_guition_esp32_4848s040.bin` (5.76 MiB update bin, 16.00 MiB factory bin, plus icon files)
- [x] Fix `tools/lib/docs-browser.mjs` (`Page.reload` `loadEventFired` synchronization + offline `--host-resolver-rules` + transient context-navigation handling) so `Deploy docs` (`test-docs-serial-navigation.mjs`) passes reliably in CI
- [ ] First flash: Chrome → installer (fork Pages URL, or upstream installer "Local .bin") → device **Guition ESP32-4848S040C_I** → mode **Update** (keeps settings). The serial port is `/dev/ttyUSB0` (CH340); the user is in group `uucp`.
- [ ] Verify Korean on the panel: the PC page Media tile shows `media_player.alicia` titles (YouTube Korean titles) and Korean UI language ("한국어") in Settings → Language
- [x] Committed `4feb6a08`, pushed; Actions enabled (write perms); tag `v0.9.1-ko` pushed → runs "Firmware builds" 38840341373 (succeeded) + "Deploy docs" (re-triggered with `docs-browser.mjs` fix). After docs succeeds: enable Pages (`gh api -X POST repos/the2ndday/HomeTiles/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'`).
- [x] **Korean UI language** ("ko", "한국어") implemented on top of English. `src/core/i18n/i18n.cpp` now has `kStringsKo` (636 fields, all translated from `kStringsEn` with matching printf placeholders) and `kLocaleKo` (locale profile: 24-hour time, YYYY/MM/DD, `"{m} {d}일"` short date, `"{M} {d}일"` long date, Korean weekday/month names, timezone, climate/cover/binary-sensor/device/editable/entity-picker labels), both registered in `kLanguages[]`. Contract strings: `settings_link_direct_fmt` = `"직접 연결 · Bridge %s"`, `settings_link_mqtt_fmt` = `"MQTT · Broker %s"`, `settings_update_short` = `"업데이트"`, binary sensor ranges stay `"24H"`/`"7D"`, the welcome text `"환영!\n스와이프로 이동"` fits the Text tile's 31 bytes. `tools/generate-korean-fonts.mjs` scans `i18n.cpp` for Hangul and adds any missing syllables/jamo to the glyph set (the translation uses only KS X 1001 syllables, so the fonts keep 2,452 glyphs; the .c files were regenerated with the updated Opts note). Tests and `tools/settings-preview.mjs` accept Korean (`kStringsKo`/`kLocaleKo`, `--lang=ko`, 5 languages). (DeepSeek `dsw_mvacxcmi_75eaxg` complex_reasoning; host reviewed the translation quality.)
- [ ] Optional: suggest upstream (GitHub issue/PR) adding optional CJK fallback fonts

## Useful commands

```sh
cd ~/src/HomeTiles
node tools/generate-korean-fonts.mjs      # download font, regenerate Korean fonts, wire fallbacks
node tools/apply-korean-fallback.mjs      # wiring only (idempotent)
gh workflow run sync-upstream.yml         # force an upstream sync now
gh workflow run firmware.yml --ref v0.9.1-ko
gh run list --limit 5
```

## Related Home Assistant setup (outside this repo)

- Panel: 10.10.0.208, HA integration `tab5_lvgl` (HomeTiles Bridge). Notes in the Claude memory
  `hometiles-office-panel.md`.
- `media_player.alicia` = HACS *Media player template*, defined in HA
  `/config/packages/alicia_media_player.yaml` (backup `configuration.yaml.bak-20261015-media`),
  fed by Go Hass Agent script sensors on the PC (`~/.config/go-hass-agent/scripts/now_playing.py`)
  and agent buttons (`~/.local/bin/media-ctl`).
