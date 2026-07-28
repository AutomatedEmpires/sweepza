import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests target the pure lib layer and API route handlers. The "server-only"
// package throws outside a Next.js server context, so it is stubbed; Supabase /
// Clerk boundaries are mocked per-test.
export default defineConfig({
  // Next keeps JSX as `preserve` for its own compiler. Vitest needs an
  // executable transform so focused component tests can render TSX directly.
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    environment: "node",
    clearMocks: true,
  },
});
