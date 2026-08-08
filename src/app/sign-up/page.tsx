"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthField } from "@/components/auth/AuthField";
import { signUpAction, type AuthActionState } from "@/lib/actions/auth";

const initialState: AuthActionState = {};

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Create your account</h1>
      <p className="mt-1 text-sm text-ink-muted">Start a franchise and run it your way.</p>

      <form action={formAction} className="mt-8 space-y-4">
        <AuthField label="Name" name="name" type="text" autoComplete="name" />
        <AuthField label="Email" name="email" type="email" autoComplete="email" />
        <AuthField label="Password" name="password" type="password" autoComplete="new-password" />

        {state.error && <p className="text-sm text-negative">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-[2px] bg-team-accent px-4 py-2.5 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-team-accent hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
