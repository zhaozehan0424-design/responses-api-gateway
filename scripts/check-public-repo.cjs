const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
  "README.md",
  "ADOPTION.md",
  "LICENSE",
  "CHANGELOG.md",
  "ROADMAP.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "MAINTENANCE.md",
  "REPOSITORY_STATUS.md",
  "docs/LAUNCH.md",
  "docs/SDK_EXAMPLES.md",
  "docs/VERCEL_KV_UPSTASH.md",
  "docs/evidence/discord-community-post.png",
  "docs/evidence/discord-locked-thread.png",
  "docs/evidence/vercel-usage-email.png",
  "docs/evidence/vercel-fluid-cpu-email.png",
  "examples/javascript-openai-sdk.mjs",
  "examples/python-openai-sdk.py",
  "scripts/smoke-tests.cjs",
  "scripts/check-discord-config.cjs",
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
  "Adoption",
  "Discord application checklist",
  "Memory Palace",
  "https://memory-palace-five.vercel.app",
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

const adoption = fs.readFileSync(path.join(root, "ADOPTION.md"), "utf8");
const requiredAdoptionSnippets = [
  "Memory Palace",
  "https://memory-palace-five.vercel.app",
  "not counted as Relay Hub traffic",
  "Fluid Active CPU usage reaching 75%",
];

const missingAdoptionSnippets = requiredAdoptionSnippets.filter((snippet) => !adoption.includes(snippet));
if (missingAdoptionSnippets.length > 0) {
  console.error(`missing_adoption_sections=${missingAdoptionSnippets.join(",")}`);
  process.exit(1);
}

console.log("public_repo_ok=true");
