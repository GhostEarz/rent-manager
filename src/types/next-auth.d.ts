import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: "ADMIN" | "STAFF" } & import("next-auth").DefaultSession["user"];
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: "ADMIN" | "STAFF";
  }
}
