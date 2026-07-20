# EchoMusic 酷狗奖励助手

面向 EchoMusic `>=2.2.8-beta.7` 的酷狗概念 VIP 奖励插件。当前版本把“每日奖励领取”“听歌上报”“广告奖励”分开表达，并使用 EchoMusic 官方播放器事件自动触发。

## 重要说明：为什么把“签到”改成“每日奖励领取”

这个活动接口并不是传统的打卡签到：

| 界面名称 | 实际动作 | 接口 | 触发时机 |
| --- | --- | --- | --- |
| 每日奖励领取 | 领取一天概念 VIP | `/youth/v1/recharge/receive_vip_listen_song` | 每个自然日启动时补领一次 |
| 听歌奖励 | 上报一首自然播放完成的歌曲 | `/youth/v2/report/listen_song` | 播放器官方 `onEnded` 事件 |
| 广告奖励 | 上报广告播放并领取奖励 | `/youth/v1/ad/play_report` | 启动时补领当天未完成次数 |
| VIP 查询 | 查询概念 VIP 到期时间 | `/v1/get_union_vip` | 手动点击 |

“每日奖励领取”是为了避免把两个语义不同的动作都叫作“签到”。服务端返回“今日已领取”时会显示为已完成，不会重复增加奖励。

## 自动模式

插件激活后会等待 EchoMusic 登录态就绪，然后读取每日账本：

1. 只执行今天尚未完成的每日奖励领取和广告奖励。
2. 广告默认最多 `8` 次，每次间隔 `30` 秒，界面显示进度和当前状态。
3. 广告任务可以点击“停止全部任务”，已完成次数会保留，下次可以继续。
4. 用户自然听完歌曲后自动上报听歌奖励；同一播放会话不会重复上报。
5. 每日听歌奖励已经成功或服务端确认已领取后，当天后续歌曲不会重复提交。
6. 插件重载、重开设置页面和重复启动不会重复执行已经完成的项目。

如果没有读取到登录态，插件会提示先登录，不会使用默认账号或伪造歌曲上报。

## 功能操作

| 操作 | 说明 |
| --- | --- |
| 补领今日未完成 | 只执行当前日期尚未完成的自动任务 |
| 每日奖励领取 | 手动调用领取一天概念 VIP 的接口 |
| 听歌奖励 | 使用当前歌曲或手动 MixSongID 上报一次 |
| 广告奖励 | 手动执行广告奖励循环，可停止 |
| 查询 VIP | 查询概念 VIP 到期时间 |

## 设置项

- **启动时补领每日奖励**：登录态就绪后，每个自然日检查一次。
- **启动时补领广告奖励**：补领当天尚未完成的广告次数。
- **听完歌曲自动上报**：只监听 EchoMusic 官方播放器 `ctx.events.onEnded`。
- **手动 MixSongID**：可留空，优先使用当前播放器歌曲；无法可信识别时不会静默使用固定歌曲 ID。
- **广告次数 / 间隔秒数**：默认 `8` 次、`30` 秒，范围分别为 `1-8` 和 `5-120`。
- **请求超时**：默认 `20` 秒，范围 `5-120` 秒。

## 稳定性改进

- 接入 `ctx.player`、`ctx.events.onTrackChange`、`ctx.events.onEnded` 和 `ctx.events.onPlaybackChange`。
- 使用插件 activate/deactivate 生命周期清理事件监听、定时器和正在执行的请求。
- 请求每次重试都会重新生成 clienttime、签名和 URL。
- 所有请求支持超时、取消和有限重试。
- 服务端错误统一归一化为成功、今日已领取、次数用尽、失败、已停止。
- 每日账本带 schema 版本，可从旧版配置迁移。
- 日志改为结构化记录，设置、账本和诊断信息不会保存 token、userid 或 dfid。

## 安装

### 方式一：通过在线插件源安装（推荐）

本仓库根目录已经提供 EchoMusic 识别的 `echo-plugins.json` 索引，因此不需要安装 Node.js、npm 或额外依赖，也不需要手动复制文件。

1. 打开 EchoMusic，进入 **插件管理 → 在线插件**。
2. 点击右上角的 **管理插件源**（插件源图标，通常在刷新按钮旁边）。
3. 在“插件源”对话框的仓库地址中填写：

   `https://github.com/DeH40/echomusic-kugou-reward`

4. 点击 **添加**。EchoMusic 会读取仓库根目录的 `echo-plugins.json`，然后同步插件清单。
5. 在在线插件列表找到 **EchoMusic 酷狗奖励**，点击 **安装**。
6. 切换到 **已安装**，启用插件；首次使用前请先在 EchoMusic 中登录酷狗账号。
7. 打开插件设置，根据需要开启自动化开关：启动时补领每日奖励、启动时补领广告奖励、听完歌曲自动上报。

如果添加后没有立即出现插件，请在在线插件页面点击刷新。仓库地址要填写仓库主页地址，不要填写 `.../tree/main`、某个文件地址，也不要填写本机路径。

