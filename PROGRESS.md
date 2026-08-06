# PROGRESS.md — 进度日志

每行格式：`时间 | 任务 | 验证结果 | 下一步`
规则：每个任务一次 commit 前追加一行；红了就记现象原文与判断，等确认。

- 2026-08-06 | 自动化基础设施（verify.sh + AGENTS.md + opencode.json + PROGRESS.md） | verify.sh 全绿：bench.js 40/40、bench.py 40/40、crosscheck 全部一致、smoke 18/18、browser 60 项 0 失败、四锚点确认；反向验证：改错 d_red 期望 → exit 1 变红，改回 → exit 0 变绿 | 3b-3（raman-qubit / hfs 改薄壳），待确认
- 2026-08-06 | ① 修浏览器计数波动：剪贴板断言移出 PASSED（headless 下异步剪贴板时好时坏，授权不解决） | verify.sh 连跑三次全绿且数字完全一致：bench.js 40/40、bench.py 40/40、crosscheck 全部一致、smoke 18/18、browser 59 项 0 失败、四锚点确认 | ② verify.sh 打印 git diff --stat；③④ 记 HANDOFF 待办
