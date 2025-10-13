"use client";

import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@/lib/zod-resolver";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

type FormValues = z.infer<typeof schema>;

export function SignInForm() {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const result = await signIn("credentials", {
      ...values,
      redirect: true,
      callbackUrl: "/"
    });
    if (result?.error) {
      toast({ title: "Login failed", description: result.error });
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
      <div>
        <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
        <input
          type="email"
          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
          {...register("email")}
        />
        {errors.email ? <p className="mt-1 text-xs text-red-400">{errors.email.message}</p> : null}
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
        <input
          type="password"
          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
          {...register("password")}
        />
        {errors.password ? <p className="mt-1 text-xs text-red-400">{errors.password.message}</p> : null}
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-blue-500 disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
      <div className="text-center text-xs text-slate-500">
        <button
          type="button"
          onClick={() => signIn("github", { callbackUrl: "/" })}
          className="mr-2 rounded-full border border-slate-700 px-3 py-1 hover:bg-slate-800"
        >
          GitHub
        </button>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="rounded-full border border-slate-700 px-3 py-1 hover:bg-slate-800"
        >
          Google
        </button>
      </div>
    </form>
  );
}
