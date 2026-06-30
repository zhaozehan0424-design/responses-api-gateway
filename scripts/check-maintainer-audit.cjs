const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];

checkSensitiveTrackedFiles();
checkGitignoreCoverage();
checkRuntimeEnvDocumentation();
checkMaintenanceDocs();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log("maintainer_audit_ok=true");

function checkSensitiveTrackedFiles() {
  const tracked = gitLsFiles();
  const sensitive = tracked.filter(isSensitiveTrackedPath);
  if (sensitive.length > 0) {
    failures.push(`sensitive_tracked_files=${sensitive.join(",")}`);
  }
}

function checkGitignoreCoverage() {
  const gitignore = readText(".gitignore");
  const requiredEntries = [
    ".env",
    ".env.*",
    "!.env.example",
    "*.log",
    ".vercel/",
    "node_modules/",
    "outputs/",
    "work/",
    "local-secrets.txt",
    "*.zip",
  ];
  const missing = requiredEntries.filter((entry) => !gitignore.split(/\r?\n/).includes(entry));
  if (missing.length > 0) {
    failures.push(`missing_gitignore_entries=${missing.join(",")}`);
  }
}

function checkRuntimeEnvDocumentation() {
  const envExample = readText(".env.example");
  const documented = new Set();
  for (const match of envExample.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]+)=/gm)) {
    documented.add(match[1]);
  }

  const runtimeFiles = listRuntimeFiles();
  const used = new Set();
  for (const file of runtimeFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of envNamePatterns()) {
      for (const match of source.matchAll(pattern)) {
        used.add(match[1]);
      }
    }
  }

  const missing = [...used].sort().filter((name) => !documented.has(name));
  if (missing.length > 0) {
    failures.push(`undocumented_runtime_env=${missing.join(",")}`);
  }
}

function checkMaintenanceDocs() {
  const requiredFiles = [
    "README.md",
    "CHANGELOG.md",
    "MAINTENANCE.md",
    "REPOSITORY_STATUS.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "ADOPTION.md",
    "docs/VERCEL_KV_UPSTASH.md",
    ".github/ISSUE_TEMPLATE/bug_report.md",
    ".github/ISSUE_TEMPLATE/feature_request.md",
    ".github/pull_request_template.md",
    ".github/workflows/ci.yml",
  ];
  const missingFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
  if (missingFiles.length > 0) {
    failures.push(`missing_maintainer_files=${missingFiles.join(",")}`);
  }

  const packageJson = JSON.parse(readText("package.json"));
  const changelog = readText("CHANGELOG.md");
  const latestHeaderPattern = new RegExp(`^## v${escapeRegExp(packageJson.version)} - \\d{4}-\\d{2}-\\d{2}`, "m");
  if (!latestHeaderPattern.test(changelog)) {
    failures.push(`missing_changelog_header_for_version=v${packageJson.version}`);
  }

  requireSnippets("README.md", [
    "Discord Registration",
    "Vercel KV",
    "ADMIN_TOKEN",
    "Admin logs mask API keys",
    "npm run check",
    "maintainer audit",
  ]);
  requireSnippets("SECURITY.md", [
    "Discord OAuth",
    "admin logs",
    "KV / Redis REST tokens",
    "ADMIN_TOKEN",
    "Never commit",
  ]);
  requireSnippets("MAINTENANCE.md", [
    "2026-06-25",
    "maintainer security audit",
    "Run `npm run check` before releases.",
    "Keep `.env`, `.vercel/`, logs, generated outputs, and local secret files out of commits.",
  ]);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requireSnippets(file, snippets) {
  const text = readText(file);
  const missing = snippets.filter((snippet) => !text.includes(snippet));
  if (missing.length > 0) {
    failures.push(`missing_${file.replace(/[\/.]/g, "_")}_snippets=${missing.join("|")}`);
  }
}

function envNamePatterns() {
  return [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
    /\b(?:requiredEnv|csvEnv|jsonEnv|optionalBaseUrl|stringEnv|numberEnv)\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
  ];
}

function listRuntimeFiles() {
  const files = [];
  for (const entry of ["gateway.js", "api", "lib"]) {
    const fullPath = path.join(root, entry);
    if (fs.existsSync(fullPath)) {
      walkRuntime(fullPath, files);
    }
  }
  return files.sort();
}

function walkRuntime(target, files) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      walkRuntime(path.join(target, entry.name), files);
    }
    return;
  }

  if (stat.isFile() && [".js", ".cjs", ".mjs"].includes(path.extname(target))) {
    files.push(target);
  }
}

function gitLsFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failures.push(`git_ls_files_failed=${(result.stderr || result.stdout || "").trim()}`);
    return [];
  }
  return result.stdout.split("\0").filter(Boolean).map(toPosixPath);
}

function isSensitiveTrackedPath(file) {
  return file === ".env" ||
    (file.startsWith(".env.") && file !== ".env.example") ||
    file === "local-secrets.txt" ||
    file === ".vercel" ||
    file.startsWith(".vercel/") ||
    file.startsWith("outputs/") ||
    file.startsWith("work/") ||
    file.startsWith("node_modules/") ||
    file.startsWith("litellm_pgdata/") ||
    file.endsWith(".log") ||
    file.endsWith(".zip");
}

function readText(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function toPosixPath(file) {
  return file.split(path.sep).join("/");
}

