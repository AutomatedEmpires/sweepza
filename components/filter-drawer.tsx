"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/icon";
import {
  FILTER_CHIPS,
  SORT_OPTIONS,
  type FilterChipId,
  type FilterGroup,
  type SortId,
} from "@/lib/listing-filters";

const GROUP_ORDER: FilterGroup[] = ["timing", "entry", "trust"];
const GROUP_LABELS: Record<FilterGroup, string> = {
  timing: "Timing",
  entry: "Entry style",
  trust: "Trust",
};

export function FilterDrawer({
  open,
  onClose,
  active,
  onToggle,
  sort,
  onSort,
  onClear,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  active: FilterChipId[];
  onToggle: (id: FilterChipId) => void;
  sort: SortId;
  onSort: (id: SortId) => void;
  onClear: () => void;
  resultCount: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Modal behavior: Escape closes, Tab is trapped inside the panel, focus
  // moves into the dialog on open and returns to the opener on close, and
  // the page behind cannot scroll.
  useEffect(() => {
    if (!open) return;

    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusables()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !panelRef.current?.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;

  const countLabel = resultCount === 1 ? "1 sweep" : `${resultCount} sweeps`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Filters and sort"
    >
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        ref={panelRef}
        className="relative mx-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-cream px-5 pb-6 pt-3 shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/15" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Filters &amp; sort</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-ink/50 transition hover:bg-ink/5"
          >
            <Icon name="skip" size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {GROUP_ORDER.map((group) => {
            const chips = FILTER_CHIPS.filter((chip) => chip.group === group);

            return (
              <section key={group} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/60">
                  {GROUP_LABELS[group]}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {chips.map((chip) => {
                    const isActive = active.includes(chip.id);
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => onToggle(chip.id)}
                        aria-pressed={isActive}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                          isActive
                            ? "border-ember bg-ember text-cream"
                            : "border-sand bg-white text-ink/70 hover:border-ink/20",
                        )}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/60">
              Sort by
            </h3>
            <div className="flex flex-wrap gap-2">
              {SORT_OPTIONS.map((option) => {
                const isActive = sort === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSort(option.id)}
                    aria-pressed={isActive}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                      isActive
                        ? "border-ink bg-ink text-cream"
                        : "border-sand bg-white text-ink/70 hover:border-ink/20",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-sand px-4 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full bg-moss px-4 py-2.5 text-sm font-semibold text-cream transition hover:bg-moss/90"
          >
            Show {countLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
