# 12周执行系统 (12 Week System)

> 基于《12周做完一年工作》方法论构建的数字化计划工具，纯前端实现。

## 功能

- **看板** — 全局视图，一屏掌握12周执行进度
- **愿景** — 写下你的12周愿景和核心目标
- **12周计划** — 将愿景拆解为可执行的12周计划
- **周计划** — 每周关键任务规划与追踪
- **每日打勾** — 每日习惯追踪，完成即打勾
- **周评量** — 每周复盘打分，追踪执行率
- **时间块** — 时间块规划，把时间分配到重要的事上

## 在线使用

直接访问：https://songqi-123-d4gvzwb62edae59b7-1251345924.tcloudbaseapp.com

数据存储在本地浏览器中（localStorage），不会上传服务器。换设备时可用「导出」功能备份数据，在新设备上「导入」恢复。

## 本地运行

```bash
git clone https://github.com/songqi8585-rgb/12week-system.git
cd 12week-system
# 用浏览器直接打开 index.html，或启动本地服务器
python3 -m http.server 8080
# 访问 http://localhost:8080
```

## 技术栈

- 纯 HTML / CSS / JavaScript，无框架依赖
- localStorage 本地存储
- 单页应用，7个功能页面智能联动

## 方法论来源

基于 Brian P. Moran 的《12 Week Year》一书，将12周执行术工具化为数字化系统。

## License

MIT
