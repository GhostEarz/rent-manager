import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { getDb } from "@/server/db/data-source";
import { User } from "@/server/entities/core";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(raw);
        if (!parsed.success) return null;
        const db = await getDb();
        const user = await db.getRepository(User).findOneBy({ email: parsed.data.email.toLowerCase() });
        if (!user || !user.active) return null;
        if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) return null;
        return { id: String(user.id), name: user.name, email: user.email };
      },
    }),
  ],
});
