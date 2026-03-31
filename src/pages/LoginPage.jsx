import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthContext } from "../context/AuthContext";

const roleOptions = [
  { id: "admin", label: "Admin Console" },
  { id: "aspirant", label: "Aspirant Portal" },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login, demoUsers } = useAuthContext();
  const [role, setRole] = useState("aspirant");
  const [email, setEmail] = useState("aspirant@aie.demo");
  const [password, setPassword] = useState("aspirant123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedDemoUser = useMemo(
    () => demoUsers.find((item) => item.role === role),
    [demoUsers, role]
  );

  const applyRoleDefaults = (nextRole) => {
    const demoUser = demoUsers.find((item) => item.role === nextRole);
    setRole(nextRole);
    if (demoUser) {
      setEmail(demoUser.email);
      setPassword(demoUser.password);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = login({ email, password, role });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Login failed");
      return;
    }
    navigate(`/${role}`, { replace: true });
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 md:px-6">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(20,184,166,0.24),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(14,165,233,0.2),transparent_30%),radial-gradient(circle_at_50%_90%,rgba(249,115,22,0.14),transparent_32%)]" />

      <section className="grid w-full overflow-hidden rounded-[2rem] border border-white/70 bg-white/70 shadow-[0_25px_80px_rgba(12,25,43,0.2)] backdrop-blur md:grid-cols-[1.05fr_1fr]">
        <div className="relative overflow-hidden bg-slate-900 p-7 text-white md:p-10">
          <div className="absolute -right-24 -top-20 h-64 w-64 rounded-full bg-cyan-400/25 blur-3xl" />
          <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" />

          <div className="relative space-y-5">
            <p className="inline-flex rounded-full border border-white/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
              AI Exam Preparation System
            </p>
            <h1 className="font-display text-3xl font-bold leading-tight md:text-4xl">
              One Platform.
              <br />
              Two Smart Experiences.
            </h1>
            <p className="max-w-xl text-sm text-slate-200 md:text-base">
              Admins curate and verify high-value current affairs. Aspirants get a daily capsule with trust score,
              notes, static GK connections, and practice MCQs in one focused interface.
            </p>

            <div className="grid gap-3 pt-1 text-sm">
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">Real-time news pipeline + AI filter</div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">Trust scoring and cross-verification</div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">One-click notes, GK facts, and quizzes</div>
            </div>

          </div>
        </div>

        <div className="p-6 md:p-10">
          <div className="mx-auto w-full max-w-md space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Secure Login</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">Welcome back</h2>
              <p className="mt-1 text-sm text-slate-600">Choose your role and continue.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
              {roleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => applyRoleDefaults(option.id)}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    role === option.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:ring"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:ring"
                  required
                />
              </label>

              {error ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {busy ? "Signing in..." : "Sign In"}
              </button>
            </form>

            {selectedDemoUser ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Demo credentials for this role: <strong>{selectedDemoUser.email}</strong> /{" "}
                <strong>{selectedDemoUser.password}</strong>
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
