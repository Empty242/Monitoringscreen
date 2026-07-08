# 数据中心运行监控大屏

这是一个基于本地监控数据文件构建的实时运行监控大屏。项目将服务器基础信息、CPU/内存/网络/磁盘指标和告警情况整合为一个可视化仪表盘，帮助快速了解数据中心整体运行状态。

## 功能特性

- 实时展示在线主机数量、平均 CPU/内存占用、告警数量
- 展示 CPU / 内存 / 负载趋势图
- 展示资源排行、机房分布、运维负责人统计和告警清单
- 支持按机房和状态筛选主机与告警
- 自动刷新数据并显示最近刷新时间

## 项目结构

- index.html：大屏页面入口
- styles.css：页面样式
- app.js：前端交互逻辑与数据渲染
- generate_dashboard_data.py：将监控数据文件整理为前端可使用的 JSON
- host_detail.dat：主机基础信息
- pref_tsar.dat：性能指标数据
- disk_tsar.dat：磁盘指标数据
- data.json：生成后的前端数据文件

## 使用方法

1. 进入项目目录
2. 运行下面的命令生成数据文件：
   ```bash
   python generate_dashboard_data.py
   ```
3. 启动本地静态服务：
   ```bash
   python -m http.server 8000
   ```
4. 在浏览器中访问：
   ```text
   http://127.0.0.1:8000/index.html
   ```

## 数据说明

- host_detail.dat：包含主机 ID、主机名、责任人、型号和机房信息
- pref_tsar.dat：包含 CPU、内存、网络、负载、进程等性能指标
- disk_tsar.dat：包含磁盘性能与使用率相关指标

## 备注

当前项目为静态前端页面，适合本地演示或快速部署到 GitHub Pages、Netlify 等服务。