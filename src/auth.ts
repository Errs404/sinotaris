import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface User {
    role: string;
    officeId: string;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      officeId: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "").toLowerCase().trim();
        const password = String(credentials?.password || "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          officeId: user.officeId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.officeId = user.officeId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub);
        session.user.role = String(token.role);
        session.user.officeId = String(token.officeId);
      }
      return session;
    },
  },
});

/** Ambil sesi atau lempar error — dipakai di server action / route handler. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Belum login.");
  return session;
}

/** Hanya role NOTARIS (admin kantor). */
export async function requireNotaris() {
  const session = await requireSession();
  if (session.user.role !== "NOTARIS") throw new Error("Akses hanya untuk Notaris.");
  return session;
}
