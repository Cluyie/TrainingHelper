import { defineConfig } from "vitest/config";
import path from "node:path";

// Only the pure logic in src/lib is unit-tested — the planner, load model and
// progression rules. Anything touching Supabase or React is verified by hand.
export default defineConfig({
  test: {
    include: ["src/lib/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
