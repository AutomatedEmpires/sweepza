"use client";

import { cn } from "@/lib/cn";
import { FILTER_CHIPS, type FilterChipId } from "@/lib/listing-filters";

export function FilterChips({
  active,
  onToggle,
}: {
  active: FilterChipId[];
  onToggle: (id: FilterChipId) => void;
}) {
  return (
    <div className="no-scrollbar mask-fade-r -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pr-8">
      {FILTER_CHIPS.map((chip) => {
        const on = active.includes(chip.id);
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onToggle(chip.id)}
            aria-pressed={on}
            className={cn(
              "min-h-11 whitespace-nowrap rounded-pill border px-3.5 text-xs font-semibold transition",
              on
                ? "border-ink bg-ink text-paper"
                : "border-line bg-surface text-ink/70 hover:border-ink/25",
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
