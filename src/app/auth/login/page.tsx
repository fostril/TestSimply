import Link from "next/link";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold text-white">Sign in to TestSimply</h1>
        <p className="mt-2 text-sm text-slate-400">Modern test management for your quality workflows.</p>
        <SignInForm />
        <p className="mt-6 text-center text-xs text-slate-500">
          New to TestSimply? <Link href="/auth/register" className="text-brand">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
