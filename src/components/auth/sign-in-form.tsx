"use client";

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
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const toast = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      setBanner({ type: "success", text: "Email verified! You can now sign in." });
    } else if (params.get("reset") === "1") {
      setBanner({ type: "success", text: "Password updated! You can now sign in." });
    } else if (params.get("error") === "EMAIL_NOT_VERIFIED") {
      setBanner({ type: "error", text: "Please verify your email address before signing in." });
    } else if (params.get("error") === "InvalidVerificationToken") {
      setBanner({ type: "error", text: "Verification link is invalid or expired." });
    } else if (params.get("error") === "CredentialsSignin") {
      setBanner({ type: "error", text: "Invalid email or password." });
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
    const result = await signIn("credentials", {
      ...values,
      redirect: true,
      callbackUrl: "/",
    });
    if (result?.error) {
      toast({ title: "Login failed", description: result.error });
    }
    setLoading(false);
  };

  return (
    <div className="mt-6 space-y-4">
      {banner ? (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            banner.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {banner.text}
        </div>
      ) : null}
      {credentialsEnabled ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
              {...register("password")}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      ) : null}

      {oauthEnabled ? (
        <div className={credentialsEnabled ? "space-y-2 border-t border-slate-800 pt-4" : "space-y-2"}>
          {googleEnabled ? (
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-full rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Continue with Google
            </button>
          ) : null}
          {githubEnabled ? (
            <button
              type="button"
              onClick={() => signIn("github", { callbackUrl: "/" })}
              className="w-full rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Continue with GitHub
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
