# 比分提醒 Windows 本地版安装说明

本地版会在 Windows 电脑上运行网页和监控服务，默认访问地址为：

`http://localhost:8787`

## 最简单的一键安装

1. 将 ZIP 完整解压到普通文件夹，例如 `D:\match-pulse-local`，不要直接在压缩包中运行。
2. 双击 `ONE-CLICK-INSTALL.bat`。
3. 脚本会自动检查 Node.js、安装依赖、启动服务并打开浏览器。
4. 首次启动后，在网页右上角导入自己的比分 API Key。

如果电脑没有 Node.js，脚本会优先调用 Windows 自带的 `winget` 安装 Node.js LTS。安装期间可能出现一次系统授权提示，请允许。没有 `winget` 的旧系统会自动打开 Node.js 下载页，安装完成后再次双击一键安装文件即可。

如果 Windows SmartScreen 阻止脚本，请确认文件来自本安装包，再选择“更多信息”→“仍要运行”。

## 安装要求

- Windows 10 或 Windows 11（64 位）
- Node.js 20.19 或更高版本（推荐当前 LTS 版本）
- 首次安装依赖时需要联网

Node.js 下载地址：<https://nodejs.org/zh-cn/download>

安装 Node.js 时保持默认选项即可。安装完成后如脚本仍提示找不到 Node.js，请关闭现有窗口后重新打开，或重启电脑一次。

## 手动安装与启动

1. 将 ZIP 完整解压到普通文件夹，例如 `D:\match-pulse-local`，不要直接在压缩包中运行。
2. 双击 `install-windows.bat`，等待依赖检查、测试和构建完成。
3. 双击 `start-windows.bat`。
4. 浏览器会自动打开 `http://localhost:8787`。
5. 需要停止服务时，回到启动服务的命令窗口并按 `Ctrl + C`，再输入 `Y` 确认。

## 配置比分 API

- 不配置 API Key 也能进入演示模式，验证选赛、监控任务和声音提醒流程。
- 使用真实比赛时，在网页右上角打开 API Key 管理，选择平台并导入自己的 Key。
- 安装包已预置服务器现有的球队中文译名缓存，包含自动翻译和页面人工修正结果；本地运行后会继续写入当前电脑的 `data/team-translations.json`。
- API Key、任务和比分缓存会在首次运行后保存到当前电脑的 `data` 文件夹，安装包中不包含这些线上数据。
- 不要将已经运行并含有真实 Key 的整个目录公开分享。

如需通过环境变量配置 API-Football，可将 `.env.example` 复制并改名为 `.env`，然后填写：

```text
API_FOOTBALL_KEY=你的_API_Key
PORT=8787
```

## 本地接口调用

服务启动后，在 PowerShell 中可以调用：

```powershell
# 服务状态
Invoke-RestMethod http://localhost:8787/api/health

# 监控任务
Invoke-RestMethod http://localhost:8787/api/tasks
```

默认建议只在当前电脑使用。其他电脑如需访问，必须另外配置 Windows 防火墙和局域网访问控制，不要直接将 8787 端口暴露到公网。

## 更新或重新安装

新版本建议解压到新的目录，再运行安装脚本。需要保留旧任务和 Key 时，应先停止服务，然后把旧目录中的 `data` 文件夹复制到新目录。不要把 `data` 上传到 Git 或公开分享。
