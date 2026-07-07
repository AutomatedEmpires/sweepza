// Image-optimization gate. next/image only accepts remote hosts allowlisted
// in next.config.mjs remotePatterns; listing media can also reference
// arbitrary sponsor-site URLs (image_source_type = external_reference), which
// must render unoptimized instead of crashing the page. Keep the host list in
// sync with next.config.mjs.

const OPTIMIZED_IMAGE_HOSTS = [/\.supabase\.co$/, /^img\.clerk\.com$/, /^picsum\.photos$/];

export function canOptimizeImage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    return OPTIMIZED_IMAGE_HOSTS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}
