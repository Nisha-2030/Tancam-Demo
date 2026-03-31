import { NavLink } from "react-router-dom";

import { useAuthContext } from "../../context/AuthContext";

const roleMeta = {
  admin: {
    chip: "Admin Access",
    title: "AI Exam Preparation System",
    subtitle: "Manage ingestion, trust validation, and intelligence generation.",
    gradient: "from-cyan-500 via-sky-500 to-teal-400",
    links: [{ to: "/admin", label: "Operations" }],
  },
  aspirant: {
    chip: "Aspirant Access",
    title: "AI Exam Preparation System",
    subtitle: "Follow the daily path: approved news -> static GK -> MCQ + level score.",
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    links: [
      { to: "/aspirant", label: "Today's News" },
      { to: "/aspirant/static-gk", label: "Static GK" },
      { to: "/aspirant/quiz", label: "MCQ" },
    ],
  },
};

function navClass({ isActive }) {
  const base =
    "rounded-full px-4 py-2 text-sm font-semibold transition-all duration-150";
  return isActive
    ? `${base} bg-slate-900 text-white shadow-sm`
    : `${base} bg-white/80 text-slate-700 hover:bg-white`;
}

export function PortalLayout({ role, children }) {
  const { user, logout } = useAuthContext();
  const meta = roleMeta[role] || roleMeta.aspirant;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 md:py-7">
      <header className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/75 p-5 shadow-panel backdrop-blur">
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${meta.gradient}`}
          aria-hidden="true"
        />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white">
              {meta.chip}
            </span>
            <h1 className="font-display text-2xl font-bold text-slate-900 md:text-3xl">{meta.title}</h1>
            <p className="text-sm text-slate-600 md:text-base">{meta.subtitle}</p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <div className="text-right">
              <p className="text-xs text-slate-500">Logged in as</p>
              <p className="text-sm font-semibold text-slate-900">{user?.name || "User"}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </div>

        <nav className="mt-5 flex flex-wrap gap-2">
          {meta.links.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
