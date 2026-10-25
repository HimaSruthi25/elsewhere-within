# Live wallpaper: manual test checklist

`ElsewhereWallpaper.exe` (preview). Run from `%LOCALAPPDATA%\Programs\ElsewhereWithin` after
`screensaver\deploy.ps1`, or from `screensaver\out`. Log: `%LOCALAPPDATA%\ElsewhereWithin\wallpaper.log`.

Automated first: `powershell -ExecutionPolicy Bypass -File wallpaper\test.ps1` (decision logic) and
`npm run test:library` (page side). Everything below needs a real desktop.

| # | Do | Expect | Pass |
|---|---|---|---|
| 1 | Start `ElsewhereWallpaper.exe` | A scene appears behind the desktop icons within a few seconds; tray icon (two rings) near the clock; log says `attached: ...` and `page loaded ... ok` | |
| 2 | Look at the icons and taskbar | Icons are drawn on top of the scene, readable; taskbar unchanged | |
| 3 | Rainy Window: press the left button on bare desktop over the glass and drag | A clear trail is wiped through the mist; **no blue selection rectangle**; trail mists over again after a while | |
| 4 | Left-click an icon | Icon highlights as usual; nothing is wiped; log has no `desktop press` line for it | |
| 5 | Double-click an icon (a folder) | It opens normally | |
| 6 | Click and drag **from an icon** onto the desktop | The icon moves like normal (drag and drop works) | |
| 7 | Right-click bare desktop, then an icon | The usual context menus appear | |
| 8 | Click empty desktop, press F5, Ctrl+A | Keyboard works as normal (selects all icons, refreshes) | |
| 9 | Click a normal app window and the taskbar | Nothing is forwarded to the scene (log shows no new `desktop press`) | |
| 10 | Maximise any app (e.g. Notepad) | Log: `paused ...`; Task Manager: CPU ~0 for the wallpaper. Restore/close it: `resumed ...` and the scene moves again | |
| 11 | Play a video or game full screen | Same as 10 | |
| 12 | Windows key + L (lock), then unlock | `screen locked: paused` then `resumed` | |
| 13 | Turn on Battery saver (Settings > System > Power) | Pauses within ~2 s; off again: resumes | |
| 14 | Tray: pick another scene | Scene changes on all monitors; remembered after a restart | |
| 15 | Tray: Pause | Scene stops; desktop behaves normally again (selection rectangle works); Resume restores it | |
| 16 | Tray: tick **Start with Windows**, sign out and in | It starts by itself | |
| 17 | Tray: untick **Start with Windows** | The Run key value `ElsewhereWallpaper` is gone | |
| 18 | Tray: **Quit** | Scene disappears and your normal wallpaper shows; process ends; mouse behaves normally | |
| 19 | Kill it in Task Manager | Your normal wallpaper returns; no stuck mouse behaviour | |
| 20 | Task Manager: CPU/GPU while idle on the desktop | Low (a few percent at most); about 30 fps | |
| 21 | Two monitors (if you have them) | One window each; dragging works on each; a fullscreen app on one monitor pauses only that one | |
| 22 | Change resolution / plug a monitor in or out | Windows rebuild by themselves within ~2 s | |
| 23 | Restart Explorer (Task Manager > Windows Explorer > Restart) | The scene comes back by itself (`Explorer restarted` in the log) | |
| 24 | Installer (separate machine or after a backup): run `ElsewhereWithin-Setup.exe` | Asks "Also install the live wallpaper?". No = no wallpaper files. Yes = tray app starts, Start menu entry exists | |
| 25 | Uninstall from Settings > Apps | Wallpaper stops, files, Start menu entry and the `Run` value are removed | |

Note: while it is running, a left press on bare desktop is swallowed (that is what stops the
selection rectangle), so you cannot rubber-band select icons. Pause it from the tray for that.