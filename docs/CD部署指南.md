# ChemGuard 生产部署（CD）指南

> 目标：`git push` 到 GitHub `main/master` 分支后，自动构建前后端镜像 → 推送到阿里云 ACR → SSH 登录 ECS 拉取并重启服务。

## 一、整体架构

```
本地 push ──▶ GitHub Actions (cd.yml)
                │
                ├─ ① build backend/frontend 镜像
                │      docker/build-push-action
                ▼
          阿里云 ACR (registry.cn-hangzhou.aliyuncs.com/<命名空间>/chy07-backend|frontend)
                │
                ├─ ② appleboy/ssh-action 登录 ECS
                │      docker pull → docker tag → compose up -d
                ▼
          阿里云 ECS (已部署 caddy + frontend + backend + postgres)
```

## 二、前置条件

1. 仓库已推送到 GitHub（当前在 Gitee `gitee.com/cloveall/chy07`，需迁移或镜像到 GitHub）。
2. 已开通**阿里云容器镜像服务 ACR**（个人版免费），并创建命名空间。
3. 已在 ACR 开通**访问凭证**（用户名 + 密码），用于 `docker login`。
4. ECS 上已安装 docker + docker compose，且已有一份 `docker-compose.prod.yml` + `Caddyfile` + `.env`（已部署在跑则满足）。

## 三、需要配置的 GitHub Secrets

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中添加以下 secrets：

| Secret 名 | 说明 | 示例 |
|---|---|---|
| `ACR_REGISTRY` | ACR 地域地址（个人版默认杭州） | `registry.cn-hangzhou.aliyuncs.com` |
| `ACR_NAMESPACE` | ACR 命名空间名 | `cloveall` |
| `ACR_USERNAME` | ACR 访问凭证用户名 | `cloveall` |
| `ACR_PASSWORD` | ACR 访问凭证密码 | `xxxx` |
| `ECS_HOST` | ECS 公网 IP 或域名 | `8.210.254.49` |
| `ECS_USER` | SSH 登录用户名 | `root` |
| `ECS_PORT` | SSH 端口（默认 22，可省） | `22` |
| `ECS_SSH_KEY` | 私钥（用于 SSH 免密登录） | `-----BEGIN OPENSSH PRIVATE KEY-----…` |
| `ECS_DEPLOY_DIR` | ECS 上项目部署目录（含 compose 文件） | `/opt/chy07` |

> 关于 `ECS_SSH_KEY`：在 ECS 上 `ssh-keygen` 生成密钥对，把公钥追加到 `~/.ssh/authorized_keys`，私钥内容粘到 secret（多行原样保留）。

## 四、ECS 上的 .env 需补充的变量

现有 `.env` 需追加以下键（参考 `.env.example`）：

```bash
ACR_REGISTRY=registry.cn-hangzhou.aliyuncs.com
ACR_NAMESPACE=<你的命名空间>
IMAGE_TAG=latest
```

## 五、首次部署步骤

1. 把 `docker-compose.prod.yml`（已改为从 ACR 拉镜像）同步到 ECS 的部署目录，覆盖旧的。
2. 在 ECS 上手动登录一次 ACR，确保能拉镜像：
   ```bash
   docker login registry.cn-hangzhou.aliyuncs.com -u <ACR_USERNAME>
   ```
3. 本地 push 代码到 GitHub `main`，触发 `cd.yml`。
4. 在 GitHub Actions 页面查看 `CD (Deploy to Alibaba Cloud ECS)` 运行结果。

## 六、回滚

每次发布镜像都会打上 `commit sha` 的 tag，回滚只需在 ECS 上：

```bash
docker compose -f docker-compose.prod.yml --env-file .env down
IMAGE_TAG=<旧commit-sha> docker compose -f docker-compose.prod.yml --env-file .env up -d
```

或直接在 GitHub Actions 里对旧 commit 重新 `workflow_dispatch`。

## 七、注意事项

- **数据库迁移**：backend 启动时在 lifespan 内自动执行 Alembic 迁移（幂等），无需手动跑。
- **数据持久化**：`pgdata` / `caddy_data` / `caddy_config` / `backend_data` 四个 named volume 不会因镜像更新而丢失。
- **零停机**：`docker compose up -d` 会先起新容器再停旧容器，滚动更新，不会长时间中断。
- **磁盘清理**：deploy 脚本末尾有 `docker image prune -f`，清理无引用镜像，防止历史版本撑满磁盘。
