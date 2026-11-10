import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";

export default {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials) return null;

        const { email, password } = credentials;
        const cleanEmail = typeof email === "string" ? email.trim() : "";

        const primaryBase = (process.env.BACKEND_INTERNAL_URL || "http://localhost:4000").replace(/\/$/, "");
        const candidateUrls = [
          `${primaryBase}/api/auth/login`,
          "http://localhost:4000/api/auth/login",
          "http://127.0.0.1:4000/api/auth/login",
        ];
        const urlsToTry = Array.from(new Set(candidateUrls));

        let lastNetworkError: any = null;

        for (const backendUrl of urlsToTry) {
          try {
            const res = await fetch(backendUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ email: cleanEmail, password }),
            });

            if (!res.ok) {
              const errBody = await res.json().catch(() => null);
              console.warn(`Auth at ${backendUrl} rejected (${res.status}):`, errBody?.message || errBody);
              return null;
            }

            const data = await res.json();
            if (!data?.success) {
              console.warn("Auth response not marked success:", data);
              return null;
            }

            const user = data.data.user;
            const roles = data.data?.roles ?? [];
            const token = data.token || data.data?.token;

            if (!token) {
              console.warn("No token found in login response");
              return null;
            }

            return {
              accessToken: token,
              id: user.user_id,
              email: user.email,
              name: user.full_name,
              phone_number: user.phone_number,
              profile_image: user.profile_image,
              is_first_logged_in: user.is_first_logged_in,
              sector: user.sector,
              department: user.department,
              role: roles?.[0]?.name ?? null,
              roles: roles ?? [],
            };
          } catch (err: any) {
            lastNetworkError = err;
            // Connection refused or ENOTFOUND: try next fallback URL
            continue;
          }
        }

        console.error("All backend login URLs failed. Last error:", lastNetworkError?.message || lastNetworkError);
        return null;
      },
    }),
  ],

  // 🔥 ADD BASE PATH FOR DOCKER
  basePath: "/api/auth",
} satisfies NextAuthConfig;
