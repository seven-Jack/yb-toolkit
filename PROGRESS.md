# PROGRESS.md — 进度日志

每行格式：`时间 | 任务 | 验证结果 | 下一步`
规则：每个任务一次 commit 前追加一行；红了就记现象原文与判断，等确认。

- 2026-08-06 | 自动化基础设施（verify.sh + AGENTS.md + opencode.json + PROGRESS.md） | verify.sh 全绿：bench.js 40/40、bench.py 40/40、crosscheck 全部一致、smoke 18/18、browser 60 项 0 失败、四锚点确认；反向验证：改错 d_red 期望 → exit 1 变红，改回 → exit 0 变绿 | 3b-3（raman-qubit / hfs 改薄壳），待确认
- 2026-08-06 | ① 修浏览器计数波动：剪贴板断言移出 PASSED（headless 下异步剪贴板时好时坏，授权不解决） | verify.sh 连跑三次全绿且数字完全一致：bench.js 40/40、bench.py 40/40、crosscheck 全部一致、smoke 18/18、browser 59 项 0 失败、四锚点确认 | ② verify.sh 打印 git diff --stat；③④ 记 HANDOFF 待办
- 2026-08-06 | ② verify.sh 摘要打印 git diff --stat HEAD + 未跟踪新文件清单 | 全绿：bench 40/40、bench.py 40/40、crosscheck 一致、smoke 18/18、browser 59 项 0 失败、四锚点确认；摘要正确显示 scripts/verify.sh +11 | ③④ 记 HANDOFF 待办（CI 复用 verify.sh 缓 / 多人并行不适用）
- 2026-08-06 | ③④ 把「CI 复用 verify.sh（缓）」「多人并行（不适用）」记入 HANDOFF 长期待办 5/6 | 纯文档改动，无需跑测试 | 3b-3：出 raman 独立页功能对照清单 + 独有内容去向方案，等裁决
- 2026-08-06 | 3b-3 第 1 步：raman 独立页改薄壳 + 补1 几何控件（P_laser/w 束腰+椭圆/wx·wy/η/Pmax，照 rabi 模式） | verify.sh 全绿（bench 40/40、bench.py 40/40、crosscheck 一致、smoke 18/18、browser 59 项 0 失败、四锚点确认）；薄壳页验收：placeholder 数据 幅度比 0.993、等效束腰 366.3µm，与主页面模块一致；P_laser ∝P 标度、椭圆 1/(wx·wy) 标度正确 | 3b-3 第 2 步：补2 不确定度滑块 + 补3 功率扫描图
- 2026-08-06 | 3b-3 第 2 步：补2 不确定度滑块（σ_w/σ_P/σ_d/σ_I，进 expu 折叠区，σ_Ω/Ω 传播）+ 补3 功率扫描图（expp，Ω_R vs P，对数/线性轴、不确定度带、×0.5/×2 束腰、功率上限、实测数据叠加、π/2 时间右轴） | verify.sh 全绿；浏览器验证：R-omu 不确定度 9%→29%（σ_w=20%，按 √(σ_P²+2σ_w²+4σ_d²) 传播）、σ_I 5% 使 eIN 1.57e-4→3.92e-3、功率扫描图 c4 55712 不透明像素、无 console error | 3b-3 第 3 步：补4 波片角度输入 + 补5 CSV/复制参数 + 补6 对账表 + 说明搬迁 exp2/exp5/exp6
- 2026-08-06 | 3b-3 第 3 步：补4 λ/4 波片角度输入（pm-s3/pm-qwp 切换，θ/θ₀，S3=|sin2(θ−θ₀)| 存 0..1、θ₀ 写 Store beam.theta0_deg）+ 补5 导出曲线 CSV/复制参数行 + 补6 notebook 对账表（进 exp2）+ 说明搬迁 exp2 数据出处/exp5 物理说明/exp6 更新记录；browser.js 新增 3g 薄壳页闭合断言 | verify.sh 全绿（browser 60 项 0 失败，含「薄壳页功率拟合闭合 0.993/366.3µm」永久回归断言）；qwp 模式 θ→S3/α、对账表数值（d_cyc=0.3121、D-00=0.18022）正确、exp5/exp6 渲染正常；顺带修 qwp 手性符号：S3 按工具约定存 |S3|（0..1）而非负值 | 3b-3 收尾：更新 HANDOFF/README/PROGRESS 计数与待办
- 2026-08-06 | 3b-3 收尾：HANDOFF/README/CHANGELOG 反映 3b-3 完成（raman 薄壳 + v-d 修复 + browser 60 项 + README 待办 #2/#3/#5 勾账） | 纯文档改动；功能已在第 1/2/3 步逐次 verify 全绿 | 3b-3 剩 hfs 未收敛（tools/hfs-matrix-element.html），待确认
- 2026-08-06 | CHANGELOG：三次『测试绿灯但没测到东西』合并成一条模式记录 + push dev（19 个 commit，CI vectors job success、browser skipped 设计如此） | push 成功 5bfbc25..3aabb65；CI vectors 四套全过 | 3b-3 hfs 薄壳，等确认
- 2026-08-06 | 3b-3 hfs 第 1 步：tools/hfs-matrix-element.html 改薄壳 + 模块补超精细约化矩阵元表 ⟨F′‖d‖F⟩（exp1，6j 分解/相对线强）+ loadDB 按页面位置选路径避免无谓 404 | verify.sh 全绿（browser 60 项 0 失败）；超精细表 Yb-171 两行（F′=1/2 −0.441446、F′=3/2 0.624299，相对线强和=2=R1 成立）；薄壳无 console error | 3b-3 hfs 第 2 步：browser 断言 + 收尾文档
