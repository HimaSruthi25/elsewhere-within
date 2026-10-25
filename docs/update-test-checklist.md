# Updater: manual test checklist

Automated: `powershell -ExecutionPolicy Bypass -File updater\test.ps1` (version rules, release
picking, URL allow-list, checksum parsing). The rest needs a real PC and a published release.

Log: `%LOCALAPPDATA%\ElsewhereWithin\update.log`. Task: `schtasks /Query /TN "ElsewhereWithin Update"`.

| # | Do | Expect | Pass |
|---|---|---|---|
| 1 | Install (or `screensaver\deploy.ps1`) | The task `ElsewhereWithin Update` exists (logon + daily 12:30), runs as you, hidden | |
| 2 | Run `ElsewhereUpdate.exe /now` while on the latest version | Log: `up to date (latest release ...)` | |
| 3 | Publish a newer tag (e.g. v0.1.1) and run `/now` | Log: newer release found, hash verified, installer started; then `[installer] installed version ...`; the scenes/wallpaper still work; the selected screensaver is the same one as before | |
| 4 | Settings (`/c`): untick "Check for updates automatically", OK; run `ElsewhereUpdate.exe` (no arguments) | Log: `automatic updates are off`; `/now` still checks | |
| 5 | Settings > "Check now" | Shows "You have the latest version." / "installing" / "Could not reach GitHub." | |
| 6 | Run `ElsewhereUpdate.exe` while a screensaver is showing | Log: `a screensaver is active` and nothing is downloaded | |
| 7 | Disconnect the network, run `/now` | Log: no connection; nothing broken; exit quietly | |
| 8 | Uninstall | The task is gone; `HKCU\Software\ElsewhereWithin` is gone | |