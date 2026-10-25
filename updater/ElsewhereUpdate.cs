// ElsewhereUpdate.exe: keeps Elsewhere, Within up to date. Installed with the app.
//
//   (no arguments), /scheduled   what the scheduled task runs: check, and update if newer
//   /now                         check now even if automatic updates are off (used by Settings)
//   /register                    create or refresh the per-user scheduled task (no admin)
//   /unregister                  remove the scheduled task
//
// It asks api.github.com for this project's releases; if one is newer than the
// installed version, it downloads the installer and SHA256SUMS.txt, checks the hash,
// and runs the installer with /quiet (which keeps the selected screensaver).
// It never runs while a screensaver is active. Only this program uses the network;
// the scenes stay offline. Log: %LOCALAPPDATA%\ElsewhereWithin\update.log.
//
// Built with the C# 5 compiler that ships with Windows (see updater\build.ps1).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32;

namespace ElsewhereUpdate
{
    static class Program
    {
        // Exit codes (Settings > "Check now" reads them).
        const int UpToDate = 0, UpdateStarted = 3, NoConnection = 4, Failed = 5;

        const string TaskName = "ElsewhereWithin Update";
        const string SettingsKey = @"Software\ElsewhereWithin\Updates";
        const long MaxInstallerBytes = 100L * 1024 * 1024;

        static string LocalAppData { get { return Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData); } }
        static string DataDir { get { return Path.Combine(LocalAppData, "ElsewhereWithin"); } }
        static string InstallDir { get { return Path.Combine(LocalAppData, @"Programs\ElsewhereWithin"); } }
        static string WorkDir { get { return Path.Combine(Path.GetTempPath(), "ElsewhereWithin-update"); } }
        static string ThisExe { get { return System.Reflection.Assembly.GetExecutingAssembly().Location; } }

        static int Main(string[] args)
        {
            string mode = args.Length > 0 ? args[0].Trim().ToLowerInvariant() : "/scheduled";
            Log("start " + mode + ", installed version " + BuildInfo.Version);
            try
            {
                if (mode == "/register") return Register();
                if (mode == "/unregister") return Unregister();
                return Check(mode == "/now");
            }
            catch (WebException e)
            {
                var response = e.Response as HttpWebResponse;
                Log(response != null ? "GitHub answered " + (int)response.StatusCode + " " + response.StatusDescription + " (no releases published yet, or rate limited)" : "no connection or GitHub unreachable: " + e.Message);
                return NoConnection;
            }
            catch (Exception e)
            {
                Log("failed: " + e);
                return Failed;
            }
        }

        // ---------- the update check ----------

        static int Check(bool forced)
        {
            if (!forced && !AutomaticUpdatesOn())
            {
                Log("automatic updates are off; nothing to do");
                return UpToDate;
            }
            if (ScreensaverActive())
            {
                Log("a screensaver is active; will try again at the next run");
                return UpToDate;
            }
            CleanOldDownloads();

            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
            string json = Download("https://api.github.com/repos/" + UpdateLogic.Repo + "/releases?per_page=20", 1024 * 1024);
            ReleaseInfo latest = UpdateLogic.PickLatest(UpdateLogic.ParseReleases(json));
            if (latest == null)
            {
                Log("no installable release found");
                return UpToDate;
            }
            if (!UpdateLogic.IsNewer(latest.Tag, BuildInfo.Version))
            {
                Log("up to date (latest release " + latest.Tag + ")");
                return UpToDate;
            }
            Log("newer release " + latest.Tag + (latest.Prerelease ? " (pre-release)" : "") + " found; downloading");

            string folder = Path.Combine(WorkDir, latest.Tag);
            Directory.CreateDirectory(folder);
            string sums = Download(latest.SumsUrl, 64 * 1024);
            string expected = UpdateLogic.FindHash(sums, UpdateLogic.InstallerName);
            if (expected == null)
            {
                Log("SHA256SUMS.txt has no entry for " + UpdateLogic.InstallerName + "; not installing");
                return Failed;
            }
            string installer = Path.Combine(folder, UpdateLogic.InstallerName);
            DownloadFile(latest.InstallerUrl, installer, MaxInstallerBytes);
            string actual = Sha256(installer);
            if (!UpdateLogic.HashesMatch(expected, actual))
            {
                Log("HASH MISMATCH, not installing. expected " + expected + " got " + actual);
                File.Delete(installer);
                return Failed;
            }
            Log("hash verified " + actual);

            // Checked again: the download may have taken a while.
            if (ScreensaverActive())
            {
                Log("a screensaver started during the download; will install at the next run");
                return UpToDate;
            }
            // The installer replaces the files this program runs from, so it is started
            // and we leave at once; it writes its own result to this log.
            var start = new ProcessStartInfo(installer, "/quiet /fromupdater");
            start.UseShellExecute = false;
            Process.Start(start);
            Log("installer started (" + latest.Tag + "); leaving");
            return UpdateStarted;
        }

