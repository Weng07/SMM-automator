"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole } from "lucide-react";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }

      const nextPath = searchParams.get("next") || "/services";

      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="panel"
      style={{
        width: "100%",
        maxWidth: "430px",
        padding: "24px",
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole size={16} className="text-[#22d3ee]" />
          Admin access
        </div>

        <h1 className="display text-2xl font-semibold tracking-tight">
          Enter admin password
        </h1>

        <p className="text-sm text-[#9aa3c7]">
          This area is protected for provider, service, and comment settings.
        </p>
      </div>

      <form onSubmit={login} className="mt-6 flex flex-col gap-4">
        <div>
          <label className="field-label">Password</label>
          <input
            className="input"
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          className="btn"
          type="submit"
          disabled={loading}
          style={{ minHeight: "48px" }}
        >
          {loading ? "Checking..." : "Unlock admin"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 160px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
      }}
    >
      <Suspense fallback={null}>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}