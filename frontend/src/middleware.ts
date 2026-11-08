import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const publicRoutes = [
  "/",
  "/login",
  "/forgot-password",
];
const authRoutes = ["/login"];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Apply intl middleware first

  const intlResponse = intlMiddleware(req);

  // Get locale
  const locale =
    routing.locales.find((l) => pathname.startsWith(`/${l}`)) ??
    routing.defaultLocale;

  // Strip the locale prefix and any trailing slash so "/en/login/" matches "/login"
  const pathnameWithoutLocale =
    pathname.replace(new RegExp(`^/${locale}(?=/|$)`), "").replace(/\/+$/, "") || "/";

  // 🔥 FIXED: Check for ANY cookie that starts with session token patterns
  const allCookies = req.cookies.getAll();

  // Look for any cookie that starts with these prefixes (handles chunked cookies)
  let hasSessionToken = false;

  for (const cookie of allCookies) {
    if (
      cookie.name.startsWith("next-auth.session-token") ||
      cookie.name.startsWith("__Secure-next-auth.session-token") ||
      cookie.name.startsWith("authjs.session-token") ||
      cookie.name.startsWith("__Secure-authjs.session-token")
    ) {
      hasSessionToken = true;
      break;
    }
  }

  const isPublicRoute = publicRoutes.includes(pathnameWithoutLocale);
  const isAuthRoute = authRoutes.includes(pathnameWithoutLocale);

  // console.log("🔐 MIDDLEWARE DEBUG:");
  // console.log("  Path:", pathnameWithoutLocale);
  // console.log(
  //   "  Found cookies:",
  //   allCookies.map((c) => c.name),
  // );
  // console.log("  Has session token:", hasSessionToken);
  // console.log("  Is public route:", isPublicRoute);

  // 🔐 Rule 1: If logged in and trying to access login page, redirect to dashboard
  // Removed to prevent infinite redirect loops when cookies exist but session is invalid.
  // The login page itself will handle redirection if a valid session is found.
  // if (isAuthRoute && hasSessionToken) {
  //   return NextResponse.redirect(new URL(`/${locale}/dashboard`, req.url));
  // }

  // 🔒 Rule 2: If NOT logged in and trying to access protected route, redirect to login
  if (!isPublicRoute && !hasSessionToken) {
    // console.log("  Redirecting unauthenticated user to login");
    const loginUrl = new URL(`/${locale}/login`, req.url);
    // Use the full pathname, not pathnameWithoutLocale
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ✅ Allow access
  return intlResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\..*).*)",
  ],
};