import { z } from "zod";
import {
  normalizeOfficialUrl,
  OfficialUrlNormalizationError,
} from "@/lib/official-url-normalization";

export const OFFICIAL_URL_INTAKE_PAYLOAD_KIND =
  "admin_official_url_v1" as const;

export const officialUrlIntakeOperationSchema = z.enum([
  "enqueue",
  "revalidate",
]);

export type OfficialUrlIntakeOperation = z.infer<
  typeof officialUrlIntakeOperationSchema
>;

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
  .transform((value, context) => {
    try {
      return normalizeOfficialUrl(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof OfficialUrlNormalizationError
            ? error.message
            : "Official URL normalization failed.",
      });
      return z.NEVER;
    }
  });

export const officialUrlIntakeEntrySchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    officialUrl: officialHttpsUrlSchema,
  })
  .strict();

export const officialUrlIntakeBatchSchema = z
  .object({
    operation: officialUrlIntakeOperationSchema.default("enqueue"),
    entries: z
      .array(officialUrlIntakeEntrySchema)
      .min(1, "Submit at least one official URL.")
      .max(500, "A batch may contain at most 500 official URLs."),
  })
  .strict()
  .superRefine((batch, context) => {
    const seenIdempotencyKeys = new Set<string>();
    const firstIndexByOfficialUrl = new Map<string, number>();
    for (const [index, entry] of batch.entries.entries()) {
      if (seenIdempotencyKeys.has(entry.idempotencyKey)) {
        context.addIssue({
          code: "custom",
          message: "Idempotency keys must be unique within a batch.",
          path: ["entries", index, "idempotencyKey"],
        });
      }
      seenIdempotencyKeys.add(entry.idempotencyKey);

      const firstIndex = firstIndexByOfficialUrl.get(entry.officialUrl);
      if (firstIndex !== undefined) {
        context.addIssue({
          code: "custom",
          message:
            `Official URL duplicates entry ${firstIndex + 1} after normalization.`,
          path: ["entries", index, "officialUrl"],
        });
      } else {
        firstIndexByOfficialUrl.set(entry.officialUrl, index);
      }
    }
  });

const officialUrlIntakeRefreshSchema = z
  .object({
    requestItemKey: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(
        /^admin-official:[A-Za-z0-9._:/-]+$/,
        "Refresh request keys must identify immutable official intake.",
      ),
    generation: z.number().int().min(2).max(2_147_483_647),
    reason: z.enum([
      "operator_revalidation",
      "scheduled_revalidation",
    ]),
  })
  .strict();

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
    refresh: officialUrlIntakeRefreshSchema.optional(),
  })
  .strict();

export type OfficialUrlIntakeEntry = z.infer<
  typeof officialUrlIntakeEntrySchema
>;
export type OfficialUrlIntakeQueuePayload = z.infer<
  typeof officialUrlIntakeQueuePayloadSchema
>;
