/// <reference types="vite/client" />
/// <reference types="mdx" />

// remark-mdx-frontmatter exposes each lesson's YAML header as `frontmatter`.
declare module "*.mdx" {
  export const frontmatter: Record<string, unknown>;
}
