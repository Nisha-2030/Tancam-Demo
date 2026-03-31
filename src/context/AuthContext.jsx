import { createContext, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "aie-auth-session-v1";

const demoUsers = [
  {
    role: "admin",
    email: "admin@aie.demo",
    password: "admin123",
    name: "Admin Operator",
  },
  {
    role: "aspirant",
    email: "aspirant@aie.demo",
    password: "aspirant123",
    name: "Aspirant Learner",
  },
];

const AuthContext = createContext(null);

function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed?.role || !parsed?.email) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession);

  const login = ({ email, password, role }) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedRole = String(role || "").trim().toLowerCase();

    const match = demoUsers.find(
      (candidate) =>
        candidate.email === normalizedEmail &&
        candidate.password === password &&
        candidate.role === normalizedRole
    );

    if (!match) {
      return { ok: false, error: "Invalid credentials. Try the demo credentials shown below." };
    }

    const nextUser = {
      role: match.role,
      email: match.email,
      name: match.name,
      loggedInAt: new Date().toISOString(),
    };
    setUser(nextUser);
    writeSession(nextUser);
    return { ok: true };
  };

  const quickLogin = (role) => {
    const userForRole = demoUsers.find((item) => item.role === role);
    if (!userForRole) {
      return { ok: false, error: "Role not available." };
    }
    return login(userForRole);
  };

  const logout = () => {
    setUser(null);
    clearSession();
  };

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      quickLogin,
      logout,
      demoUsers,
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used inside AuthProvider");
  }
  return context;
}

