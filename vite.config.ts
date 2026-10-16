import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { createBridge } from "./server/bridge.mjs";

/** In `npm run dev`, serve the AI feedback endpoints from the Vite dev server too. */
function aiBridge(): Plugin {
  return {
    name: "cache-warmup-ai-bridge",
    async configureServer(server) {
      const bridge = await createBridge({ log: false });
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/api/")) bridge.handle(req, res);
        else next();
      });
    },
  };
}

export default defineConfig({
  // Relative paths, so the built app works from any folder or static host.
  base: "./",
  // All lessons are compiled into the bundle (no network requests while studying), so it's larger than a typical page.
  build: { chunkSizeWarningLimit: 800 },
  plugins: [
    { enforce: "pre", ...mdx({ remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter] }) },
    react({ include: /\.(mdx|tsx?)$/ }),
    aiBridge(),
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
