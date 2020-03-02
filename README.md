# Moodle Mediasite Proxy

给境内 Moodle Mediasite 用户访问视频加速的本地代理，适用于 Chrome 79+。

## 食用方法
### 准备工作
克隆本仓库。
### 配置浏览器
打开 [Chrome 扩展](chrome://extensions)，选择「加载已解压的扩展程序」，打开仓库的 `chrome` 目录，完成扩展安装。

使用右上角的扩展图标配置要启用的功能，详细说明见下方原理。
### 配置本地代理
运行 mediasite-proxy 代理程序。
### 播放
打开 Moodle 开始播放视频。

## 原理
### i18n 资源本地缓存
i18n 资源是唯一一个拖慢播放器加载的请求，并且由于请求头未正确配置，浏览器缓存常常失效。通过代理这个资源，将本地文件作为响应，播放器本体可以瞬间加载完成。

推荐开启 `Enable i18n resource forwarding`。使用前请确保代理程序目录下存在 `dict.json` 文件。
### 分段并行+超时重试
使用原版播放器时，一个媒体仅占用一个 h2 连接下载，只有在网络质量允许的情况下才能流畅播放。经过观察，通常一个片段包含时长为 6 秒的媒体，意味着必须要在 6 秒内完成请求。考虑到某些众所周知的原因，

1. 理论带宽可以按时完成下载，实际上速度不够；
2. 丢包导致响应卡住。

针对问题 1, 本地代理使用分段并行的方法。例如一个 900 KiB 的响应，使用 HTTP `Range` 请求头将每 200 KiB 被分为一个片段，并发地进行请求。假设原本每个片段需要 9 秒才能全部下载，现在只需 4-5 秒，大大提高了网络利用率。

针对问题 2，本地代理采用了比较激进的超时重试策略，尽可能抵消丢包带来的影响。

同时启用 `Enable manifest forwarding` 和 `Enable media forwarding` 来使这项功能生效。若发现日志出现大量 502 响应，建议将视频向后导航约 6 秒，关闭这两个选项或等待数分钟再试。

## 构建
Chrome 扩展无需编译即可使用。本地代理程序可使用 rust 1.41 stable 工具链编译。

```sh
cargo build
```