import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { createBridge } from "./server/bridge.mjs";
import { bridgeOptions } from "./server/options.mjs";
import { checkLesson } from "./src/content/check-lesson.ts";

/**
 * In `npm run dev`, serve the AI feedback endpoints from the Vite dev server too.
 * It reads CW_PROVIDER, CW_MODEL and CW_ALLOWED_ORIGINS the same way `npm start` does.
 */
function aiBridge(): Plugin {
  return {
    name: "cache-warmup-ai-bridge",
    async configureServer(server) {
      const bridge = await createBridge({ ...bridgeOptions({}, process.env), log: false });
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/api/")) bridge.handle(req, res).catch(next);
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
    {
      enforce: "pre",
      // Keep MDX provider-free and wrapper-free (no providerImportSource, no layout):
      // parse-lesson.ts reads the elements MDX returns directly.
      ...mdx({ remarkPlugins: [remarkGfm, remarkFrontmatter, checkLesson, remarkMdxFrontmatter] }),
    },
    react({ include: /\.(mdx|tsx?)$/ }),
    aiBridge(),
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
