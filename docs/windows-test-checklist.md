# Windows test checklist — Elsewhere, Within screensaver

Use this for every build before calling it "working". Copy the results table into
`docs/test-runs/YYYY-MM-DD.md`, fill it in, and commit it.

**Diagnostics snapshot** (read-only; writes `diagnostics\EW-diagnostics.txt`, which Claude can read):

    cd <your project folder>\diagnostics
    powershell -ExecutionPolicy Bypass -File .\ew-diagnose.ps1

Run it where a step says **[snap]**. Tell Claude after each snapshot (the file is overwritten each time).

**Rule:** the run must END with the screensaver installed and selected. Never finish on an uninstall.

---

## Before you start
- Close meeting, screen-share and video tabs (they can keep the PC "awake").
- Note: build/installer SHA-256 (from `build-installer.ps1` output or `Get-FileHash release\ElsewhereWithin-Setup.exe`).
- Settings > System > Power: note "Turn off screen after" and "Sleep after" (if shorter than the Wait time, they win).

## Steps

| # | Do this | Expected | How we know |
|---|---|---|---|
| 1 | Run `release\ElsewhereWithin-Setup.exe`, click Yes/OK | Installs without admin; Screen Saver Settings opens with the default scene (**Elsewhere - Rainy Window**) selected | Dialog shows it; Apps lists "Elsewhere, Within screensaver" |
| 2 | In Settings: Wait = **1** min, click **Preview** | Lake appears full screen | Log: `start /s` |
| 3 | Move the mouse | Preview closes at once | Log: `exit: mouse moved …` |
| 4 | Click **OK**. Don't touch anything for 90 s | Lake appears by itself after ~60 s; water moves | Log: `start /s`, `page loaded: ok`, `status: water animating` |
| 5 | Press a key | Closes at once, back to desktop | Log: `exit: keyboard…` |
| 6 | Wait 90 s again, then **click** | Starts again; closes on click | Log: second `start /s`, `exit:` |
| 7 | Wait 90 s again, then nudge mouse **~2 px** | Keeps running (jitter ignored) | No `exit` for the nudge |
| 8 | Move mouse properly | Closes | Log: `exit: mouse moved` |
| 9 | **[snap]** | Selected = Elsewhere - <scene>, Wait 60 s, log shows steps 2–8 | Claude reads the report |
| 10 | Press **Win+L** (lock), wait 90 s, observe, unlock | *Observe only* — record what shows on the lock screen | Notes |
| 11 | In a terminal run `diagnostics\ew-perf.ps1 -Minutes 12`, then leave the PC idle ~11 min, then dismiss | Screensaver runs ~10 min; CPU/RAM recorded as a baseline (no target yet) | `diagnostics\EW-perf.csv` |
| 12 | Settings > Apps > "Elsewhere, Within screensaver" > Uninstall | Removed; Screen Saver goes back to (None); Start-menu entry gone | Screen Saver Settings shows (None) |
| 13 | **[snap]** | No install folder, no Apps entry, `SCRNSAVE.EXE` empty | Claude reads the report |
| 14 | Reinstall (repeat step 1), Wait = 1 min, OK | Installed and selected again | Dialog |
| 15 | Wait 90 s | Starts by itself | Log: `start /s` |
| 16 | **[snap]** — final state | Installed + selected | Claude reads the report |

## Results template

    # Test run YYYY-MM-DD
    Build: installer SHA-256 ……  | Windows build ……  | Tester: 
    Power: screen off after …… / sleep after ……

    | # | Result (pass/fail/observed) | Notes |
    |---|---|---|
    | 1 | | |
    | … | | |
    | 16 | | |

    Defects found:
    -
