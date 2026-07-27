import type { ToolDefinition } from "../types.js";

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "list_files",
    description: "List files and directories inside the project workspace.",
    parameters: objectSchema({
      path: { type: "string", description: "Project-relative directory. Defaults to ." },
      maxDepth: { type: "integer", minimum: 0, maximum: 8 },
    }),
  },
  {
    name: "read_file",
    description: "Read a bounded line range from a UTF-8 text file in the project.",
    parameters: objectSchema(
      {
        path: { type: "string", description: "Project-relative file path." },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
      },
      ["path"],
    ),
  },
  {
    name: "search_text",
    description: "Search project text files for a case-insensitive string.",
    parameters: objectSchema(
      {
        query: { type: "string" },
        path: { type: "string", description: "Project-relative search root. Defaults to ." },
      },
      ["query"],
    ),
  },
  {
    name: "write_file",
    description: "Create or fully overwrite a UTF-8 project file.",
    parameters: objectSchema(
      {
        path: { type: "string", description: "Project-relative file path." },
        content: { type: "string", description: "Complete file content." },
      },
      ["path", "content"],
    ),
  },
  {
    name: "replace_in_file",
    description: "Replace one exact, unique text occurrence in a project file.",
    parameters: objectSchema(
      {
        path: { type: "string" },
        oldText: { type: "string" },
        newText: { type: "string" },
      },
      ["path", "oldText", "newText"],
    ),
  },
  {
    name: "run_command",
    description: "Run a focused verification or development command in the project directory.",
    parameters: objectSchema(
      { command: { type: "string", description: "Shell command to execute." } },
      ["command"],
    ),
  },
  {
    name: "git_diff",
    description: "Read the current Git diff without changing the repository.",
    parameters: objectSchema({}),
  },
  {
    name: "browser_test",
    description:
      "Open a project HTML page in a real installed Chromium browser, collect runtime errors, interact with keys, and save a screenshot.",
    parameters: objectSchema(
      {
        path: { type: "string", description: "Project-relative HTML file path." },
        keys: {
          type: "array",
          items: { type: "string" },
          maxItems: 12,
          description: "Optional keyboard keys such as ArrowRight, Space, or Enter.",
        },
        waitMs: {
          type: "integer",
          minimum: 0,
          maximum: 5000,
          description: "Time to wait before and after interactions.",
        },
      },
      ["path"],
    ),
  },
];
