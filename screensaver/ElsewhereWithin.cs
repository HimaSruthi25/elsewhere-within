// Elsewhere, Within as a Windows screensaver.
//
// Windows starts a screensaver (.scr) with one of:
//   /s           show it full screen (also used by Preview and by "Test")
//   /p <hwnd>    draw the small preview inside the Settings dialog
//   /c[:<hwnd>]  open its settings (also when started with no arguments)
//
// There is one copy of this program per scene, named "Elsewhere - <Scene title>.scr";
// it finds its scene by its own file name in site\scenes.json. In /s the scene
// library's build (the "site" folder beside this file) is shown in WebView2
// under a private, local-only address, so it needs no web server and no
// internet connection. Built with the C# 5 compiler that
// ships with Windows (see build.ps1), so it avoids newer C# syntax.

using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ElsewhereWithin
{
    static class Program
    {
        public const string Title = "Elsewhere, Within";
        // A reserved .example name, so it can never reach a real site.
        public const string Host = "elsewhere-within.example";

        public static string AppDir { get { return AppDomain.CurrentDomain.BaseDirectory; } }
        public static string SiteDir { get { return Path.Combine(AppDir, "site"); } }
        // The scene this copy shows, from its own file name. Null for an unknown name:
        // the page then picks its default scene.
        const string NamePrefix = "Elsewhere - ";
        static bool sceneResolved;
        static string sceneId;
        static string sceneTitle;
        public static string SceneId { get { ResolveScene(); return sceneId; } }
        public static string SceneTitle { get { ResolveScene(); return sceneTitle; } }

        static void ResolveScene()
        {
            if (sceneResolved) return;
            sceneResolved = true;
            try
            {
                string name = Path.GetFileNameWithoutExtension(Native.LongPath(Application.ExecutablePath));
                string json = File.ReadAllText(Path.Combine(SiteDir, "scenes.json"));
                foreach (Match m in Regex.Matches(json, "\\{\\s*\"id\"\\s*:\\s*\"([^\"]*)\"\\s*,\\s*\"title\"\\s*:\\s*\"([^\"]*)\"\\s*\\}"))
                {
                    if (string.Equals(NamePrefix + m.Groups[2].Value, name, StringComparison.OrdinalIgnoreCase))
                    {
                        sceneId = m.Groups[1].Value;
                        sceneTitle = m.Groups[2].Value;
                        break;
                    }
                }
                Log.Write("scene for \"" + name + "\": " + (sceneId ?? "unknown, using the default"));
            }
            catch (Exception e)
            {
                Log.Write("scene lookup failed, using the default: " + e.Message);
            }
        }

        public static string PageAddress
        {
            get
            {
                string id = SceneId;
                return "https://" + Host + "/index.html" + (id != null ? "?scene=" + Uri.EscapeDataString(id) : "");
            }
        }

        public static string DataDir
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ElsewhereWithin"); }
        }

        [STAThread]
        static int Main(string[] args)
        {
            string mode;
            IntPtr hwnd;
            ParseArguments(args, out mode, out hwnd);
            Log.Write("start /" + mode + (hwnd != IntPtr.Zero ? " " + hwnd.ToInt64() : ""));

            try
            {
                Native.SetProcessDPIAware();
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                if (mode == "s") RunScreensaver();
                else if (mode == "p") RunPreview(hwnd);
                else ShowSettings(hwnd);
                return 0;
            }
            catch (Exception e)
            {
                Log.Write("fatal: " + e);
                return 1;
            }
            finally
            {
                Log.Write("end /" + mode);
            }
        }

        // Accepts /s, -s, /p 123, /p:123, /c, /c:123 in any case.
        static void ParseArguments(string[] args, out string mode, out IntPtr hwnd)
        {
            mode = "c";
            hwnd = IntPtr.Zero;
            if (args.Length == 0) return;
            string first = args[0].Trim().TrimStart('/', '-').ToLowerInvariant();
            if (first.Length == 0) return;
            mode = first.Substring(0, 1);
            string number = first.Length > 2 && first[1] == ':' ? first.Substring(2) : args.Length > 1 ? args[1] : null;
            long value;
            if (number != null && long.TryParse(number, out value)) hwnd = new IntPtr(value);
        }

        static void RunScreensaver()
        {
            bool created;
            using (var single = new Mutex(true, @"Local\ElsewhereWithinScreensaver", out created))
            {
                if (!created)
                {
                    Log.Write("already running");
                    return;
                }
                var watcher = new InputWatcher();
                foreach (Screen screen in Screen.AllScreens)
                {
                    // The lake on the main screen; other screens go dark.
                    var form = new SaverForm(screen.Bounds, screen.Primary, watcher);
                    form.Show();
                }
                watcher.Start();
                Application.Run();
            }
        }

        static void RunPreview(IntPtr parent)
        {
            if (parent == IntPtr.Zero || !Native.IsWindow(parent))
            {
                Log.Write("preview: no valid parent window");
                return;
            }
            Application.Run(new PreviewForm(parent));
        }

        static void ShowSettings(IntPtr owner)
        {
            string text = (SceneTitle ?? Title) + " (" + Title + " screensaver)\n\n" +
                "A quiet, silent scene for your screen.\n\n" +
                "It is silent and never uses the microphone. There is nothing to configure here; " +
                "choose the wait time in Windows Screen Saver Settings.";
            MessageBox.Show(owner != IntPtr.Zero ? new OwnerWindow(owner) : null, text, Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        static bool exiting;
        static bool leaving;
        static System.Windows.Forms.Timer goodbyeCap;
        const int GoodbyeCapMs = 700; // never wait longer than this for the page

        // Input seen: let the page play its goodbye, then close. If there is no
        // page to say goodbye (still photo, or it has not loaded), close now.
        public static void Leave(string reason)
        {
            if (exiting || leaving) return;
            leaving = true;
            Log.Write("leaving: " + reason);
            if (!SaverForm.SayGoodbye())
            {
                Exit(reason);
                return;
            }
            goodbyeCap = new System.Windows.Forms.Timer();
            goodbyeCap.Interval = GoodbyeCapMs;
            goodbyeCap.Tick += delegate { Exit(reason + " (goodbye cap reached)"); };
            goodbyeCap.Start();
        }

        // Closes immediately.
        public static void Exit(string reason)
        {
            if (exiting) return;
            exiting = true;
            if (goodbyeCap != null) goodbyeCap.Stop();
            Log.Write("exit: " + reason);
            Application.Exit();
        }

        // The still photo, for the preview and when WebView2 cannot start.
        public static Image LoadStillPhoto(string name)
        {
            try { return Image.FromFile(Path.Combine(SiteDir, "assets", name)); }
            catch (Exception e)
            {
                Log.Write("still photo unavailable: " + e.Message);
                return null;
            }
        }

        // Draws image like the website's object-fit: cover, focused on the horizon.
        public static void DrawCover(Graphics g, Image image, Rectangle area)
        {
            g.Clear(Color.FromArgb(11, 42, 60));
            if (image == null || area.Width <= 0 || area.Height <= 0) return;
            float scale = Math.Max((float)area.Width / image.Width, (float)area.Height / image.Height);
            float w = image.Width * scale;
            float h = image.Height * scale;
            float x = area.X + (area.Width - w) * 0.5f;
            float y = area.Y + (area.Height - h) * 0.506f;
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.DrawImage(image, x, y, w, h);
        }
    }

    // Ends the screensaver on keyboard or mouse input anywhere, even if the
    // page stops responding: Windows' last-input time changes on every key,
    // click and mouse movement. Movement of only a few pixels (sensor jitter)
    // is ignored, like the built-in screensavers.
    class InputWatcher
    {
        const int MoveThreshold = 8;
        const int SettleMs = 700; // ignore input generated while starting
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        int startedAt;
        uint baseline;
        Point origin;

        public InputWatcher()
        {
            timer.Interval = 100;
            timer.Tick += delegate { Check(); };
        }

        public void Start()
        {
            startedAt = Environment.TickCount;
            baseline = Native.LastInputTick();
            origin = Cursor.Position;
            timer.Start();
        }

        void Check()
        {
            uint last = Native.LastInputTick();
            if (Environment.TickCount - startedAt < SettleMs)
            {
                baseline = last;
                origin = Cursor.Position;
                return;
            }
            if (last == baseline) return;
            Point now = Cursor.Position;
            double moved = Math.Sqrt(Math.Pow(now.X - origin.X, 2) + Math.Pow(now.Y - origin.Y, 2));
            if (moved == 0) Program.Leave("keyboard, mouse button, wheel or touchpad touch");
            else if (moved > MoveThreshold) Program.Leave("mouse moved " + Math.Round(moved) + " px");
            else baseline = last; // jitter
        }

        public void MouseMovedTo(Point screenPoint)
        {
            if (Environment.TickCount - startedAt < SettleMs) return;
            double moved = Math.Sqrt(Math.Pow(screenPoint.X - origin.X, 2) + Math.Pow(screenPoint.Y - origin.Y, 2));
            if (moved > MoveThreshold) Program.Leave("mouse moved " + Math.Round(moved) + " px");
        }
    }

    class SaverForm : Form
    {
        readonly InputWatcher watcher;
        WebView2 webView;
        Image still;
        static SaverForm pageForm; // the form whose page has loaded

        // Asks the page to play its goodbye at the cursor. False if no page can.
        public static bool SayGoodbye()
        {
            SaverForm f = pageForm;
            if (f == null || f.webView == null || f.webView.CoreWebView2 == null) return false;
            try
            {
                Point p = Cursor.Position;
                p.Offset(-f.Bounds.X, -f.Bounds.Y);
                f.webView.CoreWebView2.PostWebMessageAsString("goodbye " + p.X + " " + p.Y);
                return true;
            }
            catch (Exception e)
            {
                Log.Write("goodbye unavailable: " + e.Message);
                return false;
            }
        }

        public SaverForm(Rectangle bounds, bool showLake, InputWatcher watcher)
        {
            this.watcher = watcher;
            Text = Program.Title;
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            Bounds = bounds;
            BackColor = Color.FromArgb(11, 42, 60);
            ShowInTaskbar = false;
            TopMost = true;
            KeyPreview = true;
            DoubleBuffered = true;
            Cursor.Hide();

            KeyDown += delegate { Program.Leave("key"); };
            MouseDown += delegate { Program.Leave("click"); };
            MouseMove += delegate { watcher.MouseMovedTo(Cursor.Position); };
            FormClosed += delegate
            {
                if (webView != null) webView.Dispose();
                Program.Exit("window closed");
            };
            if (showLake) Load += delegate { StartWebView(); };
            else BackColor = Color.Black;
        }

        async void StartWebView()
        {
            try
            {
                if (!File.Exists(Path.Combine(Program.SiteDir, "index.html")))
                    throw new FileNotFoundException("site folder missing", Program.SiteDir);
                CoreWebView2Environment.SetLoaderDllFolderPath(Program.AppDir);
                var options = new CoreWebView2EnvironmentOptions();
                var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.DataDir, "WebView2"), options);

                webView = new WebView2();
                webView.DefaultBackgroundColor = BackColor;
                webView.Dock = DockStyle.Fill;
                Controls.Add(webView);
                await webView.EnsureCoreWebView2Async(environment);
                Configure(webView.CoreWebView2);
                webView.CoreWebView2.Navigate(Program.PageAddress);
                Log.Write("webview2 " + environment.BrowserVersionString + " loading site");
            }
            catch (Exception e)
            {
                Log.Write("webview2 unavailable, showing the still photo: " + e.Message);
                if (webView != null) webView.Visible = false;
                still = Program.LoadStillPhoto("lake-1920.jpg");
                Invalidate();
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
            core.IsMuted = true; // silent, whatever the page does

            // The site folder, served under a private address with no network access.
            core.SetVirtualHostNameToFolderMapping(Program.Host, Program.SiteDir, CoreWebView2HostResourceAccessKind.Deny);
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (sender, e) =>
            {
                // Only network requests leave the machine; data: and blob: stay inside the page.
                Uri uri;
                if (!Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out uri)) return;
                bool network = uri.Scheme == "http" || uri.Scheme == "https" || uri.Scheme == "ws" || uri.Scheme == "wss";
                if (!network || uri.Host == Program.Host) return;
                Log.Write("blocked request: " + e.Request.Uri);
                e.Response = core.Environment.CreateWebResourceResponse(null, 403, "Blocked", "");
            };
            core.NavigationStarting += (sender, e) =>
            {
                if (!e.Uri.StartsWith("https://" + Program.Host + "/", StringComparison.OrdinalIgnoreCase))
                {
                    Log.Write("blocked navigation: " + e.Uri);
                    e.Cancel = true;
                }
            };
            core.NewWindowRequested += (sender, e) => { e.Handled = true; };
            core.PermissionRequested += (sender, e) =>
            {
                // Never the microphone, camera, location or anything else.
                e.State = CoreWebView2PermissionState.Deny;
                Log.Write("denied permission: " + e.PermissionKind);
            };
            core.WebMessageReceived += (sender, e) =>
            {
                string message = e.TryGetWebMessageAsString();
                if (message == null) return;
                if (message.StartsWith("exit: ")) Program.Exit("page: " + message.Substring(6));
                else if (message.StartsWith("leaving: ")) Program.Leave("page saw " + message.Substring(9));
                else Log.Write("page: " + message);
            };
            core.ProcessFailed += (sender, e) =>
            {
                Log.Write("webview2 process failed: " + e.ProcessFailedKind + " " + e.Reason);
                if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited) Program.Exit("browser process ended");
            };
            core.NavigationCompleted += (sender, e) =>
            {
                Log.Write("page loaded: " + (e.IsSuccess ? "ok" : "failed " + e.WebErrorStatus));
                if (e.IsSuccess) pageForm = this;
            };
            LogConsoleErrors(core);
        }

        // Console errors and uncaught exceptions go to the log file.
        static async void LogConsoleErrors(CoreWebView2 core)
        {
            try
            {
                core.GetDevToolsProtocolEventReceiver("Runtime.exceptionThrown").DevToolsProtocolEventReceived +=
                    (sender, e) => Log.Write("page exception: " + e.ParameterObjectAsJson);
                core.GetDevToolsProtocolEventReceiver("Runtime.consoleAPICalled").DevToolsProtocolEventReceived += (sender, e) =>
                {
                    string json = e.ParameterObjectAsJson;
                    if (json.Contains("\"type\":\"error\"") || json.Contains("\"type\":\"warning\"")) Log.Write("page console: " + json);
                };
                await core.CallDevToolsProtocolMethodAsync("Runtime.enable", "{}");
            }
            catch (Exception e)
            {
                Log.Write("console logging unavailable: " + e.Message);
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            if (still != null) Program.DrawCover(e.Graphics, still, ClientRectangle);
            else base.OnPaint(e);
        }
    }

    // The little preview in Screen Saver Settings: the still photo, drawn as
    // a child of the dialog's preview window. No WebView2, no full screen.
    class PreviewForm : Form
    {
        readonly IntPtr parent;
        readonly Image still = Program.LoadStillPhoto("lake-1280.jpg");
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();

        public PreviewForm(IntPtr parent)
        {
            this.parent = parent;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            DoubleBuffered = true;

            Native.SetParent(Handle, parent);
            Native.SetWindowLong(Handle, Native.GWL_STYLE, Native.WS_CHILD | Native.WS_VISIBLE);
            FitParent();

            // Close when the dialog closes or switches to another screensaver.
            timer.Interval = 250;
            timer.Tick += delegate
            {
                if (!Native.IsWindow(parent)) Close();
                else FitParent();
            };
            timer.Start();
        }

        void FitParent()
        {
            Native.RECT r;
            Native.GetClientRect(parent, out r);
            var size = new Size(r.Right - r.Left, r.Bottom - r.Top);
            if (Size != size || Location != Point.Empty)
            {
                Location = Point.Empty;
                Size = size;
                Invalidate();
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Program.DrawCover(e.Graphics, still, ClientRectangle);
            // No photo any more: show the scene's name on the dark panel.
            if (still == null)
            {
                using (var font = new Font("Georgia", Math.Max(8f, ClientRectangle.Height / 9f)))
                using (var brush = new SolidBrush(Color.FromArgb(150, 220, 235, 245)))
                {
                    var format = new StringFormat();
                    format.Alignment = StringAlignment.Center;
                    format.LineAlignment = StringAlignment.Center;
                    e.Graphics.DrawString(Program.SceneTitle ?? Program.Title, font, brush, ClientRectangle, format);
                }
            }
        }
    }

    class OwnerWindow : IWin32Window
    {
        readonly IntPtr handle;
        public OwnerWindow(IntPtr handle) { this.handle = handle; }
        public IntPtr Handle { get { return handle; } }
    }

    static class Log
    {
        static readonly object Gate = new object();
        static readonly int ProcessId = System.Diagnostics.Process.GetCurrentProcess().Id;

        public static void Write(string line)
        {
            try
            {
                lock (Gate)
                {
                    Directory.CreateDirectory(Program.DataDir);
                    string path = Path.Combine(Program.DataDir, "screensaver.log");
                    var info = new FileInfo(path);
                    if (info.Exists && info.Length > 512 * 1024) File.Delete(path); // keep it small
                    File.AppendAllText(path, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " [" + ProcessId + "] " + line + Environment.NewLine);
                }
            }
            catch (Exception)
            {
                // Logging must never stop the screensaver.
            }
        }
    }

    static class Native
    {
        public const int GWL_STYLE = -16;
        public const int WS_CHILD = 0x40000000;
        public const int WS_VISIBLE = 0x10000000;

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left, Top, Right, Bottom; }

        [StructLayout(LayoutKind.Sequential)]
        struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }

        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
        [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
        [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
        [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern uint GetLongPathName(string shortPath, StringBuilder longPath, uint size);

        // Windows may start us through a short (8.3) path; the file name must be the long one.
        public static string LongPath(string path)
        {
            var b = new StringBuilder(1024);
            return GetLongPathName(path, b, (uint)b.Capacity) > 0 ? b.ToString() : path;
        }

        public static uint LastInputTick()
        {
            var info = new LASTINPUTINFO();
            info.cbSize = (uint)Marshal.SizeOf(info);
            return GetLastInputInfo(ref info) ? info.dwTime : 0;
        }
    }
}
