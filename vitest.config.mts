import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the "@/*" alias from tsconfig.json (native in Vite, no plugin needed).
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The gym's calendar logic must not depend on the machine's clock zone, so the
    // suite runs in a zone that is neither UTC nor Africa/Casablanca.
    env: { TZ: "Pacific/Kiritimati" },
  },
});
