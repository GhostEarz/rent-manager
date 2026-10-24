"use client";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined as { error?: string } | undefined);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Rent Manager</h1>
          <p className="text-sm text-muted">Sign in to continue</p>
        </div>
        <label className="block"><span className="label">Email</span>
          <input name="email" type="email" required autoComplete="username" className="input" /></label>
        <label className="block"><span className="label">Password</span>
          <input name="password" type="password" required autoComplete="current-password" className="input" /></label>
        {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        <button disabled={pending} className="btn btn-primary w-full">{pending ? "Signing in…" : "Sign in"}</button>
        <p className="text-center text-sm text-muted">New here? <Link href="/signup" className="text-indigo-600 hover:underline">Create an account</Link></p>
      </form>
    </main>
  );
}
