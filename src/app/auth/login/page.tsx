import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="mb-6 flex items-center gap-2 text-slate-900">
        <CheckSquare className="h-6 w-6 text-blue-600" />
        <span className="text-xl font-semibold tracking-tight">TestSimply</span>
      </div>
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Sign in to TestSimply</h1>
        <p className="mt-1 text-sm text-slate-600">
          Plan, run, and track manual and automated tests.
        </p>
        <SignInForm />
        <p className="mt-6 border-t border-slate-100 pt-4 text-center text-sm text-slate-600">
          New here?{" "}
          <Link href="/auth/register" className="font-medium text-blue-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
