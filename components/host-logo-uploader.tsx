"use client";

import { useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

export default function HostLogoUploader() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onPick(next: File | null) {
    setError(null);
    if (next && !ALLOWED.has(next.type)) {
      setError("Unsupported file type.");
      return;
    }
    if (next && next.size > MAX_BYTES) {
      setError("File too large (max 2MB).");
      return;
    }
    setFile(next);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  }

  async function onUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (!ALLOWED.has(file.type)) throw new Error("Unsupported file type.");
      if (file.size > MAX_BYTES) throw new Error("File too large (max 2MB).");

      const res = await fetch("/api/host/me");
      if (!res.ok) throw new Error("Unable to load host identity.");
      const me = (await res.json()) as { hostId: string };

      const path = `${me.hostId}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("host-logos").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (uploadError) throw new Error(uploadError.message);

      const { data } = supabase.storage.from("host-logos").getPublicUrl(path);
      const saveRes = await fetch("/api/host/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logo_url: data.publicUrl, file_type: file.type, file_size: file.size }),
      });
      if (!saveRes.ok) throw new Error("Failed to save profile.");

      onPick(null);
      alert("Logo saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-4">
      <p className="text-sm font-semibold text-ink">Logo</p>
      <p className="mt-1 text-xs text-ink/60">PNG/JPG/WebP up to 2MB.</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="h-20 w-20 overflow-hidden rounded-2xl border border-ink/10 bg-ink/5">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Logo preview" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="grid gap-2">
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onPick(e.target.files?.[0] ?? null)} disabled={busy} />
          <button className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50" type="button" onClick={onUpload} disabled={!file || busy}>
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
