# 单账户云同步：首次配置

正式同步只连接 **Supabase 云端**。现有 GitHub Pages、原生 JavaScript 和 localStorage 保留，不需要运行本地 PostgreSQL，也不需要安装网站依赖。

## 1. 创建云端账户和数据库

1. 在 Supabase 创建项目，在 **Authentication → Users** 创建一个邮箱/密码用户；确认邮箱后，各电脑使用这一账户登录。关闭公开注册；不要开启限制为一个会话的选项，否则多电脑会互相退出。
2. 在该项目的 **SQL Editor** 执行 [sync.sql](sync.sql)。然后将下面的 UUID 替换为这个 Auth 用户的 UUID，单独执行：

   ```sql
   insert into public.passage_account(user_id)
   values ('YOUR_AUTH_USER_UUID');
   ```

   这张表最多允许一个账户；客户端无权改授权。数据表启用 RLS；客户端只能读取自己的数据，写入只能通过带账户检查和版本校验的 RPC。默认 Supabase Data API 的 `public` schema 应保持可访问。
3. 从项目 API 设置取得项目 URL 和 **publishable key**（`sb_publishable_…`，也兼容旧版 `anon` JWT）。**不要使用 secret key、`service_role`、数据库密码或管理员密钥。**

权限设计参考 [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) 和 [数据库函数权限](https://supabase.com/docs/guides/database/functions)。RPC 使用固定空 `search_path`，每次检查 `auth.uid()` 和唯一授权账户；直接修改表、绕过版本号写入和删除历史均无前端权限。

## 2. 配置 GitHub Pages

在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 添加两个普通 repository variables：

| 名称 | 值 |
| --- | --- |
| `PASSAGE_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `PASSAGE_SUPABASE_PUBLISHABLE_KEY` | 上述公开 publishable key |

现有 Pages workflow 会将公开配置写入 `_site/assets/sync-config.js`。未配置时网站保持本地模式。构建会拒绝管理员密钥。认证采用邮箱/密码，不依赖 OAuth redirect，因此保留 GitHub Pages 的项目子路径即可。

本地预览可参照 [配置示例](../assets/sync-config.example.js) 临时填写 `assets/sync-config.js`，或通过相同环境变量构建；正式发布优先使用 repository variables。示例配置中只放公开键。备份、SQL、文档和测试不会进入 `_site`。

## 3. 必须先用指定备份完成迁移

1. 保留另一台电脑上的完整记录和原始 **`passage-wordbook-2026-10-14.json`**。不要先在空白 Ubuntu 上进行普通 Import，也不要清空另一台电脑的数据。
2. 打开已配置的网站，展开 **Cloud sync**，登录唯一账户。首次数据库为空时，状态为 **Waiting for first migration**，设备不会上传本地空白快照，也不会下载应用数据。
3. 在 **First migration only** 选择仓库现有的 `passage-wordbook-2026-10-14.json`。浏览器和数据库都校验原始文件字节的 SHA-256：

   ```text
   8039b22a5425a868fb8b29340f3a54998548eb28a9fd2b1507d51d13efbc9a2e
   ```

   只有这一份文件能创建第一版快照。请勿重新格式化或另存导致字节变化。它含 **38 个词条、7 个句子、18 条双轨复习历史，以及 3 篇文章的进度**。数据库保留原始备份和第一版快照。
4. 等待上传成功和云端读回验证。若断网或读回失败，Ubuntu 本地不会提前导入；重新联网点击 **Sync now** 即可再次验证并下载。看到 **Synced · … · Version …** 后，检查 Wordbook、Today Review 和文章写作页。
5. 在其他电脑打开同一网站、登录同一账户。已有本地记录先与云端合并；冲突处会要求逐项选择，不能自动取舍。不同 origin（本地预览、GitHub Pages、不同浏览器）的本地记录互不共享，云端账户相同即可同步。

## 日常使用与冲突恢复

- 启动、回到窗口、恢复网络时拉取；修改后约 0.9 秒上传；可见页面每 15 秒检查另一台电脑的更新。关闭页面前尚未上传的修改保存在原 localStorage，下次打开继续同步。此功能不缓存 HTML 供完全断网时首次打开网站；已打开的页面可以离线编辑。
- 每个设备保留“共同基线 + 云端版本”。缺少某个基线条目代表删除，旧设备重连不能把它自动复活。不同词条或不同文章字段自动合并。没有共同基线的新设备如果带有云端不存在的本地记录，会先要求明确选择，防止旧备份把已删除记录自动恢复。
- **同一词条整体作为一个冲突单元**，包括释义、笔记、Recognition/Production 状态与完整历史，避免混合出错误的释义/复习计划。同一写作字段或阅读数组同时修改，也要求选择；不同练习题答案可分别合并。删除与编辑相遇同样暂停。
- 冲突界面展示双方完整内容，`[Deleted]` 表示删除。逐项选择 **This device / Cloud**，点击 **Save selected results**。如果此时另一台电脑又修改了云端，系统重新比较并要求重新选择，旧选择不会套到新版本。
- 冲突双方会先存入本地恢复副本；配额不足就停止同步。**Export recovery copies** 导出包含双方快照的恢复 JSON。该文件用于检查和提取：每份 `copies.*.local` / `cloud` 都是 `{schema, entries, lessonProgress}`，不是普通 Wordbook 备份。需要导回时将 `entries` 转为数组，包装为 `{format:"passage-wordbook",version:3,entries:Object.values(snapshot.entries),lessonProgress:snapshot.lessonProgress}`，再使用现有 Import backup；或直接从副本复制笔记/回答。
- 每个成功写入的完整版本还永久保留在云端 `passage_revisions`。可以在 Supabase SQL Editor 按版本取回 `snapshot`。不要直接覆盖当前表或回滚版本号；先导出待恢复版本并在浏览器内恢复/合并，以正常新版本同步。
- 普通 **Export backup / Import backup** 保持原有行为，兼容 v1/v2/v3；导入不会替代首次迁移。Sign out 保留本地记录、待上传修改和共同基线；下一次仍登录同一账户。
- 本地正在编辑的内容优先保留；网络请求期间又发生修改时重新比较。多标签页使用 Web Locks 串行同步与 token 刷新；学习数据修改沿用原有同步 localStorage 写入。应用多键云端更新有本地事务日志，配额异常或重载中断后回滚重试。

## 验证

先构建并启动 README 中的本地 HTTP server，再运行（浏览器脚本沿用项目的 `PLAYWRIGHT_MODULE` / `CHROME_PATH` / `PASSAGE_TEST_URL` 配置）：

```sh
node scripts/build-site.mjs
node scripts/verify-learning.cjs
node scripts/verify-learning-fixes.cjs
node scripts/verify-sync-merge.cjs
node scripts/verify-cloud-sync.cjs
node scripts/verify-learning-browser.cjs --focused
node scripts/verify-sync-sql.cjs
```

最后一项需要 Docker 和 `postgres:15-alpine` 镜像，在**一次性、无卷挂载、无端口映射**的独立容器内实际执行 SQL、RLS 和并发测试，完成后删除容器。它只用于开发验证，网站不会连接这个容器或任何本地数据库。

浏览器同步测试使用真实网站脚本和两个隔离浏览器，并模拟 Supabase HTTP 响应；数据库测试实际执行 SQL。**实际 Supabase Auth、云端 Data API 和 GitHub Pages 联调需要完成上面的外部项目配置后验收**：先备份迁移并等待读回成功，再在两台电脑分别新增不同笔记、离线修改后重连，并对同一词条同时修改，检查冲突界面和恢复副本。
