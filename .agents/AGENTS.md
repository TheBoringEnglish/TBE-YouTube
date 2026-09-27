# 行为准则与项目规则

## 🛠️ Windows 脚本与编码规范（PowerShell Only Rule）
- **核心铁律**：**所有启动脚本与工具入口严禁使用 `.bat` 批处理文件，全局统一使用 PowerShell 脚本（`.ps1`）！**
- **编码强制要求**：凡是修改或创建包含中文等非 ASCII 字符的 Windows PowerShell 脚本（`.ps1`）文件时，**必须以带有 BOM 的 UTF-8 (UTF-8 with BOM) 编码格式保存**。
- **原因说明**：Windows 默认的 PowerShell 5.1 引擎在解析非 ASCII 字符时，会将没有 BOM 标记的 UTF-8 文件误判为本地 ANSI (GBK) 编码。这会导致所有中文提示词和注释变成乱码，从而导致括号或引号配对损坏，引发解析语法错误而“闪退”。

## 🔗 桌面快捷方式同步规范（Desktop Shortcut Rule）
- **核心铁律**：凡是项目中新增或修改的**所有独立功能入口、启动脚本（`.ps1`）、GUI 程序、看板与核心工具**，必须**同步在用户的桌面工作台目录创建快捷方式（`.lnk`）**：
  - **目标目录**：`C:\Users\norman\Desktop\mywork`
- **执行要求**：
  1. 脚本/工具创建或重构后，主动使用 PowerShell / WScript.Shell 在 `C:\Users\norman\Desktop\mywork` 创建对应快捷方式。
  2. 快捷方式名称应直观明了（如 `TabSaver 标签救星.lnk`、`Kanban.lnk`），工作目录必须正确指向目标文件所在目录。
  3. 执行目标统一使用标准 PowerShell 启动格式（如：`powershell.exe -ExecutionPolicy Bypass -File "目标路径\start.ps1"`），严禁因相对路径错误导致启动闪退。

## 🤖 大模型与翻译调用规范（AI & Translation Engine Rules）
- **核心铁律**：**严禁使用 Qwen 等容易欠费/计费的外部 API！全局一律优先使用 Gemini 代理**。
- **推荐代理地址与配置**：
  - **服务名称**：`#gpt-load`
  - **接入点 (Base URL)**：`http://64.110.114.193:3001/proxy/gemini`
  - **首选模型**：`gemini-3.5-flash-lite`（超快轻量、最经济）或 `gemini-3.5-flash`（高品质）
  - **官方发音模型 (TTS)**：`gemini-3.8-flash-tts`（支持 Callirrhoe 女声与 Schedar 男声等旗舰真人质感音色）
  - **动态最新别名**：`gemini-flash-lite-latest`
  - **鉴权密码 / Key**：`Zhoushan521`
- **行为准则**：在执行字幕翻译、长文本理解、批处理生成等所有 AI 任务时，严格以此配置为最高优先级，杜绝调用未授权的扣费接口。
