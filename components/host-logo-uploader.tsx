"use client";

import { useState } from "react";
import Image from "next/image";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export function HostLogoUploader({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!ALLOWED.includes(file.type)) {
      setError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 2MB or smaller.");
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/host/logo", { method: "POST", body });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Upload failed.");
      }
      const payload = (await response.json()) as { logoUrl: string };
      setLogoUrl(payload.logoUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="h-24 w-24 overflow-hidden rounded-full border border-line bg-paper">
        {logoUrl ? (
          <Image src={logoUrl} alt="Host logo" width={96} height={96} className="h-full w-full object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-graphite">No logo</div>
        )}
      </div>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleChange} disabled={busy}
        className="block text-sm text-ink/75 file:mr-3 file:rounded-full file:border-0 file:bg-pine/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-pine hover:file:bg-pine/20" />
      {busy ? <p className="text-sm text-graphite">Uploading…</p> : null}
      {error ? <p className="text-sm text-flame">{error}</p> : null}
    </div>
  );
}
