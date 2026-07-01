"use client";

import { useEffect, useRef, useState } from "react";

type Pool = { id: string; name: string; unused_count: number; created_at: string };

export default function CommentsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
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
    load();
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
      const res = await fetch("/api/comments/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`Uploaded ${data.count} comments into "${data.pool.name}".`);
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Comment Pools</h1>
        <p className="text-sm text-[#8b929c] mt-1">
          Upload a CSV of comments (one per row, or one per line in the first column). Each
          order that uses "custom comments" pulls unique, unused comments from the pool you
          assign to it.
        </p>
      </div>

      <form onSubmit={upload} className="panel p-5 flex flex-col gap-4">
        <div className="text-sm font-medium">Upload a new pool</div>
        <div>
          <label className="text-xs text-[#8b929c] block mb-1">Pool name</label>
          <input
            className="input"
            placeholder="e.g. July comments batch"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-[#8b929c] block mb-1">CSV file</label>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="input" required />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" type="submit" disabled={uploading}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {msg && <span className="text-sm text-[#8b929c]">{msg}</span>}
        </div>
      </form>

      <div className="panel p-5">
        <div className="text-sm font-medium mb-4">Pools</div>
        <div className="flex flex-col gap-2">
          {pools.length === 0 && <div className="text-sm text-[#8b929c]">No pools yet.</div>}
          {pools.map((p) => (
            <div
              key={p.id}
              className="border border-[#23272e] rounded-md p-3 flex items-center justify-between"
            >
              <span className="text-sm">{p.name}</span>
              <span className="mono text-xs text-[#8b929c]">{p.unused_count} unused left</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
