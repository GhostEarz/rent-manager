"use client";
import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/actions/auth";

export default function SignupPage() {
  const [state, action, pending] = useActionState(registerAction, undefined as { error?: string } | undefined);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Create your account</h1>
          <p className="text-sm text-muted">Manage your buildings, rooms, rent and expenses.</p>
        </div>
        <label className="block"><span className="label">Business / property group name</span>
          <input name="orgName" required placeholder="e.g. Sunrise Rentals" className="input" /></label>
        <label className="block"><span className="label">Your name</span>
          <input name="name" required autoComplete="name" className="input" /></label>
        <label className="block"><span className="label">Email</span>
          <input name="email" type="email" required autoComplete="username" className="input" /></label>
        <label className="block"><span className="label">Password (8+ characters)</span>
          <input name="password" type="password" minLength={8} required autoComplete="new-password" className="input" /></label>
        {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        <button disabled={pending} className="btn btn-primary w-full">{pending ? "Creating…" : "Create account"}</button>
        <p className="text-center text-sm text-muted">Already have an account? <Link href="/login" className="text-indigo-600 hover:underline">Sign in</Link></p>
      </form>
    </main>
  );
}
