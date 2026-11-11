import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { SectorNode } from "./redux/types/sectorNode";
import { normalizePermissions } from "./lib/permissions";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: process.env.NEXTAUTH_SECRET,

  // 🔥 CRITICAL FOR DOCKER
  trustHost: true,

  session: {
    strategy: "jwt",
    maxAge: 3 * 60 * 60, // 3 hours
    updateAge: 25 * 60,
  },

  // jwt: {
  //   encryption: false, // 🔥 MUST disable encryption for middleware access
  // },

  // 🔥 EXPLICIT COOKIE CONFIG
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false, // Set to false for HTTP in Docker
        // domain: process.env.NODE_ENV === "production" ? ".yourdomain.com" : undefined,
      },
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return {
          ...token,
          id: user.id,
          role: user.role,
          phone_number: user.phone_number,
          profile_image: user.profile_image,
          is_first_logged_in: user.is_first_logged_in,
          sector: user.sector,
          is_central: user.is_central ?? false,
          department: user.department,
          roles: user.roles,
          accessToken: user.accessToken,
        };
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        return {
          ...session,
          accessToken: token.accessToken as string | undefined,
          user: {
            ...session.user,
            id: token.id as string,
            role: token.role as string | null | undefined,
            phone_number: token.phone_number as string | null | undefined,
            profile_image: token.profile_image as string | null | undefined,
            is_first_logged_in: token.is_first_logged_in as boolean | undefined,
            sector: token.sector as any,
            is_central: token.is_central === true,
            department: token.department as any,
            roles: token.roles as any,
          },
        };
      }
      return session;
    },
  },

  // 🔥 ENABLE DEBUG LOGGING
  debug: process.env.NODE_ENV === "development",
});

// Type augmentations
declare module "next-auth" {
  interface User {
    accessToken?: string;
    id: string;
    role?: string | null;
    phone_number?: string | null;
    profile_image?: string | null;
    is_first_logged_in?: boolean;
    roles?: Array<{
      role_id: string;
      name: string;
      permissions: Array<{
        permission_id: string;
        resource: string;
        action: string;
      }>;
    }>;
    sector?: SectorNode;
    /** In the root sector: sees and manages every sector */
    is_central?: boolean;
    department?: SectorNode;
  }

  interface Session {
    accessToken?: string;
    message?: string;
    error?: string;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string | null;
      phone_number?: string | null;
      profile_image?: string | null;
      is_first_logged_in?: boolean;
      sector?: SectorNode;
      /** In the root sector: sees and manages every sector */
      is_central?: boolean;
      department?: SectorNode;
      roles?: Array<{
        role_id: string;
        name: string;
        permissions: Array<{
          permission_id: string;
          resource: string;
          action: string;
        }>;
      }>;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessToken?: string;
    role?: string | null;
    phone_number?: string | null;
    profile_image?: string | null;
    is_first_logged_in?: boolean;
    sector?: SectorNode;
    is_central?: boolean;
    department?: SectorNode;
    roles?: Array<{
      role_id: string;
      name: string;
      permissions: Array<{
        permission_id: string;
        name: string;
        key: string;
      }>;
    }>;
  }
}
