const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ignoredDirs = new Set([".git", ".vercel", "node_modules", "outputs", "work"]);
const extensions = new Set([".js", ".cjs"]);

const files = [];
walk(root);

let failed = false;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout || `${file} failed syntax check\n`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(`syntax_ok=${files.length}`);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(fullPath);
      }
      continue;
    }

    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
}
