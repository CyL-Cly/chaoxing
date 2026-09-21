"use strict";

// ============ 纯工具函数（无 DOM 依赖） ============

// 这些函数是查询串解析、截止时间推算/展示与缓存时长文案的正确性核心，
// 独立成文件以便用 Node 内置 test runner 做零依赖单元测试（见 tests.js，
// npm test）。扩展页仍以经典 <script> 按序引入（app.html 中先于 app.js），
// 不引入模块系统和打包步骤。

// 解析查询串为 { key: value } 对象（重复 key 后者覆盖前者，与原实现一致）
function parseQuery(str) {
  const out = {};
  new URLSearchParams(str).forEach((v, k) => (out[k] = v));
  return out;
}

// 从「剩余218小时9分钟」这类文案解析剩余毫秒数：
// 支持 天 / 小时 / 时 / 分钟 / 分 / 秒 组合；命中「已截止/已结束/已过期」返回 0；
// 无文案或无法识别返回 null（表示没有有效截止时间）。
function parseRemainMs(text) {
  if (!text) return null;
  const s = String(text).trim();
  if (!s) return null;
  if (/已截止|已结束|已过期|已失效|已关闭/.test(s)) return 0;
  const unitMs = { 天: 86400000, 小时: 3600000, 时: 3600000, 分钟: 60000, 分: 60000, 秒: 1000 };
  const re = /(\d+(?:\.\d+)?)\s*(天|小时|时|分钟|分|秒)/g;
  let total = null;
  let m;
  while ((m = re.exec(s)) !== null) {
    total = (total || 0) + parseFloat(m[1]) * unitMs[m[2]];
  }
  return total;
}

// 剩余毫秒 -> 紧凑文案，如 "剩218小时9分"
function formatRemain(ms) {
  if (ms == null) return "";
  if (ms <= 0) return "已截止";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `剩${days}天${hours}小时`;
  if (hours > 0) return `剩${hours}小时${mins}分`;
  if (mins > 0) return `剩${mins}分`;
  return "不足1分钟";
}

// 相对时间文案：秒 / 分钟 / 小时
function formatAgo(ms) {
  if (!isFinite(ms) || ms < 0) return "";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return sec + " 秒前";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + " 分钟前";
  return Math.floor(min / 60) + " 小时前";
}

// 扩展页按经典脚本引入时挂全局；Node 测试走 CommonJS 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseQuery, parseRemainMs, formatRemain, formatAgo };
}