仓库索引也可以直接查看：[echo-plugins.json](echo-plugins.json)。EchoMusic 会先读取索引中的 `path`、`repo`，再读取对应位置的 `manifest.json`；本插件的清单和 `index.js` 位于仓库根目录，所以索引中的 `path` 为空字符串。

### 方式二：手动安装

从 GitHub 下载本仓库 ZIP 并解压，将包含 `manifest.json` 和 `index.js` 的插件文件夹放入 EchoMusic 的插件目录，然后在 **插件管理** 中刷新并启用。插件不需要执行 `npm install`。

放置后应当是下面这种结构，避免多套一层目录：

```text
EchoMusic 插件目录/
└── echomusic-kugou-reward/
    ├── index.js
    ├── manifest.json
    └── README.md
```

### 给插件源维护者的索引格式

如果你要把自己的多个插件放在同一个 GitHub 仓库中，在仓库根目录创建 `echo-plugins.json`，至少包含 `plugins` 数组；每项的 `path` 指向该插件目录，`repo` 用于引用其他仓库：

```json
{
  "name": "我的 EchoMusic 插件源",
  "homepage": "https://github.com/owner/repo",
  "plugins": [
    {
      "id": "my-plugin",
      "path": "my-plugin",
      "homepage": "https://github.com/owner/repo/tree/main/my-plugin",
      "tags": ["工具"]
    },
    {
      "id": "another-plugin",
      "path": "",
      "repo": "https://github.com/another-owner/another-plugin",
      "homepage": "https://github.com/another-owner/another-plugin"
    }
  ]
}
```

每个 `path` 或 `repo` 指向的位置都必须能读取到有效的 `manifest.json`，且清单中的 `id`、`name`、`version`、`main` 必须完整。提交前可用 `node -e "JSON.parse(require('fs').readFileSync('echo-plugins.json', 'utf8')); console.log('echo-plugins.json OK')"` 检查 JSON 格式。

### 常见问题

- **提示“未找到可用插件”**：确认仓库是公开的，且 `echo-plugins.json` 位于仓库根目录；确认索引中的 `path` 没有多写一层目录。
- **列表能看到但安装失败**：确认对应目录下存在 `manifest.json`，并且 `manifest.json` 中的 `main` 文件确实存在。
- **显示旧版本**：在在线插件页点击刷新，必要时重启 EchoMusic；版本号来自插件目录中的 `manifest.json`。
- **没有自动执行**：先确认插件已启用、EchoMusic 已登录酷狗，再到插件设置检查三个自动化开关。广告任务运行时可以点击“停止全部任务”。
- **不想使用在线源**：使用上面的手动安装方式即可，整个插件没有 npm 依赖。

## 参考项目

本插件的 EchoMusic 插件接入方式和在线插件源索引格式参考了以下项目：

- [EchoMusic](https://github.com/hoowhoami/EchoMusic)：参考官方插件运行时提供的播放器事件、插件激活/卸载生命周期以及插件管理流程。
- [EchoMusicPlugins](https://github.com/hoowhoami/EchoMusicPlugins)：参考官方 `echo-plugins.json` 的仓库索引结构、`path` / `repo` 用法和插件清单组织方式。
- [EchoMusicPlugins 的 echo-plugins.json](https://raw.githubusercontent.com/hoowhoami/EchoMusicPlugins/HEAD/echo-plugins.json)：可直接查看官方插件源当前使用的索引示例。
- [develop202/kgcheckin](https://github.com/develop202/kgcheckin)：酷狗概念 VIP 奖励流程的上游参考项目，参考了听歌奖励上报、每日 VIP 领取、广告播放上报、VIP 状态查询，以及相关请求参数和返回码处理。

本插件是在上述公开项目和 EchoMusic 插件接口基础上的改造版本；请求网关、任务账本、生命周期接入、界面和自动化控制由本项目重新适配实现。

## 开发与测试

```bash
npm test
```

测试覆盖每日账本迁移、错误码归一化、MixSongID 识别、播放会话去重、看板统计和请求签名。

## 版本记录

### 0.5.0

- 修正“签到 / 听歌奖励”命名和接口语义。
- 接入 EchoMusic 官方播放器事件与插件卸载生命周期。
- 新增请求网关：每次重签、超时、取消、重试和结果归一化。
- 新增版本化每日账本与任务状态机，启动时只补领未完成项目。
- 重做今日任务看板，显示任务状态、广告进度、登录态、当前歌曲和诊断信息。
- 增加纯逻辑测试、结构化日志和兼容性诊断。

### 0.4.0

- 自动触发模式改为打开时执行签到 + 广告签到，歌曲播放完成后执行听歌奖励。
- 增加停止广告按钮。
- 同时支持 HTML audio `ended` 事件和 Pinia 播放状态兜底。
- 重做插件界面。

## 说明与免责

本插件仅调用官方活动相关接口，供学习研究。请遵守当地法律法规与酷狗服务条款，勿用于商业或违法用途。音乐平台不易，请支持正版。
