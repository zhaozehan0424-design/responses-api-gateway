/*
 * 共享前端工具 —— 被 app.js（落地页）和 docs.js（文档页）复用。
 * 依赖 config.js 先加载（window.GATEWAY_CONFIG）。挂到 window.GW。
 */
(function () {
  "use strict";

  var CONFIG = window.GATEWAY_CONFIG || {};
  var FALLBACK_BASE_URL = "https://your-domain.example/v1";

  /** 解析对外展示的 base_url。优先用配置里写死的，否则按当前域名推断。 */
  function resolveBaseUrl() {
    if (CONFIG.baseUrlOverride) return String(CONFIG.baseUrlOverride);
    var origin = window.location && window.location.origin;
    // 本地以 file:// 打开时 origin 为 "null"/空，给出占位地址。
    if (!origin || origin === "null") return FALLBACK_BASE_URL;
    return origin.replace(/\/+$/, "") + "/v1";
  }

  /** 复制文本到剪贴板，带降级方案。返回 Promise<boolean>。 */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return legacyCopy(text);
        }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /** 在按钮上短暂显示“已复制”。 */
  function flashCopied(btn) {
    if (!btn) return;
    var label = btn.querySelector(".copy-label");
    var prev = label ? label.textContent : "";
    btn.classList.add("is-copied");
    if (label) label.textContent = "已复制";
    window.setTimeout(function () {
      btn.classList.remove("is-copied");
      if (label) label.textContent = prev || "复制";
    }, 1500);
  }

  /**
   * 绑定复制按钮：
   *  - [data-copy="#selector"] 复制目标元素的 value 或文本
   *  - [data-copy-code] 复制所在 .codeblock 内 <code> 的文本
   */
  function bindCopyButtons(root) {
    (root || document).addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-copy], [data-copy-code]");
      if (!btn) return;

      var text = "";
      if (btn.hasAttribute("data-copy-code")) {
        var block = btn.closest("[data-codeblock]") || btn.closest(".codeblock");
        var code = block && block.querySelector("code");
        text = code ? code.textContent : "";
      } else {
        var sel = btn.getAttribute("data-copy");
        var target = sel ? document.querySelector(sel) : null;
        if (target) text = "value" in target ? target.value : target.textContent;
      }
      if (!text) return;

      copyText(text).then(function (ok) {
        if (ok) flashCopied(btn);
      });
    });
  }

  /** 把品牌名 / 副标题 / 年份 / 链接等填进带 data-* 标记的元素。 */
  function applyBranding(root) {
    var scope = root || document;
    var brand = CONFIG.brand || "Relay Hub";

    each(scope.querySelectorAll("[data-brand]"), function (el) {
      el.textContent = brand;
    });
    each(scope.querySelectorAll("[data-tagline]"), function (el) {
      if (CONFIG.tagline) el.textContent = CONFIG.tagline;
    });
    each(scope.querySelectorAll("[data-year]"), function (el) {
      // Date 在浏览器里可用（仅工作流脚本环境受限），这里取当前年份。
      el.textContent = String(new Date().getFullYear());
    });

    var docsPath = CONFIG.docsPath || "/docs";
    each(scope.querySelectorAll("[data-docs-link]"), function (el) {
      el.setAttribute("href", docsPath);
    });

    // Discord 注册按钮：仅在启用时展示。
    each(scope.querySelectorAll("[data-discord-btn]"), function (el) {
      if (CONFIG.discordLoginEnabled && CONFIG.discordRegistrationEnabled !== false) {
        el.setAttribute("href", CONFIG.discordRegisterPath || "/api/auth/discord/login?mode=register");
        el.removeAttribute("hidden");
      } else {
        el.setAttribute("hidden", "");
      }
    });

    // Discord 登录按钮：仅在启用时展示。
    each(scope.querySelectorAll("[data-discord-login-btn]"), function (el) {
      if (CONFIG.discordLoginEnabled) {
        el.setAttribute("href", CONFIG.discordLoginPath || "/api/auth/discord/login?mode=login");
        el.removeAttribute("hidden");
      } else {
        el.setAttribute("hidden", "");
      }
    });

    each(scope.querySelectorAll("[data-dashboard-link]"), function (el) {
      el.setAttribute("href", CONFIG.dashboardPath || "/dashboard");
    });

    // 可选联系入口。
    each(scope.querySelectorAll("[data-contact-link]"), function (el) {
      if (CONFIG.contactUrl) {
        el.setAttribute("href", CONFIG.contactUrl);
        el.textContent = CONFIG.contactLabel || "联系我们";
        el.removeAttribute("hidden");
      }
    });

    // 页面标题：若元素带 data-title-suffix，则用「品牌名 + 后缀」覆盖。
    var titleEl = scope.querySelector("[data-title-suffix]");
    if (titleEl) {
      document.title = brand + " · " + titleEl.getAttribute("data-title-suffix");
    }
  }

  /** 把所有 base_url 展示位填上解析后的地址。 */
  function applyBaseUrl(root) {
    var url = resolveBaseUrl();
    each((root || document).querySelectorAll("[data-base-url]"), function (el) {
      if ("value" in el) el.value = url;
      else el.textContent = url;
    });
    return url;
  }

  /**
   * 渲染代码模板：把 [data-tpl] 里的 __BASE_URL__ / __API_KEY__ 占位符替换掉。
   * 首次调用会把原始模板缓存到 dataset.template，便于反复重渲染。
   */
  function renderTemplates(root, vars) {
    var baseUrl = (vars && vars.baseUrl) || resolveBaseUrl();
    var apiKey = (vars && vars.apiKey) || "YOUR_API_KEY";
    each((root || document).querySelectorAll("[data-tpl]"), function (code) {
      if (code.dataset.template === undefined) {
        code.dataset.template = code.textContent;
      }
      code.textContent = code.dataset.template
        .split("__BASE_URL__")
        .join(baseUrl)
        .split("__API_KEY__")
        .join(apiKey);
    });
  }

  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  window.GW = {
    config: CONFIG,
    resolveBaseUrl: resolveBaseUrl,
    copyText: copyText,
    flashCopied: flashCopied,
    bindCopyButtons: bindCopyButtons,
    applyBranding: applyBranding,
    applyBaseUrl: applyBaseUrl,
    renderTemplates: renderTemplates,
    each: each,
  };
})();
