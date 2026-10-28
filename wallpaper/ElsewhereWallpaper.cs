// Elsewhere, Within as a live wallpaper: a library scene shown behind the
// desktop icons, one window per monitor, with a tray icon to control it.
//
// How it works:
//  - Explorer's Progman window is asked (message 0x052C) to make a WorkerW
//    window behind the icons. Our windows become children of it (on Windows 11
//    24H2 and later, the WorkerW is a child of Progman and ours sit between it
//    and the icon list).
//  - The icon list is above us, so it gets the mouse. A low-level mouse hook
//    watches the cursor; only over the bare desktop (not an icon, the taskbar
//    or any app window) it forwards the mouse to the scene and swallows the
//    left button, so Windows draws no selection rectangle there.
//  - It stops rendering when an app covers the desktop, on battery saver,
//    when the screen is locked, or when the user pauses it.
//
// Built with the C# 5 compiler that ships with Windows (see wallpaper\build.ps1).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace ElsewhereWallpaper
{
    static class Program
    {
        public const string Title = "Elsewhere, Within live wallpaper";

        public static string AppDir { get { return AppDomain.CurrentDomain.BaseDirectory; } }
        public static string SiteDir { get { return Path.Combine(AppDir, "site"); } }
        public static string DataDir
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ElsewhereWithin"); }
        }

        [STAThread]
        static int Main(string[] args)
        {
            bool created;
            using (var single = new Mutex(true, @"Local\ElsewhereWithinWallpaper", out created))
            {
                if (!created)
                {
                    Log.Write("already running");
                    return 0;
                }
                Log.Write("start");
                try
                {
                    Native.SetProcessDPIAware();
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    Application.Run(new TrayApp());
                    return 0;
                }
                catch (Exception e)
                {
                    Log.Write("fatal: " + e);
                    return 1;
                }
                finally
                {
                    Log.Write("end");
                }
            }
        }
    }

    // ---------- the tray app: owns the windows, the hook and the pause rules ----------

    class TrayApp : ApplicationContext
    {
        const string SettingsKey = @"Software\ElsewhereWithin\Wallpaper";
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string RunValue = "ElsewhereWallpaper";

        readonly List<SceneInfo> scenes;
        readonly string defaultScene;
        readonly NotifyIcon tray = new NotifyIcon();
        readonly ContextMenuStrip menu = new ContextMenuStrip();
        readonly System.Windows.Forms.Timer watch = new System.Windows.Forms.Timer();
        readonly System.Windows.Forms.Timer rebuildTimer = new System.Windows.Forms.Timer();
        readonly System.Windows.Forms.Timer settle = new System.Windows.Forms.Timer(); // one update per burst of window events
        readonly WindowEvents winEvents;
        readonly uint selfPid = (uint)Process.GetCurrentProcess().Id;
        readonly List<WallpaperWindow> windows = new List<WallpaperWindow>();
        readonly DesktopInput input;
        readonly MessageWindow messages;
        string sceneId;
        string builtLayout;
        bool userPaused;
        bool locked;
        bool batterySaver;

        public TrayApp()
        {
            string json = "";
            try { json = File.ReadAllText(Path.Combine(Program.SiteDir, "scenes.json")); }
            catch (Exception e) { Log.Write("scenes.json unreadable: " + e.Message); }
            scenes = Logic.ParseScenes(json, out defaultScene);
            sceneId = Logic.PickScene(Settings.GetString("Scene"), scenes, defaultScene);
            userPaused = Settings.GetInt("Paused") == 1;

            tray.Icon = TrayIcon.Create();
            tray.ContextMenuStrip = menu;
            tray.Visible = true;
            menu.Opening += delegate { BuildMenu(); };
            tray.DoubleClick += delegate { SetUserPaused(!userPaused); };

            input = new DesktopInput(IsOurWindow, Forward);
            messages = new MessageWindow(delegate { ScheduleRebuild("Explorer restarted"); });
            Microsoft.Win32.SystemEvents.DisplaySettingsChanged += OnDisplayChanged;
            Microsoft.Win32.SystemEvents.SessionSwitch += OnSessionSwitch;

            rebuildTimer.Interval = 2000;
            rebuildTimer.Tick += delegate { rebuildTimer.Stop(); BuildWindows(); };
            watch.Interval = 1500; // backup; the window events below react within ~150 ms
            watch.Tick += delegate { UpdateRendering(); input.CheckAlive(); };
            settle.Interval = 150;
            settle.Tick += delegate { settle.Stop(); UpdateRendering(); };
            winEvents = new WindowEvents(delegate { settle.Stop(); settle.Start(); }); // debounce

            BuildWindows();
            watch.Start();
            UpdateTooltip();
        }

        string SceneTitle
        {
            get
            {
                foreach (SceneInfo s in scenes) if (s.Id == sceneId) return s.Title;
                return sceneId ?? "no scene";
            }
        }

        // ----- windows -----

        void BuildWindows()
        {
            DisposeWindows();
            if (sceneId == null)
            {
                Log.Write("no scenes found in " + Program.SiteDir);
                tray.ShowBalloonTip(5000, Program.Title, "No scenes were found. Reinstall Elsewhere, Within.", ToolTipIcon.Error);
                return;
            }
            DesktopAttachment attach = Desktop.Prepare();
            if (attach == null)
            {
                Log.Write("desktop window not found");
                tray.ShowBalloonTip(5000, Program.Title, "Could not find the desktop to draw on.", ToolTipIcon.Error);
                return;
            }
            builtLayout = LayoutSignature();
            Log.Write("attached: " + (attach.ParentIsProgman ? "Progman child (Windows 11 24H2 layout)" : "WorkerW"));
            foreach (Screen screen in Screen.AllScreens)
            {
                var w = new WallpaperWindow(screen);
                w.Attach(attach);
                w.Start(Logic.SceneUrl(sceneId));
                windows.Add(w);
            }
            UpdateRendering();
        }

        void DisposeWindows()
        {
            foreach (WallpaperWindow w in windows) w.Dispose();
            windows.Clear();
        }

        bool IsOurWindow(IntPtr handle)
        {
            for (IntPtr h = handle; h != IntPtr.Zero; h = Native.GetParent(h))
                foreach (WallpaperWindow w in windows) if (w.IsCreated && w.Handle == h) return true;
            return false;
        }

        void ScheduleRebuild(string why)
        {
            Log.Write("rebuilding windows: " + why);
            rebuildTimer.Stop();
            rebuildTimer.Start();
        }

        void OnDisplayChanged(object sender, EventArgs e)
        {
            if (LayoutSignature() != builtLayout) ScheduleRebuild("display settings changed");
        }

        static string LayoutSignature()
        {
            var sb = new StringBuilder();
            foreach (Screen s in Screen.AllScreens) sb.Append(s.Bounds).Append(s.Primary ? "*" : "").Append(';');
            return sb.ToString();
        }

        void OnSessionSwitch(object sender, SessionSwitchEventArgs e)
        {
            if (e.Reason == SessionSwitchReason.SessionLock) locked = true;
            else if (e.Reason == SessionSwitchReason.SessionUnlock || e.Reason == SessionSwitchReason.SessionLogon) locked = false;
            else return;
            Log.Write(locked ? "screen locked: paused" : "screen unlocked");
            UpdateRendering();
        }

        // ----- pause rules -----

        void UpdateRendering()
        {
            batterySaver = Native.BatterySaverOn();
            List<Rectangle> covering = CoveringWindows();
            Rectangle? foreground = ForegroundAppRect();
            bool anyAwake = false;
            foreach (WallpaperWindow w in windows)
            {
                bool covered = false;
                foreach (Rectangle r in covering)
                    if (Logic.Covers(r, w.Monitor.Bounds, w.Monitor.WorkingArea)) { covered = true; break; }
                bool appInFront = foreground.HasValue && Logic.IsOnMonitor(foreground.Value, w.Monitor.Bounds);
                int sinceTouch = w.MsSinceTouch();
                w.Covered = covered;
                Logic.RenderMode mode = Logic.DecideMode(userPaused, covered, batterySaver, locked, appInFront, sinceTouch);
                w.SetMode(mode, Logic.ModeReason(userPaused, covered, batterySaver, locked, appInFront, sinceTouch));
                anyAwake |= mode != Logic.RenderMode.Suspend;
            }
            // Frozen scenes still listen: a mouse move on the desktop wakes them. While
            // paused, the desktop behaves normally (selection rectangle and all).
            input.Enabled = anyAwake && !userPaused && !locked;
        }

        // The foreground window's rectangle if it is a normal app window, else null.
        Rectangle? ForegroundAppRect()
        {
            IntPtr h = Native.GetForegroundWindow();
            if (h == IntPtr.Zero || !Native.IsWindowVisible(h)) return null;
            uint pid;
            Native.GetWindowThreadProcessId(h, out pid);
            long ex = Native.GetWindowLong(h, Native.GWL_EXSTYLE);
            bool overlay = (ex & (Native.WS_EX_TOOLWINDOW | Native.WS_EX_TRANSPARENT | Native.WS_EX_NOACTIVATE)) != 0;
            if (!Logic.IsAppWindow(Native.ClassOf(h), Native.IsIconic(h), Native.IsCloaked(h), overlay, pid == selfPid)) return null;
            Native.RECT r;
            if (!Native.GetWindowRect(h, out r)) return null;
            return Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
        }

        // Rectangles of visible, normal top-level windows (not the desktop's own).
        List<Rectangle> CoveringWindows()
        {
            var result = new List<Rectangle>();
            uint self = (uint)Process.GetCurrentProcess().Id;
            Native.EnumWindows(delegate(IntPtr h, IntPtr lp)
            {
                if (!Native.IsWindowVisible(h) || Native.IsIconic(h)) return true;
                if (Native.IsCloaked(h)) return true; // suspended UWP apps and other virtual desktops
                long ex = Native.GetWindowLong(h, Native.GWL_EXSTYLE);
                if ((ex & (Native.WS_EX_TOOLWINDOW | Native.WS_EX_TRANSPARENT | Native.WS_EX_NOACTIVATE)) != 0) return true; // overlays
                if (Logic.IsShellClass(Native.ClassOf(h))) return true;
                uint pid;
                Native.GetWindowThreadProcessId(h, out pid);
                if (pid == self) return true;
                Native.RECT r;
                if (Native.GetWindowRect(h, out r)) result.Add(Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom));
                return true;
            }, IntPtr.Zero);
            return result;
        }

        void SetUserPaused(bool paused)
        {
            userPaused = paused;
            Settings.SetInt("Paused", paused ? 1 : 0);
            UpdateRendering();
            UpdateTooltip();
        }

        // ----- mouse forwarding -----

        void Forward(string type, Point screenPoint)
        {
            foreach (WallpaperWindow w in windows)
            {
                if (!w.Monitor.Bounds.Contains(screenPoint)) continue;
                w.Touch();
                // Wake a frozen scene at once, without waiting for the next check
                // (UpdateRendering agrees: touched within 10 s means run).
                if (w.Mode == Logic.RenderMode.Freeze && !w.Covered) w.SetMode(Logic.RenderMode.Run, "mouse touched the desktop");
                w.Post(Logic.PointerMessage(type, screenPoint, w.Monitor.Bounds));
                return;
            }
        }

        // ----- tray menu -----

        void UpdateTooltip()
        {
            string text = "Elsewhere, Within: " + SceneTitle + (userPaused ? " (paused)" : "");
            tray.Text = text.Length > 63 ? text.Substring(0, 63) : text;
        }

        void BuildMenu()
        {
            menu.Items.Clear();
            var header = new ToolStripMenuItem(Program.Title);
            header.Enabled = false;
            menu.Items.Add(header);
            menu.Items.Add(new ToolStripSeparator());

            var sceneMenu = new ToolStripMenuItem("Scene");
            foreach (SceneInfo s in scenes)
            {
                SceneInfo scene = s;
                var item = new ToolStripMenuItem(scene.Title);
                item.Checked = scene.Id == sceneId;
                item.Click += delegate { ChangeScene(scene.Id); };
                sceneMenu.DropDownItems.Add(item);
            }
            menu.Items.Add(sceneMenu);

            var pause = new ToolStripMenuItem(userPaused ? "Resume" : "Pause");
            pause.Click += delegate { SetUserPaused(!userPaused); };
            menu.Items.Add(pause);

            var autostart = new ToolStripMenuItem("Start with Windows");
            autostart.Checked = StartsWithWindows();
            autostart.Click += delegate { SetStartsWithWindows(!StartsWithWindows()); };
            menu.Items.Add(autostart);

            menu.Items.Add(new ToolStripSeparator());
            var quit = new ToolStripMenuItem("Quit (restores your wallpaper)");
            quit.Click += delegate { Quit(); };
            menu.Items.Add(quit);
        }

        void ChangeScene(string id)
        {
            if (id == sceneId) return;
            sceneId = id;
            Settings.SetString("Scene", id);
            Log.Write("scene: " + id);
            foreach (WallpaperWindow w in windows) w.Navigate(Logic.SceneUrl(id));
            UpdateTooltip();
        }

        static bool StartsWithWindows()
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKey))
            {
                string value = key == null ? null : key.GetValue(RunValue) as string;
                return !string.IsNullOrEmpty(value);
            }
        }

        static void SetStartsWithWindows(bool on)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) key.SetValue(RunValue, "\"" + Application.ExecutablePath + "\"");
                else key.DeleteValue(RunValue, false);
            }
            Log.Write("start with Windows: " + on);
        }

        // ----- quit -----

        void Quit()
        {
            Log.Write("quit");
            watch.Stop();
            settle.Stop();
            winEvents.Dispose();
            rebuildTimer.Stop();
            Microsoft.Win32.SystemEvents.DisplaySettingsChanged -= OnDisplayChanged;
            Microsoft.Win32.SystemEvents.SessionSwitch -= OnSessionSwitch;
            input.Dispose();
            DisposeWindows();
            tray.Visible = false;
            tray.Dispose();
            messages.DestroyHandle();
            // Windows redraws the normal wallpaper (the same as re-applying it).
            Native.SystemParametersInfo(Native.SPI_SETDESKWALLPAPER, 0, null, Native.SPIF_SENDCHANGE);
            ExitThread();
        }
    }

    // ---------- finding the desktop ----------

    class DesktopAttachment
    {
        public IntPtr Parent;      // the window our windows become children of
        public IntPtr InsertAfter; // z-order: just below this window (the icon list), or HWND_TOP
        public bool ParentIsProgman;
    }

    static class Desktop
    {
        public static DesktopAttachment Prepare()
        {
            IntPtr progman = Native.FindWindow("Progman", null);
            if (progman == IntPtr.Zero) return null;

            // Ask Explorer to create the WorkerW behind the icons (the "0x052C" trick).
            IntPtr result;
            Native.SendMessageTimeout(progman, 0x052C, (IntPtr)0xD, (IntPtr)1, Native.SMTO_NORMAL, 1000, out result);

            for (int attempt = 0; attempt < 20; attempt++)
            {
                // Windows 11 24H2 and later: the icon list and the WorkerW are both children of Progman.
                IntPtr defView = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
                IntPtr workerChild = Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
                if (defView != IntPtr.Zero && workerChild != IntPtr.Zero)
                {
                    var a = new DesktopAttachment();
                    a.Parent = progman;
                    a.InsertAfter = defView; // directly below the icons, above the wallpaper layer
                    a.ParentIsProgman = true;
                    return a;
                }

                // Earlier layout: a top-level WorkerW after the one that holds the icon list.
                IntPtr found = IntPtr.Zero;
                Native.EnumWindows(delegate(IntPtr top, IntPtr lp)
                {
                    if (Native.FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                        found = Native.FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                    return true;
                }, IntPtr.Zero);
                if (found != IntPtr.Zero)
                {
                    var a = new DesktopAttachment();
                    a.Parent = found;
                    a.InsertAfter = IntPtr.Zero;
                    return a;
                }
                Thread.Sleep(100);
            }
            return null;
        }
    }

    // ---------- one window per monitor ----------

    class WallpaperWindow : Form
    {
        static System.Threading.Tasks.Task<CoreWebView2Environment> environmentTask; // shared by every window

        public readonly Screen Monitor;
        WebView2 webView;
        string pendingUrl;
        Logic.RenderMode wantMode = Logic.RenderMode.Run;
        Logic.RenderMode mode = Logic.RenderMode.Run;
        string wantWhy = "";
        bool touched;
        int touchTick;
        bool disposed;

        public bool IsCreated { get { return IsHandleCreated; } }

        public WallpaperWindow(Screen monitor)
        {
            Monitor = monitor;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(11, 26, 36);
            Enabled = true;
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW;
                return cp;
            }
        }

        // Becomes a child of the desktop, behind the icons.
        public void Attach(DesktopAttachment attach)
        {
            IntPtr h = Handle; // creates the window
            Native.SetParent(h, attach.Parent);
            Native.SetWindowLong(h, Native.GWL_STYLE, Native.WS_CHILD | Native.WS_VISIBLE | Native.WS_CLIPSIBLINGS | Native.WS_CLIPCHILDREN);
            Native.POINT p = new Native.POINT();
            p.X = Monitor.Bounds.X;
            p.Y = Monitor.Bounds.Y;
            Native.ScreenToClient(attach.Parent, ref p);
            Native.MoveWindow(h, p.X, p.Y, Monitor.Bounds.Width, Monitor.Bounds.Height, true);
            Show();
            Native.SetWindowPos(h, attach.InsertAfter, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
            Log.Write("window for " + Monitor.DeviceName + " " + Monitor.Bounds + " at " + p.X + "," + p.Y);
        }

        public void Start(string url)
        {
            pendingUrl = url;
            StartWebView();
        }

        public void Navigate(string url)
        {
            pendingUrl = url;
            if (webView != null && webView.CoreWebView2 != null) webView.CoreWebView2.Navigate(url);
        }

        // Pointer messages only matter while the scene runs.
        public void Post(string message)
        {
            if (mode == Logic.RenderMode.Run) PostRaw(message);
        }

        void PostRaw(string message)
        {
            try
            {
                if (mode != Logic.RenderMode.Suspend && webView != null && webView.CoreWebView2 != null) webView.CoreWebView2.PostWebMessageAsString(message);
            }
            catch (Exception) { }
        }

        // Run = animating. Freeze = visible, but the page holds its frames (the covered
        // desktop; uncovering it shows the scene at once). Suspend = hidden and
        // suspended: no drawing, no timers worth mentioning.
        public void SetMode(Logic.RenderMode newMode, string why)
        {
            wantMode = newMode;
            wantWhy = why;
            ApplyMode();
        }

        public Logic.RenderMode Mode { get { return mode; } }

        // Set by the tray app: a window covers this monitor, so no mouse move can wake it.
        public bool Covered;

        // A mouse move reached this monitor's scene.
        public void Touch()
        {
            touchTick = Environment.TickCount;
            touched = true;
        }

        public int MsSinceTouch()
        {
            return touched ? Math.Max(0, unchecked(Environment.TickCount - touchTick)) : Logic.NeverTouched;
        }

        // The page just loaded (or reloaded): tell it where we are.
        public void RepeatFreezeState()
        {
            if (mode != Logic.RenderMode.Run) PostRaw(Logic.FreezeMessage(mode == Logic.RenderMode.Freeze));
        }

        async void ApplyMode()
        {
            if (disposed || webView == null || webView.CoreWebView2 == null || mode == wantMode) return;
            Logic.RenderMode previous = mode;
            mode = wantMode;
            try
            {
                if (mode == Logic.RenderMode.Suspend)
                {
                    webView.Visible = false;
                    Log.Write("paused " + Monitor.DeviceName + ": " + wantWhy);
                    await webView.CoreWebView2.TrySuspendAsync();
                    return;
                }
                if (previous == Logic.RenderMode.Suspend)
                {
                    webView.CoreWebView2.Resume();
                    webView.Visible = true;
                    Log.Write("resumed " + Monitor.DeviceName + ": " + wantWhy);
                }
                else Log.Write((mode == Logic.RenderMode.Freeze ? "frozen " : "unfrozen ") + Monitor.DeviceName + ": " + wantWhy);
                PostRaw(Logic.FreezeMessage(mode == Logic.RenderMode.Freeze));
            }
            catch (Exception e)
            {
                Log.Write("pause/resume failed: " + e.Message);
            }
        }

        async void StartWebView()
        {
            try
            {
                if (!File.Exists(Path.Combine(Program.SiteDir, "index.html")))
                    throw new FileNotFoundException("site folder missing", Program.SiteDir);
                if (environmentTask == null)
                {
                    CoreWebView2Environment.SetLoaderDllFolderPath(Program.AppDir);
                    environmentTask = CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.DataDir, "WebView2-wallpaper"), new CoreWebView2EnvironmentOptions());
                }
                CoreWebView2Environment environment = await environmentTask;
                if (disposed) return;

                webView = new WebView2();
                webView.DefaultBackgroundColor = BackColor;
                webView.Dock = DockStyle.Fill;
                Controls.Add(webView);
                await webView.EnsureCoreWebView2Async(environment);
                if (disposed) return;
                Configure(webView.CoreWebView2);
                webView.CoreWebView2.Navigate(pendingUrl);
                mode = Logic.RenderMode.Run; // a fresh page runs; bring it to the wanted mode
                ApplyMode();
            }
            catch (Exception e)
            {
                Log.Write("webview2 unavailable: " + e.Message);
            }
        }

        void Configure(CoreWebView2 core)
        {
            CoreWebView2Settings s = core.Settings;
            s.AreDevToolsEnabled = false;
            s.AreDefaultContextMenusEnabled = false;
            s.AreBrowserAcceleratorKeysEnabled = false;
            s.IsStatusBarEnabled = false;
            s.IsZoomControlEnabled = false;
            s.IsPinchZoomEnabled = false;
            s.AreDefaultScriptDialogsEnabled = false;
            s.IsGeneralAutofillEnabled = false;
            s.IsPasswordAutosaveEnabled = false;
            core.IsMuted = true;

            // The site folder under a private address, with no network access.
            core.SetVirtualHostNameToFolderMapping(Logic.Host, Program.SiteDir, CoreWebView2HostResourceAccessKind.Deny);
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (sender, e) =>
            {
                Uri uri;
                if (!Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out uri)) return;
                bool network = uri.Scheme == "http" || uri.Scheme == "https" || uri.Scheme == "ws" || uri.Scheme == "wss";
                if (!network || uri.Host == Logic.Host) return;
                Log.Write("blocked request: " + e.Request.Uri);
                e.Response = core.Environment.CreateWebResourceResponse(null, 403, "Blocked", "");
            };
            core.NavigationStarting += (sender, e) =>
            {
                if (!e.Uri.StartsWith("https://" + Logic.Host + "/", StringComparison.OrdinalIgnoreCase))
                {
                    Log.Write("blocked navigation: " + e.Uri);
                    e.Cancel = true;
                }
            };
            core.NewWindowRequested += (sender, e) => { e.Handled = true; };
            core.PermissionRequested += (sender, e) =>
            {
                e.State = CoreWebView2PermissionState.Deny;
                Log.Write("denied permission: " + e.PermissionKind);
            };
            core.WebMessageReceived += (sender, e) =>
            {
                string message = e.TryGetWebMessageAsString();
                if (message == "ready") RepeatFreezeState(); // the page's handler exists now
                else if (message != null) Log.Write("page: " + message);
            };
            core.ProcessFailed += (sender, e) =>
            {
                Log.Write("webview2 process failed: " + e.ProcessFailedKind + " " + e.Reason);
                if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited || e.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)
                    BeginInvoke(new MethodInvoker(delegate { try { core.Reload(); } catch (Exception) { } }));
            };
            core.NavigationCompleted += (sender, e) =>
            {
                Log.Write("page loaded on " + Monitor.DeviceName + ": " + (e.IsSuccess ? "ok" : "failed " + e.WebErrorStatus));
            };
        }

        protected override void Dispose(bool disposing)
        {
            disposed = true;
            if (disposing && webView != null)
            {
                try { webView.Dispose(); } catch (Exception) { }
            }
            base.Dispose(disposing);
        }
    }

    // ---------- window events ----------

    // Tells the tray app at once when the foreground window changes, a window is
    // minimised or restored (Win+D, alt-tab, clicking the desktop), so it does not wait
    // for the 1.5 s timer. Callbacks arrive on the UI thread.
    class WindowEvents : IDisposable
    {
        readonly Native.WinEventProc proc; // kept so the garbage collector cannot free it
        readonly List<IntPtr> hooks = new List<IntPtr>();
        readonly Action changed;

        public WindowEvents(Action changed)
        {
            this.changed = changed;
            proc = OnEvent;
            Hook(Native.EVENT_SYSTEM_FOREGROUND, Native.EVENT_SYSTEM_FOREGROUND);
            Hook(Native.EVENT_SYSTEM_MINIMIZESTART, Native.EVENT_SYSTEM_MINIMIZEEND);
        }

        void Hook(uint min, uint max)
        {
            IntPtr hook = Native.SetWinEventHook(min, max, IntPtr.Zero, proc, 0, 0, Native.WINEVENT_OUTOFCONTEXT | Native.WINEVENT_SKIPOWNPROCESS);
            if (hook == IntPtr.Zero) Log.Write("window event hook " + min.ToString("X") + " failed; the timer still works");
            else hooks.Add(hook);
        }

        void OnEvent(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
        {
            if (hwnd == IntPtr.Zero || !Logic.IsWindowEvent(idObject, idChild)) return;
            if (Native.GetAncestor(hwnd, Native.GA_ROOT) != hwnd) return; // top-level windows only
            changed();
        }

        public void Dispose()
        {
            foreach (IntPtr hook in hooks) Native.UnhookWinEvent(hook);
            hooks.Clear();
        }
    }

    // ---------- the mouse hook ----------

    // Mouse on the desktop goes to the scene.
    // Moves: anywhere on the desktop surface (over icons too; a ripple under an icon
    // does no harm). Presses: on bare desktop the scene gets them and the left button
    // is swallowed (no selection rectangle). When Explorer can't be asked where the
    // icons are (some antivirus blocks that), a press still reaches the scene but is
    // also passed on to Windows, so icons keep working. Over the taskbar or any app
    // window everything passes through untouched.
    class DesktopInput : IDisposable
    {
        readonly Func<IntPtr, bool> isOurWindow;
        readonly Action<string, Point> forward;
        readonly Native.HookProc proc;
        IntPtr hook;
        bool capturing;      // a left button press we swallowed is still down
        bool sharing;        // a left button press we forwarded but also passed on is still down
        int lastMoveTick;
        IntPtr iconProcess;  // the process that owns the icon list (Explorer), for hit-testing
        uint iconProcessId;
        IntPtr remote;       // memory in Explorer for the hit-test structure
        Point lastHitPoint;
        int lastHitTick;
        int lastHit;         // 1 icon, 0 bare, -1 can't tell
        // Diagnostics and the watchdog.
        int lastCallbackTick = Environment.TickCount;
        int lastCheckTick = Environment.TickCount;
        Native.POINT lastCursor;
        bool loggedMove, loggedShared;
        int missLogs;
        readonly HashSet<string> loggedProblems = new HashSet<string>();

        public bool Enabled;

        public DesktopInput(Func<IntPtr, bool> isOurWindow, Action<string, Point> forward)
        {
            this.isOurWindow = isOurWindow;
            this.forward = forward;
            proc = HookCallback; // kept in a field so it is not garbage collected
            Install("mouse hook installed");
            Native.GetCursorPos(out lastCursor);
        }

        void Install(string what)
        {
            hook = Native.SetWindowsHookEx(Native.WH_MOUSE_LL, proc, Native.GetModuleHandle(null), 0);
            Log.Write(hook == IntPtr.Zero ? "mouse hook failed (error " + Marshal.GetLastWin32Error() + ")" : what);
        }

        // Windows silently removes a low-level hook that once answers too slowly.
        // Called every 1.5 s: if the cursor moved but the hook heard nothing, put it back.
        public void CheckAlive()
        {
            int now = Environment.TickCount;
            Native.POINT p;
            if (!Native.GetCursorPos(out p)) return;
            bool moved = p.X != lastCursor.X || p.Y != lastCursor.Y;
            if (moved && unchecked(lastCallbackTick - lastCheckTick) < 0)
            {
                if (hook != IntPtr.Zero) Native.UnhookWindowsHookEx(hook);
                Install("mouse hook went quiet (Windows may have removed it): reinstalled");
                lastCallbackTick = now;
            }
            lastCursor = p;
            lastCheckTick = now;
        }

        IntPtr HookCallback(int code, IntPtr wParam, IntPtr lParam)
        {
            lastCallbackTick = Environment.TickCount;
            if (code >= 0 && Enabled)
            {
                try
                {
                    Native.MSLLHOOKSTRUCT m = (Native.MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.MSLLHOOKSTRUCT));
                    int msg = wParam.ToInt32();
                    Point pt = new Point(m.pt.X, m.pt.Y);
                    if (msg == Native.WM_MOUSEMOVE)
                    {
                        IntPtr list;
                        if (Logic.ShouldForwardMove(Environment.TickCount, lastMoveTick) && (capturing || sharing || OverDesktop(pt, out list)))
                        {
                            lastMoveTick = Environment.TickCount;
                            forward("move", pt);
                            if (!loggedMove) { loggedMove = true; Log.Write("mouse moves reach the scene"); }
                        }
                    }
                    else if (msg == Native.WM_LBUTTONDOWN)
                    {
                        IntPtr list;
                        if (!OverDesktop(pt, out list))
                        {
                            if (missLogs < 5)
                            {
                                missLogs++;
                                IntPtr h = Native.WindowFromPoint(new Native.POINT(pt.X, pt.Y));
                                Log.Write("press at " + pt.X + "," + pt.Y + " over " + Native.ClassOf(h) + " (parent " + Native.ClassOf(Native.GetParent(h)) + "): not the desktop, left alone");
                            }
                        }
                        else
                        {
                            int hit = list == IntPtr.Zero ? 0 : IconAt(list, pt);
                            if (hit == 0)
                            {
                                capturing = true;
                                Log.Write("desktop press at " + pt.X + "," + pt.Y + ": forwarded, no selection box");
                                forward("down", pt);
                                return (IntPtr)1; // no selection rectangle
                            }
                            if (hit < 0)
                            {
                                sharing = true;
                                if (!loggedShared) { loggedShared = true; Log.Write("desktop press at " + pt.X + "," + pt.Y + ": can't tell if an icon is there, so the scene and Windows both get it"); }
                                forward("down", pt);
                            }
                        }
                    }
                    else if (msg == Native.WM_LBUTTONUP)
                    {
                        if (capturing)
                        {
                            capturing = false;
                            forward("up", pt);
                            return (IntPtr)1;
                        }
                        if (sharing)
                        {
                            sharing = false;
                            forward("up", pt); // and let Windows have it too
                        }
                    }
                }
                catch (Exception e)
                {
                    Log.Write("hook error: " + e.Message);
                }
            }
            return Native.CallNextHookEx(hook, code, wParam, lParam);
        }

        // The desktop surface (our window, the desktop itself, or Explorer's icon list).
        // list = the icon list when the point is on it, else IntPtr.Zero.
        bool OverDesktop(Point pt, out IntPtr list)
        {
            list = IntPtr.Zero;
            IntPtr h = Native.WindowFromPoint(new Native.POINT(pt.X, pt.Y));
            if (h == IntPtr.Zero) return false;
            if (isOurWindow(h)) return true;
            string cls = Native.ClassOf(h);
            if (Logic.IsDesktopSurface(cls)) return true;
            if (cls == "SysListView32" && Logic.IsDesktopSurface(Native.ClassOf(Native.GetParent(h)))) { list = h; return true; }
            return false;
        }

        void Problem(string text)
        {
            if (loggedProblems.Add(text)) Log.Write("icon check: " + text);
        }

        // Asks Explorer's icon list whether an icon or its label is under the point:
        // 1 icon, 0 bare desktop, -1 can't tell (Explorer busy, or access refused).
        int IconAt(IntPtr listView, Point pt)
        {
            int now = Environment.TickCount;
            if (Math.Abs(pt.X - lastHitPoint.X) <= 2 && Math.Abs(pt.Y - lastHitPoint.Y) <= 2 && unchecked(now - lastHitTick) < 120)
                return lastHit;
            int hit = -1;
            try { hit = HitTest(listView, pt); }
            catch (Exception e) { Problem("hit test failed: " + e.Message); }
            lastHitPoint = pt;
            lastHitTick = now;
            lastHit = hit;
            return hit;
        }

        int HitTest(IntPtr listView, Point pt)
        {
            uint pid;
            Native.GetWindowThreadProcessId(listView, out pid);
            if (iconProcess == IntPtr.Zero || iconProcessId != pid) ReleaseRemote(pid);
            if (iconProcess == IntPtr.Zero || remote == IntPtr.Zero) return -1;

            Native.POINT client = new Native.POINT(pt.X, pt.Y);
            Native.ScreenToClient(listView, ref client);
            // LVHITTESTINFO: POINT pt; UINT flags; int iItem; int iSubItem; int iGroup
            byte[] buffer = new byte[24];
            BitConverter.GetBytes(client.X).CopyTo(buffer, 0);
            BitConverter.GetBytes(client.Y).CopyTo(buffer, 4);
            BitConverter.GetBytes(-1).CopyTo(buffer, 12);
            IntPtr n;
            if (!Native.WriteProcessMemory(iconProcess, remote, buffer, (IntPtr)buffer.Length, out n)) { Problem("writing to Explorer refused (error " + Marshal.GetLastWin32Error() + ")"); return -1; }
            IntPtr result;
            if (Native.SendMessageTimeout(listView, Native.LVM_HITTEST, IntPtr.Zero, remote, Native.SMTO_ABORTIFHUNG, 40, out result) == IntPtr.Zero) { Problem("Explorer did not answer within 40 ms"); return -1; }
            if (!Native.ReadProcessMemory(iconProcess, remote, buffer, (IntPtr)buffer.Length, out n)) { Problem("reading from Explorer refused (error " + Marshal.GetLastWin32Error() + ")"); return -1; }
            return Logic.IsIconHit(BitConverter.ToInt32(buffer, 12), BitConverter.ToInt32(buffer, 8)) ? 1 : 0;
        }

        void ReleaseRemote(uint newPid)
        {
            if (iconProcess != IntPtr.Zero)
            {
                if (remote != IntPtr.Zero) Native.VirtualFreeEx(iconProcess, remote, IntPtr.Zero, Native.MEM_RELEASE);
                Native.CloseHandle(iconProcess);
            }
            iconProcess = IntPtr.Zero;
            remote = IntPtr.Zero;
            iconProcessId = newPid;
            if (newPid == 0) return;
            iconProcess = Native.OpenProcess(Native.PROCESS_VM_OPERATION | Native.PROCESS_VM_READ | Native.PROCESS_VM_WRITE, false, newPid);
            if (iconProcess == IntPtr.Zero) { Problem("opening Explorer refused (error " + Marshal.GetLastWin32Error() + ")"); return; }
            remote = Native.VirtualAllocEx(iconProcess, IntPtr.Zero, (IntPtr)64, Native.MEM_COMMIT | Native.MEM_RESERVE, Native.PAGE_READWRITE);
            if (remote == IntPtr.Zero) Problem("memory in Explorer refused (error " + Marshal.GetLastWin32Error() + ")");
        }

        public void Dispose()
        {
            Enabled = false;
            if (hook != IntPtr.Zero) Native.UnhookWindowsHookEx(hook);
            hook = IntPtr.Zero;
            ReleaseRemote(0);
            if (iconProcess != IntPtr.Zero) { Native.CloseHandle(iconProcess); iconProcess = IntPtr.Zero; }
        }
    }

    // ---------- small helpers ----------

    // Hears "TaskbarCreated": Explorer restarted, so the desktop windows are new.
    class MessageWindow : NativeWindow
    {
        readonly uint taskbarCreated = Native.RegisterWindowMessage("TaskbarCreated");
        readonly Action onExplorerRestart;

        public MessageWindow(Action onExplorerRestart)
        {
            this.onExplorerRestart = onExplorerRestart;
            CreateHandle(new CreateParams());
        }

        protected override void WndProc(ref Message m)
        {
            if ((uint)m.Msg == taskbarCreated) onExplorerRestart();
            base.WndProc(ref m);
        }
    }

    static class Settings
    {
        const string Key = @"Software\ElsewhereWithin\Wallpaper";

        public static string GetString(string name)
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(Key)) return k == null ? null : k.GetValue(name) as string;
        }

        public static int GetInt(string name)
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(Key))
            {
                object v = k == null ? null : k.GetValue(name);
                return v is int ? (int)v : 0;
            }
        }

        public static void SetString(string name, string value)
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(Key)) k.SetValue(name, value);
        }

        public static void SetInt(string name, int value)
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(Key)) k.SetValue(name, value, RegistryValueKind.DWord);
        }
    }

    // Two soft rings, drawn at run time (no icon file to ship).
    static class TrayIcon
    {
        public static Icon Create()
        {
            using (var bmp = new Bitmap(32, 32))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);
                    using (var fill = new SolidBrush(Color.FromArgb(255, 16, 42, 60))) g.FillEllipse(fill, 1, 1, 30, 30);
                    using (var outer = new Pen(Color.FromArgb(210, 190, 225, 240), 2f)) g.DrawEllipse(outer, 5, 5, 22, 22);
                    using (var inner = new Pen(Color.FromArgb(255, 255, 255, 255), 2f)) g.DrawEllipse(inner, 11, 11, 10, 10);
                }
                IntPtr handle = bmp.GetHicon();
                Icon icon = (Icon)Icon.FromHandle(handle).Clone();
                Native.DestroyIcon(handle);
                return icon;
            }
        }
    }

    static class Log
    {
        static readonly object Gate = new object();
        static readonly int ProcessId = Process.GetCurrentProcess().Id;

        public static void Write(string line)
        {
            try
            {
                lock (Gate)
                {
                    Directory.CreateDirectory(Program.DataDir);
                    string path = Path.Combine(Program.DataDir, "wallpaper.log");
                    var info = new FileInfo(path);
                    if (info.Exists && info.Length > 512 * 1024) File.Delete(path);
                    File.AppendAllText(path, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " [" + ProcessId + "] " + line + Environment.NewLine);
                }
            }
            catch (Exception)
            {
                // Logging must never stop the wallpaper.
            }
        }
    }

    static class Native
    {
        public const int GWL_STYLE = -16;
        public const int GWL_EXSTYLE = -20;
        public const int WS_CHILD = 0x40000000;
        public const int WS_VISIBLE = 0x10000000;
        public const int WS_CLIPSIBLINGS = 0x04000000;
        public const int WS_CLIPCHILDREN = 0x02000000;
        public const int WS_EX_TOOLWINDOW = 0x80;
        public const int WS_EX_NOACTIVATE = 0x08000000;
        public const int WS_EX_TRANSPARENT = 0x20;
        public const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;
        public const uint SMTO_NORMAL = 0, SMTO_ABORTIFHUNG = 2;
        public const int WH_MOUSE_LL = 14;
        public const int WM_MOUSEMOVE = 0x200, WM_LBUTTONDOWN = 0x201, WM_LBUTTONUP = 0x202;
        public const uint LVM_HITTEST = 0x1012;
        public const uint PROCESS_VM_OPERATION = 0x8, PROCESS_VM_READ = 0x10, PROCESS_VM_WRITE = 0x20;
        public const uint MEM_COMMIT = 0x1000, MEM_RESERVE = 0x2000, MEM_RELEASE = 0x8000, PAGE_READWRITE = 4;
        public const uint SPI_SETDESKWALLPAPER = 0x14, SPIF_SENDCHANGE = 2;
        const int DWMWA_CLOAKED = 14;
        public const uint EVENT_SYSTEM_FOREGROUND = 0x3, EVENT_SYSTEM_MINIMIZESTART = 0x16, EVENT_SYSTEM_MINIMIZEEND = 0x17;
        public const uint WINEVENT_OUTOFCONTEXT = 0, WINEVENT_SKIPOWNPROCESS = 2;
        public const uint GA_ROOT = 2;

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X, Y;
            public POINT(int x, int y) { X = x; Y = y; }
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left, Top, Right, Bottom; }

        [StructLayout(LayoutKind.Sequential)]
        public struct MSLLHOOKSTRUCT
        {
            public POINT pt;
            public uint mouseData, flags, time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct SYSTEM_POWER_STATUS
        {
            public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag;
            public int BatteryLifeTime, BatteryFullLifeTime;
        }

        public delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        public delegate void WinEventProc(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);

        [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventProc proc, uint pid, uint thread, uint flags);
        [DllImport("user32.dll")] public static extern bool UnhookWinEvent(IntPtr hook);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc proc, IntPtr lParam);
        [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
        [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
        [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
        [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
        [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int w, int h, uint flags);
        [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr hWnd, ref POINT p);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder text, int max);
        [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
        [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
        [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
        [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern uint RegisterWindowMessage(string name);
        [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SystemParametersInfo(uint action, uint param, string value, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr GetModuleHandle(string name);
        [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
        [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr VirtualAllocEx(IntPtr process, IntPtr address, IntPtr size, uint type, uint protect);
        [DllImport("kernel32.dll")] public static extern bool VirtualFreeEx(IntPtr process, IntPtr address, IntPtr size, uint type);
        [DllImport("kernel32.dll", SetLastError = true)] public static extern bool WriteProcessMemory(IntPtr process, IntPtr address, byte[] buffer, IntPtr size, out IntPtr written);
        [DllImport("kernel32.dll", SetLastError = true)] public static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, IntPtr size, out IntPtr read);
        [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);
        [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);

        public static string ClassOf(IntPtr hWnd)
        {
            if (hWnd == IntPtr.Zero) return "";
            var b = new StringBuilder(256);
            return GetClassName(hWnd, b, b.Capacity) > 0 ? b.ToString() : "";
        }

        public static bool IsCloaked(IntPtr hWnd)
        {
            int cloaked;
            return DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0;
        }

        // Windows' Battery Saver: SystemStatusFlag is 1 while it is on.
        public static bool BatterySaverOn()
        {
            SYSTEM_POWER_STATUS s;
            return GetSystemPowerStatus(out s) && s.SystemStatusFlag == 1;
        }
    }
}
