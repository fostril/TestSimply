import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="mb-6 flex items-center gap-2 text-slate-900">
        <CheckSquare className="h-6 w-6 text-blue-600" />
        <span className="text-xl font-semibold tracking-tight">TestSimply</span>
      </div>
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-600">
          Get started managing test cases, plans, executions, and coverage.
        </p>
        <SignUpForm />
        <p className="mt-6 border-t border-slate-100 pt-4 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
