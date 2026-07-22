import { z } from "zod";

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first === 0
  );
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipv6 = normalized.includes(":");
  let mappedIpv4IsPrivate = false;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (mapped.includes(".")) {
      mappedIpv4IsPrivate = isPrivateIpv4(mapped);
    } else {
      const words = mapped.split(":");
      if (words.length === 2 && words.every((word) => /^[0-9a-f]{1,4}$/.test(word))) {
        const high = Number.parseInt(words[0], 16);
        const low = Number.parseInt(words[1], 16);
        mappedIpv4IsPrivate = isPrivateIpv4(
          [high >> 8, high & 255, low >> 8, low & 255].join("."),
        );
      }
    }
  }
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1" ||
    normalized === "::" ||
    (ipv6 && /^f[cd][0-9a-f]*:/.test(normalized)) ||
    (ipv6 && /^fe[89ab][0-9a-f]*:/.test(normalized)) ||
    mappedIpv4IsPrivate ||
    isPrivateIpv4(normalized)
  );
}

export const publicHttpUrlSchema = z
  .string()
  .trim()
  .url()
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid URL." });
      return;
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only HTTP or HTTPS links are allowed.",
      });
    }
    if (url.username || url.password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URLs cannot contain embedded credentials.",
      });
    }
    if (isPrivateHostname(url.hostname)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Private or local network URLs are not allowed.",
      });
    }
  });

export const publicHttpsUrlSchema = publicHttpUrlSchema.superRefine(
  (value, context) => {
    let protocol: string;
    try {
      protocol = new URL(value).protocol;
    } catch {
      return;
    }
    if (protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An HTTPS link is required.",
      });
    }
  },
);

export const optionalPublicHttpUrlSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  publicHttpUrlSchema.optional().nullable(),
);

export const optionalPublicHttpsUrlSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  publicHttpsUrlSchema.optional().nullable(),
);
