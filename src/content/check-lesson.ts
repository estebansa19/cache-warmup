import { parse } from "yaml";
import { describeIssues, frontmatterSchema } from "./frontmatter.ts";

/*
 * A remark plugin that checks each lesson in src/lessons/ while it's compiled, so a mistake
 * shows up in the dev server's error overlay and fails `vite build`, with the file and line.
 * It only checks: parse-lesson.ts still turns the lesson into steps when the app runs.
 */

type Node = {
  type: string;
  name?: string | null;
  value?: unknown;
  checked?: boolean | null;
  ordered?: boolean | null;
  attributes?: { name?: string; value?: unknown }[];
  children?: Node[];
};

type File = { path?: string; fail(reason: string, place?: unknown): never };

const LESSON_FILE = /[\\/]src[\\/]lessons[\\/][^\\/]+\.mdx$/;

/** What's wrong with each kind of check, or null when it's fine. */
const CHECKS: Record<string, (node: Node) => string | null> = {
  Quiz: (node) => {
    const marked = list(node, false)?.children?.filter((li) => li.checked === true).length ?? 0;
    if (marked === 0) return "mark the correct <Quiz> option with `- [x]`";
    return marked > 1 ? "a <Quiz> can only have one `- [x]` option" : null;
  },
  Myth: (node) => {
    const fact = node.attributes?.find((a) => a.name === "fact")?.value as { value?: string } | undefined;

    return fact?.value === "true" || fact?.value === "false"
      ? null
      : "write <Myth fact={true}> or <Myth fact={false}>";
  },
  Order: (node) =>
    (list(node, true)?.children?.length ?? 0) < 3
      ? "an <Order> needs a numbered list of at least 3 items, in the correct order"
      : null,
};

export function checkLesson() {
  return (tree: Node, file: File) => {
    if (!LESSON_FILE.test(file.path ?? "")) return;

    checkFrontmatter(tree, file);
    visit(tree, (node) => {
      const check = node.type === "mdxJsxFlowElement" && node.name ? CHECKS[node.name] : undefined;
      if (!check) return;

      const hasWhy = node.children?.some((k) => k.name === "Why");
      const problem = hasWhy ? check(node) : `every <${node.name}> needs a <Why> explaining the answer`;
      if (problem) file.fail(problem, node);
    });
  };
}

function checkFrontmatter(tree: Node, file: File) {
  const yaml = tree.children?.find((n) => n.type === "yaml");
  let data: unknown;

  try {
    data = parse(String(yaml?.value ?? ""));
  } catch (e) {
    file.fail(`the frontmatter isn't valid YAML: ${e instanceof Error ? e.message : e}`, yaml);
  }

  const meta = frontmatterSchema.safeParse(data ?? {});
  if (!meta.success) file.fail(`check the frontmatter: ${describeIssues(meta.error.issues)}`, yaml);
}

/** The first bullet (or numbered) list directly inside a check. */
function list(node: Node, ordered: boolean) {
  return node.children?.find((k) => k.type === "list" && Boolean(k.ordered) === ordered);
}

function visit(node: Node, fn: (node: Node) => void) {
  fn(node);
  node.children?.forEach((child) => visit(child, fn));
}
