"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

type AuthProviders = Record<string, { id: string; name: string }>;

export function SignInForm() {
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const [loading, setLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const toast = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      setBanner({ type: "success", text: "Email verified! You can now sign in." });
      setNeedsVerification(false);
    } else if (params.get("reset") === "1") {
      setBanner({ type: "success", text: "Password updated! You can now sign in." });
      setNeedsVerification(false);
    } else if (params.get("error") === "EMAIL_NOT_VERIFIED") {
      setBanner({ type: "error", text: "Please verify your email address before signing in." });
      setNeedsVerification(true);
    } else if (params.get("error") === "InvalidVerificationToken") {
      setBanner({ type: "error", text: "Verification link is invalid or expired." });
      setNeedsVerification(true);
    } else if (params.get("error") === "CredentialsSignin") {
      setBanner({ type: "error", text: "Invalid email or password." });
      setNeedsVerification(false);
    }

    void fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setProviders(data ?? {}))
      .catch(() => setProviders({}));
  }, []);

  const credentialsEnabled = providers === null || Boolean(providers.credentials);
  const googleEnabled = Boolean(providers?.google);
  const githubEnabled = Boolean(providers?.github);
  const oauthEnabled = googleEnabled || githubEnabled;

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const params = new URLSearchParams(window.location.search);
    const rawCallback = params.get("callbackUrl");
    const callbackUrl =
      rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//")
        ? rawCallback
        : "/";
    const result = await signIn("credentials", {
      ...values,
      redirect: true,
      callbackUrl,
    });
    if (result?.error) {
      toast({ title: "Login failed", description: result.error });
    }
    setLoading(false);
  };

  const handleResendVerification = async () => {
    const email = getValues("email")?.trim();
    if (!email) {
      toast({
        title: "Enter your email address",
        description: "Type your email in the field below, then click Resend verification email.",
      });
      return;
    }
    setResendingVerification(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Could not send verification email");
      }
      setBanner({
        type: "success",
        text: body?.message || "If your account requires verification, a link has been sent.",
      });
      setNeedsVerification(false);
    } catch (err: unknown) {
      toast({ title: "Resend failed", description: (err as Error).message });
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {banner ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <p>{banner.text}</p>
          {needsVerification ? (
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendingVerification}
              className="mt-1.5 text-xs font-semibold underline hover:no-underline disabled:opacity-60"
            >
              {resendingVerification ? "Sending..." : "Resend verification email"}
            </button>
          ) : null}
        </div>
      ) : null}
      {credentialsEnabled ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              placeholder="name@company.com"
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <Link href="/auth/forgot-password" className="text-xs font-medium text-blue-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              {...register("password")}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      ) : null}

      {oauthEnabled ? (
        <div className={credentialsEnabled ? "space-y-2 border-t border-slate-200 pt-4" : "space-y-2"}>
          {googleEnabled ? (
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Continue with Google
            </button>
          ) : null}
          {githubEnabled ? (
            <button
              type="button"
              onClick={() => signIn("github", { callbackUrl: "/" })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Continue with GitHub
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
