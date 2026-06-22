/*
 * 管理配置助手。所有计算都在浏览器本地完成，不向服务器发送任何数据。
 */
(function () {
  "use strict";

  var MODELS = (window.GATEWAY_CONFIG && window.GATEWAY_CONFIG.models) || [];
  var DEFAULT_BUDGET_USD = Number((window.GATEWAY_CONFIG && window.GATEWAY_CONFIG.defaultKeyBudgetUsd) || 30);
  var DEFAULT_RPM_LIMIT = Number((window.GATEWAY_CONFIG && window.GATEWAY_CONFIG.defaultRpmLimit) || 4);
  var GUEST_MODELS = MODELS.filter(function (model) { return model !== "claude-opus-fable"; });
  var GROUPS = [
    { name: "guest", label: "Guest", note: "Discord 默认访客组，除 fable 外均可用，每个 Discord 用户共享 30 USD 额度。", models: GUEST_MODELS, maxInputTokens: 0, maxOutputTokens: 0, allowStream: true, budgetUsd: DEFAULT_BUDGET_USD, rpmLimit: DEFAULT_RPM_LIMIT },
    { name: "member", label: "Member", note: "普通服务器成员。", models: GUEST_MODELS, maxInputTokens: 0, maxOutputTokens: 0, allowStream: true, budgetUsd: DEFAULT_BUDGET_USD, rpmLimit: DEFAULT_RPM_LIMIT },
    { name: "trusted", label: "Trusted", note: "熟人或长期用户。", models: GUEST_MODELS, maxInputTokens: 0, maxOutputTokens: 0, allowStream: true, budgetUsd: DEFAULT_BUDGET_USD, rpmLimit: DEFAULT_RPM_LIMIT },
    { name: "supporter", label: "Supporter", note: "赞助者或贡献者。", models: MODELS.slice(), maxInputTokens: 0, maxOutputTokens: 0, allowStream: true, budgetUsd: DEFAULT_BUDGET_USD, rpmLimit: DEFAULT_RPM_LIMIT },
    { name: "staff", label: "Staff", note: "管理员和维护人员。", models: MODELS.slice(), maxInputTokens: 0, maxOutputTokens: 0, allowStream: true, budgetUsd: DEFAULT_BUDGET_USD, rpmLimit: DEFAULT_RPM_LIMIT },
    { name: "tester", label: "Tester", note: "测试新模型和新策略。", models: MODELS.slice(), maxInputTokens: 0, maxOutputTokens: 1500, allowStream: true, budgetUsd: DEFAULT_BUDGET_USD, rpmLimit: DEFAULT_RPM_LIMIT },
  ];

  var ENDPOINTS = [
    { id: "models", label: "Models" },
    { id: "responses", label: "Responses" },
    { id: "chat.completions", label: "Chat Completions" },
  ];

  var registrationState = {
    users: [],
    meta: null,
    selectedUserId: "",
    query: "",
    group: "",
  };

  var logState = {
    logs: [],
    filteredLogs: [],
    selectedIndex: -1,
    filters: {
      query: "",
      status: "",
      group: "",
      model: "",
      agent: "",
      endpoint: "",
    },
  };

  function init() {
    if (window.GW) {
      GW.applyBranding(document);
      GW.bindCopyButtons(document);
    }
    renderGroups();
    bindInputs();
    bindLogControls();
    bindRegistrationControls();
    renderOutput();
    loadRegistrations();
    loadLogs();
    enhanceWideTables();
  }

  function renderGroups() {
    var root = document.querySelector("[data-admin-groups]");
    if (!root) return;
    root.innerHTML = "";

    GROUPS.forEach(function (group) {
      var card = document.createElement("section");
      card.className = "group-card";
      card.dataset.group = group.name;

      var heading = document.createElement("div");
      heading.className = "group-card-head";
      heading.innerHTML =
        "<div>" +
        "<h3>" + escapeHtml(group.label) + " <code class=\"inline-code\">" + escapeHtml(group.name) + "</code></h3>" +
        "<p class=\"muted\">" + escapeHtml(group.note) + "</p>" +
        "</div>";
      card.appendChild(heading);

      card.appendChild(buildModelPicker(group));
      card.appendChild(buildEndpointPicker(group));
      card.appendChild(buildLimits(group));

      root.appendChild(card);
    });
  }

  function buildModelPicker(group) {
    var wrap = document.createElement("div");
    wrap.className = "admin-fieldset";
    wrap.innerHTML = '<div class="field-label">模型</div>';

    var grid = document.createElement("div");
    grid.className = "model-options";
    MODELS.forEach(function (model) {
      var label = document.createElement("label");
      label.className = "check-pill";
      label.innerHTML =
        '<input type="checkbox" data-model="' + escapeAttr(model) + '"' +
        (group.models.indexOf(model) !== -1 ? " checked" : "") +
        "> <span>" + modelMarkHtml(model) + escapeHtml(model) + "</span>";
      grid.appendChild(label);
    });

    wrap.appendChild(grid);
    return wrap;
  }

  function buildEndpointPicker(group) {
    var wrap = document.createElement("div");
    wrap.className = "admin-fieldset";
    wrap.innerHTML = '<div class="field-label">接口</div>';

    var grid = document.createElement("div");
    grid.className = "endpoint-options";
    ENDPOINTS.forEach(function (endpoint) {
      var label = document.createElement("label");
      label.className = "check-pill";
      label.innerHTML =
        '<input type="checkbox" data-endpoint="' + escapeAttr(endpoint.id) + '" checked> ' +
        "<span>" + escapeHtml(endpoint.label) + "</span>";
      grid.appendChild(label);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function buildLimits(group) {
    var wrap = document.createElement("div");
    wrap.className = "admin-controls";
    wrap.innerHTML =
      '<label class="toggle-line">' +
      '<input type="checkbox" data-allow-stream' + (group.allowStream ? " checked" : "") + "> " +
      "<span>允许流式</span>" +
      "</label>" +
      '<label class="limit-line">' +
      "<span>最大输入 token</span>" +
      '<input class="field" type="number" min="0" step="100" data-max-input value="' + String(group.maxInputTokens || 0) + '">' +
      "</label>" +
      '<label class="limit-line">' +
      "<span>最大输出 token</span>" +
      '<input class="field" type="number" min="0" step="100" data-max-output value="' + String(group.maxOutputTokens || 0) + '">' +
      "</label>" +
      '<label class="limit-line">' +
      "<span>每分钟请求</span>" +
      '<input class="field" type="number" min="0" step="1" data-rpm-limit value="' + String(group.rpmLimit) + '">' +
      "</label>" +
      '<label class="limit-line">' +
      "<span>预算 USD</span>" +
      '<input class="field" type="number" min="0" step="1" data-budget-usd value="' + String(group.budgetUsd) + '">' +
      "</label>";
    return wrap;
  }

  function bindInputs() {
    document.addEventListener("input", function (ev) {
      if (ev.target.closest("[data-admin-groups]") || ev.target.matches("[data-user-map-input], [data-blocked-input], [data-blocked-key-hashes-input]")) {
        renderOutput();
      }
    });
    document.addEventListener("change", function (ev) {
      if (ev.target.closest("[data-admin-groups]")) renderOutput();
    });
    document.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-block-key-hash]");
      if (!btn) return;
      addBlockedKeyHash(btn.getAttribute("data-block-key-hash"));
    });
  }

  function renderOutput() {
    var groups = {};
    document.querySelectorAll("[data-admin-groups] [data-group]").forEach(function (card) {
      var groupName = card.dataset.group;
      groups[groupName] = {
        models: checkedValues(card, "model"),
        endpoints: checkedValues(card, "endpoint"),
        allowStream: !!card.querySelector("[data-allow-stream]")?.checked,
        rpmLimit: numberValue(card.querySelector("[data-rpm-limit]")?.value),
        maxInputTokens: numberValue(card.querySelector("[data-max-input]")?.value),
        maxOutputTokens: numberValue(card.querySelector("[data-max-output]")?.value),
        budgetUsd: numberValue(card.querySelector("[data-budget-usd]")?.value),
      };
    });

    var userMap = parseUserMap(document.querySelector("[data-user-map-input]")?.value || "");
    var blocked = parseBlocked(document.querySelector("[data-blocked-input]")?.value || "");
    var blockedKeyHashes = parseBlockedKeyHashes(document.querySelector("[data-blocked-key-hashes-input]")?.value || "");

    var groupsJson = JSON.stringify(groups, null, 2);
    var userMapJson = JSON.stringify(userMap, null, 2);

    setValue("[data-groups-json]", groupsJson);
    setValue("[data-user-map-json]", userMapJson);
    setValue("[data-blocked-output]", blocked.join(","));
    setValue("[data-blocked-key-hashes-output]", blockedKeyHashes.join(","));
    setValue("[data-vercel-commands]", buildVercelCommands(groupsJson, userMapJson, blocked, blockedKeyHashes));
  }

  function checkedValues(root, key) {
    return Array.prototype.slice.call(root.querySelectorAll("[data-" + key + "]:checked")).map(function (input) {
      return input.getAttribute("data-" + key);
    });
  }

  function numberValue(value) {
    var number = Number(value || 0);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function parseUserMap(text) {
    var output = {};
    text.split(/\r?\n/).forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed || trimmed.indexOf("=") === -1) return;
      var parts = trimmed.split("=");
      var id = parts.shift().trim();
      var group = parts.join("=").trim();
      if (/^\d{5,}$/.test(id) && group) output[id] = group;
    });
    return output;
  }

  function parseBlocked(text) {
    return text
      .split(/[,\s]+/)
      .map(function (item) { return item.trim(); })
      .filter(function (item, index, list) {
        return /^\d{5,}$/.test(item) && list.indexOf(item) === index;
      });
  }

  function parseBlockedKeyHashes(text) {
    return text
      .split(/[,\s]+/)
      .map(function (item) { return item.trim().replace(/^#/, ""); })
      .filter(function (item, index, list) {
        return /^[a-f0-9]{12,64}$/i.test(item) && list.indexOf(item) === index;
      });
  }

  function addBlockedKeyHash(hash) {
    var cleaned = String(hash || "").trim().replace(/^#/, "");
    if (!/^[a-f0-9]{12,64}$/i.test(cleaned)) return;
    var input = document.querySelector("[data-blocked-key-hashes-input]");
    if (!input) return;
    var values = parseBlockedKeyHashes(input.value);
    if (values.indexOf(cleaned) === -1) values.push(cleaned);
    input.value = values.join("\n");
    renderOutput();
    setLogStatus("已加入待封禁列表；复制下方 Vercel 命令并重新部署后才会真正封禁该 Key Hash。", false);
  }

  function buildVercelCommands(groupsJson, userMapJson, blocked, blockedKeyHashes) {
    var lines = [
      "npx vercel env rm GATEWAY_GROUPS_JSON production -y",
      "'" + oneLine(groupsJson) + "' | npx vercel env add GATEWAY_GROUPS_JSON production",
      "npx vercel env rm DISCORD_GROUP_USER_MAP_JSON production -y",
      "'" + oneLine(userMapJson) + "' | npx vercel env add DISCORD_GROUP_USER_MAP_JSON production",
      "npx vercel env rm DISCORD_BLOCKED_USER_IDS production -y",
      "'" + blocked.join(",") + "' | npx vercel env add DISCORD_BLOCKED_USER_IDS production",
      "npx vercel env rm GATEWAY_BLOCKED_KEY_HASHES production -y",
      "'" + blockedKeyHashes.join(",") + "' | npx vercel env add GATEWAY_BLOCKED_KEY_HASHES production",
      "npx vercel env rm MAX_REQUEST_COST_USD production -y",
      "'0' | npx vercel env add MAX_REQUEST_COST_USD production",
      "npx vercel --prod",
    ];
    return lines.join("\n");
  }

  function oneLine(json) {
    return JSON.stringify(JSON.parse(json));
  }

  function setValue(selector, value) {
    var el = document.querySelector(selector);
    if (el) el.value = value;
  }

  function claudeMarkHtml() {
    return '<span class="model-mark model-mark--claude" aria-hidden="true"><img src="/assets/claude-ai-symbol.svg" alt="" loading="lazy" decoding="async"></span>';
  }

  function geminiMarkHtml() {
    return '<span class="model-mark model-mark--gemini" aria-hidden="true"><img src="/assets/google-gemini-icon-2025.svg" alt="" loading="lazy" decoding="async"></span>';
  }

  function modelMarkHtml(model) {
    var id = String(model || "");
    if (id.indexOf("claude-") === 0 || id.indexOf("agy-claude-") === 0) return claudeMarkHtml();
    if (id.toLowerCase().indexOf("gemini") !== -1) return geminiMarkHtml();
    return "";
  }

  function bindLogControls() {
    var refreshBtn = document.querySelector("[data-refresh-logs]");
    var clearBtn = document.querySelector("[data-clear-logs]");
    var filterSelectors = [
      "[data-log-query]",
      "[data-log-status-filter]",
      "[data-log-group-filter]",
      "[data-log-model-filter]",
      "[data-log-agent-filter]",
      "[data-log-endpoint-filter]",
    ];
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        loadLogs();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        clearLogs();
      });
    }
    filterSelectors.forEach(function (selector) {
      var el = document.querySelector(selector);
      if (!el) return;
      var eventName = el.matches("input") ? "input" : "change";
      el.addEventListener(eventName, function () {
        syncLogFiltersFromControls();
        logState.selectedIndex = -1;
        applyLogFilters();
      });
    });
    var logRows = document.querySelector("[data-log-rows]");
    if (logRows) {
      logRows.addEventListener("click", function (event) {
        var row = event.target.closest("[data-log-index]");
        if (!row) return;
        logState.selectedIndex = Number(row.dataset.logIndex || -1);
        renderLogList();
        renderLogDetail(logState.filteredLogs[logState.selectedIndex] || null);
      });
    }
    var facets = document.querySelector("[data-log-facets]");
    if (facets) {
      facets.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-log-facet]");
        if (!btn) return;
        var key = btn.dataset.logFacet;
        var value = btn.dataset.logFacetValue || "";
        if (!key || !(key in logState.filters)) return;
        logState.filters[key] = logState.filters[key] === value ? "" : value;
        logState.selectedIndex = -1;
        syncLogControlsFromFilters();
        applyLogFilters();
      });
    }
  }

  function bindRegistrationControls() {
    var refreshBtn = document.querySelector("[data-refresh-registrations]");
    var registrationRows = document.querySelector("[data-registration-rows]");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        loadRegistrations();
      });
    }
    if (registrationRows) {
      registrationRows.addEventListener("click", function (event) {
        var rowBtn = event.target.closest("[data-select-registration]");
        if (rowBtn) {
          event.preventDefault();
          selectRegistration(rowBtn.dataset.selectRegistration);
          return;
        }
        var removeBtn = event.target.closest("[data-remove-registration]");
        if (removeBtn) {
          event.preventDefault();
          removeRegistration(removeBtn.dataset.removeRegistration, removeBtn.dataset.registrationName || "");
          return;
        }
        var saveBtn = event.target.closest("[data-save-registration-group]");
        if (saveBtn) {
          event.preventDefault();
          var card = saveBtn.closest("[data-registration-card]");
          var select = card ? card.querySelector("[data-registration-group-select]") : null;
          updateRegistrationGroup(saveBtn.dataset.saveRegistrationGroup, select ? select.value : "");
          return;
        }
        var limitsBtn = event.target.closest("[data-save-registration-limits]");
        if (limitsBtn) {
          event.preventDefault();
          updateRegistrationLimits(limitsBtn.dataset.saveRegistrationLimits, limitsFromCard(limitsBtn.closest("[data-registration-card]")));
          return;
        }
        var resetBtn = event.target.closest("[data-reset-registration-usage]");
        if (resetBtn) {
          event.preventDefault();
          resetRegistrationUsage(resetBtn.dataset.resetRegistrationUsage, resetBtn.dataset.registrationName || "");
          return;
        }
        var logsBtn = event.target.closest("[data-view-registration-logs]");
        if (logsBtn) {
          event.preventDefault();
          viewRegistrationLogs(logsBtn.dataset.viewRegistrationLogs, logsBtn.dataset.registrationName || "");
        }
      });

      registrationRows.addEventListener("change", function (event) {
        var groupFilter = event.target.closest("[data-registration-group-filter]");
        if (groupFilter) {
          registrationState.group = groupFilter.value;
          renderRegistrationBoard();
          return;
        }
        var select = event.target.closest("[data-registration-group-select]");
        if (select) {
          var card = select.closest("[data-registration-card]");
          var saveBtn = card ? card.querySelector("[data-save-registration-group]") : null;
          if (saveBtn) saveBtn.disabled = select.value === select.dataset.originalGroup;
          return;
        }
        var limitInput = event.target.closest("[data-registration-limit]");
        if (limitInput) markLimitsChanged(limitInput.closest("[data-registration-card]"));
      });

      registrationRows.addEventListener("input", function (event) {
        var queryInput = event.target.closest("[data-registration-query]");
        if (queryInput) {
          registrationState.query = queryInput.value || "";
          renderRegistrationBoard();
          var replacement = document.querySelector("[data-registration-query]");
          if (replacement) {
            replacement.focus();
            try {
              replacement.setSelectionRange(replacement.value.length, replacement.value.length);
            } catch {}
          }
          return;
        }
        var limitInput = event.target.closest("[data-registration-limit]");
        if (limitInput) markLimitsChanged(limitInput.closest("[data-registration-card]"));
      });
    }
  }

  async function loadRegistrations() {
    var token = getAdminToken();
    setRegistrationStatus("正在读取注册用户...", false);

    try {
      var response = await fetch("/admin/registrations", {
        headers: adminHeaders(token),
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(payload?.error?.message || "读取注册用户失败");
      }
      renderRegistrations(payload.users || [], payload);
      refreshTableScrollers();
      setRegistrationStatus(
        "已读取 " + String(payload.count || 0) + " / " + String(payload.limit || 0) + " 个注册用户，存储：" + String(payload.storage || "unknown") + "。",
        false
      );
    } catch (error) {
      renderRegistrations([], null);
      refreshTableScrollers();
      setRegistrationStatus(error.message || "读取注册用户失败。", true);
    }
  }

  function renderRegistrations(users, meta) {
    registrationState.users = Array.isArray(users) ? users : [];
    registrationState.meta = meta || null;
    if (!registrationState.selectedUserId || !findRegistrationUser(registrationState.selectedUserId)) {
      registrationState.selectedUserId = registrationState.users[0]?.id || "";
    }
    renderRegistrationSummary(registrationState.users, meta);
    renderRegistrationBoard();
  }

  function renderRegistrationBoard() {
    var board = document.querySelector("[data-registration-rows]");
    if (!board) return;
    if (!registrationState.users.length) {
      board.innerHTML = '<div class="registration-empty muted">暂无注册用户。</div>';
      refreshTableScrollers();
      return;
    }
    var filteredUsers = filteredRegistrationUsers();
    if (filteredUsers.length && !filteredUsers.some(function (user) { return String(user.id || "") === String(registrationState.selectedUserId || ""); })) {
      registrationState.selectedUserId = filteredUsers[0].id || "";
    }

    board.innerHTML =
      '<div class="registration-workbench">' +
        '<div class="registration-workbench__main">' +
          '<div class="registration-toolbar">' +
            '<label><span class="field-label">搜索用户</span><input class="field" type="search" autocomplete="off" spellcheck="false" placeholder="昵称 / Discord ID / 用户名" data-registration-query value="' + escapeAttr(registrationState.query) + '"></label>' +
            '<label><span class="field-label">分组</span><select class="field" data-registration-group-filter>' + registrationGroupFilterOptions() + '</select></label>' +
          '</div>' +
          '<div class="registration-list" data-registration-list>' + registrationListHtml(filteredUsers) + '</div>' +
        '</div>' +
        '<aside class="registration-detail" data-registration-detail>' + registrationDetailHtml(selectedRegistrationUser()) + '</aside>' +
      '</div>';
    refreshTableScrollers();
  }

  function selectRegistration(userId) {
    var id = String(userId || "").trim();
    if (!id) return;
    registrationState.selectedUserId = id;
    renderRegistrationBoard();
  }

  function filteredRegistrationUsers() {
    var query = registrationState.query.toLowerCase();
    var group = registrationState.group;
    return registrationState.users.filter(function (user) {
      if (group && String(user.groupName || "guest") !== group) return false;
      if (!query) return true;
      return registrationSearchText(user).toLowerCase().indexOf(query) !== -1;
    });
  }

  function selectedRegistrationUser() {
    var filtered = filteredRegistrationUsers();
    return filtered.find(function (user) { return String(user.id || "") === String(registrationState.selectedUserId || ""); }) || filtered[0] || registrationState.users[0] || null;
  }

  function findRegistrationUser(userId) {
    var id = String(userId || "").trim();
    return registrationState.users.find(function (user) { return String(user.id || "") === id; }) || null;
  }

  function registrationSearchText(user) {
    return [
      user.id,
      user.displayName,
      user.globalName,
      user.username,
      user.groupName,
      user.effective?.lastModel,
      (user.effective?.agents || []).join(" "),
    ].filter(Boolean).join(" ");
  }

  function registrationGroupFilterOptions() {
    var counts = {};
    registrationState.users.forEach(function (user) {
      var group = String(user.groupName || "guest");
      counts[group] = (counts[group] || 0) + 1;
    });
    var options = ['<option value="">全部分组</option>'];
    Object.keys(counts).sort().forEach(function (group) {
      options.push('<option value="' + escapeAttr(group) + '"' + (registrationState.group === group ? " selected" : "") + '>' + escapeHtml(group + " · " + counts[group]) + '</option>');
    });
    return options.join("");
  }

  function registrationListHtml(users) {
    if (!users.length) return '<div class="registration-empty muted">没有匹配的用户。</div>';
    return users.map(function (user) {
      var name = registrationName(user);
      var usage = user.effective || {};
      var status = registrationStatusTone(usage);
      var fresh = registrationFreshInfo(user);
      var budget = Number(usage.budgetUsd || 0);
      var spent = Number(usage.spentUsd || 0);
      var percent = budget > 0 ? Math.min(100, Math.max(0, (spent / budget) * 100)) : 0;
      var selected = String(user.id || "") === String(registrationState.selectedUserId || "");
      return '<button type="button" class="registration-row' + (selected ? " is-selected" : "") + '" data-select-registration="' + escapeAttr(user.id || "") + '">' +
        '<span class="registration-row__avatar">' + registrationAvatarInner(user, name) + '</span>' +
        '<span class="registration-row__body">' +
          '<span class="registration-row__top"><strong title="' + escapeAttr(name) + '">' + escapeHtml(name) + '</strong>' + (fresh.isNew ? '<b title="' + escapeAttr(fresh.title) + '">NEW</b>' : '') + '</span>' +
          '<span class="registration-row__meta"><code>' + escapeHtml(user.id || "-") + '</code></span>' +
          '<span class="registration-row__chips"><i>' + escapeHtml(user.groupName || "guest") + '</i><i class="is-' + escapeAttr(status.tone) + '">' + escapeHtml(status.label) + '</i></span>' +
          '<span class="quota-bar" aria-hidden="true"><span style="width:' + escapeAttr(String(percent.toFixed(1))) + '%"></span></span>' +
        '</span>' +
        '<span class="registration-row__money"><strong>$' + escapeHtml(formatMoney(spent)) + '</strong><small>剩余 ' + escapeHtml(formatMoney(usage.remainingUsd || 0)) + '</small></span>' +
      '</button>';
    }).join("");
  }

  function registrationDetailHtml(user) {
    if (!user) {
      return '<div class="registration-detail__empty"><strong>选择用户</strong><span>这里会显示分组、额度、token 限制和管理动作。</span></div>';
    }
    var name = registrationName(user);
    var usage = user.effective || {};
    var status = registrationStatusTone(usage);
    var fresh = registrationFreshInfo(user);
    var remaining = usage.remainingUsd === null || usage.remainingUsd === undefined ? "Unlimited" : "$" + formatMoney(usage.remainingUsd);
    return '<article class="registration-card" data-registration-card data-registration-user-id="' + escapeAttr(user.id || "") + '">' +
      '<div class="registration-detail__head">' +
        registrationUserCell(user, name) +
        '<div class="registration-card__badges">' +
          (fresh.isNew ? '<span class="registration-badge registration-badge--new" title="' + escapeAttr(fresh.title) + '">NEW · 新注册</span>' : '') +
          '<span class="registration-badge registration-badge--group">' + escapeHtml(user.groupName || "guest") + '</span>' +
          '<span class="registration-badge registration-badge--' + escapeAttr(status.tone) + '">' + escapeHtml(status.label) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="registration-detail__stats">' +
        detailMetric("已用", "$" + formatMoney(usage.spentUsd || 0), "money") +
        detailMetric("剩余", remaining, "money") +
        detailMetric("请求", formatNumber(usage.requestCount || 0), "") +
        detailMetric("错误", formatNumber(usage.errorCount || 0), usage.errorCount ? "bad" : "") +
      '</div>' +
      registrationUsageCell(user) +
      '<div class="registration-detail__grid">' +
        registrationPanel("分组", registrationGroupControl(user)) +
        registrationPanel("成员级限制", registrationLimitsControl(user)) +
        registrationPanel("调用概况", registrationCallSummary(user)) +
        registrationPanel("最近调用", registrationRecentCall(user)) +
        registrationPanel("Key", registrationKeyCell(user)) +
      '</div>' +
      '<div class="registration-card__actions">' + registrationActions(user, name) + '</div>' +
    '</article>';
  }

  function registrationPanel(title, body) {
    return '<section class="registration-panel">' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      body +
    '</section>';
  }

  function registrationFreshInfo(user) {
    var createdAt = String(user.createdAt || "").trim();
    var createdTime = Date.parse(createdAt);
    if (!Number.isFinite(createdTime)) return { isNew: false, title: "" };

    var ageMs = Date.now() - createdTime;
    var isNew = ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;
    return {
      isNew: isNew,
      title: "注册时间 " + formatTime(createdAt),
    };
  }

  function registrationStatusTone(usage) {
    var budget = Number(usage.budgetUsd || 0);
    var remaining = usage.remainingUsd === null || usage.remainingUsd === undefined ? null : Number(usage.remainingUsd || 0);
    if (budget > 0 && remaining !== null && remaining <= 0) return { tone: "bad", label: "额度用尽" };
    if (Number(usage.errorCount || 0) > 0) return { tone: "warn", label: "有错误" };
    if (Number(usage.requestCount || 0) > 0) return { tone: "ok", label: "有调用" };
    return { tone: "idle", label: "未调用" };
  }

  function limitsFromCard(card) {
    var output = {};
    if (!card) return output;
    card.querySelectorAll("[data-registration-limit]").forEach(function (input) {
      output[input.dataset.registrationLimit] = String(input.value || "").trim();
    });
    return output;
  }

  function markLimitsChanged(card) {
    if (!card) return;
    var changed = false;
    card.querySelectorAll("[data-registration-limit]").forEach(function (input) {
      if (String(input.value || "").trim() !== String(input.dataset.originalValue || "").trim()) changed = true;
    });
    var saveBtn = card.querySelector("[data-save-registration-limits]");
    if (saveBtn) saveBtn.disabled = !changed;
  }

  async function postRegistrationAction(body) {
    var token = getAdminToken();
    var response = await fetch("/admin/registrations", {
      method: "POST",
      headers: {
        ...adminHeaders(token),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Registration action failed");
    }
    renderRegistrations(payload.users || [], payload);
    return payload;
  }

  function registrationUserCell(user, name) {
    var avatar = user.avatarUrl
      ? '<img src="' + escapeAttr(user.avatarUrl) + '" alt="" loading="lazy" decoding="async">'
      : '<span>' + escapeHtml(initialForName(name)) + '</span>';
    var subtitle = [user.globalName || "", user.username ? "@" + user.username : ""].filter(Boolean).join(" / ");
    return '<div class="registration-user">' +
      '<div class="registration-avatar">' + avatar + '</div>' +
      '<div><strong title="' + escapeAttr(name) + '">' + escapeHtml(name) + '</strong><span title="' + escapeAttr(subtitle) + '">' + escapeHtml(subtitle || "-") + '</span><code title="' + escapeAttr(user.id || "-") + '">' + escapeHtml(user.id || "-") + '</code></div>' +
      '</div>';
  }

  function registrationGroupControl(user) {
    var current = String(user.groupName || "guest").trim() || "guest";
    var known = GROUPS.some(function (group) { return group.name === current; });
    var options = GROUPS.map(function (group) {
      return '<option value="' + escapeAttr(group.name) + '"' + (group.name === current ? " selected" : "") + '>' +
        escapeHtml(group.label + " (" + group.name + ")") +
        '</option>';
    }).join("");
    if (!known) {
      options = '<option value="' + escapeAttr(current) + '" selected>' + escapeHtml(current) + '</option>' + options;
    }
    return '<div class="registration-group-control">' +
      '<select data-registration-group-select data-original-group="' + escapeAttr(current) + '">' + options + '</select>' +
      '<button type="button" class="copy-btn btn--sm" data-save-registration-group="' + escapeAttr(user.id || "") + '" disabled><span class="copy-label">保存</span></button>' +
      '</div>';
  }

  function registrationLimitsControl(user) {
    var defaultText = "留空继承分组，0 表示不限";
    var modeText = user.manualLimits ? "已自定义" : "继承分组";
    var modeClass = user.manualLimits ? " registration-limit-mode--custom" : "";
    return '<div class="registration-limit-card" data-registration-limits-card>' +
      '<div class="registration-limit-top"><span class="registration-limit-mode' + modeClass + '">' + escapeHtml(modeText) + '</span></div>' +
      '<div class="registration-limit-grid">' +
        registrationLimitField("额度 USD", "budgetUsd", user.budgetUsd) +
        registrationLimitField("输入 token", "maxInputTokens", user.maxInputTokens) +
        registrationLimitField("输出 token", "maxOutputTokens", user.maxOutputTokens) +
      '</div>' +
      '<div class="registration-limit-footer">' +
        '<span class="registration-limit-hint">' + escapeHtml(defaultText) + '</span>' +
        '<button type="button" class="copy-btn btn--sm" data-save-registration-limits="' + escapeAttr(user.id || "") + '" disabled><span class="copy-label">保存限制</span></button>' +
      '</div>' +
    '</div>';
  }

  function registrationLimitField(label, name, value) {
    var textValue = value === null || value === undefined ? "" : String(value);
    return '<label class="registration-limit-field">' +
      '<span>' + escapeHtml(label) + '</span>' +
      '<input class="field" type="number" min="0" step="' + (name === "budgetUsd" ? "0.01" : "1") + '" ' +
        'data-registration-limit="' + escapeAttr(name) + '" data-original-value="' + escapeAttr(textValue) + '" value="' + escapeAttr(textValue) + '">' +
    '</label>';
  }

  function registrationActions(user, name) {
    return '<div class="registration-actions">' +
      '<button type="button" class="copy-btn btn--sm" data-view-registration-logs="' + escapeAttr(user.id || "") + '" data-registration-name="' + escapeAttr(name || user.id || "") + '"><span class="copy-label">看日志</span></button>' +
      '<button type="button" class="copy-btn btn--sm" data-reset-registration-usage="' + escapeAttr(user.id || "") + '" data-registration-name="' + escapeAttr(name || user.id || "") + '"><span class="copy-label">重置额度</span></button>' +
      '<button type="button" class="copy-btn copy-btn--danger btn--sm" data-remove-registration="' + escapeAttr(user.id || "") + '" data-registration-name="' + escapeAttr(name || user.id || "") + '"><span class="copy-label">踢出</span></button>' +
      '</div>';
  }

  async function removeRegistration(userId, name) {
    var id = String(userId || "").trim();
    if (!id) return;
    var label = name ? name + " (" + id + ")" : id;
    if (!confirm("确定踢出 " + label + " 吗？这会删除他的注册记录和当前 key 额度记录，并释放一个注册名额。")) return;
    try {
      var payload = await postRegistrationAction({ action: "remove_user", userId: id });
      setRegistrationStatus("已踢出 " + label + "。当前注册 " + String(payload.count || 0) + " / " + String(payload.limit || 0) + "。", false);
    } catch (error) {
      setRegistrationStatus(error.message || "踢出用户失败。", true);
    }
  }

  async function updateRegistrationGroup(userId, groupName) {
    var id = String(userId || "").trim();
    var group = String(groupName || "").trim();
    if (!id || !group) return;
    try {
      var payload = await postRegistrationAction({ action: "update_group", userId: id, groupName: group });
      setRegistrationStatus("已把 " + id + " 的分组改为 " + group + "。当前注册 " + String(payload.count || 0) + " / " + String(payload.limit || 0) + "。", false);
    } catch (error) {
      setRegistrationStatus(error.message || "修改分组失败。", true);
    }
  }

  async function updateRegistrationLimits(userId, limits) {
    var id = String(userId || "").trim();
    if (!id) return;
    try {
      var payload = await postRegistrationAction({
        action: "update_limits",
        userId: id,
        budgetUsd: limits.budgetUsd,
        maxInputTokens: limits.maxInputTokens,
        maxOutputTokens: limits.maxOutputTokens,
      });
      setRegistrationStatus("已更新 " + id + " 的成员级限制。当前注册 " + String(payload.count || 0) + " / " + String(payload.limit || 0) + "。", false);
    } catch (error) {
      setRegistrationStatus(error.message || "修改成员级限制失败。", true);
    }
  }

  async function resetRegistrationUsage(userId, name) {
    var id = String(userId || "").trim();
    if (!id) return;
    var label = name ? name + " (" + id + ")" : id;
    if (!confirm("确定把 " + label + " 的已用额度重置为 0 吗？调用日志会保留。")) return;
    try {
      var payload = await postRegistrationAction({ action: "reset_usage", userId: id });
      setRegistrationStatus("已重置 " + label + " 的已用额度。当前注册 " + String(payload.count || 0) + " / " + String(payload.limit || 0) + "。", false);
    } catch (error) {
      setRegistrationStatus(error.message || "重置额度失败。", true);
    }
  }

  function viewRegistrationLogs(userId, name) {
    var id = String(userId || "").trim();
    if (!id) return;
    var limitInput = document.querySelector("[data-log-limit]");
    if (limitInput) limitInput.value = Math.max(Number(limitInput.value || 0), 500);
    var queryInput = document.querySelector("[data-log-query]");
    if (queryInput) queryInput.value = id;
    logState.filters.query = id;
    loadLogs().then(function () {
      var logsSection = document.querySelector("#logs");
      if (logsSection) logsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      setLogStatus("已刷新并过滤 " + id + (name ? "（" + name + "）" : "") + " 的调用日志。", false);
    });
  }

  function registrationUsageCell(user) {
    var usage = user.effective || {};
    var budget = Number(usage.budgetUsd || 0);
    var spent = Number(usage.spentUsd || 0);
    var remaining = usage.remainingUsd === null || usage.remainingUsd === undefined ? null : Number(usage.remainingUsd || 0);
    var percent = budget > 0 ? Math.min(100, Math.max(0, (spent / budget) * 100)) : 0;
    return '<div class="registration-usage">' +
      '<div class="registration-usage-top"><strong>$' + escapeHtml(formatMoney(spent)) + '</strong><span> / ' + escapeHtml(budget > 0 ? "$" + formatMoney(budget) : "Unlimited") + '</span></div>' +
      '<div class="quota-bar" aria-hidden="true"><span style="width:' + escapeAttr(String(percent.toFixed(1))) + '%"></span></div>' +
      '<div class="registration-stack">' +
        '<span>剩余 ' + escapeHtml(remaining === null ? "Unlimited" : "$" + formatMoney(remaining)) + '</span>' +
        '<span>本页日志 $' + escapeHtml(formatMoney(usage.pageCostUsd || 0)) + '</span>' +
      '</div>' +
    '</div>';
  }

  function registrationCallSummary(user) {
    var usage = user.effective || {};
    return '<div class="registration-stack">' +
      '<span>请求 ' + escapeHtml(formatNumber(usage.requestCount || 0)) + ' / 成功 ' + escapeHtml(formatNumber(usage.successCount || 0)) + ' / 错误 ' + escapeHtml(formatNumber(usage.errorCount || 0)) + '</span>' +
      '<span>Token in ' + escapeHtml(formatNumber(usage.inputTokens || 0)) + ' / out ' + escapeHtml(formatNumber(usage.outputTokens || 0)) + '</span>' +
      '<span>RPM ' + escapeHtml(String(usage.rpmLimit || "-")) + ' / Agent ' + escapeHtml((usage.agents || []).join(", ") || "-") + '</span>' +
    '</div>';
  }

  function registrationRecentCall(user) {
    var usage = user.effective || {};
    var models = Array.isArray(usage.models) ? usage.models : [];
    var modelText = usage.lastModel || (models[0] ? models[0].name : "");
    return '<div class="registration-stack">' +
      '<strong>' + escapeHtml(formatTime(usage.lastCallAt)) + '</strong>' +
      '<span>模型 ' + escapeHtml(modelText || "-") + '</span>' +
      '<span>接口 ' + escapeHtml(usage.lastEndpoint || "-") + ' / 状态 ' + escapeHtml(usage.lastStatusCode ? String(usage.lastStatusCode) : "-") + '</span>' +
    '</div>';
  }

  function registrationKeyCell(user) {
    return '<div class="registration-stack">' +
      '<span>签发 ' + escapeHtml(formatTime(user.keyIssuedAt)) + '</span>' +
      '<span>过期 ' + escapeHtml(user.keyExpiresAt ? formatTime(user.keyExpiresAt) : "不限") + '</span>' +
    '</div>';
  }

  function renderRegistrationSummary(users, meta) {
    var root = document.querySelector("[data-registration-summary]");
    if (!root) return;
    var groups = {};
    var newCount = 0;
    users.forEach(function (user) {
      var group = user.groupName || "-";
      groups[group] = (groups[group] || 0) + 1;
      if (registrationFreshInfo(user).isNew) newCount += 1;
    });
    var groupText = Object.keys(groups).sort().map(function (group) {
      return group + " " + groups[group];
    }).join(" / ");
    root.innerHTML = [
      summaryPill("已注册", String(meta?.count || users.length)),
      summaryPill("上限", String(meta?.limit || 0)),
      summaryPill("存储", String(meta?.storage || "unknown")),
      newCount ? summaryPill("NEW", String(newCount), "ok") : "",
      summaryPill("Legacy", meta?.legacyKeysAllowed ? "on" : "off", meta?.legacyKeysAllowed ? "warn" : "ok"),
      groupText ? summaryPill("分组", groupText) : "",
    ].filter(Boolean).join("");
  }

  function setRegistrationStatus(message, isError) {
    var el = document.querySelector("[data-registration-status]");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-error", !!isError);
  }

  function initialForName(name) {
    var text = String(name || "").trim();
    return text ? text.slice(0, 1).toUpperCase() : "?";
  }

  function registrationName(user) {
    return user.displayName || user.globalName || user.username || user.id || "-";
  }

  function registrationAvatarInner(user, name) {
    if (user.avatarUrl) {
      return '<img src="' + escapeAttr(user.avatarUrl) + '" alt="" loading="lazy" decoding="async">';
    }
    return '<span>' + escapeHtml(initialForName(name)) + '</span>';
  }

  async function loadLogs() {
    var token = getAdminToken();
    var limit = Number(document.querySelector("[data-log-limit]")?.value || 100);
    setLogStatus("正在读取日志...", false);

    try {
      var response = await fetch("/api/admin/logs?limit=" + encodeURIComponent(String(limit)), {
        headers: adminHeaders(token),
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(payload?.error?.message || "读取日志失败");
      }
      logState.logs = payload.data || [];
      renderLogs(logState.logs);
      renderKeyList(payload.data || []);
      setLogStatus(
        "已读取 " + String((payload.data || []).length) + " 条日志，存储：" + String(payload.storage || "unknown") + "。",
        false
      );
    } catch (error) {
      logState.logs = [];
      renderLogs([]);
      renderKeyList([]);
      setLogStatus(error.message || "读取日志失败。", true);
    }
  }

  async function clearLogs() {
    var token = getAdminToken();
    setLogStatus("正在清空日志...", false);
    try {
      var response = await fetch("/api/admin/logs", {
        method: "POST",
        headers: {
          ...adminHeaders(token),
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "clear" }),
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(payload?.error?.message || "清空日志失败");
      }
      logState.logs = [];
      renderLogs([]);
      renderKeyList([]);
      setLogStatus("日志已清空，存储：" + String(payload.storage || "unknown") + "。", false);
    } catch (error) {
      setLogStatus(error.message || "清空日志失败。", true);
    }
  }

  function renderKeyList(logs) {
    var root = document.querySelector("[data-key-list]");
    if (!root) return;
    var summaries = summarizeKeys(logs);
    if (!summaries.length) {
      root.innerHTML = '<div class="muted">暂无 Key 记录。</div>';
      return;
    }

    root.innerHTML = summaries.map(function (item) {
      var flags = keyFlags(item);
      var classes = "key-card" + (flags.length ? " key-card--warn" : "");
      var actor = item.discordUser
        ? [item.discordUser.globalName || item.discordUser.username, item.discordUser.id].filter(Boolean).join(" / ")
        : (item.keyName || "-");
      return '<div class="' + classes + '">' +
        '<div class="key-card-head">' +
        '<div><code>' + escapeHtml(item.key || "-") + '</code><div class="log-subtle">#' + escapeHtml(item.keyHash || "-") + '</div></div>' +
        '<button type="button" class="copy-btn btn--sm" data-block-key-hash="' + escapeAttr(item.keyHash || "") + '"><span class="copy-label">加入待封禁</span></button>' +
        '</div>' +
        '<div class="key-metrics">' +
        '<span>请求 ' + String(item.count) + '</span>' +
        '<span>错误 ' + String(item.errors) + '</span>' +
        '<span>消费 $' + formatMoney(item.spentUsd || 0) + '</span>' +
        '<span>剩余 $' + formatMoney(item.remainingUsd || 0) + '</span>' +
        '</div>' +
        '<div class="log-subtle">分组 ' + escapeHtml(item.group || "-") + ' · Agent ' + escapeHtml(item.agent || "Unknown") + ' · ' + escapeHtml(actor) + '</div>' +
        '<div class="key-flags">' + (flags.length ? flags.map(function (flag) { return '<span>' + escapeHtml(flag) + '</span>'; }).join("") : '<span>正常</span>') + '</div>' +
        '</div>';
    }).join("");
  }

  function summarizeKeys(logs) {
    var map = {};
    logs.forEach(function (log) {
      if (!log.keyHash) return;
      if (!map[log.keyHash]) {
        map[log.keyHash] = {
          keyHash: log.keyHash,
          key: log.key,
          keyName: log.keyName,
          discordUser: log.discordUser,
          group: log.group,
          agent: log.agent,
          count: 0,
          errors: 0,
          rateLimited: 0,
          quotaExceeded: 0,
          denied: 0,
          spentUsd: 0,
          remainingUsd: 0,
          lastTime: log.time || "",
        };
      }
      var item = map[log.keyHash];
      item.count += 1;
      item.errors += Number(log.statusCode || 0) >= 400 ? 1 : 0;
      item.rateLimited += log.errorCode === "rate_limit_exceeded" ? 1 : 0;
      item.quotaExceeded += log.errorCode === "quota_exceeded" ? 1 : 0;
      item.denied += log.errorCode === "access_denied" || log.errorCode === "model_not_allowed" ? 1 : 0;
      item.spentUsd = Math.max(Number(item.spentUsd || 0), Number(log.spentUsd || 0));
      item.remainingUsd = Number(log.remainingUsd || item.remainingUsd || 0);
      item.group = log.group || item.group;
      item.agent = log.agent || item.agent;
      item.key = log.key || item.key;
      item.keyName = log.keyName || item.keyName;
      item.discordUser = log.discordUser || item.discordUser;
      item.lastTime = log.time || item.lastTime;
    });
    return Object.keys(map).map(function (key) { return map[key]; })
      .sort(function (a, b) { return String(b.lastTime).localeCompare(String(a.lastTime)); });
  }

  function keyFlags(item) {
    var flags = [];
    if (item.rateLimited > 0) flags.push("触发限流");
    if (item.quotaExceeded > 0) flags.push("额度用尽");
    if (item.denied > 0) flags.push("被拒请求");
    if (item.errors >= 3) flags.push("错误较多");
    return flags;
  }

  function renderLogs(logs) {
    logState.logs = Array.isArray(logs) ? logs : [];
    logState.selectedIndex = -1;
    renderLogSummary(logs);
    renderUsageRanking(logs);
    renderLogFilterOptions(logState.logs);
    syncLogFiltersFromControls();
    applyLogFilters();
  }

  function formatModelDisplay(log) {
    if (log.model) {
      return { text: log.model, title: log.model, reason: "", isMissing: false };
    }
    if (log.endpoint === "models") {
      return { text: "模型列表", title: "GET /v1/models 不指定单个模型", reason: "models 接口不指定模型", isMissing: true };
    }
    if (Number(log.statusCode || 0) === 401) {
      return { text: "未鉴权", title: "请求在 API Key 鉴权阶段被拒绝，尚未进入模型调用", reason: "Key 无效，未进入模型阶段", isMissing: true };
    }
    if (Number(log.statusCode || 0) >= 400) {
      return { text: "未记录", title: "失败请求没有可记录的 model 字段", reason: "失败请求未带 model", isMissing: true };
    }
    return { text: "未指定", title: "请求体没有 model 字段", reason: "请求体没有 model", isMissing: true };
  }

  function syncLogFiltersFromControls() {
    logState.filters.query = String(document.querySelector("[data-log-query]")?.value || "").trim();
    logState.filters.status = String(document.querySelector("[data-log-status-filter]")?.value || "");
    logState.filters.group = String(document.querySelector("[data-log-group-filter]")?.value || "");
    logState.filters.model = String(document.querySelector("[data-log-model-filter]")?.value || "");
    logState.filters.agent = String(document.querySelector("[data-log-agent-filter]")?.value || "");
    logState.filters.endpoint = String(document.querySelector("[data-log-endpoint-filter]")?.value || "");
  }

  function syncLogControlsFromFilters() {
    setControlValue("[data-log-query]", logState.filters.query);
    setControlValue("[data-log-status-filter]", logState.filters.status);
    setControlValue("[data-log-group-filter]", logState.filters.group);
    setControlValue("[data-log-model-filter]", logState.filters.model);
    setControlValue("[data-log-agent-filter]", logState.filters.agent);
    setControlValue("[data-log-endpoint-filter]", logState.filters.endpoint);
  }

  function setControlValue(selector, value) {
    var el = document.querySelector(selector);
    if (el) el.value = value || "";
  }

  function applyLogFilters() {
    var filters = logState.filters;
    var query = filters.query.toLowerCase();
    logState.filteredLogs = logState.logs.filter(function (log) {
      if (filters.status && !logMatchesStatus(log, filters.status)) return false;
      if (filters.group && String(log.group || "-") !== filters.group) return false;
      if (filters.model && modelBucketName(log) !== filters.model) return false;
      if (filters.agent && String(log.agent || "Unknown") !== filters.agent) return false;
      if (filters.endpoint && String(log.endpoint || "-") !== filters.endpoint) return false;
      if (!query) return true;
      return logSearchText(log).toLowerCase().indexOf(query) !== -1;
    });

    if (logState.selectedIndex >= logState.filteredLogs.length) logState.selectedIndex = -1;
    renderLogFacets();
    renderLogList();
    renderLogDetail(logState.selectedIndex >= 0 ? logState.filteredLogs[logState.selectedIndex] : logState.filteredLogs[0] || null);
  }

  function logMatchesStatus(log, status) {
    var statusCode = Number(log.statusCode || 0);
    if (status === "success") return statusCode >= 200 && statusCode < 400;
    if (status === "error") return statusCode >= 400;
    if (status === "upstream") return !!log.upstreamStatus || log.errorCode === "upstream_request_failed";
    if (status === "rate_limit") return log.errorCode === "rate_limit_exceeded" || statusCode === 429;
    if (status === "quota") return log.errorCode === "quota_exceeded";
    return true;
  }

  function logSearchText(log) {
    var actor = formatLogActor(log);
    return [
      log.time,
      log.group,
      log.agent,
      log.userAgent,
      log.model,
      modelBucketName(log),
      log.key,
      log.keyHash,
      log.endpoint,
      log.statusCode,
      log.errorCode,
      log.upstreamStatus,
      log.upstreamErrorCode,
      log.upstreamErrorMessage,
      log.ip,
      actor.full,
    ].filter(Boolean).join(" ");
  }

  function renderLogFilterOptions(logs) {
    setSelectOptions("[data-log-group-filter]", "全部分组", countLogValues(logs, function (log) { return log.group || "-"; }), logState.filters.group);
    setSelectOptions("[data-log-model-filter]", "全部模型", countLogValues(logs, modelBucketName), logState.filters.model);
    setSelectOptions("[data-log-agent-filter]", "全部 Agent", countLogValues(logs, function (log) { return log.agent || "Unknown"; }), logState.filters.agent);
    setSelectOptions("[data-log-endpoint-filter]", "全部接口", countLogValues(logs, function (log) { return log.endpoint || "-"; }), logState.filters.endpoint);
  }

  function setSelectOptions(selector, emptyLabel, counts, currentValue) {
    var select = document.querySelector(selector);
    if (!select) return;
    var entries = Object.keys(counts || {}).sort(function (a, b) {
      return (counts[b] - counts[a]) || a.localeCompare(b);
    });
    select.innerHTML = '<option value="">' + escapeHtml(emptyLabel) + '</option>' + entries.map(function (value) {
      return '<option value="' + escapeAttr(value) + '"' + (value === currentValue ? " selected" : "") + '>' + escapeHtml(value + " · " + counts[value]) + '</option>';
    }).join("");
  }

  function countLogValues(logs, getter) {
    var counts = {};
    logs.forEach(function (log) {
      var value = String(getter(log) || "-");
      counts[value] = (counts[value] || 0) + 1;
    });
    return counts;
  }

  function renderLogFacets() {
    var root = document.querySelector("[data-log-facets]");
    if (!root) return;
    if (!logState.logs.length) {
      root.innerHTML = '<div class="log-empty">读取日志后会显示筛选项。</div>';
      return;
    }
    root.innerHTML = [
      logFacetSection("状态", logFacetCounts([
        ["success", "成功"],
        ["error", "错误"],
        ["upstream", "上游"],
        ["rate_limit", "限流"],
        ["quota", "额度"],
      ], function (key) {
        return logState.logs.filter(function (log) { return logMatchesStatus(log, key); }).length;
      }), "status"),
      logFacetSection("分组", topFacetEntries(countLogValues(logState.logs, function (log) { return log.group || "-"; })), "group"),
      logFacetSection("模型", topFacetEntries(countLogValues(logState.logs, modelBucketName)), "model"),
      logFacetSection("Agent", topFacetEntries(countLogValues(logState.logs, function (log) { return log.agent || "Unknown"; })), "agent"),
    ].join("");
  }

  function logFacetCounts(items, countFn) {
    return items.map(function (item) {
      return { value: item[0], label: item[1], count: countFn(item[0]) };
    }).filter(function (item) { return item.count > 0; });
  }

  function topFacetEntries(counts) {
    return Object.keys(counts || {}).map(function (value) {
      return { value, label: value, count: counts[value] };
    }).sort(function (a, b) {
      return (b.count - a.count) || a.label.localeCompare(b.label);
    }).slice(0, 8);
  }

  function logFacetSection(title, entries, filterKey) {
    if (!entries.length) return "";
    return '<section class="log-facet">' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      entries.map(function (entry) {
        var active = String(logState.filters[filterKey] || "") === String(entry.value);
        return '<button type="button" class="' + (active ? "is-active" : "") + '" data-log-facet="' + escapeAttr(filterKey) + '" data-log-facet-value="' + escapeAttr(entry.value) + '">' +
          '<span>' + escapeHtml(entry.label) + '</span><b>' + String(entry.count) + '</b>' +
        '</button>';
      }).join("") +
      '</section>';
  }

  function renderLogList() {
    var root = document.querySelector("[data-log-rows]");
    if (!root) return;
    if (!logState.logs.length) {
      root.innerHTML = '<div class="log-empty">暂无日志。</div>';
      return;
    }
    if (!logState.filteredLogs.length) {
      root.innerHTML = '<div class="log-empty">没有匹配当前筛选的日志。</div>';
      return;
    }
    root.innerHTML = logState.filteredLogs.map(function (log, index) {
      return logRowHtml(log, index);
    }).join("");
  }

  function logRowHtml(log, index) {
    var actor = formatLogActor(log);
    var time = formatTimeParts(log.time);
    var statusCode = Number(log.statusCode || 0);
    var tone = statusTone(statusCode);
    var modelDisplay = formatModelDisplay(log);
    var billing = buildBillingView(log);
    var selected = index === logState.selectedIndex || (logState.selectedIndex < 0 && index === 0);
    var upstream = buildUpstreamDisplay(log);
    return '<button type="button" class="log-row log-row--' + tone + (selected ? " is-selected" : "") + '" data-log-index="' + String(index) + '">' +
      '<span class="log-row__time"><strong>' + escapeHtml(time.time || time.date) + '</strong><small>' + escapeHtml(time.time ? time.date : "") + '</small></span>' +
      '<span class="log-row__actor">' + logActorCell(log, actor) + '</span>' +
      '<span class="log-row__main">' +
        '<span class="log-row__model ' + (modelDisplay.isMissing ? "is-missing" : "") + '" title="' + escapeAttr(modelDisplay.title) + '">' + modelMarkHtml(log.model || "") + '<code>' + escapeHtml(modelDisplay.text) + '</code></span>' +
        '<span class="log-row__meta"><i>' + escapeHtml(log.group || "-") + '</i><i>' + escapeHtml(log.endpoint || "-") + '</i><i>' + escapeHtml(log.agent || "Unknown") + '</i></span>' +
        (upstream.pill ? '<span class="log-row__error">' + escapeHtml("upstream " + upstream.pill) + '</span>' : '') +
      '</span>' +
      '<span class="log-row__status"><b class="log-status-badge log-status-badge--' + tone + '">' + escapeHtml(String(log.statusCode || "-")) + '</b><small>' + escapeHtml(log.errorCode || statusLabel(statusCode) || billing.note) + '</small></span>' +
      '<span class="log-row__cost"><strong>' + escapeHtml(billing.current) + '</strong><small>' + escapeHtml(billing.remaining ? "剩 " + billing.remaining : billing.note) + '</small></span>' +
    '</button>';
  }

  function renderLogDetail(log) {
    var root = document.querySelector("[data-log-detail]");
    if (!root) return;
    if (!log) {
      root.innerHTML = '<div class="log-detail__empty"><strong>没有日志</strong><span>刷新或调整筛选后再查看详情。</span></div>';
      return;
    }
    var actor = formatLogActor(log);
    var modelDisplay = formatModelDisplay(log);
    var billing = buildBillingView(log);
    var upstream = buildUpstreamDisplay(log);
    var statusCode = Number(log.statusCode || 0);
    root.innerHTML =
      '<article class="log-detail-card">' +
        '<div class="log-detail-card__head">' +
          '<div>' +
            '<p class="eyebrow">日志详情</p>' +
            '<h3>' + escapeHtml(formatTime(log.time)) + '</h3>' +
          '</div>' +
          '<span class="log-status-badge log-status-badge--' + statusTone(statusCode) + '">' + escapeHtml(String(log.statusCode || "-")) + '</span>' +
        '</div>' +
        '<div class="log-detail-user">' + logActorCell(log, actor) + '</div>' +
        '<div class="log-detail-grid">' +
          detailMetric("本次费用", billing.current, "money") +
          detailMetric("计费状态", billing.note, billing.noteTone) +
          detailMetric("已用", billing.spent || "-", "money") +
          detailMetric("剩余", billing.remaining || "-", "money") +
        '</div>' +
        '<dl class="log-detail-list">' +
          detailRow("模型", modelDisplay.text, modelDisplay.reason) +
          detailRow("接口", log.endpoint || "-") +
          detailRow("分组", log.group || "-") +
          detailRow("Agent", log.agent || "Unknown", log.userAgent || "") +
          detailRow("Key", log.key || "-", log.keyHash ? "#" + log.keyHash : "") +
          detailRow("状态码", String(log.statusCode || "-"), log.errorCode || statusLabel(statusCode) || "") +
          detailRow("上游", upstream.text || "-", upstream.message || "") +
          detailRow("Token", String(log.inputTokens || 0) + " in / " + String(log.outputTokens || 0) + " out", log.totalTokens ? "total " + log.totalTokens : "") +
          detailRow("限制", log.maxInputTokenLimit || log.maxOutputTokenLimit ? "输入 " + (log.maxInputTokenLimit || "-") + " / 输出 " + (log.maxOutputTokenLimit || "-") : "-", log.maxOutputTokens ? "请求输出上限 " + log.maxOutputTokens : "") +
          detailRow("网络", log.ip || "-", log.durationMs ? String(log.durationMs) + "ms" : "") +
        '</dl>' +
        '<div class="log-detail-actions">' +
          '<button type="button" class="copy-btn btn--sm" data-block-key-hash="' + escapeAttr(log.keyHash || "") + '"><span class="copy-label">加入待封禁</span></button>' +
        '</div>' +
      '</article>';
  }

  function detailMetric(label, value, tone) {
    return '<span class="detail-metric' + (tone ? " detail-metric--" + tone : "") + '"><b>' + escapeHtml(label) + '</b><strong>' + escapeHtml(value || "-") + '</strong></span>';
  }

  function detailRow(label, value, note) {
    return '<div><dt>' + escapeHtml(label) + '</dt><dd><strong title="' + escapeAttr(value || "-") + '">' + escapeHtml(value || "-") + '</strong>' + (note ? '<span title="' + escapeAttr(note) + '">' + escapeHtml(note) + '</span>' : '') + '</dd></div>';
  }

  function formatLogActor(log) {
    var discord = log.discordUser || {};
    var id = String(discord.id || "").trim();
    var username = String(discord.username || "").trim();
    var globalName = String(discord.globalName || discord.global_name || "").trim();
    var displayName = String(discord.displayName || globalName || username || id || log.keyName || "未知用户").trim();
    var handle = username ? "@" + username : "";
    var full = [displayName, handle, id].filter(Boolean).join(" / ");
    return {
      id: id,
      label: displayName,
      handle: handle,
      full: full || log.keyName || "-",
      avatarUrl: discord.avatarUrl || buildDiscordAvatarUrl(id, discord.avatar || ""),
    };
  }

  function logActorCell(log, actor) {
    var subtitle = [
      actor.handle,
      actor.id ? "ID " + actor.id : "",
    ].filter(Boolean).join(" · ");
    var meta = [
      "Agent " + (log.agent || "Unknown"),
      log.userAgent || "",
    ].filter(Boolean).join(" · ");
    return '<div class="log-user">' +
      avatarHtml(actor.avatarUrl, actor.label) +
      '<div class="log-user__body">' +
        '<strong title="' + escapeAttr(actor.full) + '">' + escapeHtml(actor.label || "-") + '</strong>' +
        '<span title="' + escapeAttr(subtitle || "-") + '">' + escapeHtml(subtitle || "-") + '</span>' +
        '<small title="' + escapeAttr(meta) + '">' + escapeHtml(meta || "-") + '</small>' +
      '</div>' +
      '</div>';
  }

  function renderLogSummary(logs) {
    var root = document.querySelector("[data-log-summary]");
    if (!root) return;
    if (!logs.length) {
      root.innerHTML = "";
      return;
    }

    var uniqueKeys = {};
    var uniqueSubjects = {};
    var ok = 0;
    var errors = 0;
    var limited = 0;
    var totalCost = 0;
    logs.forEach(function (log) {
      var statusCode = Number(log.statusCode || 0);
      if (statusCode >= 200 && statusCode < 400) ok += 1;
      if (statusCode >= 400) errors += 1;
      if (log.errorCode === "rate_limit_exceeded") limited += 1;
      if (log.keyHash) uniqueKeys[log.keyHash] = true;
      uniqueSubjects[getUsageSubjectId(log)] = true;
      totalCost += Number(log.costUsd || 0) || 0;
    });

    root.innerHTML = [
      summaryPill("日志", String(logs.length)),
      summaryPill("用户", String(Object.keys(uniqueSubjects).length)),
      summaryPill("Key", String(Object.keys(uniqueKeys).length)),
      summaryPill("成功", String(ok), "ok"),
      summaryPill("错误", String(errors), errors ? "bad" : "ok"),
      summaryPill("限流", String(limited), limited ? "warn" : ""),
      summaryPill("本页费用", "$" + formatMoney(totalCost)),
    ].join("");
  }

  function summaryPill(label, value, tone) {
    return '<span class="admin-log-stat' + (tone ? " admin-log-stat--" + tone : "") + '">' +
      '<b>' + escapeHtml(label) + '</b>' +
      '<strong>' + escapeHtml(value) + '</strong>' +
      '</span>';
  }

  function renderUsageRanking(logs) {
    var section = document.querySelector("[data-usage-ranking-section]");
    var root = document.querySelector("[data-usage-ranking]");
    if (!section || !root) return;

    var rows = summarizeUsageRanking(logs);
    section.hidden = rows.length === 0;
    if (!rows.length) {
      root.innerHTML = "";
      refreshTableScrollers();
      return;
    }

    root.innerHTML = rows.map(function (item, index) {
      var actor = formatActor(item);
      var quota = [
        rankMetric("本页", "$" + formatMoney(item.pageCostUsd), "current"),
        rankMetric("已用", "$" + formatMoney(item.spentUsd), "money"),
        item.budgetUsd > 0 ? rankMetric("额度", "$" + formatMoney(item.budgetUsd), "money") : "",
        isFiniteNumber(item.remainingUsd) ? rankMetric("剩余", "$" + formatMoney(item.remainingUsd), "money") : "",
      ].filter(Boolean).join("");
      var requestStats = [
        rankMetric("总数", String(item.count)),
        item.keyCount > 1 ? rankMetric("Key", String(item.keyCount)) : "",
        rankMetric("成功", String(item.success), "ok"),
        rankMetric("错误", String(item.errors), item.errors ? "bad" : ""),
        item.rateLimited ? rankMetric("限流", String(item.rateLimited), "warn") : "",
        item.quotaExceeded ? rankMetric("超额", String(item.quotaExceeded), "bad") : "",
        item.denied ? rankMetric("拒绝", String(item.denied), "bad") : "",
        item.upstreamErrors ? rankMetric("上游", String(item.upstreamErrors), "bad") : "",
        item.streams ? rankMetric("流式", String(item.streams)) : "",
      ].filter(Boolean).join("");
      var tokenStats = [
        rankMetric("输入", formatNumber(item.inputTokens)),
        rankMetric("输出", formatNumber(item.outputTokens)),
        rankMetric("总计", formatNumber(item.totalTokens || item.inputTokens + item.outputTokens)),
      ].join("");
      var recentStats = [
        rankMetric("状态", String(item.lastStatusCode || "-"), statusTone(Number(item.lastStatusCode || 0))),
        item.avgDurationMs ? rankMetric("平均", String(Math.round(item.avgDurationMs)) + "ms") : "",
        item.maxDurationMs ? rankMetric("最慢", String(item.maxDurationMs) + "ms") : "",
        item.lastIp ? rankMetric("IP", item.lastIp) : "",
      ].filter(Boolean).join("");
      var flags = keyFlags(item);

      return '<article class="usage-rank-card">' +
        '<div class="usage-rank-card__place"><span class="rank-number">#' + String(index + 1) + '</span></div>' +
        '<div class="usage-rank-card__user">' +
          '<div class="rank-user rank-user--with-avatar">' +
            avatarHtml(actor.avatarUrl, actor.label) +
            '<div class="rank-user__body">' +
              '<strong title="' + escapeAttr(actor.full) + '">' + escapeHtml(actor.label) + '</strong>' +
              '<code title="' + escapeAttr(item.key || "-") + '">' + escapeHtml(item.key || "-") + '</code>' +
              '<span>' + escapeHtml(formatSubjectLabel(item)) + '</span>' +
            '</div>' +
            '<button type="button" class="copy-btn btn--sm" data-block-key-hash="' + escapeAttr(item.keyHash || "") + '"><span class="copy-label">加入待封禁</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="usage-rank-card__meta"><div class="rank-stack"><span class="log-chip log-chip--group">' + escapeHtml(item.group || "-") + '</span><strong>' + escapeHtml(item.agent || "Unknown") + '</strong><span>' + escapeHtml(item.userAgent || "") + '</span></div></div>' +
        '<div class="usage-rank-card__metrics"><div class="rank-metrics">' + requestStats + renderRankFlags(flags) + '</div></div>' +
        '<div class="usage-rank-card__lists"><div class="rank-list">' + formatCountList(item.models, "未记录") + '</div><div class="rank-list">' + formatCountList(item.endpoints, "-") + '</div></div>' +
        '<div class="usage-rank-card__quota"><div class="rank-metrics">' + tokenStats + quota + '</div></div>' +
        '<div class="usage-rank-card__recent"><div class="rank-recent"><strong>' + escapeHtml(formatTime(item.lastTime)) + '</strong><div class="rank-metrics">' + recentStats + '</div></div></div>' +
      '</article>';
    }).join("");
    refreshTableScrollers();
  }

  function enhanceWideTables() {
    document.querySelectorAll(".table-wrap").forEach(function (wrap) {
      if (wrap.dataset.scrollEnhanced === "true") return;
      var scroller = document.createElement("div");
      var inner = document.createElement("div");
      scroller.className = "table-scroll-top";
      inner.className = "table-scroll-top__inner";
      scroller.appendChild(inner);
      wrap.parentNode.insertBefore(scroller, wrap);
      wrap.dataset.scrollEnhanced = "true";

      var syncing = false;
      scroller.addEventListener("scroll", function () {
        if (syncing) return;
        syncing = true;
        wrap.scrollLeft = scroller.scrollLeft;
        syncing = false;
      });
      wrap.addEventListener("scroll", function () {
        if (syncing) return;
        syncing = true;
        scroller.scrollLeft = wrap.scrollLeft;
        syncing = false;
      });
    });
    refreshTableScrollers();
    window.addEventListener("resize", debounce(refreshTableScrollers, 120));
  }

  function refreshTableScrollers() {
    window.requestAnimationFrame(function () {
      document.querySelectorAll(".table-wrap[data-scroll-enhanced='true']").forEach(function (wrap) {
        var scroller = wrap.previousElementSibling;
        var inner = scroller && scroller.querySelector(".table-scroll-top__inner");
        var table = wrap.querySelector("table");
        if (!scroller || !inner || !table) return;
        inner.style.width = String(table.scrollWidth) + "px";
        scroller.scrollLeft = wrap.scrollLeft;
        var shouldShow = table.scrollWidth > wrap.clientWidth + 2;
        scroller.hidden = !shouldShow;
      });
    });
  }

  function debounce(fn, wait) {
    var timer = 0;
    return function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, wait);
    };
  }

  function summarizeUsageRanking(logs) {
    var map = {};
    logs.forEach(function (log) {
      var subjectId = getUsageSubjectId(log);
      if (!map[subjectId]) {
        map[subjectId] = {
          usageSubjectId: subjectId,
          billingSubjectType: log.billingSubjectType || (log.discordUser?.id ? "discord_user" : "api_key"),
          billingSubjectId: log.billingSubjectId || log.discordUser?.id || log.keyHash || "",
          keyHash: log.keyHash || "",
          key: log.key || "",
          keyName: log.keyName || "",
          discordUser: log.discordUser || null,
          group: log.group || "",
          agent: log.agent || "",
          userAgent: log.userAgent || "",
          count: 0,
          success: 0,
          errors: 0,
          rateLimited: 0,
          quotaExceeded: 0,
          denied: 0,
          upstreamErrors: 0,
          streams: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          pageCostUsd: 0,
          spentUsd: 0,
          budgetUsd: 0,
          remainingUsd: null,
          durationTotalMs: 0,
          durationCount: 0,
          avgDurationMs: 0,
          maxDurationMs: 0,
          lastTime: "",
          lastStatusCode: 0,
          lastIp: "",
          keyHashes: {},
          keyCount: 0,
          models: {},
          endpoints: {},
        };
      }

      var item = map[subjectId];
      var statusCode = Number(log.statusCode || 0);
      item.count += 1;
      item.success += statusCode >= 200 && statusCode < 400 ? 1 : 0;
      item.errors += statusCode >= 400 ? 1 : 0;
      item.rateLimited += log.errorCode === "rate_limit_exceeded" ? 1 : 0;
      item.quotaExceeded += log.errorCode === "quota_exceeded" ? 1 : 0;
      item.denied += ["access_denied", "model_not_allowed", "endpoint_not_allowed", "stream_not_allowed"].indexOf(log.errorCode) !== -1 ? 1 : 0;
      item.upstreamErrors += log.errorCode === "upstream_request_failed" ? 1 : 0;
      item.streams += log.stream ? 1 : 0;
      item.inputTokens += Number(log.inputTokens || 0) || 0;
      item.outputTokens += Number(log.outputTokens || 0) || 0;
      item.totalTokens += Number(log.totalTokens || 0) || 0;
      item.pageCostUsd += Number(log.costUsd || 0) || 0;
      item.spentUsd = Math.max(Number(item.spentUsd || 0), Number(log.spentUsd || 0) || 0);
      item.budgetUsd = Math.max(Number(item.budgetUsd || 0), Number(log.budgetUsd || 0) || 0);
      if (isFiniteNumber(log.remainingUsd)) item.remainingUsd = Number(log.remainingUsd);
      item.maxDurationMs = Math.max(Number(item.maxDurationMs || 0), Number(log.durationMs || 0) || 0);
      if (Number(log.durationMs || 0) > 0) {
        item.durationTotalMs += Number(log.durationMs || 0);
        item.durationCount += 1;
        item.avgDurationMs = item.durationTotalMs / item.durationCount;
      }

      addCount(item.models, modelBucketName(log));
      addCount(item.endpoints, log.endpoint || "-");
      if (log.keyHash) addCount(item.keyHashes, log.keyHash);

      if (!item.lastTime || String(log.time || "").localeCompare(String(item.lastTime)) > 0) {
        item.lastTime = log.time || item.lastTime;
        item.lastStatusCode = statusCode || item.lastStatusCode;
        item.lastIp = log.ip || item.lastIp;
        item.group = log.group || item.group;
        item.agent = log.agent || item.agent;
        item.userAgent = log.userAgent || item.userAgent;
        item.key = log.key || item.key;
        item.keyHash = log.keyHash || item.keyHash;
        item.keyName = log.keyName || item.keyName;
        item.discordUser = log.discordUser || item.discordUser;
        item.billingSubjectType = log.billingSubjectType || item.billingSubjectType;
        item.billingSubjectId = log.billingSubjectId || item.billingSubjectId;
      }
    });

    return Object.keys(map).map(function (key) {
      map[key].keyCount = Object.keys(map[key].keyHashes || {}).length;
      return map[key];
    })
      .sort(function (a, b) {
        return (b.spentUsd - a.spentUsd) ||
          (b.pageCostUsd - a.pageCostUsd) ||
          ((b.totalTokens || b.inputTokens + b.outputTokens) - (a.totalTokens || a.inputTokens + a.outputTokens)) ||
          (b.count - a.count) ||
          String(b.lastTime).localeCompare(String(a.lastTime));
      });
  }

  function modelBucketName(log) {
    if (log.model) return log.model;
    if (log.endpoint === "models") return "模型列表";
    if (Number(log.statusCode || 0) === 401) return "未鉴权";
    return "未记录";
  }

  function addCount(map, name) {
    var key = String(name || "-");
    map[key] = (map[key] || 0) + 1;
  }

  function getUsageSubjectId(log) {
    if (log.billingSubjectType && log.billingSubjectId) {
      return String(log.billingSubjectType) + ":" + String(log.billingSubjectId);
    }
    if (log.discordUser?.id) return "discord_user:" + String(log.discordUser.id);
    if (log.keyHash) return "api_key:" + String(log.keyHash);
    if (log.key) return "api_key:" + String(log.key);
    return "unknown:no-key";
  }

  function formatSubjectLabel(item) {
    if (item.billingSubjectType === "discord_user") {
      return "Discord 用户额度 · " + (item.billingSubjectId || item.discordUser?.id || "-") +
        (item.keyCount > 1 ? " · " + String(item.keyCount) + " 个 Key" : "");
    }
    return "Key 额度 · #" + (item.keyHash || item.billingSubjectId || "-");
  }

  function formatCountList(counts, emptyLabel) {
    var entries = Object.keys(counts || {}).map(function (name) {
      return { name, count: counts[name] };
    }).sort(function (a, b) {
      return (b.count - a.count) || a.name.localeCompare(b.name);
    }).slice(0, 4);
    if (!entries.length) return '<span class="log-empty">' + escapeHtml(emptyLabel || "-") + '</span>';
    return entries.map(function (entry) {
      return '<span title="' + escapeAttr(entry.name) + '"><code>' + escapeHtml(entry.name) + '</code><b>' + String(entry.count) + '</b></span>';
    }).join("");
  }

  function rankMetric(label, value, tone) {
    if (!value) return "";
    return '<span class="rank-metric' + (tone ? " rank-metric--" + tone : "") + '">' +
      '<b>' + escapeHtml(label) + '</b>' +
      '<code>' + escapeHtml(value) + '</code>' +
      '</span>';
  }

  function renderRankFlags(flags) {
    if (!flags.length) return "";
    return flags.map(function (flag) {
      return '<span class="rank-flag">' + escapeHtml(flag) + '</span>';
    }).join("");
  }

  function formatActor(item) {
    var discord = item.discordUser || {};
    var name = discord.displayName || discord.globalName || discord.username || item.keyName || "未知用户";
    var id = discord.id || "";
    return {
      label: id ? name + " / " + id : name,
      full: [name, id].filter(Boolean).join(" / "),
      avatarUrl: discord.avatarUrl || buildDiscordAvatarUrl(id, discord.avatar || ""),
    };
  }

  function avatarHtml(url, name) {
    if (url) {
      return '<div class="log-avatar"><img src="' + escapeAttr(url) + '" alt="" loading="lazy" decoding="async"></div>';
    }
    return '<div class="log-avatar"><span>' + escapeHtml(initialForName(name)) + '</span></div>';
  }

  function buildDiscordAvatarUrl(id, avatar) {
    if (!id || !avatar) return "";
    var ext = String(avatar).indexOf("a_") === 0 ? "gif" : "png";
    return "https://cdn.discordapp.com/avatars/" + encodeURIComponent(id) + "/" + encodeURIComponent(avatar) + "." + ext + "?size=64";
  }

  function buildParamText(log, actor) {
    var billing = buildBillingView(log);
    var upstream = buildUpstreamDisplay(log);
    var stop = buildStopDisplay(log);
    return [
      "本次 " + billing.current,
      "计费 " + billing.note,
      billing.spent ? "已用 " + billing.spent : "",
      billing.budget ? "额度 " + billing.budget : "",
      billing.remaining ? "剩余 " + billing.remaining : "",
      log.stream ? "流式" : "",
      log.estimatedInputTokens ? "预估输入 " + String(log.estimatedInputTokens) : "",
      log.maxInputTokenLimit ? "输入限制 " + String(log.maxInputTokenLimit) : "",
      log.maxOutputTokenLimit ? "输出限制 " + String(log.maxOutputTokenLimit) : "",
      log.inputTokens || log.outputTokens ? "Tokens " + String(log.inputTokens || 0) + "/" + String(log.outputTokens || 0) : "",
      log.maxOutputTokens ? "输出上限 " + String(log.maxOutputTokens) : "",
      log.durationMs ? String(log.durationMs) + "ms" : "",
      stop.text,
      upstream.text,
      actor ? "用户 " + actor : "",
      log.ip ? "IP " + log.ip : "",
    ].filter(Boolean).join(" | ");
  }

  function buildParamPills(log, actor) {
    var billing = buildBillingView(log);
    var upstream = buildUpstreamDisplay(log);
    var stop = buildStopDisplay(log);
    var pills = [
      paramPill("本次", billing.current, "current"),
      paramPill("计费", billing.note, billing.noteTone),
      paramPill("已用", billing.spent, "money"),
      paramPill("额度", billing.budget, "money"),
      paramPill("剩余", billing.remaining, "money"),
      paramPill("模式", log.stream ? "stream" : ""),
      paramPill("预估输入", log.estimatedInputTokens ? String(log.estimatedInputTokens) : ""),
      paramPill("输入限制", log.maxInputTokenLimit ? String(log.maxInputTokenLimit) : ""),
      paramPill("输出限制", log.maxOutputTokenLimit ? String(log.maxOutputTokenLimit) : ""),
      paramPill("Tokens", log.inputTokens || log.outputTokens ? String(log.inputTokens || 0) + "/" + String(log.outputTokens || 0) : ""),
      paramPill("上限", log.maxOutputTokens ? String(log.maxOutputTokens) : ""),
      paramPill("耗时", log.durationMs ? String(log.durationMs) + "ms" : ""),
      paramPill("stop", stop.reason, stop.tone),
      paramPill("stream end", stop.streamEnded, stop.streamEnded === "no" ? "bad" : ""),
      paramPill("client closed", stop.clientClosed, stop.clientClosed === "yes" ? "bad" : ""),
      paramPill("bytes", stop.bytes),
      paramPill("upstream", upstream.pill, "bad"),
      paramPill("upstream msg", upstream.message, "bad"),
      paramPill("用户", actor || ""),
      paramPill("IP", log.ip || ""),
    ].filter(Boolean);
    return pills.length ? '<div class="log-param-grid">' + pills.join("") + '</div>' : '<span class="log-empty">-</span>';
  }

  function buildUpstreamDisplay(log) {
    var status = Number(log.upstreamStatus || 0);
    var code = String(log.upstreamErrorCode || "").trim();
    var message = String(log.upstreamErrorMessage || "").trim();
    if (!status && !code && !message) {
      return { text: "", pill: "", message: "", statusHtml: "" };
    }

    var statusText = status ? String(status) : "network";
    var pieces = [
      "upstream " + statusText,
      code ? "code " + code : "",
      message ? "message " + message : "",
    ].filter(Boolean);
    var pill = [statusText, code].filter(Boolean).join(" / ");
    var statusHtml = '<div class="log-subtle log-subtle--upstream" title="' + escapeAttr(pieces.join(" | ")) + '">' +
      'upstream ' + escapeHtml(pill || statusText) +
      '</div>';
    return {
      text: pieces.join(" | "),
      pill: pill,
      message: message,
      statusHtml: statusHtml,
    };
  }

  function buildStopDisplay(log) {
    var reason = String(log.finishReason || log.stopReason || log.incompleteReason || "").trim();
    var streamEnded = log.streamEnded === true ? "yes" : (log.streamEnded === false ? "no" : "");
    var clientClosed = log.clientClosed === true ? "yes" : (log.clientClosed === false ? "no" : "");
    var bytes = Number(log.bytesSent || 0) > 0 ? formatNumber(log.bytesSent) : "";
    var pieces = [
      reason ? "stop " + reason : "",
      streamEnded ? "streamEnded " + streamEnded : "",
      clientClosed ? "clientClosed " + clientClosed : "",
      bytes ? "bytes " + bytes : "",
    ].filter(Boolean);
    return {
      reason: reason,
      streamEnded: streamEnded,
      clientClosed: clientClosed,
      bytes: bytes,
      tone: reason === "length" || reason === "max_tokens" || reason === "max_output_tokens" ? "bad" : "",
      text: pieces.join(" | "),
    };
  }

  function buildBillingView(log) {
    var statusCode = Number(log.statusCode || 0);
    var costUsd = isFiniteNumber(log.costUsd) ? Number(log.costUsd) : 0;
    var isSuccess = statusCode >= 200 && statusCode < 400;
    var note = "未计费";
    var noteTone = "";

    if (costUsd > 0) {
      note = "已扣费";
      noteTone = "charged";
    } else if (log.endpoint === "models") {
      note = "列表不计费";
    } else if (!isSuccess) {
      note = "失败未计费";
      noteTone = "free";
    } else if (log.usageMissing) {
      note = "未返回用量";
      noteTone = "warn";
    }

    return {
      current: "$" + formatMoney(costUsd),
      note,
      noteTone,
      spent: isFiniteNumber(log.spentUsd) ? "$" + formatMoney(log.spentUsd) : "",
      budget: isFiniteNumber(log.budgetUsd) && Number(log.budgetUsd) > 0 ? "$" + formatMoney(log.budgetUsd) : "",
      remaining: isFiniteNumber(log.remainingUsd) ? "$" + formatMoney(log.remainingUsd) : "",
    };
  }

  function paramPill(label, value, tone) {
    if (!value) return "";
    return '<span class="log-param' + (tone ? " log-param--" + tone : "") + '">' +
      '<b>' + escapeHtml(label) + '</b>' +
      '<code>' + escapeHtml(value) + '</code>' +
      '</span>';
  }

  function statusTone(statusCode) {
    if (statusCode >= 200 && statusCode < 400) return "ok";
    if (statusCode === 429) return "warn";
    if (statusCode >= 400 && statusCode < 500) return "bad";
    if (statusCode >= 500) return "bad";
    return "neutral";
  }

  function statusLabel(statusCode) {
    if (statusCode >= 200 && statusCode < 400) return "ok";
    return "";
  }

  function formatTimeParts(value) {
    if (!value) return { date: "-", time: "" };
    var formatted = formatTime(value);
    var parts = String(formatted).split(/\s+/);
    return {
      date: parts[0] || formatted,
      time: parts.slice(1).join(" ") || "",
    };
  }

  function isFiniteNumber(value) {
    if (value === null || value === undefined || value === "") return false;
    var number = Number(value);
    return Number.isFinite(number);
  }

  function getAdminToken() {
    return String(document.querySelector("[data-admin-token]")?.value || "").trim();
  }

  function adminHeaders(token) {
    return token ? { authorization: "Bearer " + token } : {};
  }

  function setLogStatus(message, isError) {
    var el = document.querySelector("[data-log-status]");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-error", !!isError);
  }

  function formatTime(value) {
    if (!value) return "-";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function formatMoney(value) {
    var number = Number(value || 0);
    if (!Number.isFinite(number)) return "0";
    return number.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0");
  }

  function formatNumber(value) {
    var number = Number(value || 0);
    if (!Number.isFinite(number)) return "0";
    try {
      return number.toLocaleString("zh-CN");
    } catch {
      return String(Math.round(number));
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
