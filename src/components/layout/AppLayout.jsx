import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/news", label: "News List" },
  { to: "/notes", label: "Notes View" },
  { to: "/quiz", label: "Quiz Section" },
];

function linkClassName({ isActive }) {
  const base =
    "rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-150";
  if (isActive) {
    return `${base} bg-sky-600 text-white`;
  }
  return `${base} text-slate-700 hover:bg-slate-200`;
}

export function AppLayout({ children }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <header className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-panel backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">AI-Powered Platform</p>
            <h1 className="font-display text-xl font-semibold text-slate-900 md:text-2xl">
              Aspirant Intelligence Engine
            </h1>
          </div>
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClassName}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
