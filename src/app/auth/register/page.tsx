import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold text-white">Create your account</h1>
        <p className="mt-2 text-sm text-slate-400">Invite your QA team and centralize test assets.</p>
        <SignUpForm />
        <p className="mt-6 text-center text-xs text-slate-500">
          Already have an account? <Link href="/auth/login" className="text-brand">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
