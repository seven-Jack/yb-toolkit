# PROGRESS.md — 进度日志

每行格式：`时间 | 任务 | 验证结果 | 下一步`
规则：每个任务一次 commit 前追加一行；红了就记现象原文与判断，等确认。

- 2026-08-06 | 自动化基础设施（verify.sh + AGENTS.md + opencode.json + PROGRESS.md） | verify.sh 全绿：bench.js 40/40、bench.py 40/40、crosscheck 全部一致、smoke 18/18、browser 60 项 0 失败、四锚点确认；反向验证：改错 d_red 期望 → exit 1 变红，改回 → exit 0 变绿 | 3b-3（raman-qubit / hfs 改薄壳），待确认
- 2026-08-06 | ① 修浏览器计数波动：剪贴板断言移出 PASSED（headless 下异步剪贴板时好时坏，授权不解决） | verify.sh 连跑三次全绿且数字完全一致：bench.js 40/40、bench.py 40/40、crosscheck 全部一致、smoke 18/18、browser 59 项 0 失败、四锚点确认 | ② verify.sh 打印 git diff --stat；③④ 记 HANDOFF 待办
- 2026-08-06 | ② verify.sh 摘要打印 git diff --stat HEAD + 未跟踪新文件清单 | 全绿：bench 40/40、bench.py 40/40、crosscheck 一致、smoke 18/18、browser 59 项 0 失败、四锚点确认；摘要正确显示 scripts/verify.sh +11 | ③④ 记 HANDOFF 待办（CI 复用 verify.sh 缓 / 多人并行不适用）
- 2026-08-06 | ③④ 把「CI 复用 verify.sh（缓）」「多人并行（不适用）」记入 HANDOFF 长期待办 5/6 | 纯文档改动，无需跑测试 | 3b-3：出 raman 独立页功能对照清单 + 独有内容去向方案，等裁决
- 2026-08-06 | 3b-3 第 1 步：raman 独立页改薄壳 + 补1 几何控件（P_laser/w 束腰+椭圆/wx·wy/η/Pmax，照 rabi 模式） | verify.sh 全绿（bench 40/40、bench.py 40/40、crosscheck 一致、smoke 18/18、browser 59 项 0 失败、四锚点确认）；薄壳页验收：placeholder 数据 幅度比 0.993、等效束腰 366.3µm，与主页面模块一致；P_laser ∝P 标度、椭圆 1/(wx·wy) 标度正确 | 3b-3 第 2 步：补2 不确定度滑块 + 补3 功率扫描图
