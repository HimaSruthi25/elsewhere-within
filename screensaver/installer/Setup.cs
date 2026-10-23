// ElsewhereWithin-Setup.exe: installs the Elsewhere, Within screensaver for
// the current Windows user, with no administrator rights.
//
//   (no arguments)               install, with dialogs
//   /quiet                       install without dialogs (does not change the selected screensaver)
//   /uninstall [/quiet]          remove it (the installed Uninstall.exe is a copy of this program)
//   /simulate-missing-webview2   act as if WebView2 were missing (to test that path)
//
// The finished screensaver (screensaver\out) travels inside as payload.zip;
// Microsoft's WebView2 Runtime bootstrapper travels inside in case the PC
// lacks the runtime. Built by build-installer.ps1 with Windows' C# 5 compiler.

using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ElsewhereWithin.Setup
{
    static class Program
    {
        const string Title = "Elsewhere, Within";
        const string ProductName = "Elsewhere, Within screensaver";
        const string Version = "1.0.0";
        const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\ElsewhereWithin";
        const string WebView2Client = @"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
        static readonly string[] OurItems =
        {
            "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll",
            "WebView2Loader.dll", "site", "Uninstall.exe",
        };
        // One "Elsewhere - <Scene title>.scr" per scene, plus the single
        // ElsewhereWithin.scr of earlier versions.
        const string ScrPrefix = "Elsewhere - ";
        const string OldScr = "ElsewhereWithin.scr";

        static bool IsOurs(string name)
        {
            return Array.IndexOf(OurItems, name) >= 0 || IsScr(name);
        }

        static bool IsScr(string name)
        {
            return string.Equals(name, OldScr, StringComparison.OrdinalIgnoreCase) ||
                (name.StartsWith(ScrPrefix, StringComparison.OrdinalIgnoreCase) && name.EndsWith(".scr", StringComparison.OrdinalIgnoreCase));
        }

        static string LocalAppData { get { return Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData); } }
        static string InstallDir { get { return Path.Combine(LocalAppData, "Programs", "ElsewhereWithin"); } }
        // The screensaver Setup selects: the default scene's, from site\scenes.json.
        static string ScrPath
        {
            get
            {
                string title = null;
                try
                {
                    string json = File.ReadAllText(Path.Combine(InstallDir, "site", "scenes.json"));
                    Match d = Regex.Match(json, "\"default\"\\s*:\\s*\"([^\"]*)\"");
                    foreach (Match m in Regex.Matches(json, "\\{\\s*\"id\"\\s*:\\s*\"([^\"]*)\"\\s*,\\s*\"title\"\\s*:\\s*\"([^\"]*)\"\\s*\\}"))
                        if (d.Success && m.Groups[1].Value == d.Groups[1].Value) title = m.Groups[2].Value;
                }
                catch (Exception e) { Log("scenes.json unreadable: " + e.Message); }
                if (title != null && File.Exists(Path.Combine(InstallDir, ScrPrefix + title + ".scr")))
                    return Path.Combine(InstallDir, ScrPrefix + title + ".scr");
                foreach (string path in Directory.GetFiles(InstallDir, ScrPrefix + "*.scr")) return path;
                return Path.Combine(InstallDir, OldScr);
            }
        }
        static string UninstallerPath { get { return Path.Combine(InstallDir, "Uninstall.exe"); } }
        static string DataDir { get { return Path.Combine(LocalAppData, "ElsewhereWithin"); } } // WebView2 data and log
        static string ShortcutPath
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), ProductName + ".lnk"); }
        }
        static string Rundll32 { get { return Path.Combine(Environment.SystemDirectory, "rundll32.exe"); } }
        // Selects the screensaver and opens Screen Saver Settings. The path is
        // unquoted, exactly like Windows' own Install verb (%l): rundll32 passes
        // the rest of the line through, spaces included, and quotes would be
        // stored as part of the path, which the Settings list cannot match.
        static string SelectArguments { get { return "desk.cpl,InstallScreenSaver " + ScrPath; } }

        static bool quiet;

        [STAThread]
        static int Main(string[] args)
        {
            bool uninstall = false;
            bool simulateMissing = false;
            foreach (string arg in args)
            {
                string a = arg.ToLowerInvariant();
                if (a == "/quiet") quiet = true;
                else if (a == "/uninstall") uninstall = true;
                else if (a == "/simulate-missing-webview2") simulateMissing = true;
            }
            Application.EnableVisualStyles();
            Log("start " + string.Join(" ", args));
            try
            {
                int code = uninstall ? Uninstall() : Install(simulateMissing);
                Log("end, code " + code);
                return code;
            }
            catch (Exception e)
            {
                Log("failed: " + e);
                Tell("Something went wrong:\n\n" + e.Message, MessageBoxIcon.Error);
                return 1;
            }
        }

        // ---------- install ----------

        static int Install(bool simulateMissing)
        {
            if (!Ask("Install the " + ProductName + " for " + Environment.UserName + "?\n\n" +
                "Quiet scenes for your screen, each its own entry in Screen Saver Settings. It is silent and never uses the microphone.\n\n" +
                "It installs to your user folder and does not need administrator rights.", MessageBoxIcon.Question))
                return 2;

            EnsureWebView2(simulateMissing);

            // The folder belongs to the screensaver; never touch one holding anything else.
            if (Directory.Exists(InstallDir))
            {
                foreach (string path in Directory.GetFileSystemEntries(InstallDir))
                    if (!IsOurs(Path.GetFileName(path)))
                        throw new IOException(InstallDir + " contains files that are not the screensaver's (" + Path.GetFileName(path) + "); nothing was changed.");
            }

            StopScreensaver();
            Directory.CreateDirectory(InstallDir);
            ClearSelectionIfOurs(true); // an old single ElsewhereWithin.scr is about to go away
            foreach (string path in Directory.GetFileSystemEntries(InstallDir)) Delete(path);
            ExtractPayload();
            File.Copy(Application.ExecutablePath, UninstallerPath, true);
            Register();
            CreateShortcut();
            Log("installed to " + InstallDir);

            if (!quiet)
            {
                Tell(ProductName + " is installed.\n\n" +
                    "Screen Saver Settings opens next with the default scene selected; every scene is in its list as \"Elsewhere - ...\". Choose how many minutes to Wait, then click OK.\n\n" +
                    "To select it again later: Start menu > " + ProductName + ".\n" +
                    "To remove it: Settings > Apps > Installed apps > " + ProductName + " > Uninstall.", MessageBoxIcon.Information);
                // Windows' own install command, as used by right-click > Install on a .scr.
                Process.Start(Rundll32, SelectArguments);
            }
            return 0;
        }

        static void EnsureWebView2(bool simulateMissing)
        {
            string version = simulateMissing ? null : WebView2Version();
            if (version != null)
            {
                Log("WebView2 Runtime " + version + " found");
                return;
            }
            Log("WebView2 Runtime missing" + (simulateMissing ? " (simulated)" : ""));
            if (quiet) return;
            if (Ask("This PC is missing the Microsoft Edge WebView2 Runtime, which draws the moving water.\n\n" +
                "Install it now? Microsoft's installer will download it (internet needed).\n\n" +
                "Without it the screensaver shows the still lake photo.", MessageBoxIcon.Warning))
            {
                RunWebView2Installer();
                version = simulateMissing ? null : WebView2Version();
                Log("after WebView2 installer: " + (version ?? "still missing"));
                if (version == null)
                    Tell("The WebView2 Runtime is still not installed, so the screensaver will show the still photo.\n\n" +
                        "You can install it later from Microsoft (search \"WebView2 Runtime download\") and the water will move.", MessageBoxIcon.Warning);
            }
            else
            {
                Tell("Continuing without the WebView2 Runtime: the screensaver will show the still lake photo until it is installed.", MessageBoxIcon.Information);
            }
        }

        // Microsoft's documented check: the runtime's "pv" value, per machine or per user.
        static string WebView2Version()
        {
            foreach (RegistryHive hive in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
                foreach (RegistryView view in new[] { RegistryView.Registry32, RegistryView.Registry64 })
                    using (RegistryKey root = RegistryKey.OpenBaseKey(hive, view))
                    using (RegistryKey key = root.OpenSubKey(WebView2Client))
                    {
                        string pv = key == null ? null : key.GetValue("pv") as string;
                        if (!string.IsNullOrEmpty(pv) && pv != "0.0.0.0") return pv;
                    }
            return null;
        }

        static void RunWebView2Installer()
        {
            string path = Path.Combine(Path.GetTempPath(), "ElsewhereWithin-WebView2Setup.exe");
            using (Stream resource = Resource("MicrosoftEdgeWebview2Setup.exe"))
            using (FileStream file = File.Create(path))
                resource.CopyTo(file);
            try
            {
                using (Process p = Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }))
                    p.WaitForExit();
            }
            catch (Exception e)
            {
                Log("WebView2 installer did not run: " + e.Message);
            }
            finally
            {
                try { File.Delete(path); } catch (Exception) { }
            }
        }

        static void ExtractPayload()
        {
            string root = Path.GetFullPath(InstallDir) + Path.DirectorySeparatorChar;
            using (Stream stream = Resource("payload.zip"))
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                foreach (ZipArchiveEntry entry in zip.Entries)
                {
                    string target = Path.GetFullPath(Path.Combine(root, entry.FullName));
                    if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new IOException("bad path in payload: " + entry.FullName);
                    if (entry.Name.Length == 0) { Directory.CreateDirectory(target); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    entry.ExtractToFile(target, true);
                }
            }
        }

        // Settings > Apps lists it, with an Uninstall button (per user, no admin).
        static void Register()
        {
            long size = 0;
            foreach (string f in Directory.GetFiles(InstallDir, "*", SearchOption.AllDirectories)) size += new FileInfo(f).Length;
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
            {
                key.SetValue("DisplayName", ProductName);
                key.SetValue("DisplayVersion", Version);
                key.SetValue("Publisher", Title);
                key.SetValue("InstallLocation", InstallDir);
                key.SetValue("DisplayIcon", Path.Combine(Environment.SystemDirectory, "desk.cpl") + ",0");
                key.SetValue("UninstallString", "\"" + UninstallerPath + "\" /uninstall");
                key.SetValue("QuietUninstallString", "\"" + UninstallerPath + "\" /uninstall /quiet");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                key.SetValue("EstimatedSize", (int)(size / 1024), RegistryValueKind.DWord);
                key.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
            }
        }

        // Start menu entry that opens Screen Saver Settings with it selected,
        // for picking it again after choosing another screensaver.
        static void CreateShortcut()
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(shellType);
            try
            {
                object link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { ShortcutPath });
                Type t = link.GetType();
                t.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { Rundll32 });
                t.InvokeMember("Arguments", BindingFlags.SetProperty, null, link, new object[] { SelectArguments });
                t.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { "Select the " + ProductName + " in Screen Saver Settings" });
                t.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { Path.Combine(Environment.SystemDirectory, "desk.cpl") + ",0" });
                t.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
                Marshal.FinalReleaseComObject(link);
            }
            finally
            {
                Marshal.FinalReleaseComObject(shell);
            }
        }

        // ---------- uninstall ----------

        static int Uninstall()
        {
            if (!Ask("Remove the " + ProductName + "?", MessageBoxIcon.Question)) return 2;
            Environment.CurrentDirectory = Path.GetTempPath(); // so the folder is not held open

            StopScreensaver();
            ClearSelectionIfOurs(false);
            Delete(ShortcutPath);
            Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);
            DeleteWithRetry(DataDir);

            string self = Path.GetFullPath(Application.ExecutablePath);
            bool runningFromInstall = string.Equals(self, Path.GetFullPath(UninstallerPath), StringComparison.OrdinalIgnoreCase);
            if (Directory.Exists(InstallDir))
            {
                foreach (string path in Directory.GetFileSystemEntries(InstallDir))
                {
                    string name = Path.GetFileName(path);
                    if (IsOurs(name) && !(runningFromInstall && name == "Uninstall.exe")) DeleteWithRetry(path);
                }
                bool onlySelfLeft = Directory.GetFileSystemEntries(InstallDir).Length == (runningFromInstall ? 1 : 0);
                if (runningFromInstall)
                {
                    // A running program cannot delete itself; finish just after it exits.
                    string what = onlySelfLeft ? "rmdir /s /q \"" + InstallDir + "\"" : "del /f /q \"" + UninstallerPath + "\"";
                    var info = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "cmd.exe"), "/c ping 127.0.0.1 -n 3 > nul & " + what);
                    info.UseShellExecute = false;
                    info.CreateNoWindow = true;
                    info.WorkingDirectory = Path.GetTempPath();
                    Process.Start(info);
                }
                else if (onlySelfLeft)
                {
                    Directory.Delete(InstallDir);
                }
            }
            Log("uninstalled");
            Tell(ProductName + " has been removed.", MessageBoxIcon.Information);
            return 0;
        }

        // The same as choosing (None) in Screen Saver Settings, only if one of our
        // .scr files is selected (any scene's; with oldOnly, just the single
        // ElsewhereWithin.scr of earlier versions, which is about to be removed).
        static void ClearSelectionIfOurs(bool oldOnly)
        {
            using (RegistryKey desktop = Registry.CurrentUser.OpenSubKey(@"Control Panel\Desktop", true))
            {
                // Windows may store it quoted, long or short (8.3) form.
                string selected = desktop == null ? null : desktop.GetValue("SCRNSAVE.EXE") as string;
                if (selected != null) selected = selected.Trim().Trim('"');
                if (string.IsNullOrEmpty(selected) || !Directory.Exists(InstallDir) || !File.Exists(selected)) return;
                string folder = Path.GetDirectoryName(selected);
                string name = Path.GetFileName(selected);
                if (!string.Equals(ShortPath(folder), ShortPath(InstallDir), StringComparison.OrdinalIgnoreCase)) return;
                // A short-form name (ELSEWH~1.SCR) cannot be matched by prefix; use the long name.
                name = Path.GetFileName(LongPath(selected));
                bool ours = oldOnly ? string.Equals(name, OldScr, StringComparison.OrdinalIgnoreCase) : IsScr(name);
                if (ours)
                {
                    desktop.DeleteValue("SCRNSAVE.EXE", false);
                    Log("screensaver selection set back to (None)");
                }
            }
        }
        // ---------- helpers ----------

        static void StopScreensaver()
        {
            foreach (Process p in Process.GetProcesses())
            {
                string name = p.ProcessName;
                if (name != "ElsewhereWithin" && !IsScr(name + ".scr")) continue;
                try { p.Kill(); p.WaitForExit(3000); } catch (Exception) { }
            }
            System.Threading.Thread.Sleep(500); // let its WebView2 processes close
        }

        static Stream Resource(string name)
        {
            Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
            if (s == null) throw new InvalidOperationException("installer is missing " + name);
            return s;
        }

        static void Delete(string path)
        {
            if (Directory.Exists(path)) Directory.Delete(path, true);
            else if (File.Exists(path)) File.Delete(path);
        }

        static void DeleteWithRetry(string path)
        {
            for (int i = 0; ; i++)
            {
                try { Delete(path); return; }
                catch (IOException) { if (i >= 10) throw; }
                catch (UnauthorizedAccessException) { if (i >= 10) throw; }
                System.Threading.Thread.Sleep(300);
            }
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        static extern uint GetShortPathName(string longPath, StringBuilder shortPath, uint size);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        static extern uint GetLongPathName(string shortPath, StringBuilder longPath, uint size);

        static string LongPath(string path)
        {
            var b = new StringBuilder(1024);
            return GetLongPathName(path, b, (uint)b.Capacity) > 0 ? b.ToString() : path;
        }

        static string ShortPath(string path)
        {
            var b = new StringBuilder(1024);
            return GetShortPathName(path, b, (uint)b.Capacity) > 0 ? b.ToString() : path;
        }

        static bool Ask(string text, MessageBoxIcon icon)
        {
            if (quiet) return true;
            return MessageBox.Show(text, Title, MessageBoxButtons.YesNo, icon) == DialogResult.Yes;
        }

        static void Tell(string text, MessageBoxIcon icon)
        {
            if (!quiet) MessageBox.Show(text, Title, MessageBoxButtons.OK, icon);
        }

        static void Log(string line)
        {
            try
            {
                File.AppendAllText(Path.Combine(Path.GetTempPath(), "ElsewhereWithin-Setup.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + line + Environment.NewLine);
            }
            catch (Exception) { }
        }
    }
}
