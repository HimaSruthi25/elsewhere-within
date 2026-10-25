# Elsewhere, Within: Windows screensaver host

A small C# window hosting Microsoft WebView2 that shows one scene from `library/`.
Silent, and it never uses the microphone.

| Path | What it is |
|---|---|
| `ElsewhereWithin.cs` | The screensaver program. One copy per scene, named `Elsewhere - <Scene title>.scr`; it finds its scene from its own file name in `site\scenes.json`. |
| `build.ps1` | Builds `library/` into `out\site`, compiles the program and writes one `.scr` per scene into `out\`. |
| `build-installer.ps1` | Packs `out\` into `release\ElsewhereWithin-Setup.exe` (`installer\Setup.cs`). |
| `deploy.ps1` | Quick update while developing: builds and copies into the installed folder without changing the selected screensaver. |
| `version-source.ps1` | Writes `Version.g.cs` from `package.json`'s version; every program is compiled with it. |
| `../updater/` | `ElsewhereUpdate.exe`: the daily update check (the only part that uses the network). |
| `install.ps1` / `uninstall.ps1` | Developer install without the installer. |
| `web/` | The earlier screensaver page (the lake). Kept for reference; no longer built. |
| `lib/`, `out/` | Build outputs (not in git). `lib/` holds Microsoft's WebView2 DLLs, downloaded by `build.ps1` with a pinned version and hash. |

Run the scripts from the project folder, for example
`powershell -ExecutionPolicy Bypass -File screensaver\build.ps1`. You need Node/npm
and the C# compiler that comes with Windows.

Host contract: the host loads `https://elsewhere-within.example/index.html?scene=<id>`
(a private local address mapped to the `site` folder, with all network access
blocked), closes on any input, and waits at most 0.7 s for the page to send
`exit: ...` after the page's goodbye animation.

The log is `%LOCALAPPDATA%\ElsewhereWithin\screensaver.log`.