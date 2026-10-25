// The decisions of ElsewhereUpdate that need no network or Windows, so they can
// be tested alone (updater\test.ps1). C# 5 only.

using System;
using System.Collections;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace ElsewhereUpdate
{
    public class ReleaseInfo
    {
        public string Tag;
        public Version Version;
        public bool Prerelease;
        public string InstallerUrl;
        public string SumsUrl;
    }

    public static class UpdateLogic
    {
        public const string Repo = "HimaSruthi25/elsewhere-within";
        public const string InstallerName = "ElsewhereWithin-Setup.exe";
        public const string SumsName = "SHA256SUMS.txt";

        // "v0.1.1" or "0.1.1". Anything else (a suffix like "-beta", a missing part) is not a release we update to.
        public static bool TryParseVersion(string text, out Version version)
        {
            version = null;
            if (text == null) return false;
            Match m = Regex.Match(text.Trim(), @"^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$");
            if (!m.Success) return false;
            version = new Version(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value));
            return true;
        }

        public static bool IsNewer(string candidate, string current)
        {
            Version c, k;
            if (!TryParseVersion(candidate, out c)) return false;
            if (!TryParseVersion(current, out k)) return false; // unknown installed version: never guess
            return c > k;
        }

        // The GitHub "list releases" JSON. Drafts and releases without both files are left out.
        public static List<ReleaseInfo> ParseReleases(string json)
        {
            var result = new List<ReleaseInfo>();
            object root;
            try { root = new JavaScriptSerializer().DeserializeObject(json); }
            catch (Exception) { return result; }
            IEnumerable items = root as IEnumerable;
            if (items == null || root is string) return result;
            foreach (object item in items)
            {
                var release = item as Dictionary<string, object>;
                if (release == null) continue;
                if (Flag(release, "draft")) continue;
                var info = new ReleaseInfo();
                info.Tag = Text(release, "tag_name");
                if (!TryParseVersion(info.Tag, out info.Version)) continue;
                info.Prerelease = Flag(release, "prerelease");
                object assets;
                if (release.TryGetValue("assets", out assets) && assets is IEnumerable)
                {
                    foreach (object a in (IEnumerable)assets)
                    {
                        var asset = a as Dictionary<string, object>;
                        if (asset == null) continue;
                        string name = Text(asset, "name");
                        string url = Text(asset, "browser_download_url");
                        if (name == InstallerName) info.InstallerUrl = url;
                        else if (name == SumsName) info.SumsUrl = url;
                    }
                }
                if (info.InstallerUrl != null && info.SumsUrl != null && IsAllowedDownloadUrl(info.InstallerUrl) && IsAllowedDownloadUrl(info.SumsUrl))
                    result.Add(info);
            }
            return result;
        }

        static bool Flag(Dictionary<string, object> d, string key)
        {
            object v;
            return d.TryGetValue(key, out v) && v is bool && (bool)v;
        }

        static string Text(Dictionary<string, object> d, string key)
        {
            object v;
            return d.TryGetValue(key, out v) ? v as string : null;
        }

        // The highest version, pre-releases included (the project releases only pre-releases for now).
        public static ReleaseInfo PickLatest(List<ReleaseInfo> releases)
        {
            ReleaseInfo best = null;
            foreach (ReleaseInfo r in releases)
                if (best == null || r.Version > best.Version) best = r;
            return best;
        }

        // Downloads must come from this project's releases on GitHub, over https.
        public static bool IsAllowedDownloadUrl(string url)
        {
            Uri u;
            if (url == null || !Uri.TryCreate(url, UriKind.Absolute, out u)) return false;
            if (u.Scheme != "https" || !u.IsDefaultPort) return false;
            return u.Host == "github.com" && u.AbsolutePath.StartsWith("/" + Repo + "/releases/download/", StringComparison.Ordinal);
        }

        // SHA256SUMS.txt lines look like "<64 hex>  <file name>" (sha256sum also writes "*" before binary names).
        public static string FindHash(string sums, string fileName)
        {
            if (sums == null) return null;
            foreach (string line in sums.Split('\n'))
            {
                Match m = Regex.Match(line.Trim(), @"^([0-9a-fA-F]{64})\s+\*?(.+)$");
                if (m.Success && m.Groups[2].Value.Trim() == fileName) return m.Groups[1].Value.ToLowerInvariant();
            }
            return null;
        }

        public static bool HashesMatch(string expected, string actual)
        {
            return !string.IsNullOrEmpty(expected) && !string.IsNullOrEmpty(actual) &&
                string.Equals(expected.Trim(), actual.Trim(), StringComparison.OrdinalIgnoreCase);
        }
    }
}