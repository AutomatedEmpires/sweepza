import { isRegistrablePublicHostname } from "@/lib/public-hostname";

export const MAX_OFFICIAL_URL_LENGTH = 2048;

export class OfficialUrlNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficialUrlNormalizationError";
  }
}

function invalidOfficialUrl(message: string): never {
  throw new OfficialUrlNormalizationError(message);
}

/**
 * The canonical browser-and-server boundary for operator-supplied official
 * URLs. Keeping this policy in one client-safe module prevents the console from
 * deriving an idempotency key for a URL the API would normalize differently.
 */
export function normalizeOfficialUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) invalidOfficialUrl("URL is empty.");
  if (trimmed.length > MAX_OFFICIAL_URL_LENGTH) {
    invalidOfficialUrl(
      `URL exceeds ${MAX_OFFICIAL_URL_LENGTH} characters.`,
    );
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    invalidOfficialUrl("Enter a valid absolute HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    invalidOfficialUrl("URL must use HTTPS.");
  }
  if (url.username || url.password) {
    invalidOfficialUrl("URL must not contain credentials.");
  }
  if (url.port) {
    invalidOfficialUrl("URL must use the default HTTPS port.");
  }
  if (!isRegistrablePublicHostname(url.hostname)) {
    invalidOfficialUrl(
      "URL must use a registrable public hostname.",
    );
  }

  url.hash = "";
  return url.toString();
}
