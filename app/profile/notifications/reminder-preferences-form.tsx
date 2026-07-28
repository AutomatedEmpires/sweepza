"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SeekerNotificationPrefsInput } from "@/lib/seeker-notification-prefs-schema";
import {
  updateSeekerNotificationPrefsAction,
  type ReminderPreferencesActionState,
} from "./actions";

type ReminderCategory = Exclude<
  keyof SeekerNotificationPrefsInput,
  "email_enabled"
>;

const INITIAL_STATE: ReminderPreferencesActionState = {
  status: "idle",
  message: "",
};

const CATEGORIES: Array<{
  name: ReminderCategory;
  label: string;
  description: string;
}> = [
  {
    name: "ready_again",
    label: "Ready to enter again",
    description:
      "Allow a reminder when a daily or recurring sweep may be ready for another entry.",
  },
  {
    name: "ends_today",
    label: "Ending today",
    description:
      "Allow a deadline reminder for a tracked sweep on its stated final day.",
  },
  {
    name: "ends_soon",
    label: "Ending soon",
    description:
      "Allow a reminder a few days before a tracked sweep's stated deadline.",
  },
];

function PreferenceFields({
  prefs,
}: {
  prefs: SeekerNotificationPrefsInput;
}) {
  const { pending } = useFormStatus();

  return (
    <fieldset
      disabled={pending}
      aria-busy={pending}
      className="flex min-w-0 flex-col gap-4 disabled:opacity-70"
    >
      <legend className="sr-only">Reminder email preferences</legend>

      <label
        htmlFor="email_enabled"
        className="flex cursor-pointer items-start gap-3 rounded-card border border-ember/30 bg-ember/[0.04] p-4 shadow-e1"
      >
        <input
          id="email_enabled"
          name="email_enabled"
          type="checkbox"
          defaultChecked={prefs.email_enabled}
          aria-describedby="email-enabled-description"
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-line text-ember focus:ring-ember"
        />
        <span>
          <span className="block text-sm font-semibold text-ink">
            Allow reminder emails
          </span>
          <span
            id="email-enabled-description"
            className="mt-0.5 block text-sm leading-relaxed text-graphite"
          >
            Explicit consent is required. This preference does not activate
            Sweepza&apos;s outbound delivery service.
          </span>
        </span>
      </label>

      <div>
        <h2
          id="reminder-categories-heading"
          className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-graphite"
        >
          Categories
        </h2>
        <div
          role="group"
          aria-labelledby="reminder-categories-heading"
          className="flex flex-col gap-3"
        >
          {CATEGORIES.map((category) => (
            <label
              key={category.name}
              htmlFor={category.name}
              className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-e1"
            >
              <input
                id={category.name}
                name={category.name}
                type="checkbox"
                defaultChecked={prefs[category.name]}
                aria-describedby={`${category.name}-description`}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-line text-pine focus:ring-pine"
              />
              <span>
                <span className="block text-sm font-medium text-ink">
                  {category.label}
                </span>
                <span
                  id={`${category.name}-description`}
                  className="mt-0.5 block text-sm leading-relaxed text-graphite"
                >
                  {category.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex min-h-11 items-center justify-center self-start rounded-xl bg-ember px-5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Saving preferences…" : "Save preferences"}
    </button>
  );
}

export function ReminderPreferencesForm({
  prefs,
}: {
  prefs: SeekerNotificationPrefsInput;
}) {
  const [state, formAction] = useActionState(
    updateSeekerNotificationPrefsAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <PreferenceFields prefs={prefs} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SaveButton />
        <div
          aria-live="polite"
          aria-atomic="true"
          className="min-h-5 text-sm"
        >
          {state.status !== "idle" && (
            <p
              role={state.status === "error" ? "alert" : "status"}
              className={
                state.status === "error" ? "text-flame" : "text-pine"
              }
            >
              {state.message}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
