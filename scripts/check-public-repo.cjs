const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "ROADMAP.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "MAINTENANCE.md",
  "docs/LAUNCH.md",
  "docs/SDK_EXAMPLES.md",
  "docs/VERCEL_KV_UPSTASH.md",
  "examples/javascript-openai-sdk.mjs",
  "examples/python-openai-sdk.py",
  "docs/screenshots/home.png",
  "docs/screenshots/docs.png",
  "docs/screenshots/dashboard.png",
  "docs/screenshots/admin.png",
  ".env.example",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md",
  ".github/pull_request_template.md",
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));

if (missing.length > 0) {
  console.error(`missing_public_files=${missing.join(",")}`);
  process.exit(1);
}

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const requiredReadmeSnippets = [
  "https://responses-api-gateway.vercel.app",
  "## Quick Start",
  "## Security Notes",
  "## Maintenance",
  "## Screenshots",
  "## SDK Examples",
  "Vercel KV",
];

const missingReadmeSnippets = requiredReadmeSnippets.filter((snippet) => !readme.includes(snippet));
if (missingReadmeSnippets.length > 0) {
  console.error(`missing_readme_sections=${missingReadmeSnippets.join(",")}`);
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (!packageJson.repository || !String(packageJson.repository.url || "").includes("responses-api-gateway")) {
  console.error("package_repository_missing");
  process.exit(1);
}

console.log("public_repo_ok=true");
