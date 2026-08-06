# AGENTS.md — 常驻工作循环

> 本文件是执行方（opencode 里的 DeepSeek）在本仓库的**工作守则**。
> 物理与验证标准以 `HANDOFF.md` 为准；本文件只写"怎么干活、什么时候停下"。

## 一个任务的完整循环

1. **取任务**：从 `HANDOFF.md` 的「后续待办 / 待办」取下一个任务。
   任务定义、数值锚点、六条硬规则、验证标准都在 `HANDOFF.md`，动手前完整重读相关小节。
2. **实现**：精确的小步编辑。每步之后立即 `node --check`（JS）或 `json.load`（JSON）验证（规则⑤）。
3. **验收**：跑 `bash scripts/verify.sh`。它依次跑五套测试、硬校验四锚点（相对容差 2e-4）、报告工作区状态。
4. **绿 → 提交**：`git commit`（中文信息），在 `PROGRESS.md` 追加一行，回到第 1 步取下一个任务。
   **红 → 停下**：在 `PROGRESS.md` 记录原始现象与你的判断，报告组里，等确认。不许自己放宽标准绕过。

每个任务一次 commit。做完停下报告，等确认再继续。

## 禁令（违反即停下）

- **测试红了不许放宽 rtol/atol，不许改 `tests/vectors.json` 期望值。**
  期望值来自 notebook 或论文原文（规则②），红了是代码错或期望值录错，查根因并报告，不是改标准。
- **同一个失败连续修两次仍不过，第二次就停下报告，不要继续试。**
  继续瞎试只会越改越远，且违反"发现同类问题不止一处"的排查原则。
- **一次 commit 只装一个任务。** 不要顺手夹带别的改动。
- **不用 `python3 -c` / `node -e` / `sed -i` 批量改写文件（规则⑤）。**
  需要跑脚本就落成 `.js` / `.py` 文件再执行（如 `scripts/check-anchors.js`）。
  临时坏数据/坏代码在内存里构造，不碰磁盘。

## 每次 commit 前的三个自问

1. **图表改动：数过不透明像素吗？**（`getImageData` 数 alpha≠0，不能只看无 console error）
2. **计算改动：有物理量闭合验证吗？**（如反推等效束腰 ≈ 设定值、幅度比 ≈ 1）
3. **我这次有没有造成什么问题还没说？** 说出来比悄悄修有价值 —— 同类问题往往不止一处。

## 权限与硬闸门

`opencode.json` 已把高风险文件/命令设为 ask/deny：

- 改 `shared/constants.js`、`shared/physics.js`、`shared/wigner.js`、`tests/vectors.json`、`data/**` → **ask**
- `rm *`、`git reset --hard*`、`python3 -c *`、`node -e *`、`sed -i*` → **deny**（规则⑤的机械化）
- `git push *`、`npm install*` → **ask**

## 汇报格式（PROGRESS.md 每行）

`时间 | 任务 | 验证结果 | 下一步`。红的时候写明现象原文与你的判断。
