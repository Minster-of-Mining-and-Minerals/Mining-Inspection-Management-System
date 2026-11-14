import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/session-clear — deletes this browser's sign-in cookies on the server side.
 * A safety net for signing out: the sign-in cookie is httpOnly (the page can't remove it),
 * and if it stays, the login page thinks the user is still signed in and sends them back
 * to the dashboard, which signs them out again (the page "blinks").
 */
const SIGN_IN_COOKIE = /^(__Secure-|__Host-)?(next-auth|authjs)\.(session-token|callback-url|csrf-token)/;

export function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  for (const c of req.cookies.getAll()) {
    if (SIGN_IN_COOKIE.test(c.name)) res.cookies.set(c.name, "", { path: "/", maxAge: 0, expires: new Date(0) });
  }
  res.headers.set("Cache-Control", "no-store");
  return res;
}
