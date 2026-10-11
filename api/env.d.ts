// Just enough of Node's `process` for the proxy and vite.config.ts, without adding @types/node.
declare const process: {
  env: Record<string, string | undefined>
  cwd(): string
}
