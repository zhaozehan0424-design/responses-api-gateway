const fs = require("fs");
const path = require("path");

const action = String(process.argv[2] || "").toLowerCase();
const root = path.resolve(__dirname, "..");
const vercelPath = path.join(root, "vercel.json");

const closedSources = new Set(["/", "/index.html", "/docs", "/docs.html"]);
const closedRedirects = Array.from(closedSources).map((source) => ({
  source,
  destination: "/api/site/closed",
  permanent: false,
}));

if (!["open", "close", "status"].includes(action)) {
  console.error("Usage: node scripts/site-toggle.js <open|close|status>");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
config.redirects = Array.isArray(config.redirects) ? config.redirects : [];
config.rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];

if (action === "status") {
  const routeState = isRouteClosed(config) ? "closed" : "open";
  console.log(`route_state=${routeState}`);
  process.exit(0);
}

if (action === "close") {
  config.redirects = [
    ...closedRedirects,
    ...config.redirects.filter((redirect) => !closedSources.has(String(redirect.source || ""))),
  ];
  config.rewrites = upsertRewrite(
    config.rewrites.filter((rewrite) => !closedSources.has(String(rewrite.source || ""))),
    "/dashboard",
    "/api/site/closed"
  );
}

if (action === "open") {
  config.redirects = config.redirects.filter((redirect) => !closedSources.has(String(redirect.source || "")));
  config.rewrites = upsertRewrite(
    config.rewrites.filter((rewrite) => !closedSources.has(String(rewrite.source || ""))),
    "/dashboard",
    "/api/dashboard/page"
  );
}

fs.writeFileSync(vercelPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`site_routes=${action}`);

function upsertRewrite(rewrites, source, destination) {
  const index = rewrites.findIndex((rewrite) => String(rewrite.source || "") === source);
  if (index >= 0) {
    rewrites[index] = { ...rewrites[index], destination };
    return rewrites;
  }
  return [...rewrites, { source, destination }];
}

function isRouteClosed(config) {
  const redirects = Array.isArray(config.redirects) ? config.redirects : [];
  const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
  const hasClosedHome = Array.from(closedSources).every((source) =>
    redirects.some((redirect) =>
      String(redirect.source || "") === source &&
      String(redirect.destination || "") === "/api/site/closed"
    )
  );
  const dashboard = rewrites.find((rewrite) => String(rewrite.source || "") === "/dashboard");
  return hasClosedHome && String(dashboard?.destination || "") === "/api/site/closed";
}
