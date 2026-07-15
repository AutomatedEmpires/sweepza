"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { track } from "@/lib/analytics";

export function SearchInput({
  placeholder = "Search prizes, hosts, tags...",
}: {
  placeholder?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("q") ?? "";

  const [value, setValue] = useState(initial);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Keep input in sync with back/forward nav.
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);

    const next = value.trim();
    if (next === initial) return;
    timeoutRef.current = window.setTimeout(() => {
      if (!next) {
        router.push("/discover");
        return;
      }
      track("search_performed", { query: next });
      router.push(`/discover?q=${encodeURIComponent(next)}`);
    }, 300);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [router, value, initial]);

  return (
    <form
      role="search"
      aria-label="Search sweepstakes"
      onSubmit={(event) => event.preventDefault()}
      className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 transition focus-within:border-ink/40 focus-within:ring-1 focus-within:ring-ink/25"
    >
      <Icon name="search" size={16} className="shrink-0 text-graphite" />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label="Search sweepstakes"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-graphite"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            router.push("/discover");
          }}
          aria-label="Clear search"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-graphite transition hover:bg-ink/5 hover:text-ink"
        >
          <Icon name="skip" size={14} />
        </button>
      ) : null}
    </form>
  );
}
