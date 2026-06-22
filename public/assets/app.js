/*
 * 落地页脚本。依赖 config.js + ui.js（window.GW）先加载。
 */
(function () {
  "use strict";

  function init() {
    if (!window.GW) return;

    GW.applyBranding(document);
    GW.applyBaseUrl(document);
    GW.renderTemplates(document, { apiKey: "YOUR_API_KEY" });
    GW.bindCopyButtons(document);
    renderSiteStats();
    renderModels();
    renderPricing();
  }

  async function renderSiteStats() {
    var root = document.querySelector("[data-site-stats]");
    if (!root) return;
    try {
      var response = await fetch("/site/stats", { headers: { accept: "application/json" } });
      var data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "stats unavailable");
      setText("[data-site-stat-registered]", formatNumber(data.registered));
      setText("[data-site-stat-limit]", data.limit > 0 ? formatNumber(data.limit) : "不限");
      setText("[data-site-stat-remaining]", data.remaining === null ? "不限" : formatNumber(data.remaining));
      setText("[data-site-stat-status]", data.registrationOpen ? "开放中" : "已满/暂停");
      root.classList.toggle("site-stats--closed", !data.registrationOpen);
    } catch {
      setText("[data-site-stat-status]", "暂不可用");
      root.classList.add("site-stats--closed");
    }
  }

  function setText(selector, value) {
    var el = document.querySelector(selector);
    if (el) el.textContent = String(value);
  }

  function renderModels() {
    var box = document.querySelector("[data-models]");
    if (!box) return;
    var models = (GW.config && GW.config.models) || [];
    if (!models.length) {
      box.innerHTML = '<span class="muted">（未配置展示模型）</span>';
      return;
    }
    box.innerHTML = "";
    GW.each(models, function (id) {
      var chip = document.createElement("span");
      chip.className = "chip model-chip";
      if (isClaudeModel(id)) {
        chip.appendChild(createClaudeMark());
      } else if (isGeminiModel(id)) {
        chip.appendChild(createGeminiMark());
      }
      var price = getModelPrice(id);
      if (price) {
        chip.title = "Input $" + price.input + "/MTok · Output $" + price.output + "/MTok";
      }
      var label = document.createElement("span");
      label.textContent = id;
      chip.appendChild(label);
      box.appendChild(chip);
    });
  }

  function createClaudeMark() {
    var mark = document.createElement("span");
    mark.className = "model-mark model-mark--claude";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = '<img src="/assets/claude-ai-symbol.svg" alt="" loading="lazy" decoding="async" />';
    return mark;
  }

  function createGeminiMark() {
    var mark = document.createElement("span");
    mark.className = "model-mark model-mark--gemini";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = '<img src="/assets/google-gemini-icon-2025.svg" alt="" loading="lazy" decoding="async" />';
    return mark;
  }

  function isClaudeModel(id) {
    var value = String(id || "");
    return value.indexOf("claude-") === 0 || value.indexOf("agy-claude-") === 0;
  }

  function isGeminiModel(id) {
    return String(id || "").toLowerCase().indexOf("gemini") !== -1;
  }

  function renderPricing() {
    var root = document.querySelector("[data-model-pricing]");
    if (!root) return;
    var models = (GW.config && GW.config.models) || [];
    if (!models.length) return;
    root.innerHTML = "";

    models.forEach(function (model) {
      var price = getModelPrice(model);
      if (!price) return;
      var row = document.createElement("div");
      row.className = "pricing-row";
      row.innerHTML =
        '<code title="' + escapeHtml(model) + '">' + escapeHtml(model) + "</code>" +
        '<span class="pricing-price">Input <strong>$' + escapeHtml(price.input) + "</strong>/MTok</span>" +
        '<span class="pricing-price">Output <strong>$' + escapeHtml(price.output) + "</strong>/MTok</span>";
      root.appendChild(row);
    });
  }

  function getModelPrice(model) {
    var prices = (GW.config && GW.config.modelPricesUsdPerMTok) || {};
    return prices[model] || null;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatNumber(value) {
    var number = Number(value || 0);
    if (!Number.isFinite(number)) return "-";
    try {
      return number.toLocaleString("zh-CN");
    } catch {
      return String(Math.round(number));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
