import { z } from "zod";
import { isRegistrablePublicHostname } from "@/lib/public-hostname";

export const OFFICIAL_URL_INTAKE_PAYLOAD_KIND =
  "admin_official_url_v1" as const;

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1, "Each URL requires an idempotency key.")
  .max(200, "Idempotency keys must be 200 characters or fewer.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
    "Idempotency keys may contain letters, numbers, dot, underscore, colon, slash, and hyphen.",
  );

const officialHttpsUrlSchema = z
  .string()
  .trim()
  .min(1, "An official URL is required.")
  .max(2048, "Official URLs must be 2048 characters or fewer.")
  .transform((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Official URLs must be valid absolute URLs.",
      });
      return z.NEVER;
    }
    if (url.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "Official URLs must use HTTPS.",
      });
      return z.NEVER;
    }
    if (url.username || url.password) {
      context.addIssue({
        code: "custom",
        message: "Official URLs must not contain credentials.",
      });
      return z.NEVER;
    }
    if (url.port) {
      context.addIssue({
        code: "custom",
        message: "Official URLs must use the default HTTPS port.",
      });
      return z.NEVER;
    }
    if (!isRegistrablePublicHostname(url.hostname)) {
      context.addIssue({
        code: "custom",
        message: "Official URLs must use a registrable public hostname.",
      });
      return z.NEVER;
    }
    url.hash = "";
    return url.toString();
  });

export const officialUrlIntakeEntrySchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    officialUrl: officialHttpsUrlSchema,
  })
  .strict();

export const officialUrlIntakeBatchSchema = z
  .object({
    entries: z
      .array(officialUrlIntakeEntrySchema)
      .min(1, "Submit at least one official URL.")
      .max(500, "A batch may contain at most 500 official URLs."),
  })
  .strict()
  .superRefine((batch, context) => {
    const seen = new Set<string>();
    for (const [index, entry] of batch.entries.entries()) {
      if (seen.has(entry.idempotencyKey)) {
        context.addIssue({
          code: "custom",
          message: "Idempotency keys must be unique within a batch.",
          path: ["entries", index, "idempotencyKey"],
        });
      }
      seen.add(entry.idempotencyKey);
    }
  });

export const officialUrlIntakeQueuePayloadSchema = z
  .object({
    kind: z.literal(OFFICIAL_URL_INTAKE_PAYLOAD_KIND),
    officialUrl: officialHttpsUrlSchema,
    idempotencyKey: idempotencyKeySchema,
    authority: z
      .object({
        type: z.literal("sweepza_operator"),
        appUserId: z.string().uuid(),
      })
      .strict(),
  })
  .strict();

export type OfficialUrlIntakeEntry = z.infer<
  typeof officialUrlIntakeEntrySchema
>;
export type OfficialUrlIntakeQueuePayload = z.infer<
  typeof officialUrlIntakeQueuePayloadSchema
>;
