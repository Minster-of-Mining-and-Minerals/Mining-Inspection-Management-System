import { getSession, signOut } from "next-auth/react";
import { resolveApiBaseUrl } from "@/utils/apiUrl";

// One sign-out at a time: when a session has ended, every request on the page gets "session
// ended" at once; each used to start its own sign-out and reload the login page (it "blinked").
let running: Promise<void> | null = null;

/**
 * Perform a thorough logout by clearing all browser storage and sessions.
 * This ensures no stale data remains in localStorage, sessionStorage, or cookies.
 */
export const performLogout = (callbackUrl: string = "/login"): Promise<void> => {
  if (!running) running = doLogout(callbackUrl);
  return running;
};

const doLogout = async (callbackUrl: string) => {
  // 0. End this sign-in's session on the server (best effort: never blocks signing out)
  try {
    const session = await getSession();
    if (session?.accessToken) {
      await fetch(`${resolveApiBaseUrl()}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${session.accessToken}` } });
    }
  } catch {
    /* offline, or the session already ended: it ends by itself after the inactivity time */
  }

  // 1. Clear all browser storage
  if (typeof window !== "undefined") {
    localStorage.clear();
    sessionStorage.clear();

    // 2. Clear all cookies (best effort from client side)
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      // Also try to clear for the current domain just in case
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
    }
  }

  // 3. Clear the session with next-auth, but redirect ourselves. next-auth builds its
  //    redirect URL from NEXTAUTH_URL, which sends users to that host (e.g. the internal
  //    IP) when they reached the site through a different address.
  try {
    await signOut({ redirect: false });
  } catch {
    /* the cookie is removed below anyway */
  }
  // 4. Safety net: remove the (httpOnly) sign-in cookie on this site directly, so the login
  //    page can't mistake a stale cookie for a live sign-in and bounce back to the dashboard.
  try {
    await fetch("/api/session-clear", { method: "POST", credentials: "same-origin" });
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    // replace: no extra history entry, so Back doesn't return to the signed-out page
    window.location.replace(callbackUrl);
  }
};