        static bool AutomaticUpdatesOn()
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(SettingsKey))
            {
                object v = key == null ? null : key.GetValue("Automatic");
                return !(v is int) || (int)v != 0; // on unless switched off
            }
        }

        // Any screensaver running full screen: Windows says so, or one of ours was started
        // with /s (the Settings dialog /c and the small preview /p do not count).
        static bool ScreensaverActive()
        {
            bool running;
            if (NativeMethods.SystemParametersInfo(0x0072 /* SPI_GETSCREENSAVERRUNNING */, 0, out running, 0) && running) return true;
            try
            {
                using (var search = new System.Management.ManagementObjectSearcher(
                    "SELECT CommandLine FROM Win32_Process WHERE Name LIKE 'Elsewhere - %' OR Name LIKE 'ElsewhereWithin%.scr'"))
                {
                    foreach (System.Management.ManagementBaseObject o in search.Get())
                    {
                        string commandLine = o["CommandLine"] as string;
                        if (commandLine != null && System.Text.RegularExpressions.Regex.IsMatch(commandLine, @"\s[/-]s(\s|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return true;
                    }
                }
            }
            catch (Exception e)
            {
                Log("could not list processes: " + e.Message);
            }
            return false;
        }
        // ---------- network ----------

        static HttpWebRequest Request(string url)
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.UserAgent = "ElsewhereWithin-Updater/" + BuildInfo.Version;
            request.Accept = "application/vnd.github+json, application/octet-stream";
            request.Headers["X-GitHub-Api-Version"] = "2022-11-28";
            request.Timeout = 20000;
            request.ReadWriteTimeout = 30000;
            request.AllowAutoRedirect = true;
            request.Proxy = WebRequest.GetSystemWebProxy();
            request.Proxy.Credentials = CredentialCache.DefaultCredentials;
            return request;
        }

        static string Download(string url, int maxBytes)
        {
            Log("GET " + url);
            using (WebResponse response = Request(url).GetResponse())
            using (Stream stream = response.GetResponseStream())
            using (var memory = new MemoryStream())
            {
                CopyLimited(stream, memory, maxBytes);
                return Encoding.UTF8.GetString(memory.ToArray());
            }
        }

        static void DownloadFile(string url, string path, long maxBytes)
        {
            Log("GET " + url);
            using (WebResponse response = Request(url).GetResponse())
            {
                // Redirects (to GitHub's download servers) are followed; the final address must still be on GitHub.
                string host = response.ResponseUri.Host;
                if (response.ResponseUri.Scheme != "https" || !(host == "github.com" || host.EndsWith(".githubusercontent.com", StringComparison.Ordinal)))
                    throw new IOException("download redirected to an unexpected address: " + response.ResponseUri);
                using (Stream stream = response.GetResponseStream())
                using (FileStream file = File.Create(path))
                    CopyLimited(stream, file, maxBytes);
            }
        }

        static void CopyLimited(Stream from, Stream to, long maxBytes)
        {
            var buffer = new byte[64 * 1024];
            long total = 0;
            int n;
            while ((n = from.Read(buffer, 0, buffer.Length)) > 0)
            {
                total += n;
                if (total > maxBytes) throw new IOException("download is larger than expected");
                to.Write(buffer, 0, n);
            }
        }

        static string Sha256(string path)
        {
            using (var sha = SHA256.Create())
            using (FileStream file = File.OpenRead(path))
            {
                var sb = new StringBuilder();
                foreach (byte b in sha.ComputeHash(file)) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        static void CleanOldDownloads()
        {
            try
            {
                if (Directory.Exists(WorkDir)) Directory.Delete(WorkDir, true);
            }
            catch (Exception)
            {
                // In use by a running installer: leave it.
            }
        }

        // ---------- the scheduled task ----------

        // Per user, no admin rights: at logon (after a short delay) and once a day.
        // If the PC was off at the daily time, it runs when the PC is next on.
        static int Register()
        {
            string exe = Path.GetFullPath(ThisExe);
            if (!string.Equals(Path.GetDirectoryName(exe), Path.GetFullPath(InstallDir), StringComparison.OrdinalIgnoreCase))
            {
                Log("not registering the task: this copy is not in " + InstallDir);
                return Failed;
            }
            string user = WindowsIdentity.GetCurrent().Name;
            string today = DateTime.Now.ToString("yyyy-MM-dd");
            string xml =
                "<?xml version=\"1.0\" encoding=\"UTF-16\"?>\r\n" +
                "<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">\r\n" +
                "  <RegistrationInfo><Description>Checks GitHub for a newer Elsewhere, Within and installs it quietly.</Description></RegistrationInfo>\r\n" +
                "  <Triggers>\r\n" +
                "    <LogonTrigger><Enabled>true</Enabled><UserId>" + Xml(user) + "</UserId><Delay>PT3M</Delay></LogonTrigger>\r\n" +
                "    <CalendarTrigger><StartBoundary>" + today + "T12:30:00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>\r\n" +
                "  </Triggers>\r\n" +
                "  <Principals><Principal id=\"Author\"><UserId>" + Xml(user) + "</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>\r\n" +
                "  <Settings>\r\n" +
                "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\r\n" +
                "    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\r\n" +
                "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>\r\n" +
                "    <StartWhenAvailable>true</StartWhenAvailable>\r\n" +
                "    <Hidden>true</Hidden>\r\n" +
                "    <ExecutionTimeLimit>PT30M</ExecutionTimeLimit>\r\n" +
                "  </Settings>\r\n" +
                "  <Actions Context=\"Author\"><Exec><Command>" + Xml(exe) + "</Command><Arguments>/scheduled</Arguments></Exec></Actions>\r\n" +
                "</Task>\r\n";
            string file = Path.Combine(Path.GetTempPath(), "ElsewhereWithin-update-task.xml");
            File.WriteAllText(file, xml, Encoding.Unicode);
            try
            {
                int code = RunSchtasks("/Create /TN \"" + TaskName + "\" /XML \"" + file + "\" /F");
                Log(code == 0 ? "scheduled task registered" : "scheduled task could not be registered (schtasks " + code + ")");
                return code == 0 ? UpToDate : Failed;
            }
            finally
            {
                try { File.Delete(file); } catch (Exception) { }
            }
        }

        static int Unregister()
        {
            int code = RunSchtasks("/Delete /TN \"" + TaskName + "\" /F");
            Log("scheduled task removed (schtasks " + code + ")");
            return UpToDate;
        }

        static int RunSchtasks(string arguments)
        {
            var info = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "schtasks.exe"), arguments);
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            using (Process p = Process.Start(info))
            {
                p.WaitForExit(30000);
                return p.HasExited ? p.ExitCode : -1;
            }
        }

        static string Xml(string text)
        {
            return text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
        }

        // ---------- log ----------

        static void Log(string line)
        {
            try
            {
                Directory.CreateDirectory(DataDir);
                string path = Path.Combine(DataDir, "update.log");
                var info = new FileInfo(path);
                if (info.Exists && info.Length > 256 * 1024) File.Delete(path);
                File.AppendAllText(path, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " [updater] " + line + Environment.NewLine);
            }
            catch (Exception)
            {
                // Logging must never stop the updater.
            }
        }
    }

    static class NativeMethods
    {
        [DllImport("user32.dll")]
        public static extern bool SystemParametersInfo(uint action, uint param, out bool value, uint flags);
    }
}
