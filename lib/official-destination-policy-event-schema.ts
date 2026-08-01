import { z } from "zod";
import { SOURCE_COMPLIANCE_STATES } from "@/lib/ingestion/compliance";
import {
  optionalPublicHttpsUrlSchema,
} from "@/lib/http-url-schema";
import { isRegistrablePublicHostname } from "@/lib/public-hostname";

const ROBOTS_POSTURES = [
  "permissive",
  "permissive_with_delay",
  "restricted",
  "unknown",
] as const;

const TOS_POSTURES = [
  "unreviewed",
  "permits_use",
  "prohibits_use",
  "requires_agreement",
] as const;

const hostnameSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value.trim().toLowerCase().replace(/\.$/, "")
      : value,
  z
    .string()
    .min(3)
    .max(253)
    .regex(
      /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/,
      "Enter a hostname without a scheme, port, path, or wildcard.",
    )
    .refine((value) => value.includes("."), "Enter a public hostname.")
    .refine((value) => !value.includes(".."), "Hostname labels cannot be empty.")
    .refine(
      isRegistrablePublicHostname,
      "Enter a registrable hostname below a public suffix, not an IP or suffix.",
    ),
);

const pathPrefixSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return "/";
    return trimmed === "/" ? "/" : trimmed.replace(/\/+$/, "");
  },
  z
    .string()
    .min(1)
    .max(2048)
    .startsWith("/", "Path scope must begin with '/'.")
    .refine(
      (value) => !/[?#\s]/.test(value),
      "Path scope cannot contain whitespace, a query, or a fragment.",
    )
    .refine(
      (value) => value === "/" || !value.endsWith("/"),
      "Path scope must use its canonical form.",
    ),
);

const nullableTimestampSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? null : value,
  z.string().datetime({ offset: true }).nullable().optional(),
);

/**
 * Admin input for one append-only destination decision. Actor and decision
 * time are intentionally absent: the authenticated server supplies both.
 */
export const officialDestinationPolicyEventSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    expectedCurrentId: z.number().int().positive().nullable(),
    expectedLedgerVersion: z.number().int().positive().nullable(),
    hostname: hostnameSchema,
    pathPrefix: pathPrefixSchema,
    includeSubdomains: z.boolean().default(false),
    complianceState: z.enum(SOURCE_COMPLIANCE_STATES),
    robotsPosture: z.enum(ROBOTS_POSTURES),
    tosPosture: z.enum(TOS_POSTURES),
    termsUrl: optionalPublicHttpsUrlSchema,
    robotsUrl: optionalPublicHttpsUrlSchema,
    reason: z.string().trim().min(10).max(2000),
    reviewExpiresAt: nullableTimestampSchema,
    productionApprovalConfirmed: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.complianceState !== "approved_for_production") return;

    if (!value.productionApprovalConfirmed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["productionApprovalConfirmed"],
        message:
          "Explicitly confirm that this reviewed scope may be fetched in production.",
      });
    }
    if (value.tosPosture !== "permits_use") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tosPosture"],
        message: "Production approval requires a ToS review that permits use.",
      });
    }
    if (
      value.robotsPosture !== "permissive" &&
      value.robotsPosture !== "permissive_with_delay"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["robotsPosture"],
        message: "Production approval requires permissive robots evidence.",
      });
    }
    if (!value.termsUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["termsUrl"],
        message: "Production approval requires an HTTPS terms evidence URL.",
      });
    }
    if (!value.robotsUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["robotsUrl"],
        message: "Production approval requires an HTTPS robots evidence URL.",
      });
    }
    if (!value.reviewExpiresAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewExpiresAt"],
        message: "Production approval requires a bounded review expiry.",
      });
    } else {
      const expiry = Date.parse(value.reviewExpiresAt);
      const now = Date.now();
      if (expiry <= now || expiry > now + 180 * 24 * 60 * 60 * 1000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reviewExpiresAt"],
          message:
            "Production approval must expire in the future within 180 days.",
        });
      }
    }
  });

export type OfficialDestinationPolicyEventInput = z.infer<
  typeof officialDestinationPolicyEventSchema
>;
