"use strict";

// app.util.js 纯函数的零依赖单元测试（Node 内置 test runner，npm test）。
// 这些函数是截止时间推算/展示与查询串解析的正确性核心，站点文案怪癖
// （「剩余218小时9分钟」「已截止」等）回归时先在这里补用例。

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseQuery, parseRemainMs, formatRemain, formatAgo } = require("./app.util.js");

test("parseQuery 基本解析与编码值", () => {
  assert.deepEqual(parseQuery("a=1&b=2"), { a: "1", b: "2" });
  assert.deepEqual(parseQuery("taskrefId=123&courseId=45"), { taskrefId: "123", courseId: "45" });
  assert.deepEqual(parseQuery("q=%E4%BD%9C%E4%B8%9A&x"), { q: "作业", x: "" });
  assert.deepEqual(parseQuery(""), {});
  assert.deepEqual(parseQuery("a=1&a=2"), { a: "2" });
});

test("parseRemainMs 组合单位与截止文案", () => {
  // 页面实测文案：「剩余218小时9分钟」
  assert.equal(parseRemainMs("剩余218小时9分钟"), 218 * 3600000 + 9 * 60000);
  assert.equal(parseRemainMs("剩余3天2小时"), 3 * 86400000 + 2 * 3600000);
  assert.equal(parseRemainMs("剩余30秒"), 30 * 1000);
  assert.equal(parseRemainMs("剩余1.5小时"), 1.5 * 3600000);
  // 已截止类文案返回 0
  assert.equal(parseRemainMs("已截止"), 0);
  assert.equal(parseRemainMs("已结束"), 0);
  assert.equal(parseRemainMs("已过期"), 0);
  // 空与无法识别返回 null
  assert.equal(parseRemainMs(""), null);
  assert.equal(parseRemainMs(null), null);
  assert.equal(parseRemainMs("剩余"), null);
});

test("formatRemain 紧凑文案", () => {
  assert.equal(formatRemain(null), "");
  assert.equal(formatRemain(0), "已截止");
  assert.equal(formatRemain(-1000), "已截止");
  // formatRemain：超过 1 天时只展示 天+小时，不含分钟（既有行为）
  assert.equal(formatRemain(218 * 3600000 + 9 * 60000), "剩9天2小时");
  assert.equal(formatRemain(5 * 3600000 + 9 * 60000), "剩5小时9分");
  assert.equal(formatRemain(3 * 86400000 + 2 * 3600000), "剩3天2小时");
  assert.equal(formatRemain(5 * 60000), "剩5分");
  assert.equal(formatRemain(30 * 1000), "不足1分钟");
});

test("formatAgo 相对时间文案", () => {
  assert.equal(formatAgo(-1), "");
  assert.equal(formatAgo(Infinity), "");
  assert.equal(formatAgo(30 * 1000), "30 秒前");
  assert.equal(formatAgo(90 * 1000), "1 分钟前");
  assert.equal(formatAgo(59 * 60 * 1000), "59 分钟前");
  assert.equal(formatAgo(90 * 60 * 1000), "1 小时前");
});
