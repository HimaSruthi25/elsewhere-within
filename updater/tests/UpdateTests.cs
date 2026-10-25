// Tests for UpdateLogic.cs. Run: powershell -ExecutionPolicy Bypass -File updater\test.ps1
using System;
using System.Collections.Generic;
using ElsewhereUpdate;

static class UpdateTests
{
    static int failures;
    static int checks;

    static void Check(bool ok, string name)
    {
        checks++;
        if (!ok) { failures++; Console.WriteLine("FAIL: " + name); }
    }

    static string Asset(string name, string tag)
    {
        return "{\"name\":\"" + name + "\",\"browser_download_url\":\"https://github.com/HimaSruthi25/elsewhere-within/releases/download/" + tag + "/" + name + "\"}";
    }

    static string Release(string tag, bool draft, bool pre, params string[] assets)
    {
        return "{\"tag_name\":\"" + tag + "\",\"draft\":" + (draft ? "true" : "false") + ",\"prerelease\":" + (pre ? "true" : "false") + ",\"assets\":[" + string.Join(",", assets) + "]}";
    }

    static int Main()
    {
        // Versions.
        Version v;
        Check(UpdateLogic.TryParseVersion("v0.1.1", out v) && v == new Version(0, 1, 1), "v-prefixed");
        Check(UpdateLogic.TryParseVersion("1.2.3", out v) && v == new Version(1, 2, 3), "plain");
        foreach (string bad in new string[] { "", null, "v1", "1.2", "1.2.3.4", "v1.2.3-beta", "latest", "v1.2.x" })
            Check(!UpdateLogic.TryParseVersion(bad, out v), "not a version: " + bad);
        Check(UpdateLogic.IsNewer("v0.1.1", "0.1.0"), "0.1.1 > 0.1.0");
        Check(UpdateLogic.IsNewer("v0.10.0", "0.9.9"), "0.10.0 > 0.9.9 (numeric, not text)");
        Check(!UpdateLogic.IsNewer("v0.1.0", "0.1.0"), "same version is not newer");
        Check(!UpdateLogic.IsNewer("v0.0.9", "0.1.0"), "older is not newer");
        Check(!UpdateLogic.IsNewer("garbage", "0.1.0"), "garbage candidate");
        Check(!UpdateLogic.IsNewer("v9.9.9", "dev"), "unknown installed version: never update");

        // Releases JSON.
        string json = "[" +
            Release("v0.1.1", false, true, Asset("ElsewhereWithin-Setup.exe", "v0.1.1"), Asset("SHA256SUMS.txt", "v0.1.1")) + "," +
            Release("v0.2.0", true, true, Asset("ElsewhereWithin-Setup.exe", "v0.2.0"), Asset("SHA256SUMS.txt", "v0.2.0")) + "," +
            Release("v0.1.5", false, true, Asset("ElsewhereWithin-Setup.exe", "v0.1.5")) + "," +
            Release("nightly", false, true, Asset("ElsewhereWithin-Setup.exe", "nightly"), Asset("SHA256SUMS.txt", "nightly")) + "," +
            Release("v0.1.0", false, false, Asset("ElsewhereWithin-Setup.exe", "v0.1.0"), Asset("SHA256SUMS.txt", "v0.1.0")) +
            "]";
        List<ReleaseInfo> releases = UpdateLogic.ParseReleases(json);
        Check(releases.Count == 2, "drafts, releases missing the sums file and non-version tags are left out (got " + releases.Count + ")");
        ReleaseInfo best = UpdateLogic.PickLatest(releases);
        Check(best != null && best.Tag == "v0.1.1" && best.Prerelease, "latest is v0.1.1, a pre-release");
        Check(UpdateLogic.PickLatest(new List<ReleaseInfo>()) == null, "no releases -> null");
        Check(UpdateLogic.ParseReleases("not json").Count == 0, "garbage json");
        Check(UpdateLogic.ParseReleases("{\"message\":\"Not Found\"}").Count == 0, "an API error object");
        Check(UpdateLogic.ParseReleases("[]").Count == 0, "empty list");

        // Downloads only from our own repo's releases.
        Check(UpdateLogic.IsAllowedDownloadUrl("https://github.com/HimaSruthi25/elsewhere-within/releases/download/v0.1.1/ElsewhereWithin-Setup.exe"), "own release url");
        Check(!UpdateLogic.IsAllowedDownloadUrl("http://github.com/HimaSruthi25/elsewhere-within/releases/download/v1/x"), "http refused");
        Check(!UpdateLogic.IsAllowedDownloadUrl("https://github.com/someone-else/elsewhere-within/releases/download/v1/x"), "other repo refused");
        Check(!UpdateLogic.IsAllowedDownloadUrl("https://evil.example/HimaSruthi25/elsewhere-within/releases/download/v1/x"), "other host refused");
        Check(!UpdateLogic.IsAllowedDownloadUrl("https://github.com.evil.example/HimaSruthi25/elsewhere-within/releases/download/v1/x"), "look-alike host refused");
        Check(!UpdateLogic.IsAllowedDownloadUrl("https://github.com:8443/HimaSruthi25/elsewhere-within/releases/download/v1/x"), "other port refused");
        Check(!UpdateLogic.IsAllowedDownloadUrl(null) && !UpdateLogic.IsAllowedDownloadUrl("not a url"), "null and garbage refused");
        string tricky = "[" + Release("v0.3.0", false, false,
            "{\"name\":\"ElsewhereWithin-Setup.exe\",\"browser_download_url\":\"https://evil.example/ElsewhereWithin-Setup.exe\"}", Asset("SHA256SUMS.txt", "v0.3.0")) + "]";
        Check(UpdateLogic.ParseReleases(tricky).Count == 0, "a release whose installer is hosted elsewhere is ignored");

        // SHA256SUMS.txt.
        string h1 = new string('a', 64);
        string h2 = new string('B', 64);
        string sums = h1 + "  ElsewhereWithin-Setup.exe\r\n" + h2 + " *other.zip\n";
        Check(UpdateLogic.FindHash(sums, "ElsewhereWithin-Setup.exe") == h1, "finds the installer's hash (CRLF)");
        Check(UpdateLogic.FindHash(sums, "other.zip") == h2.ToLowerInvariant(), "binary-mode star, lower-cased");
        Check(UpdateLogic.FindHash(sums, "missing.exe") == null, "missing file");
        Check(UpdateLogic.FindHash("abc  ElsewhereWithin-Setup.exe", "ElsewhereWithin-Setup.exe") == null, "short hash refused");
        Check(UpdateLogic.FindHash(null, "x") == null, "null sums");
        Check(UpdateLogic.HashesMatch(h1, h1.ToUpperInvariant()), "case-insensitive match");
        Check(!UpdateLogic.HashesMatch(h1, new string('c', 64)), "different hash");
        Check(!UpdateLogic.HashesMatch(null, h1) && !UpdateLogic.HashesMatch(h1, ""), "empty never matches");

        Console.WriteLine(checks + " checks, " + failures + " failed");
        return failures == 0 ? 0 : 1;
    }
}