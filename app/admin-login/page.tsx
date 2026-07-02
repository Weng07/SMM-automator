"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/services";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Invalid password.");
      }

      router.push(nextPath);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "calc(100vh - 120px)" }}
    >
      <form
        onSubmit={login}
        className="panel flex flex-col gap-5"
        style={{ width: "min(100%, 420px)", padding: "24px" }}
      >
        <div className="flex flex-col gap-2">
          <div
            className="flex items-center justify-center"
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "5px",
              background: "rgba(34, 211, 238, 0.12)",
              border: "1px solid rgba(34, 211, 238, 0.22)",
            }}
          >
            <LockKeyhole size={20} className="text-[#22d3ee]" />
          </div>

          <div>
            <h1 className="display text-2xl font-semibold tracking-tight">
              Admin Access
            </h1>
            <p className="text-sm text-[#9aa3c7] mt-1">
              Enter the admin password to manage services, comments, and API providers.
            </p>
          </div>
        </div>

        <div>
          <label className="field-label">Password</label>
          <input
            className="input"
            type="password"
            placeholder="Enter admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>

        {error && <div className="panel-error">{error}</div>}

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Checking..." : "Unlock admin pages"}
        </button>
      </form>
    </div>
  );
}