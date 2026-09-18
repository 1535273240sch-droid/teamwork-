# Teamwork for ZCode

**给 ZCode 用的多智能体协作框架**——先访谈定范围，再派一支八个角色的队伍，用文件独占锁避免互相踩踏，用互相独立的验证角色逼出真话。

不是"多开几个 agent 跑得快一点"。它要解决的是一个具体问题：**单个 agent 会同意自己早期的错误，然后信心十足地往上盖。** Teamwork 的结构就是冲着这个来的——每个里程碑都必须由**没有参与实现它的** agent 来验证。

---

## 目录

- [它是什么](#它是什么)
- [为什么需要它](#为什么需要它)
- [仓库结构](#仓库结构)
- [环境要求](#环境要求)
- [安装](#安装)
- [安装后验证](#安装后验证)
- [使用流程](#使用流程)
- [八个角色](#八个角色)
- [五种编排形态](#五种编排形态)
- [三种完整性模式](#三种完整性模式)
- [文件独占锁](#文件独占锁)
- [宪章字段说明](#宪章字段说明)
- [成本](#成本)
- [已知限制](#已知限制)
- [排错](#排错)
- [设计说明](#设计说明)
- [开发与测试](#开发与测试)
- [许可](#许可)

---

## 它是什么

一个 **ZCode 插件**，通过 **marketplace** 分发。

它给 ZCode 补上三样东西：

| 补什么 | 靠什么 |
|---|---|
| **开工前把目标定死** | Phase 1 访谈 skill + `/teamwork` 命令 |
| **角色分工 + 独立验证** | 8 个自定义 subagent |
| **并行时不互相踩踏** | `PreToolUse` 钩子实现的文件独占锁 |

**验证循环本身没有重写**——那是 ZCode 自带的 **Goal Mode** 干的活，比用 `Stop` 钩子硬凑要可靠。见[设计说明](#设计说明)。

---

## 为什么需要它

单 agent 干大活儿的典型失败长这样：

```
说"做完了" → 你问"验证了吗" → "验证了" → 你实际一跑 → 挂了
```

根因不是模型不诚实，是**结构问题**：让写代码的那个 agent 去检查自己写的代码，等于同一份判断重复两遍。它会用同一套（错误的）假设看第二遍，然后确认没问题。

Teamwork 的结构强制把"做"和"验"分开，而且把"验"再拆成四种不同的问法：

- **Critic** 问：这代码写错了吗？
- **Challenger** 问：这个前提本身成立吗？
- **Auditor** 问：这个证据是真的吗？我自己复现一遍。
- **Success Auditor** 问：当初要的东西，真的做到了吗？

**规则就一条：一个里程碑，在没参与实现它的 agent 验证之前，不算完成。**

---

## 仓库结构

```
.
├── marketplace.json              ← 市场清单（ZCode 从这里读）
├── package.json
├── LICENSE
├── README.md
├── tests/                        ← 131 项自动化校验
│   ├── frontmatter.test.mjs
│   └── hooks.test.mjs
└── plugins/teamwork/             ← 插件本体
    ├── .zcode-plugin/plugin.json ← 插件清单
    ├── agents/                   ← 八个角色
    │   ├── sentinel.md
    │   ├── orchestrator.md
    │   ├── explorer.md
    │   ├── worker.md
    │   ├── critic.md
    │   ├── challenger.md
    │   ├── auditor.md
    │   └── success-auditor.md
    ├── hooks/
    │   ├── hooks.json            ← 钩子注册（自动发现，勿在清单重复声明）
    │   ├── ownership-lock.mjs    ← 文件独占锁
    │   └── session-context.mjs   ← 会话启动时注入宪章
    ├── skills/teamwork/SKILL.md  ← Phase 1：Specify What, Not How
    └── commands/teamwork.md      ← /teamwork <目标>
```

---

## 环境要求

- **ZCode**（Z.ai）桌面版，需要一个已打开的 workspace 才能管理插件
- **Node.js ≥ 18**（钩子脚本用 node 跑；`node` 必须在 PATH 上）
- 仅用 Node 内置模块，**无需 `npm install`**

---

## 安装

### 方式一：本地目录（推荐先这样试）

1. 在 ZCode 里**打开任意一个项目**（不开 workspace 的话，插件页会提示 `Open a workspace to manage plugins`）
2. **Settings → Plugins → 右上角 Create → Add marketplace**
3. 填这个目录的路径（也可以直接把文件夹拖进去）：
   ```
   <你克隆下来的路径>/zcode-teamwork
   ```
4. 在 **Personal** 分区里找到 `teamwork` → **Install** → 打开开关

> 本地目录**不需要联网**。ZCode 那个公共插件目录才是从 GitHub 拉的，网络不通不影响你。

### 方式二：GitHub marketplace

1. 把本仓库推到 GitHub
2. **Settings → Plugins → Create → Add marketplace**，填 `你的用户名/仓库名`
3. 同上，Install 并启用

### ⚠️ 装完必须开新会话

**这是最容易踩的坑。** ZCode 的钩子配置是**会话启动时快照**的，当前开着的会话不会热加载。改配置、开关插件之后，都要**开新会话**才生效。

---

## 安装后验证

三个地方核对：

**1. Settings → Plugins → 点 teamwork**
应列出：8 个 agents、1 个 skill、1 个 command、1 个 hook。

**2. Settings → Subagents**
应出现 **Plugin subagents** 分组，里面有 `sentinel` / `orchestrator` / `worker` / `critic` / `challenger` / `auditor` / `success-auditor` / `explorer`。

**3. Settings → Hooks**
应出现一条**只读**条目：`PreToolUse`，matcher `Write|Edit`，来源指向插件目录。

三条都对了，就装好了。

---

## 使用流程

### 第 1 步：起一个 campaign

```
/teamwork 把 utils 里的日期解析函数补一组边界测试
```

### 第 2 步：回答访谈

它进入 **Phase 1（Specify What, Not How）**，一次问完五个议题：

| 议题 | 要问到什么程度 |
|---|---|
| **Scope & Objectives** | 达成什么**结果**，不是做什么**动作**。要可检查 |
| **Requirements** | 约束，以及**明确不做什么** |
| **Independent Verification** | 谁验、用什么命令、跟什么比 |
| **Acceptance Criteria** | 逐条可检查，每条绑一份证据 |
| **Project Working Directory** | 绝对路径 |

**这一步别糊弄。** 访谈问得越具体，后面烧的钱越少。特别是第 3 条——如果你答"跑一下测试"，等于没有验证标准，后面四个验证角色全部无从下手。

### 第 3 步：它会推荐模式，然后等你批准

它会推荐一个 **integrity mode**（默认 `development`）和一个 **pattern**（五种编排形态之一），把宪章写到目标项目的 `.teamwork/campaign.json`，**然后停下来**。

**在你批准之前它不会派任何 agent。**

### 第 4 步：批准之后

1. **Sentinel** 先审宪章，返回 `CLEARED` 或 `BLOCKED`
   - **BLOCKED 就是真卡住了**，它会列出缺什么。在起点被拦下来，比跑三小时才发现目标没定义便宜得多
2. **Orchestrator** 拆里程碑 + 出依赖图 + **分配文件所有权表**
3. 它把目标设成 `/goal`，之后 ZCode **每轮自动验证、自动继续**，你不用再打 "continue"
4. Worker 开工；写文件撞车会被独占锁拦下

### 第 5 步：收尾

**Success Auditor** 对着**最初的宪章**（不是里程碑列表）做终审，判断该做的到底做没做，专门防"指标漂移"——优化了可测的那个东西，而原目标悄悄溜走。

### 顺手做一件事

在**跑 campaign 的那个项目**里，把 `.teamwork/` 加进 `.gitignore`：

```gitignore
.teamwork/
```

那是运行时状态，不该提交。（本仓库的 `.gitignore` 管不到你的目标项目。）

---

## 八个角色

| 角色 | 职责 | 工具权限 |
|---|---|---|
| **sentinel** | 起点关卡。审宪章，返回 CLEARED / BLOCKED。强制完整性模式 | 只读 |
| **orchestrator** | 拆里程碑、出依赖图、分配文件所有权。**不写代码** | 只读 |
| **explorer** | 只读调研。报告必须带可独立核对的行号证据 | 只读 |
| **worker** | 在自己的文件范围内实现一个里程碑 | 读写 + 命令 |
| **critic** | 找**实现**的缺陷：边界、错误路径、静默错误 | 只读 + 命令 |
| **challenger** | 攻击**前提**：度量、基线、因果故事 | 只读 + 命令 |
| **auditor** | 从干净状态**独立复现**证据，不信报告 | 只读 + 命令 |
| **success-auditor** | 终审：宪章定义的"完成"真的达到了吗 | 只读 + 命令 |

### 四个验证角色的区别（这是本项目的核心）

它们问的是四个不同的问题，少一个都会漏：

- **Critic** — *这段代码错了吗？* 边界输入、异常路径、资源泄漏、被吞掉的失败
- **Challenger** — *这个前提成立吗？* 度量的东西是那个东西吗？什么证据能推翻它？基线公平吗？事后参数？
- **Auditor** — *这个证据是真的吗？* 从干净状态重跑一遍，数字对不对得上，**而且这个检查在东西坏掉时会不会真的失败**
- **Success Auditor** — *该做的做了吗？* 有没有把可测的当成了目标

**让建东西的人去验自己建的东西，不是验证，是同一份判断的第二遍。**

---

## 五种编排形态

`/teamwork` 会推荐一种，也可以自己指定。

| 形态 | 什么时候用 | 流水线 |
|---|---|---|
| **Iterative Coding** | 拆不开的活儿——一个算法、一个参数互相影响的模拟 | Implement → Critic → 打磨 → Auditor |
| **Distributed Coding** | 能干净拆成独立工作流的活儿 | Orchestrator → 并行 Worker → Critic → Auditor |
| **Long Proof** | 有死胡同的开放问题——猜想、策略搜索、新设计 | Explorer → Challenger（证伪）→ Worker → Auditor |
| **Self-Verification** | 每一步都要验、不能只在最后验的声明 | Worker → Auditor，逐里程碑循环 |
| **Document Review** | 分析一堆材料而不是代码 | Explorer → Critic → 综合 → Auditor |

**对拆解要诚实。** 如果各部分耦合得紧，选 Distributed Coding 买来的是冲突，不是速度。

---

## 三种完整性模式

在 Phase 1 选定，写进宪章，全程生效。

| 模式 | 含义 |
|---|---|
| **development** | 默认。快速迭代。允许走捷径，但必须记录 |
| **demo** | 别人必须能从干净状态独立复现，不用你帮忙 |
| **benchmark** | 最严。**只准用语言标准库**。不许生成 fixture，不许在看到结果之后才写期望值，不许写只断言当前行为的测试 |

选了 `benchmark`，Success Auditor 会专门去找指标造假——**一份诚实报告的"部分达成"，比一份造假的"完整达成"有价值得多。**

---

## 文件独占锁

`hooks/ownership-lock.mjs` 挂在 `PreToolUse`（`Write|Edit`）上，当一个 Worker 要写**正被另一个 Worker 持有**的文件时，直接 deny。

这是 Teamwork 的核心不变量：**同一时刻，两个 Worker 绝不同时碰一个文件。**

### 两个刻意的设计决定

**1. 它有开关。**
只在目标项目里存在 `.teamwork/campaign.json` 时才生效。没有这道门，这个钩子会去管你**每一个项目里的每一次普通编辑**——那是灾难。

想临时关掉？删掉 `campaign.json` 就回到正常 ZCode。

**2. 它是租约，不是硬锁。**
认领超过 `ownership_lease_minutes`（默认 10 分钟）无活动就过期，可以被别的 Worker 回收。否则一个崩掉的 Worker 会把整个 campaign 永久死锁。

### ⚠️ 一个你必须知道的限制

持有者身份是**尽力识别**的，优先级如下：

```
$TEAMWORK_OWNER_TOKEN  →  agent_id / agent_type  →  transcript_path 哈希  →  session_id
```

**问题在于：ZCode 的钩子文档没有记载 `PreToolUse` 载荷里存在 per-subagent 标识符。** 如果确实没有，独占锁会退化成**会话内先到先得**——它**仍然能防止两个 Worker 交错写同一个文件**（这正是要保证的），但**没法把某次认领归属到具名的 Worker**。

需要精确归属的话，两个办法：

- 给每个 worker 设 `TEAMWORK_OWNER_TOKEN` 环境变量
- 或者在编排流程里加一步显式认领

---

## 宪章字段说明

Phase 1 结束时会写到 `<目标项目>/.teamwork/campaign.json`：

```json
{
  "objective": "一句话，可检查",
  "integrity_mode": "development | demo | benchmark",
  "pattern": "iterative-coding | distributed-coding | long-proof | self-verification | document-review",
  "working_directory": "/绝对路径",
  "requirements": ["约束"],
  "out_of_scope": ["明确排除的"],
  "verification_method": "证明结果的命令或产物，以及由谁执行",
  "acceptance_criteria": ["逐条可独立检查"],
  "ownership_lease_minutes": 10,
  "approved": false,
  "phase": "scoping"
}
```

其中三个字段会被钩子实际读取：

| 字段 | 谁读 | 作用 |
|---|---|---|
| `ownership_lease_minutes` | `ownership-lock.mjs` | 认领过期时间 |
| `integrity_mode` | `session-context.mjs` | 会话启动时注入模式约束 |
| `objective` / `acceptance_criteria` | `session-context.mjs` | 会话启动时注入宪章，防止跑偏 |

---

## 成本

**这东西又贵又慢，这是它的设计属性，不是缺陷。**

什么时候值：

- 活儿够大（跨多文件、跨小时）
- 验证确实独立
- **答错的代价很高**

什么时候不值：

- 小改动、单文件修复
- 你要的是可预测的单任务成本

参考量级：Google 那个 93 个 subagent"从零造操作系统"的演示，**大约 26 亿 token**。把那当上限的形状看，别当模板。

**跑之前先设预算。** 目标定清楚、验收标准写到能验，是最有效的省钱手段——它避免的是"跑三小时才发现目标没定义"。

---

## 已知限制

| 限制 | 说明 |
|---|---|
| **子 agent 不能再开子 agent** | ZCode 不把 Agent/Task 工具给 subagent。所以 Sentinel → Orchestrator → Workers 这棵树是**拍平**的：主 agent 当编排层，所有角色都是叶子。真嵌套得靠进程级（ZCode CLI `--print`） |
| **项目级钩子不执行** | `<workspace>/.zcode/config.json` 里的 hooks 被 ZCode 当前运行时**整体忽略**。这正是本项目必须以插件形式分发的原因 |
| **`model` / `thoughtLevel` 故意留空** | ZCode 的 `thoughtLevel` 必须和具体 `model` 一起写才生效，而且**对未知键静默忽略**——写错就是无声失效。所以默认继承会话模型。要钉模型：先去模型选择器确认合法 id，然后**两个键一起加** |
| **自定义 subagent 仍是 Beta** | `~/.zcode/agents/` 目前仅支持 user 级 |
| **所有权归属是尽力而为** | 见[文件独占锁](#文件独占锁)那一节 |
| **没有 SessionEnd 事件** | ZCode 不提供，所以租约靠超时回收，不靠会话结束释放 |

---

## 排错

**`/teamwork` 敲下去没反应**
→ 检查命令是否注册：Settings → Plugins → teamwork 详情里应有 commands。也可能是你在**旧会话**里敲的，**开个新会话**。

**Settings → Subagents 里看不到那 8 个角色**
→ 插件没启用，或者没开新会话。

**Settings → Hooks 里没有那条 PreToolUse**
→ 同上。另外确认 `node` 在 PATH 上：`node --version`。

**编辑文件没有被独占锁拦截**
→ 这是正常的，除非目标项目里有 `.teamwork/campaign.json`。钩子在无 campaign 时**完全空转**。

**钩子报错 / 不触发**
→ 看日志：`~/.zcode/cli/log/zcode-<日期>.jsonl`。钩子执行失败会记 `hook.run.failed`；项目级配置被忽略会记 `config_project_hooks_ignored`。

**改了插件后不生效**
→ 钩子配置是会话启动时快照的。**开新会话。** 从本地目录装的，还要在 Marketplace sources 面板里刷新该 marketplace。

**想知道插件的结构对不对**
→ 跑 `npm test`（见下）。

---

## 设计说明

### 灵感来源与对照

本项目复刻的是 Google Antigravity 的 **Teamwork**（`/teamwork-preview`）的编排结构：两阶段流程（先访谈后执行）、八角色分工、文件独占所有权、三种完整性模式、五种编排形态。

**一个重要的对照：** Antigravity 至今被用户批评为**黑盒**（官方 issue #301：跑起来只提示"后台任务已启动"，看不到每个 agent 在干嘛）。而 **ZCode 的 Goal Mode 已经有按轮次分组的迭代清单面板了**——观测性这块不用自己造。

### 为什么验证循环交给 Goal Mode

Goal Mode 已经提供了：

- 每轮结束自动验证目标是否达成，未达成自动开下一轮
- **只认真实证据**（改动的文件、命令输出、测试结果），不认计划、清单、听起来很笃定的总结
- 目标状态下跨会话持久化
- 到达用量预算自动停
- 每轮迭代清单面板

自己用 `Stop` 钩子重写这套，上限是**连续 3 次**，而且丢掉面板。不划算。

**代价要说清楚**：这样产物就依赖 ZCode 的 Goal Mode，搬到别家会降级。这是当初明确选的取舍。

### 为什么配置和协议文件强制纯 ASCII

Markdown 里用破折号箭头没问题（模型按 UTF-8 读）。但 **JSON 配置和钩子 stdout 是协议路径**，跨编码边界进 ZCode 运行时。开发过程中实际踩到：一个 `—` 在 GBK 环境下会吃掉后续引号，**直接破坏 JSON**。所以这三类文件由测试强制纯 ASCII。

---

## 开发与测试

```bash
npm test                # 全部
npm run test:frontmatter  # 只测结构
npm run test:hooks        # 只测钩子行为
```

**131 项校验**，分两组：

### `tests/frontmatter.test.mjs` — 105 项结构校验

ZCode **会静默忽略无法识别的 frontmatter 键**，所以一个拼写错误不会报错，只会悄悄失效。这组测试断言：

- 每个角色的必填键齐全（`name` / `description`）
- **没有未知键**
- **工具名全是 ZCode 的**（`Read` / `Edit`），不是别家的（`read_file` / `shell_command`）——后者会静默地什么都拿不到
- `thoughtLevel` 没有脱离 `model` 单独出现（那样会被静默忽略）
- 角色名不与 ZCode 内置的 `general-purpose` / `explore` 冲突
- 清单里 `marketplace.json` 的版本号与 `plugin.json` 一致（**版本号不一致会导致不推送更新**）
- 配置与协议文件纯 ASCII

### `tests/hooks.test.mjs` — 26 项行为校验

真起 node 子进程，喂符合 ZCode 文档契约的 JSON 到 stdin，断言 stdout 协议与磁盘上的租约文件：

- 无 campaign 时**完全空转**（不干扰日常使用）
- 首次认领放行并落盘
- **冲突时正确 deny，且错误信息点出文件和持有者**
- 同持有者重复写放行
- 不同文件互不影响（并行 Worker 不受干扰）
- **租约过期可回收**（崩掉的 Worker 不会死锁）
- **畸形 stdin 绝不阻塞工具调用**（记账永远不能成为工具调用失败的理由）

---

## 许可

MIT，见 [LICENSE](LICENSE)。
