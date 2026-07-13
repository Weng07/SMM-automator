"use client";

import { useEffect, useRef, useState } from "react";
import { PLATFORM_META, PLATFORMS, PlatformKey } from "@/lib/platform-meta";
import { X_COMMENT_CATEGORIES } from "@/lib/comment-categories";
import { UploadCloud } from "lucide-react";

type Pool = {
  id: string;
  name: string;
  platform: string;
  category?: string | null;
  unused_count: number;
  created_at: string;
};

export default function CommentsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [filterPlatform, setFilterPlatform] = useState<PlatformKey>("x");
  const [uploadPlatform, setUploadPlatform] = useState<PlatformKey>("x");
  const [xCategory, setXCategory] = useState<string>(X_COMMENT_CATEGORIES[0]);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/comments/upload");
    const data = await res.json();
    setPools(data.pools ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function upload(e: React.FormEvent) {
    e.preventDefault();

    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setMsg(null);

    try {
      const form = new FormData();
      form.set("file", file);
      form.set("name", name || file.name);
      form.set("platform", uploadPlatform);

      if (uploadPlatform === "x") {
        form.set("category", xCategory);
      }

      const res = await fetch("/api/comments/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error);
      }

      setMsg(`Uploaded ${data.count} comments into "${data.pool.name}".`);
      setName("");

      if (fileRef.current) {
        fileRef.current.value = "";
      }

      load();
    } catch (error) {
      setMsg(`Error: ${error instanceof Error ? error.message : "Unexpected error."}`);
    } finally {
      setUploading(false);
    }
  }

  const visiblePools = pools.filter((p) => p.platform === filterPlatform);

  return (
    <div className="flex flex-col gap-7">
      <section className="panel" style={{ padding: "22px" }}>
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Comment engine</span>
          <h1 className="display text-2xl font-semibold tracking-tight">
            Comment Pools
          </h1>
          <p className="text-sm text-[#9aa3c7] max-w-2xl">
            Upload platform-specific comment pools and assign them to orders so
            each submission pulls a fresh, never-reused comment.
          </p>
        </div>
      </section>

      <form
        onSubmit={upload}
        className="panel flex flex-col gap-5"
        style={{ padding: "22px" }}
      >
        <div className="text-sm font-semibold">Upload a new pool</div>

        <div>
          <label className="text-xs text-[#8b8fa3] block mb-2">
            Platform
          </label>

          <div className="platform-grid">
            {PLATFORMS.map((p) => {
              const meta = PLATFORM_META[p];
              const Icon = meta.icon;

              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => setUploadPlatform(p)}
                  className={`platform-pill ${
                    uploadPlatform === p ? "active" : ""
                  }`}
                >
                  <Icon size={15} style={{ color: meta.color }} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: "14px",
          }}
        >
          <div>
            <label className="text-xs text-[#8b8fa3] block mb-1">
              Pool name
            </label>
            <input
              className="input"
              placeholder="e.g. July comments batch"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-[#8b8fa3] block mb-1">
              CSV file
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.docx,.doc,.txt"
              className="input"
              required
            />
          </div>

          {uploadPlatform === "x" && (
            <div>
              <label className="text-xs text-[#8b8fa3] block mb-1">
                X category
              </label>
              <select
                className="input"
                value={xCategory}
                onChange={(e) => setXCategory(e.target.value)}
              >
                {X_COMMENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            className="btn flex items-center gap-2"
            type="submit"
            disabled={uploading}
          >
            <UploadCloud size={14} />
            {uploading ? "Uploading…" : "Upload"}
          </button>

          {msg && <span className="text-sm text-[#8b8fa3]">{msg}</span>}
        </div>
      </form>

      <div className="panel flex flex-col gap-4" style={{ padding: "22px" }}>
        <div className="platform-grid">
          {PLATFORMS.map((p) => {
            const meta = PLATFORM_META[p];
            const Icon = meta.icon;

            return (
              <button
                key={p}
                onClick={() => setFilterPlatform(p)}
                className={`platform-pill ${
                  p === filterPlatform ? "active" : ""
                }`}
              >
                <Icon size={15} style={{ color: meta.color }} />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          {visiblePools.length === 0 && (
            <div className="text-sm text-[#8b8fa3]">
              No pools yet for {PLATFORM_META[filterPlatform].label}.
            </div>
          )}

          {visiblePools.map((p) => (
            <div
              key={p.id}
              className="panel-alt flex items-center justify-between"
              style={{ padding: "16px" }}
            >
              <span className="text-sm">
                {p.name}
                {p.platform === "x" && p.category ? ` [${p.category}]` : ""}
              </span>
              <span className="mono text-xs text-[#8b8fa3]">
                {p.unused_count} unused left
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}