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

const visit = (node: Node, fn: (node: Node) => void) => {
  fn(node);
  node.children?.forEach((child) => visit(child, fn));
};

export function checkLesson() {
  return (tree: Node, file: File) => {
    if (!/[\\/]src[\\/]lessons[\\/][^\\/]+\.mdx$/.test(file.path ?? "")) return;

    const yaml = tree.children?.find((n) => n.type === "yaml");
    let data: unknown;
    try {
      data = parse(String(yaml?.value ?? ""));
    } catch (e) {
      file.fail(`the frontmatter isn't valid YAML: ${e instanceof Error ? e.message : e}`, yaml);
    }
    const meta = frontmatterSchema.safeParse(data ?? {});
    if (!meta.success) file.fail(`check the frontmatter: ${describeIssues(meta.error.issues)}`, yaml);

    visit(tree, (node) => {
      if (node.type !== "mdxJsxFlowElement" || !node.name) return;
      const kids = node.children ?? [];
      const list = (ordered: boolean) =>
        kids.find((k) => k.type === "list" && Boolean(k.ordered) === ordered);
      if (["Quiz", "Myth", "Order"].includes(node.name) && !kids.some((k) => k.name === "Why")) {
        file.fail(`every <${node.name}> needs a <Why> explaining the answer`, node);
      }
      if (node.name === "Quiz") {
        const marked = list(false)?.children?.filter((li) => li.checked === true).length ?? 0;
        if (marked !== 1)
          file.fail(
            marked
              ? "a <Quiz> can only have one `- [x]` option"
              : "mark the correct <Quiz> option with `- [x]`",
            node,
          );
      }
      if (node.name === "Myth") {
        const fact = node.attributes?.find((a) => a.name === "fact")?.value as { value?: string } | undefined;
        if (fact?.value !== "true" && fact?.value !== "false")
          file.fail("write <Myth fact={true}> or <Myth fact={false}>", node);
      }
      if (node.name === "Order" && (list(true)?.children?.length ?? 0) < 3) {
        file.fail("an <Order> needs a numbered list of at least 3 items, in the correct order", node);
      }
    });
  };
}
