# Launch Kit

Use these posts to share Relay Hub with developers who might actually run it, review it, or open issues. Do not buy stars or ask for empty stars; ask for testing and feedback.

## Short English Post

I open-sourced Relay Hub, an OpenAI-compatible API gateway for small teams and Discord communities.

It lets you share model access through downstream API keys while keeping the upstream key server-side. It supports `/v1/models`, `/v1/responses`, `/v1/chat/completions`, quotas, rate limits, Discord registration, masked admin logs, Vercel deployment, and Docker.

Repo: https://github.com/zhaozehan0424-design/responses-api-gateway  
Demo/docs: https://responses-api-gateway.vercel.app

I would love feedback on deployment docs, SDK compatibility, and security hardening.

## Short Chinese Post

我开源了一个 OpenAI-compatible API gateway，叫 Relay Hub。

它适合小团队或 Discord 社区共享模型 API：用户拿到的是下游 key，上游 API key 只保存在服务端。项目支持 `/v1/models`、`/v1/responses`、`/v1/chat/completions`，还有额度、限速、Discord 注册、管理员日志、Vercel 部署和 Docker。

仓库：https://github.com/zhaozehan0424-design/responses-api-gateway  
演示/文档：https://responses-api-gateway.vercel.app

欢迎试用和提 issue，尤其想收集部署文档、SDK 兼容性和安全加固方面的反馈。

## Longer English Post

I just published Relay Hub as an open-source project.

Relay Hub is an OpenAI-compatible API gateway for small teams, AI communities, and self-hosted access control. Instead of giving users your real upstream API key, you can give them downstream keys and enforce gateway-side rules:

- OpenAI-compatible endpoints: `/v1/models`, `/v1/responses`, `/v1/chat/completions`
- Downstream API keys with server-side upstream secrets
- Per-group quotas, rate limits, endpoint permissions, model allowlists, and token caps
- Optional Discord registration and login
- Masked admin call logs
- Vercel serverless and Docker/Node deployment support

Repo: https://github.com/zhaozehan0424-design/responses-api-gateway  
Demo/docs: https://responses-api-gateway.vercel.app

The project is early as public OSS, but it comes from an existing deployed gateway. Feedback and issues are welcome, especially around deployment docs, SDK compatibility, streaming behavior, Discord auth hardening, and quota/rate-limit testing.

## V2EX / Chinese Forum Version

最近把自己之前用的一个 OpenAI-compatible API gateway 开源了，叫 Relay Hub。

主要场景是：你想给小团队、朋友或 Discord 社区共享模型 API，但不想把真正的上游 key 直接发出去。Relay Hub 放在中间，用户使用下游 key 调 `/v1` 接口，上游 key 只保存在服务端。

目前支持：

- `/v1/models`
- `/v1/responses`
- `/v1/chat/completions`
- 下游 API key
- 模型白名单、限速、额度、token 限制
- Discord 注册/登录
- 管理员调用日志，key 会脱敏
- Vercel / Docker 部署

仓库：https://github.com/zhaozehan0424-design/responses-api-gateway  
文档/演示：https://responses-api-gateway.vercel.app

现在最想收集的是：部署文档是否清晰、OpenAI SDK 兼容性、Discord 登录安全、限速和额度逻辑有没有边界问题。欢迎试用和提 issue。

## Sharing Checklist

- Pin the repository on the GitHub profile.
- Share the short English post on X/Twitter, LinkedIn, Discord, or relevant AI developer communities.
- Share the Chinese post on V2EX, developer groups, or personal social channels.
- Ask for testing feedback, not artificial stars.
- Reply to issues within 24-48 hours.
- When a real issue is fixed, close it with a commit and cut a small release.
