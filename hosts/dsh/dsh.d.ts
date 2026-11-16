// The harness's own packages are provided by the profile at run time; only the one function used is declared.
declare module '@deepseek-ai/dsh-tools' {
  export function defineTool(tool: unknown): unknown
}
