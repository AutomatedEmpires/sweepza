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
    timeoutRef.current = window.setTimeout(() => {
      if (!next) {
        router.push("/search");
        return;
      }
      track("search_performed", { query: next, result_count: 0 });
      router.push(`/search?q=${encodeURIComponent(next)}`);
    }, 300);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [router, value]);

  return (
    <form
      role="search"
      aria-label="Search sweepstakes"
      onSubmit={(event) => event.preventDefault()}
      className="flex items-center gap-2 rounded-full border border-sand bg-white px-3.5 py-2"
    >
      <Icon name="search" size={16} className="shrink-0 text-ink/40" />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label="Search sweepstakes"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            router.push("/search");
          }}
          aria-label="Clear search"
          className="grid h-11 w-11 shrink-0 place-items-center text-ink/40 transition hover:text-ink"
        >
          <Icon name="skip" size={14} />
        </button>
      ) : null}
    </form>
  );
}
