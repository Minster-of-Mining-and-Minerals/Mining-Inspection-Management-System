"use client";

import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { login } from "@/actions/user";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  AuthInputIcon,
  AuthShell,
  AuthSubmitButton,
  AuthTopButton,
  GemIcon,
  authInputClass,
  authLabelClass,
} from "@/components/layout/AuthShell";

/** Why a session ended (the server's reason), as shown on the sign-in page */
const SESSION_ENDED_NOTE: Record<string, string> = {
  signed_out_by_user: "This device was signed out from another device. Please sign in again.",
  signed_out_by_admin: "An administrator signed you out. Please sign in again.",
  inactive: "You were signed out after 24 hours without activity. Please sign in again.",
  expired: "Your sign-in has expired. Please sign in again.",
  password_changed: "Your password was changed. Please sign in with the new password.",
  deactivated: "Your account was deactivated. Contact your administrator.",
  no_session: "Please sign in again.",
  signed_out: "You were signed out. Please sign in again.",
};

export default function ExternalLogin() {
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const searchParams = useSearchParams();

  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  // Why the previous session ended (sent here by the app), shown above the form
  const endedNote = SESSION_ENDED_NOTE[searchParams.get("ended") ?? ""] ?? null;

  useEffect(() => {
    if (status === "authenticated") {
      const isFirstLogin = (session?.user as any)?.is_first_logged_in;
      if (isFirstLogin) {
        router.push("/change-password");
      } else {
        router.push(callbackUrl);
      }
    }
  }, [status, session, callbackUrl, router]);
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError("");
    const result = await login(formData.email as string, formData.password as string);
    if (result?.error) {
      setAuthError(result.error);
    }

    if (result?.success) {
      const newSession: any = await update(); // Force session refresh
      const isFirstLogin = newSession?.user?.is_first_logged_in;

      if (isFirstLogin) {
        router.push("/change-password");
      } else {
        router.push(callbackUrl || "/dashboard");
      }
    }
    setIsLoading(false);
  };

  return (
    <AuthShell
      topAction={
        <AuthTopButton onClick={() => router.push("/")} icon={<ArrowLeftIcon />}>
          Back
        </AuthTopButton>
      }
    >
      <GemIcon className="hidden h-[42px] w-[42px] lg:block" />
      <h1 className="mt-3.5 text-3xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-[#B6CBD8]">
        Welcome back · <span className="text-golden-bright">እንኳን ደህና መጡ</span>
      </p>

      {endedNote && !authError && (
        <div role="status" className="mt-6 rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {endedNote}
        </div>
      )}

      {authError && (
        <div role="alert" className="mt-6 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm text-red-100">
          {authError}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-7 space-y-4">

        {/* Email */}
        <div>
          <label htmlFor="email" className={authLabelClass}>Email</label>
          <div className="relative">
            <AuthInputIcon><MailIcon /></AuthInputIcon>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="example.xx@gov.et"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className={authInputClass}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className={authLabelClass}>Password</label>
          <div className="relative">
            <AuthInputIcon><LockIcon /></AuthInputIcon>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className={`${authInputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#B6CBD8] transition-colors hover:text-white"
            >
              {showPassword ? (
                <EyeIcon className="h-5 w-5" />
              ) : (
                <EyeOffIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Forgot Password */}
        <div className="w-full text-right">
          <Link href="/forgot-password" data-test="forgot-password-link" className="text-[13px] font-semibold text-golden-bright hover:underline">
            Forgot password?
          </Link>
        </div>

        {/* Submit */}
        <AuthSubmitButton loading={isLoading} loadingText="Logging in..." className="!mt-6">
          Log in
          <ArrowRightIcon />
        </AuthSubmitButton>
      </form>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-[#8FB0C4]">
        <ShieldCheckIcon className="h-4 w-4 text-golden-bright" />
        Secure access for Ministry staff only
      </p>
    </AuthShell>
  );
}
