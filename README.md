# Tsinghua Newetds Userscript

一个适用于清华大学学位论文服务系统的油猴用户脚本，用于保存当前账户已经获得预览权限的 PDF，并按照“论文题名\_作者.pdf”命名文件。

本项目是对 Chrome 扩展 [**Tsinghua Newetds Downloader**](https://chromewebstore.google.com/detail/tsinghua-newetds-download/bffnnlmenpnmpkhphmjeapeahpkcdnoc) 的用户脚本移植与精简实现，可通过 Tampermonkey 或 Violentmonkey 在 Chrome、Edge、Firefox 等浏览器中使用，无需安装专用 Chrome 扩展。

![](https://lh3.googleusercontent.com/fxuGdkPWdOdqfFGEjEMDHHjtDk1O_ZoGe4CGLYGRNmkz0BWNsnaQ9tkrJ8C_c4lxwbiXEdialpbZWVjg5a3Zdreh=s1600-w1600-h1000)

## 功能

- 在论文摘要页识别论文题名和作者；
- 记录论文信息与 PDF 预览地址之间的对应关系；
- 捕获当前页面已经获得授权并加载的 PDF；
- 在需要时使用网站当前会话提供的临时密钥解密 PDF；
- 按照“论文题名\_作者.pdf”自动命名；
- 支持“询问”“总是保存”和“不保存”三种模式；
- 不包含广告、统计或第三方数据上传功能。

## 安装

使用本脚本前，需要先安装用户脚本管理器：

- [Tampermonkey](https://www.tampermonkey.net/)
- [Violentmonkey](https://violentmonkey.github.io/)

推荐通过 Greasy Fork 安装：

```text
Greasy Fork 脚本地址 占位
```

也可以从 GitHub 安装：

```text
https://raw.githubusercontent.com/Yousa-Mirage/tsinghua-newetds-userscript/main/tsinghua-newetds-downloader.user.js
```

## 使用方法

1. 登录清华大学学位论文服务系统。
2. 打开目标论文的摘要页。
3. 使用网站原有的 PDF 在线预览入口。
4. PDF 加载完成后，脚本会根据当前设置询问是否保存，或直接触发下载。
5. 下载的文件默认命名为：

```text
论文题名_作者.pdf
```

页面左下角会显示下载模式按钮。点击按钮可依次切换：

```text
询问 → 总是保存 → 不保存
```

## 权限与限制

本脚本不会绕过网站的身份认证、访问控制或论文预览权限，只处理当前登录账户已经能够通过网站正常加载的 PDF。

使用者应遵守：

- 清华大学相关信息系统的使用规定；
- 数据库和数字资源的授权协议；
- 论文作者及出版机构的著作权；
- 所在国家或地区适用的法律法规。

请勿将本脚本用于未经授权的批量下载、公开传播或商业用途。

## 项目来源

本项目的功能来源于 Chrome 网上应用店中的扩展 [**Tsinghua Newetds Downloader**](https://chromewebstore.google.com/detail/tsinghua-newetds-download/bffnnlmenpnmpkhphmjeapeahpkcdnoc)。原插件主要以 Chrome 扩展的形式发布（Firefox 版本暂未通过审核），这使它主要面向 Chromium 浏览器，并要求用户额外安装浏览器扩展。对于只需要在特定页面执行下载处理的功能，用户脚本是更轻量、方便的分发方式。

本仓库不是原插件的官方仓库，当前维护者也不是原插件作者。已获得原作者授权改写并发布本脚本项目。

本项目的主要改写包括：

- 将多个扩展脚本合并为单个用户脚本；
- 移除对 `chrome.runtime` 和后台 Service Worker 的依赖；
- 将扩展存储替换为网站域名下的浏览器本地存储；
- 精简设置界面和缓存结构；
- 支持 Tampermonkey 和 Violentmonkey；
- 保留 `fetch`、XMLHttpRequest、PDF 解密和文件命名兼容性；
- 公开代码，便于审查、修复和维护。

## 许可证状态

TODO

## 问题反馈

如遇到问题，请在 [GitHub Issues](https://github.com/Yousa-Mirage/tsinghua-newetds-userscript/issues) 中反馈。
