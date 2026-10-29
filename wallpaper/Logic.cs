// The decisions of ElsewhereWallpaper that need no Windows or screen, so they
// can be tested alone (wallpaper\test.ps1). C# 5 only.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Text.RegularExpressions;

namespace ElsewhereWallpaper
{
    public class SceneInfo
    {
        public string Id;
        public string Title;
    }

    public static class Logic
    {
        public const string Host = "elsewhere-within.example";
        public const int MoveIntervalMs = 16; // forward desktop mouse moves at most ~60 times a second
        const int ListViewOnItem = 0x2 | 0x4 | 0x8; // LVHT_ONITEMICON | LVHT_ONITEMLABEL | LVHT_ONITEMSTATEICON

        // Does a window hide the desktop on this monitor? A full-screen window covers
        // the monitor; a maximised one covers the work area (the monitor minus the
        // taskbar). A couple of pixels' slack: maximised windows overhang a little.
        public static bool Covers(Rectangle window, Rectangle monitor, Rectangle workArea)
        {
            return Contains(window, monitor, 2) || Contains(window, workArea, 2);
        }

        static bool Contains(Rectangle outer, Rectangle inner, int slack)
        {
            return inner.Width > 0 && inner.Height > 0 &&
                outer.Left <= inner.Left + slack && outer.Top <= inner.Top + slack &&
                outer.Right >= inner.Right - slack && outer.Bottom >= inner.Bottom - slack;
        }

        // Windows that belong to the desktop itself never count as "an app covering it".
        public static bool IsShellClass(string className)
        {
            switch (className)
            {
                case "Progman":
                case "WorkerW":
                case "SHELLDLL_DefView":
                case "Shell_TrayWnd":
                case "Shell_SecondaryTrayWnd":
                case "XamlExplorerHostIslandWindow":
                    return true;
                default:
                    return false;
            }
        }

        // The window classes that are the bare desktop surface (the icon list is checked separately).
        public static bool IsDesktopSurface(string className)
        {
            return className == "Progman" || className == "WorkerW" || className == "SHELLDLL_DefView";
        }

        // Run: animating. Freeze: still on screen but the page holds its frames, so
        // uncovering the desktop shows the scene at once (no wallpaper flash).
        // Suspend: hidden and suspended; resuming takes a moment, so only for long pauses.
        public enum RenderMode { Run, Freeze, Suspend }

        // A mouse move that reaches the scene wakes a frozen monitor for this long.
        public const int TouchWakeMs = 10000;
        public const int NeverTouched = int.MaxValue;

        // Suspend for lock, Battery Saver and the user's pause. Otherwise freeze when a
        // window covers the monitor, or when an app window is in front on it, unless the
        // mouse touched the desktop within TouchWakeMs (then it runs until the mouse rests).
        public static RenderMode DecideMode(bool userPaused, bool covered, bool batterySaver, bool locked, bool appInFront, int msSinceTouch)
        {
            if (userPaused || batterySaver || locked) return RenderMode.Suspend;
            if (covered) return RenderMode.Freeze;
            if (appInFront && msSinceTouch >= TouchWakeMs) return RenderMode.Freeze;
            return RenderMode.Run;
        }

        // The reason behind DecideMode's answer, for the log.
        public static string ModeReason(bool userPaused, bool covered, bool batterySaver, bool locked, bool appInFront, int msSinceTouch)
        {
            if (userPaused) return "paused by the user";
            if (locked) return "screen locked";
            if (batterySaver) return "Battery Saver";
            if (covered) return "a window covers the monitor";
            if (appInFront) return msSinceTouch < TouchWakeMs ? "mouse touched the desktop" : "an app is in front and the mouse is still";
            return "the desktop is in front";
        }

        // Is this foreground window a normal app window, one that should freeze the scene?
        public static bool IsAppWindow(string className, bool minimized, bool cloaked, bool overlay, bool ownProcess)
        {
            return !minimized && !cloaked && !overlay && !ownProcess && !IsShellClass(className);
        }

        // Which monitor a window is on: the one holding its centre.
        public static bool IsOnMonitor(Rectangle window, Rectangle monitor)
        {
            return monitor.Contains(window.Left + window.Width / 2, window.Top + window.Height / 2);
        }

        // Sent to the page; library\core\wallpaper.js parseFreezeMessage reads them.
        public static string FreezeMessage(bool freeze)
        {
            return freeze ? "freeze" : "unfreeze";
        }

        // Hand control (camera), sent to the page; library\core\wallpaper.js parseCameraMessage reads them.
        public static string CameraMessage(bool on)
        {
            return on ? "camera on" : "camera off";
        }

        // Only the camera, only while the tray switch is on, only on one monitor's page.
        public static bool AllowCamera(bool isCameraRequest, bool switchOn, bool isPrimaryWindow)
        {
            return isCameraRequest && switchOn && isPrimaryWindow;
        }

        // WinEvent callbacks about a window itself (not a caret, a menu or a child object).
        public const int ObjIdWindow = 0, ChildIdSelf = 0;
        public static bool IsWindowEvent(int idObject, int idChild)
        {
            return idObject == ObjIdWindow && idChild == ChildIdSelf;
        }

        // Result of the desktop list's LVM_HITTEST: on an icon or its label.
        public static bool IsIconHit(int item, int flags)
        {
            return item >= 0 && (flags & ListViewOnItem) != 0;
        }

        // Tick counts wrap around every ~49 days; the subtraction is done unchecked.
        public static bool ShouldForwardMove(int nowTick, int lastTick)
        {
            return unchecked(nowTick - lastTick) >= MoveIntervalMs;
        }

        // Physical screen pixels -> pixels inside that monitor's wallpaper window.
        public static string PointerMessage(string type, Point screen, Rectangle monitor)
        {
            return "pointer " + type + " " + (screen.X - monitor.X) + " " + (screen.Y - monitor.Y);
        }

        public static string SceneUrl(string id)
        {
            return "https://" + Host + "/index.html?scene=" + Uri.EscapeDataString(id) + "&mode=wallpaper";
        }

        // site\scenes.json, as written by library\vite.config.js.
        public static List<SceneInfo> ParseScenes(string json, out string defaultId)
        {
            var scenes = new List<SceneInfo>();
            Match d = Regex.Match(json, "\"default\"\\s*:\\s*\"([^\"]*)\"");
            defaultId = d.Success ? d.Groups[1].Value : null;
            foreach (Match m in Regex.Matches(json, "\\{\\s*\"id\"\\s*:\\s*\"([^\"]*)\"\\s*,\\s*\"title\"\\s*:\\s*\"([^\"]*)\"\\s*\\}"))
            {
                var s = new SceneInfo();
                s.Id = m.Groups[1].Value;
                s.Title = m.Groups[2].Value;
                scenes.Add(s);
            }
            return scenes;
        }

        // The saved scene if it still exists, else the default, else the first.
        public static string PickScene(string wanted, List<SceneInfo> scenes, string defaultId)
        {
            foreach (SceneInfo s in scenes) if (s.Id == wanted) return s.Id;
            foreach (SceneInfo s in scenes) if (s.Id == defaultId) return s.Id;
            return scenes.Count > 0 ? scenes[0].Id : null;
        }
    }
}