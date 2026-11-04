# Tsinghua Newetds Userscript

适用于清华大学学位论文服务系统的油猴脚本，用于下载当前账户已经获得预览权限的 PDF，并按照“论文题名_作者.pdf”命名文件。

本项目是对 Chrome 扩展 [**Tsinghua Newetds Downloader**](https://chromewebstore.google.com/detail/tsinghua-newetds-download/bffnnlmenpnmpkhphmjeapeahpkcdnoc) 的脚本移植与精简，可通过 Tampermonkey 或 Violentmonkey 在 Chrome、Edge、Firefox 等多种浏览器中使用。

![](https://lh3.googleusercontent.com/fxuGdkPWdOdqfFGEjEMDHHjtDk1O_ZoGe4CGLYGRNmkz0BWNsnaQ9tkrJ8C_c4lxwbiXEdialpbZWVjg5a3Zdreh=s1600-w1600-h1000)

## 安装

使用本脚本前，需要先安装浏览器插件：

- [Tampermonkey（篡改猴）](https://www.tampermonkey.net/)

安装篡改猴插件后，[通过 Greasy Fork 安装](https://greasyfork.org/zh-CN/scripts/588207-tsinghua-newetds-userscript)本脚本。

## 使用方法

1. 登录清华大学学位论文服务系统。
2. 打开目标论文的摘要页。
3. 点击“在线预览”旁的蓝色“下载为 PDF”按钮，即可直接保存；如果有多个文件，先在出现的选择框中选择文件，再点击下载。
4. 也可以使用网站原有的在线预览入口，PDF 预览页右下角同样提供“下载为 PDF”按钮，PDF 准备好后即可使用。
5. 下载的文件默认命名为 `论文题名_作者.pdf`。脚本不会自动下载、弹窗询问或记录下载偏好。

## 工作流程

- 在论文摘要页识别论文题名和作者；
- 记录论文信息与 PDF 预览地址之间的对应关系；
- 捕获当前页面已经获得授权并加载的 PDF；
- 在需要时使用网站当前会话提供的临时密钥解密 PDF；
- 按照“论文题名_作者.pdf”自动命名；
- 通过摘要页“在线预览”旁或 PDF 预览页右下角的“下载为 PDF”按钮手动保存；
- 不包含广告、统计或第三方数据上传功能。

## 权限与限制

本脚本不会绕过网站的身份认证、访问控制或论文预览权限，只处理当前登录账户已经能够通过网站正常加载的 PDF。

使用者应遵守：

- 清华大学相关信息系统的使用规定；
- 数据库和数字资源的授权协议；
- 论文作者及出版机构的著作权；
- 所在国家或地区适用的法律法规。

请勿将本脚本用于未经授权的批量下载、公开传播或商业用途。

## 项目来源

本项目的功能来源于 Chrome 扩展 [**Tsinghua Newetds Downloader**](https://chromewebstore.google.com/detail/tsinghua-newetds-download/bffnnlmenpnmpkhphmjeapeahpkcdnoc)。对于只需要在特定页面执行下载处理的功能，用户脚本是更轻量、方便、灵活的分发方式，并且能够支持多种浏览器。

已获得原作者授权改写并发布本脚本项目。

## 许可证

MIT
