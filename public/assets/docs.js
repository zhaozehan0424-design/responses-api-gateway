/*
 * 文档页脚本。依赖 config.js + ui.js（window.GW）先加载。
 * 代码示例集中定义在 SAMPLES，再渲染成语言标签页。
 */
(function () {
  "use strict";

  // 模型示例值：取展示列表里偏中档的一个，给不出就退回 haiku。
  var MODELS = (window.GATEWAY_CONFIG && window.GATEWAY_CONFIG.models) || [];
  var DEMO_MODEL =
    MODELS.find(function (m) {
      return m.indexOf("sonnet") !== -1;
    }) ||
    MODELS[0] ||
    "claude-haiku-4-5-20251001";

  // 占位符：__BASE_URL__ / __API_KEY__ 由 ui.js 统一替换。
  var SAMPLES = [
    {
      id: "curl",
      label: "cURL",
      blocks: [
        {
          title: "列出模型 · GET /models",
          code:
            'curl __BASE_URL__/models \\\n' +
            '  -H "Authorization: Bearer __API_KEY__"',
        },
        {
          title: "通用 Chat Completions · POST /chat/completions",
          code:
            'curl __BASE_URL__/chat/completions \\\n' +
            '  -H "Authorization: Bearer __API_KEY__" \\\n' +
            '  -H "Content-Type: application/json" \\\n' +
            "  -d '{\n" +
            '    "model": "' + DEMO_MODEL + '",\n' +
            '    "messages": [\n' +
            '      {"role": "user", "content": "用一句话介绍你自己"}\n' +
            "    ]\n" +
            "  }'",
        },
        {
          title: "通用 Chat Completions（流式）· stream: true",
          code:
            'curl -N __BASE_URL__/chat/completions \\\n' +
            '  -H "Authorization: Bearer __API_KEY__" \\\n' +
            '  -H "Content-Type: application/json" \\\n' +
            "  -d '{\n" +
            '    "model": "' + DEMO_MODEL + '",\n' +
            '    "messages": [{"role": "user", "content": "讲个一句话冷笑话"}],\n' +
            '    "stream": true\n' +
            "  }'",
        },
        {
          title: "推荐 Responses API · POST /responses",
          code:
            'curl __BASE_URL__/responses \\\n' +
            '  -H "Authorization: Bearer __API_KEY__" \\\n' +
            '  -H "Content-Type: application/json" \\\n' +
            "  -d '{\n" +
            '    "model": "' + DEMO_MODEL + '",\n' +
            '    "input": "用一句话介绍你自己"\n' +
            "  }'",
        },
      ],
    },
    {
      id: "python",
      label: "Python",
      blocks: [
        {
          title: "初始化客户端（openai SDK）",
          code:
            "# pip install openai\n" +
            "from openai import OpenAI\n\n" +
            "client = OpenAI(\n" +
            '    base_url="__BASE_URL__",\n' +
            '    api_key="__API_KEY__",\n' +
            ")",
        },
        {
          title: "列出模型 + Chat Completions",
          code:
            "# 列出当前 Key 可用的模型\n" +
            "for m in client.models.list().data:\n" +
            "    print(m.id)\n\n" +
            "# 对话补全\n" +
            "resp = client.chat.completions.create(\n" +
            '    model="' + DEMO_MODEL + '",\n' +
            '    messages=[{"role": "user", "content": "用一句话介绍你自己"}],\n' +
            ")\n" +
            "print(resp.choices[0].message.content)",
        },
        {
          title: "流式输出",
          code:
            "stream = client.chat.completions.create(\n" +
            '    model="' + DEMO_MODEL + '",\n' +
            '    messages=[{"role": "user", "content": "讲个一句话冷笑话"}],\n' +
            "    stream=True,\n" +
            ")\n" +
            "for chunk in stream:\n" +
            "    delta = chunk.choices[0].delta.content\n" +
            "    if delta:\n" +
            '        print(delta, end="", flush=True)',
        },
        {
          title: "推荐 Responses API",
          code:
            "resp = client.responses.create(\n" +
            '    model="' + DEMO_MODEL + '",\n' +
            '    input="用一句话介绍你自己",\n' +
            ")\n" +
            "print(resp.output_text)",
        },
      ],
    },
    {
      id: "node",
      label: "Node.js",
      blocks: [
        {
          title: "初始化客户端（openai SDK）",
          code:
            "// npm install openai\n" +
            'import OpenAI from "openai";\n\n' +
            "const client = new OpenAI({\n" +
            '  baseURL: "__BASE_URL__",\n' +
            '  apiKey: "__API_KEY__",\n' +
            "});",
        },
        {
          title: "列出模型 + Chat Completions",
          code:
            "// 列出当前 Key 可用的模型\n" +
            "const models = await client.models.list();\n" +
            "for (const m of models.data) console.log(m.id);\n\n" +
            "// 对话补全\n" +
            "const resp = await client.chat.completions.create({\n" +
            '  model: "' + DEMO_MODEL + '",\n' +
            '  messages: [{ role: "user", content: "用一句话介绍你自己" }],\n' +
            "});\n" +
            "console.log(resp.choices[0].message.content);",
        },
        {
          title: "流式输出",
          code:
            "const stream = await client.chat.completions.create({\n" +
            '  model: "' + DEMO_MODEL + '",\n' +
            '  messages: [{ role: "user", content: "讲个一句话冷笑话" }],\n' +
            "  stream: true,\n" +
            "});\n" +
            "for await (const chunk of stream) {\n" +
            '  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");\n' +
            "}",
        },
        {
          title: "推荐 Responses API",
          code:
            "const r = await client.responses.create({\n" +
            '  model: "' + DEMO_MODEL + '",\n' +
            '  input: "用一句话介绍你自己",\n' +
            "});\n" +
            "console.log(r.output_text);",
        },
      ],
    },
    {
      id: "agents",
      label: "Agent 工具",
      blocks: [
        {
          title: "使用限制 · 禁止写代码任务",
          code:
            "这些配置仅用于说明客户端兼容方式，不代表允许把 Key 用于写代码。\n" +
            "禁止将本站 API Key 用于 vibe coding、AI 编程、自动生成或修改代码，\n" +
            "也禁止接入 Codex、Claude Code、Cline、Roo Code 等写代码任务。\n\n" +
            "请勿公开传播本站地址、Base URL、API Key，也不要转卖共享或高频滥用。",
        },
        {
          title: "Codex CLI · 推荐 Responses",
          code:
            "# ~/.codex/config.toml\n" +
            'model_provider = "gateway"\n' +
            'model = "' + DEMO_MODEL + '"\n\n' +
            "[model_providers.gateway]\n" +
            'name = "Relay Hub"\n' +
            'base_url = "__BASE_URL__"\n' +
            'env_key = "GATEWAY_API_KEY"\n' +
            'wire_api = "responses"\n\n' +
            "# PowerShell\n" +
            '$env:GATEWAY_API_KEY="__API_KEY__"\n' +
            "codex",
        },
        {
          title: "Cline · OpenAI Compatible",
          code:
            "API Provider: OpenAI Compatible\n" +
            "Base URL: __BASE_URL__\n" +
            "API Key: __API_KEY__\n" +
            "Model ID: " + DEMO_MODEL + "\n\n" +
            "说明：Cline 的 OpenAI Compatible 配置一般走 /chat/completions，\n" +
            "适合直接接入本网关的通用兼容接口。",
        },
        {
          title: "Roo Code · OpenAI Compatible",
          code:
            "Provider / API Provider: OpenAI Compatible\n" +
            "Base URL: __BASE_URL__\n" +
            "OpenAI Compatible API Key: __API_KEY__\n" +
            "Model: " + DEMO_MODEL + "\n\n" +
            "如果工具要求手动填写模型名，就直接填上面的 Model。\n" +
            "如果工具会自动拉模型列表，可以先用 GET /v1/models 检查。",
        },
        {
          title: "Claude Code · 需要 Anthropic-compatible 转换层",
          code:
            "# Claude Code 不是 OpenAI-compatible 客户端，不能直接接 __BASE_URL__。\n" +
            "# 它需要的是 Anthropic Messages API 形状的网关，例如 /v1/messages。\n" +
            "# 如果之后你加了 Anthropic-to-OpenAI 转换层，可以类似这样配置：\n\n" +
            "# macOS / Linux\n" +
            'export ANTHROPIC_BASE_URL="https://your-anthropic-compatible-gateway.example"\n' +
            'export ANTHROPIC_AUTH_TOKEN="__API_KEY__"\n' +
            'export ANTHROPIC_MODEL="' + DEMO_MODEL + '"\n' +
            "claude\n\n" +
            "# PowerShell\n" +
            '$env:ANTHROPIC_BASE_URL="https://your-anthropic-compatible-gateway.example"\n' +
            '$env:ANTHROPIC_AUTH_TOKEN="__API_KEY__"\n' +
            '$env:ANTHROPIC_MODEL="' + DEMO_MODEL + '"\n' +
            "claude",
        },
      ],
    },
    {
      id: "powershell",
      label: "PowerShell",
      blocks: [
        {
          title: "列出模型 · GET /models",
          code:
            '$headers = @{ Authorization = "Bearer __API_KEY__" }\n' +
            'Invoke-RestMethod -Method Get -Uri "__BASE_URL__/models" -Headers $headers',
        },
        {
          title: "通用 Chat Completions · POST /chat/completions",
          code:
            '$headers = @{ Authorization = "Bearer __API_KEY__" }\n' +
            "$body = @{\n" +
            '  model    = "' + DEMO_MODEL + '"\n' +
            '  messages = @(@{ role = "user"; content = "用一句话介绍你自己" })\n' +
            "} | ConvertTo-Json -Depth 8\n\n" +
            'Invoke-RestMethod -Method Post -Uri "__BASE_URL__/chat/completions" `\n' +
            '  -Headers $headers -ContentType "application/json" -Body $body',
        },
        {
          title: "推荐 Responses API · POST /responses",
          code:
            '$headers = @{ Authorization = "Bearer __API_KEY__" }\n' +
            "$body = @{\n" +
            '  model = "' + DEMO_MODEL + '"\n' +
            '  input = "用一句话介绍你自己"\n' +
            "} | ConvertTo-Json -Depth 8\n\n" +
            'Invoke-RestMethod -Method Post -Uri "__BASE_URL__/responses" `\n' +
            '  -Headers $headers -ContentType "application/json" -Body $body',
        },
        {
          title: "关于流式",
          code:
            "# PowerShell 的 Invoke-RestMethod 不便处理 SSE 流式响应，\n" +
            "# 建议流式场景改用 cURL（curl -N ...）或 Python / Node.js SDK。",
        },
      ],
    },
  ];

  function init() {
    if (!window.GW) return;
    GW.applyBranding(document);
    GW.applyBaseUrl(document);
    renderTabs();
    GW.bindCopyButtons(document);
    renderAll();
    wireKeyInput();
  }

  function renderTabs() {
    var tablist = document.querySelector("[data-tablist]");
    var panels = document.querySelector("[data-panels]");
    if (!tablist || !panels) return;

    SAMPLES.forEach(function (lang, i) {
      var tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab";
      tab.id = "tab-" + lang.id;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "panel-" + lang.id);
      tab.setAttribute("aria-selected", i === 0 ? "true" : "false");
      tab.setAttribute("tabindex", i === 0 ? "0" : "-1");
      tab.textContent = lang.label;
      tablist.appendChild(tab);

      var panel = document.createElement("div");
      panel.className = "tabpanel stack";
      panel.id = "panel-" + lang.id;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", "tab-" + lang.id);
      if (i !== 0) panel.hidden = true;

      lang.blocks.forEach(function (b) {
        panel.appendChild(buildCodeblock(b.title, b.code));
      });
      panels.appendChild(panel);
    });

    tablist.addEventListener("click", function (ev) {
      var tab = ev.target.closest('[role="tab"]');
      if (tab) selectTab(tab);
    });
    tablist.addEventListener("keydown", onTablistKeydown);
  }

  function buildCodeblock(title, code) {
    var wrap = document.createElement("div");
    wrap.className = "codeblock";
    wrap.setAttribute("data-codeblock", "");

    var head = document.createElement("div");
    head.className = "codeblock-head";

    var titleEl = document.createElement("span");
    titleEl.className = "codeblock-title";
    titleEl.textContent = title;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.setAttribute("data-copy-code", "");
    btn.setAttribute("aria-label", "复制代码");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
      '<span class="copy-label">复制</span>';

    head.appendChild(titleEl);
    head.appendChild(btn);

    var pre = document.createElement("pre");
    var codeEl = document.createElement("code");
    codeEl.setAttribute("data-tpl", "");
    codeEl.textContent = code; // 原始模板，含占位符；ui.js 会缓存并替换
    pre.appendChild(codeEl);

    wrap.appendChild(head);
    wrap.appendChild(pre);
    return wrap;
  }

  function selectTab(tab) {
    var tablist = tab.parentNode;
    GW.each(tablist.querySelectorAll('[role="tab"]'), function (t) {
      var selected = t === tab;
      t.setAttribute("aria-selected", selected ? "true" : "false");
      t.setAttribute("tabindex", selected ? "0" : "-1");
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !selected;
    });
  }

  function onTablistKeydown(ev) {
    var key = ev.key;
    if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End") return;
    var tabs = Array.prototype.slice.call(this.querySelectorAll('[role="tab"]'));
    var current = tabs.indexOf(document.activeElement);
    if (current === -1) return;
    ev.preventDefault();
    var next = current;
    if (key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    else if (key === "Home") next = 0;
    else if (key === "End") next = tabs.length - 1;
    tabs[next].focus();
    selectTab(tabs[next]);
  }

  function renderAll() {
    var input = document.getElementById("api-key-input");
    var apiKey = input && input.value.trim() ? input.value.trim() : "YOUR_API_KEY";
    GW.renderTemplates(document, { apiKey: apiKey });
  }

  function wireKeyInput() {
    var input = document.getElementById("api-key-input");
    if (!input) return;
    input.addEventListener("input", renderAll);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
