/*
 * 站点前端配置 —— 想改的东西都集中在这里。
 *
 * 这是一个普通脚本（不是 ES module），会把配置挂到 window.GATEWAY_CONFIG，
 * 供 index.html / docs.html 里的 app.js、docs.js 读取。
 *
 * 注意：服务端渲染的 Discord 结果页（api/auth/discord/callback.js、login.js）
 * 运行在另一套环境里，读不到这个文件。那两处的品牌名各有一个 BRAND 常量，
 * 改名时记得一起改（文件顶部都有注释提示）。
 */
window.GATEWAY_CONFIG = {
  // ── 品牌 ─────────────────────────────────────────────
  brand: "Relay Hub", // ← 站点名
  brandEn: "模型共享站", // ← 中文副标识
  tagline: "公益模型共享 · Responses 优先 · 类脑社区注册登录", // 首页副标题

  // ── 接入信息 ─────────────────────────────────────────
  // base_url 默认按当前访问域名自动推断（origin + "/v1"）。
  // 如果你想固定写死，把完整地址填到这里，例如：
  //   baseUrlOverride: "https://your-domain.example/v1"
  baseUrlOverride: "",

  // ── Discord 登录 ─────────────────────────────────────
  // 仅控制首页按钮是否展示；后端是否真正启用由服务端环境变量决定。
  discordLoginEnabled: true,
  discordRegistrationEnabled: true,
  discordRegisterPath: "/api/auth/discord/login?mode=register",
  discordLoginPath: "/api/auth/discord/login?mode=login",
  dashboardPath: "/dashboard",

  // ── 展示用模型列表 ───────────────────────────────────
  // 仅用于首页展示。每个 Key 实际可用的模型以其所属分组为准，
  // 登录后可用 GET /v1/models 查询真实清单。
  models: [
    "claude-haiku-4-5-20251001",
    "claude-opus-4-5-20251101",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-opus-fable",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6",
    "agy-claude-opus-4-6",
    "agy-claude-opus-4-6-thinking",
    "agy-claude-sonnet-4-6",
    "agy-claude-sonnet-4-6-thinking",
    "agy-gemini-2.5-flash",
    "agy-gemini-2.5-flash-lite",
    "agy-gemini-2.5-flash-thinking",
    "agy-gemini-2.5-pro",
    "agy-gemini-3-flash",
    "agy-gemini-3-flash-agent",
    "agy-gemini-3.1-flash-image",
    "agy-gemini-3.1-flash-lite",
    "agy-gemini-3.1-pro-high",
    "agy-gemini-3.1-pro-low",
    "agy-gemini-3.5-flash-extra-low",
    "agy-gemini-3.5-flash-low",
    "agy-gemini-pro-agent",
    "agy-chat_20706",
    "agy-chat_23310",
    "agy-gpt-oss-120b-medium",
    "agy-tab_flash_lite_preview",
    "agy-tab_jump_flash_lite_preview",
  ],

  // ── 展示用模型价格（USD / 1M tokens）──────────────────
  // 后端也有同一套默认价格；如需线上覆盖，可设置 MODEL_PRICES_JSON。
  defaultKeyBudgetUsd: 30,
  modelPricesUsdPerMTok: {
    "claude-opus-fable": { input: 10, output: 50 },
    "claude-opus-4-8": { input: 5, output: 25 },
    "claude-opus-4-7": { input: 5, output: 25 },
    "claude-opus-4-6": { input: 5, output: 25 },
    "claude-opus-4-5-20251101": { input: 5, output: 25 },
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
    "claude-haiku-4-5-20251001": { input: 1, output: 5 },
    "agy-claude-sonnet-4-6": { input: 3, output: 15 },
    "agy-gemini-pro-agent": { input: 1, output: 5 },
    "agy-gemini-3.1-flash-lite": { input: 1, output: 5 },
    "agy-gemini-3.1-pro-low": { input: 1, output: 5 },
    "agy-claude-opus-4-6-thinking": { input: 5, output: 25 },
    "agy-gemini-2.5-flash": { input: 1, output: 5 },
    "agy-gemini-3.5-flash-low": { input: 1, output: 5 },
    "agy-gemini-2.5-flash-thinking": { input: 1, output: 5 },
    "agy-gemini-3.1-flash-image": { input: 1, output: 5 },
    "agy-gemini-3-flash": { input: 1, output: 5 },
    "agy-gemini-3.1-pro-high": { input: 1, output: 5 },
    "agy-gemini-3.5-flash-extra-low": { input: 1, output: 5 },
    "agy-gemini-2.5-pro": { input: 1, output: 5 },
    "agy-gpt-oss-120b-medium": { input: 1, output: 5 },
    "agy-gemini-2.5-flash-lite": { input: 1, output: 5 },
    "agy-gemini-3-flash-agent": { input: 1, output: 5 },
    "agy-claude-sonnet-4-6-thinking": { input: 3, output: 15 },
    "agy-claude-opus-4-6": { input: 5, output: 25 },
  },

  // ── 可选链接（留空则不显示对应入口）────────────────────
  docsPath: "/docs", // 文档页路径（vercel cleanUrls 已开启）
  adminPath: "/admin", // 管理配置助手路径（静态页面，不直接修改服务器配置）
  contactUrl: "", // 例如 Discord 邀请链接 / 邮箱 mailto: / 帮助页
  contactLabel: "联系我们",
};
