import { getSession, signOut } from "next-auth/react";
import { resolveApiBaseUrl } from "@/utils/apiUrl";

/**
 * Perform a thorough logout by clearing all browser storage and sessions.
 * This ensures no stale data remains in localStorage, sessionStorage, or cookies.
 */
export const performLogout = async (callbackUrl: string = "/login") => {
  // 0. End this sign-in's session on the server (best effort: never blocks signing out)
  try {
    const session = await getSession();
    if (session?.accessToken) {
      await fetch(`${resolveApiBaseUrl()}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${session.accessToken}` } });
    }
  } catch {
    /* offline: the session ends by itself after the inactivity time */
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
  } finally {
    if (typeof window !== "undefined") {
      window.location.href = callbackUrl;
    }
  }
};
