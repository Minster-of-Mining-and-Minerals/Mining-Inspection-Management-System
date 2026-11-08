/**
 * A short, readable name for the device an inspection was submitted from,
 * e.g. "Android 13 · Chrome · SM-A515F" or "iPhone · iOS 17 · Safari" or "Windows · Edge".
 */
export function deviceLabel(userAgent?: string | null, platform?: string | null): string {
  const ua = userAgent || "";
  if (!ua && !platform) return "Unknown device";

  let os = platform || "";
  let model = "";
  const android = /Android\s*([\d.]+)?(?:;\s*([^;)]+))?/i.exec(ua);
  if (android) {
    os = `Android${android[1] ? " " + android[1].split(".")[0] : ""}`;
    const m = (android[2] || "").replace(/\s*Build\/.*$/i, "").trim();
    if (m && m !== "K" && !/^wv$/i.test(m) && !/^[a-z]{2}[-_][a-z]{2}$/i.test(m)) model = m; // Chrome hides it as "K"
  } else if (/iPhone|iPad|iPod/.test(ua)) {
    const v = /OS (\d+)[_\d]* like Mac OS X/.exec(ua);
    os = `${/iPad/.test(ua) ? "iPad" : "iPhone"} · iOS${v ? " " + v[1] : ""}`;
  } else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "Mac";
  else if (/CrOS/.test(ua)) os = "Chromebook";
  else if (/Linux/.test(ua)) os = "Linux";

  const browser = /SamsungBrowser\//.test(ua)
    ? "Samsung Internet"
    : /EdgA?\//.test(ua)
      ? "Edge"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /CriOS\/|Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "";
  return [os || "Unknown device", browser, model].filter(Boolean).join(" · ");
}

/** Phone / tablet / computer, for an icon. */
export const deviceKind = (userAgent?: string | null): "phone" | "tablet" | "computer" =>
  /iPad|Tablet/i.test(userAgent || "") || (/Android/i.test(userAgent || "") && !/Mobile/i.test(userAgent || "")) ? "tablet" : /Mobi|iPhone|Android/i.test(userAgent || "") ? "phone" : "computer";
