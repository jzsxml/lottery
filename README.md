# 年会抽奖系统（Lottery）

单机部署，200 人以内：公平抽取、大屏 3D、资格筛选、主题音效、移动主持、多种滚动/背景特效。

> 仓库内**不包含**本地数据库（`data/lottery.db` 已在 `.gitignore` 中忽略），克隆后首次 `npm run dev` 会自动创建空库。

**现场操作详见：[docs/操作手册.md](docs/操作手册.md)**（会前清单、角色分工、正赛流程、异常重抽、归档与排障）。

## 快速开始

```bash
git clone <your-repo-url>
cd lottery
npm install
npm run dev
```

- 管理台：http://127.0.0.1:5173
- 大屏：http://127.0.0.1:5173/screen（建议 F11 全屏）
- 移动主持：http://127.0.0.1:5173/host（同 WiFi 下用手机访问）
- API / WebSocket：http://127.0.0.1:3000

生产式单机（先构建前端，再由 Node 托管静态页）：

```bash
npm run build
npm run start -w server
```

浏览器打开 http://127.0.0.1:3000

## 数据文件

SQLite 数据库：`data/lottery.db`（首次启动自动创建）

导入模板：`data/templates/`（管理台名单页可下载 CSV / Excel）

## 导入格式

CSV / Excel 表头任选：

- `工号`, `姓名`, `部门`
- `emp_no`, `name`, `department`

工号在同一活动内唯一；重复导入会更新姓名与部门。

## 抽奖与公平性

- 使用 `crypto.randomInt` 的 Fisher–Yates 洗牌，禁止 `Math.random` 取模抽奖。
- 默认**全局不允许重复中奖**（除非后续为活动/奖项开启 `allow_repeat`）。
- 每轮记录：`pool_snapshot_hash`、`random_seed_hex`、`canonical_payload_json`、`result_hash`、审计链 `audit_logs`。

校验某一伦次完整性：

```bash
npm run audit:verify -w server -- 1
```

## 大屏主持流程

1. 管理台 → **打开大屏**（全屏）
2. **开始滚动**：冻结抽奖池，3D 球体加速
3. **停止并抽奖**：服务端落库，大屏减速约 3.5s 后揭晓
4. **复位 idle**：准备下一奖

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/screen/state` | 大屏状态 |
| WS | `/api/ws` | 实时同步 |
| POST | `/api/screen/start` | 开始滚动 |
| POST | `/api/screen/stop` | 停止并抽奖 |
| POST | `/api/prizes/:id/draw` | 快速抽奖（无动画） |
| GET | `/api/export/results.xlsx` | 导出 |

## 功能概要

### 阶段三（资格 / 审计 / 断点）

- **活动设置**：全员 / 仅签到 / 手动可参与 / 混合；可锁定活动
- **名单**：按模式显示签到 / 可参与勾选；主持可签到
- **角色**：`admin` / `operator` / `host`（请求头 `X-Lottery-Role`，管理台右上角切换）
- **作废重抽**：结果页对有效轮次作废并恢复奖项为 `pending`（须原因 + 二次确认）
- **大屏**：IndexedDB 缓存 + `/api/screen/state` 双通道恢复
- **操作日志**：管理台「操作日志」Tab

### 阶段四（外观 / 音效 / 移动主持 / 压测）

- **活动设置 → 外观与音效**：标题、Logo URL、主色/强调色/背景、音量；大屏点「开启音效」后生效（浏览器策略）
- **主持 PIN**：保存后，`/host` 与移动主持需 PIN（请求头 `X-Host-Pin`）；管理员/操作员控制台免 PIN
- **压测 / 清空测试数据**（勿对正式会库执行）：
  ```bash
  npm run stress:test -w server
  npm run reset:test -w server
  ```

## 发布到 GitHub

1. 在 GitHub 新建空仓库（不要勾选 README，避免冲突）。
2. 在本项目根目录执行（将 URL 换成你的仓库）：

```bash
git init -b main
git add -A
git status   # 确认无 data/*.db、.env、node_modules
git commit -m "Initial commit: annual lottery monorepo"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

3. 生产部署：克隆 → `npm install` → `npm run build` → `npm run start`（或由 `npm run dev` 做彩排）。

可选：添加 [LICENSE](LICENSE)（如 MIT）；敏感环境勿将服务暴露公网，详见操作手册「安全提示」。