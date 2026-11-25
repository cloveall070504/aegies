# ChemGuard 生产部署（CD）指南

> 目标：`git push` 到 GitHub `master` 分支后，GitHub Actions 自动 SSH 到 ECS，执行 `git pull` + `docker compose up -d --build` 完成更新。

## 一、整体架构

```
本地 push ──▶ GitHub (cloveall070504/aegies, 公开仓库)
                │
                ▼
        GitHub Actions (cd.yml)
                │  appleboy/ssh-action 用私钥免密登录 ECS
                ▼
        ECS /root/project
          git pull origin master (HTTPS 匿名)
          docker compose up -d --build
                ▼
           线上更新 (frontend:80 + backend:8000 + postgres)
```

## 二、现状（已确认）

- ECS：`47.95.23.29`，SSH 用户 `root`，端口 `22`，部署目录 `/root/project`
- 线上实际用 **`docker-compose.yml`**（非 prod 版）：前端 `FRONTEND_PORT=80` 映射 80，后端暴露 8000，无 Caddy/HTTPS，直接 `http://47.95.23.29` 访问
- 原本用 Gitee webhook（`receiver.py` 在 9000 端口）触发 `deploy.sh`；改用 GitHub Actions 后这套可退役

## 三、需要配置的 GitHub Secrets（共 5 个）

在 GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret** 添加：

| Secret 名 | 值 |
|---|---|
| `ECS_HOST` | `47.95.23.29` |
| `ECS_USER` | `root` |
| `ECS_PORT` | `22` |
| `ECS_SSH_KEY` | 本机 `~/.ssh/id_ed25519_ecs` 私钥内容（整段粘贴） |
| `ECS_DEPLOY_DIR` | `/root/project` |

## 四、ECS 上已就绪（无需改动）

- 免密登录：本机公钥 `~/.ssh/id_ed25519_ecs.pub` 已追加到 ECS `~/.ssh/authorized_keys`
- `.env` 已在 `/root/project/.env`（含 `DB_PASSWORD`/`SECRET_KEY`/`OPENAI_API_KEY`/`FRONTEND_PORT=80` 等），`cd.yml` 的 `git clean -e` 会保留它

## 五、首次部署步骤

1. 本地 push 代码到 GitHub `master`（`cd.yml` 已在仓库里）。
2. GitHub Actions 自动触发 `CD (Deploy to Alibaba Cloud ECS)`。
3. 或在仓库 Actions 页手动 `Run workflow`（`workflow_dispatch`）。

## 六、回滚

```bash
# ECS 上切回旧提交
cd /root/project
git reset --hard <旧commit-sha>
docker compose up -d --build
```

## 七、注意事项

- **数据库迁移**：backend 启动时在 lifespan 内自动执行 Alembic 迁移（幂等），无需手动跑。
- **数据持久化**：`pgdata` named volume 不会因重建而丢数据。
- **敏感文件保护**：`git clean -fd -e '.env' -e 'backend/.env' -e 'frontend/.env' -e 'deploy.log'` 会保留这些本地文件。
- **磁盘清理**：deploy 脚本末尾 `docker image prune -f` 清理无引用镜像。
- **仓库公开**：`aegies` 仓库是 public，ECS 用 HTTPS 匿名拉取无需配 GitHub 凭据；若以后改 private，需在 ECS 配 token 或 deploy key。
