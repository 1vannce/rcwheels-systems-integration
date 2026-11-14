import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

function resolveWorkspaceRoot(): string {
  // In a worktree (.worktrees/<name>), node_modules lives in the parent repo.
  const parentRepo = path.resolve(process.cwd(), "../..");
  if (fs.existsSync(path.join(parentRepo, "node_modules", "next", "package.json"))) {
    return parentRepo;
  }
  return process.cwd();
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: resolveWorkspaceRoot(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
