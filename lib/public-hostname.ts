import { parse } from "tldts";

/**
 * True only for a registrable hostname (or one of its subdomains).
 *
 * Public suffixes such as `co.uk` and private multi-tenant suffixes such as
 * `github.io` are not authority scopes by themselves. IP literals are also
 * excluded; official-destination policy is deliberately host based.
 */
export function isRegistrablePublicHostname(hostname: string): boolean {
  const result = parse(hostname, { allowPrivateDomains: true });
  return (
    !result.isIp &&
    Boolean(result.domain) &&
    (result.isIcann === true || result.isPrivate === true)
  );
}
