// Tests for Logic.cs. Run: powershell -ExecutionPolicy Bypass -File wallpaper\test.ps1
using System;
using System.Collections.Generic;
using System.Drawing;
using ElsewhereWallpaper;

static class LogicTests
{
    static int failures;
    static int checks;

    static void Check(bool ok, string name)
    {
        checks++;
        if (!ok) { failures++; Console.WriteLine("FAIL: " + name); }
    }

    static int Main()
    {
        var monitor = new Rectangle(0, 0, 1920, 1080);
        var work = new Rectangle(0, 0, 1920, 1040); // taskbar 40 px

        // Covers: full screen, maximised (with overhang), a normal window, a half window.
        Check(Logic.Covers(new Rectangle(0, 0, 1920, 1080), monitor, work), "fullscreen covers");
        Check(Logic.Covers(new Rectangle(-8, -8, 1936, 1056), monitor, work), "maximised with invisible border covers");
        Check(Logic.Covers(new Rectangle(0, 0, 1920, 1040), monitor, work), "maximised exactly to the work area covers");
        Check(!Logic.Covers(new Rectangle(100, 100, 1200, 800), monitor, work), "a normal window does not cover");
        Check(!Logic.Covers(new Rectangle(0, 0, 960, 1040), monitor, work), "a half-screen window does not cover");
        Check(!Logic.Covers(new Rectangle(0, 0, 1920, 900), monitor, work), "a window shorter than the work area does not cover");
        Check(!Logic.Covers(new Rectangle(1920, 0, 1920, 1080), monitor, work), "a window on the next monitor does not cover this one");
        Check(Logic.Covers(new Rectangle(1920, 0, 1920, 1080), new Rectangle(1920, 0, 1920, 1080), new Rectangle(1920, 0, 1920, 1040)), "covers the second monitor");
        Check(!Logic.Covers(new Rectangle(0, 0, 100, 100), Rectangle.Empty, Rectangle.Empty), "empty monitor is never covered");

        // Shell classes.
        foreach (string c in new string[] { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "SHELLDLL_DefView" })
            Check(Logic.IsShellClass(c), c + " is a shell class");
        Check(!Logic.IsShellClass("Chrome_WidgetWin_1"), "a browser is not a shell class");
        Check(Logic.IsDesktopSurface("SHELLDLL_DefView") && Logic.IsDesktopSurface("Progman") && Logic.IsDesktopSurface("WorkerW"), "desktop surfaces");
        Check(!Logic.IsDesktopSurface("Shell_TrayWnd") && !Logic.IsDesktopSurface("SysListView32"), "taskbar and icon list are not bare surfaces");

        // Render decision: any one reason pauses.
        Check(Logic.ShouldRender(false, false, false, false), "renders when nothing stops it");
        Check(!Logic.ShouldRender(true, false, false, false), "user pause");
        Check(!Logic.ShouldRender(false, true, false, false), "covered");
        Check(!Logic.ShouldRender(false, false, true, false), "battery saver");
        Check(!Logic.ShouldRender(false, false, false, true), "locked");

        // Icon hit test: LVHT_NOWHERE=1, ONITEMICON=2, ONITEMLABEL=4, ONITEMSTATEICON=8, ABOVE=8? (flags only matter with an item).
        Check(!Logic.IsIconHit(-1, 1), "empty desktop (no item, NOWHERE) is not an icon");
        Check(Logic.IsIconHit(3, 2), "on an icon");
        Check(Logic.IsIconHit(0, 4), "on a label");
        Check(!Logic.IsIconHit(3, 1), "an item index with only NOWHERE is not a hit");
        Check(!Logic.IsIconHit(-1, 2), "no item index is not a hit");

        // Move throttle, including wrap-around of the tick count.
        Check(!Logic.ShouldForwardMove(1010, 1000), "10 ms after the last move: skip");
        Check(Logic.ShouldForwardMove(1016, 1000), "16 ms after: forward");
        Check(Logic.ShouldForwardMove(int.MinValue + 5, int.MaxValue - 10), "tick wrap-around, 16 ms apart");
        Check(!Logic.ShouldForwardMove(int.MinValue + 2, int.MaxValue - 10), "tick wrap-around, 13 ms apart");

        // Messages.
        Check(Logic.PointerMessage("move", new Point(2000, 100), new Rectangle(1920, 0, 1920, 1080)) == "pointer move 80 100", "pointer relative to the second monitor");
        Check(Logic.PointerMessage("down", new Point(-50, 40), new Rectangle(-1920, 0, 1920, 1080)) == "pointer down 1870 40", "monitor left of the main one");
        Check(Logic.SceneUrl("rainy-window") == "https://elsewhere-within.example/index.html?scene=rainy-window&mode=wallpaper", "scene url");
        Check(Logic.SceneUrl("a b") == "https://elsewhere-within.example/index.html?scene=a%20b&mode=wallpaper", "scene url escapes");

        // scenes.json.
        string json = "{\n  \"default\": \"rainy-window\",\n  \"scenes\": [\n    {\n      \"id\": \"dashboard-clock\",\n      \"title\": \"Dashboard Clock\"\n    },\n    {\n      \"id\": \"rainy-window\",\n      \"title\": \"Rainy Window\"\n    }\n  ]\n}\n";
        string def;
        List<SceneInfo> scenes = Logic.ParseScenes(json, out def);
        Check(def == "rainy-window", "default scene parsed");
        Check(scenes.Count == 2 && scenes[0].Id == "dashboard-clock" && scenes[1].Title == "Rainy Window", "scenes parsed");
        Check(Logic.PickScene("dashboard-clock", scenes, def) == "dashboard-clock", "saved scene kept");
        Check(Logic.PickScene("gone", scenes, def) == "rainy-window", "unknown saved scene -> default");
        Check(Logic.PickScene(null, scenes, def) == "rainy-window", "no saved scene -> default");
        Check(Logic.PickScene("x", scenes, "also-gone") == "dashboard-clock", "no default -> first");
        Check(Logic.PickScene("x", new List<SceneInfo>(), null) == null, "no scenes -> null");
        string d2;
        Check(Logic.ParseScenes("not json", out d2).Count == 0 && d2 == null, "garbage -> no scenes");

        Console.WriteLine(checks + " checks, " + failures + " failed");
        return failures == 0 ? 0 : 1;
    }
}