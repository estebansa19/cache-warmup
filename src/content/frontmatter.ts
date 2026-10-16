import { z } from "zod/mini";

/*
 * The YAML header of a lesson file. Kept apart from parse-lesson.ts (no React) so the
 * build-time lesson check in vite.config.ts can use it too.
 */

export const TRACK_NAMES = ["Foundations", "Data", "Systems", "Craft"] as const;

export const frontmatterSchema = z.object({
  id: z.string().check(z.regex(/^[a-z0-9-]+$/, "use lowercase letters, digits and dashes")),
  title: z.string().check(z.minLength(1)),
  track: z.enum(TRACK_NAMES),
  mins: z.int().check(z.positive()),
  tag: z.string().check(z.minLength(1)),
  cards: z
    .array(z.tuple([z.string().check(z.minLength(1)), z.string().check(z.minLength(1))]))
    .check(z.minLength(1)),
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;

/** "title (expected string), track (…)" for an error message. */
export const describeIssues = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues.map((i) => `${i.path.map(String).join(".") || "frontmatter"} (${i.message})`).join(", ");
