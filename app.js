"use strict";

// ============ 基础工具 ============

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}

// 只允许 https + 学习通域名（含子域）。相对路径按 mooc1 解析。
function chaoxingHttpsUrl(url, base = "https://mooc1.chaoxing.com") {
  if (!url) return "";
  try {
    const u = new URL(url, base);
    if (u.protocol !== "https:") return "";
    const host = u.hostname.toLowerCase();
    if (host === "chaoxing.com" || host.endsWith(".chaoxing.com")) return u.href;
  } catch (e) {}
  return "";
}

// 打开学习通页面：noopener 切断 window.opener，避免对端反 tabnabbing。
function openTab(url) {
  const href = chaoxingHttpsUrl(url);
  if (!href) {
    log("✗ 拒绝打开非学习通链接:", url);
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

// 拼学习通 URL，参数一律 encode（enc 含 &/=/+ 时字符串拼接会截断）。
function cxUrl(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  }
  return u.href;
}

// localStorage JSON 读取样板：getItem + JSON.parse + 可选 validate(obj) 校验。
// 键缺失返回 null（静默）；解析/读取异常时 label 非 null 则记「✗ <label>: <err>」，静默时直接吞掉；
// 校验失败同样返回 null（各调用方在 validate 里保留原有的「⚠ …格式异常」日志文案）。
function readJsonStorage(key, { label = null, validate = null } = {}) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (validate && !validate(obj)) return null;
    return obj;
  } catch (e) {
    if (label) log("✗ " + label + ":", e.message);
    return null;
  }
}

// localStorage JSON 写入样板：JSON.stringify + setItem + try/catch。
// 失败时 label 非 null 则记「✗ <label>: <err>」，为 null 则静默吞掉。
function writeJsonStorage(key, value, { label = null } = {}) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (label) log("✗ " + label + ":", e.message);
  }
}

// ============ 时间工具 ============

// parseRemainMs / formatRemain 已抽到 app.util.js（无 DOM 依赖，可单测，见 tests.js）

// 时间戳 -> "MM-DD HH:mm"
function formatDeadline(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ============ 调试日志 ============

function log(...args) {
  const body = $("#logBody");
  if (body) {
    const line = document.createElement("div");
    line.textContent = "[" + new Date().toLocaleTimeString() + "] " + args.map(a =>
      typeof a === "string" ? a : JSON.stringify(a)
    ).join(" ");
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }
  console.log(...args);
}

// 匿名遥测：只发 event / feature / version，不含账号、课程、作业内容。
// 未同意则必须在欢迎页确认；已 allow 不再提示。
const TELEMETRY_URL = "https://ssl.dagongren.tech/event";
const TELEMETRY_CONSENT_KEY = "chaoxing.telemetry.consent.v1";
let cachedManifestVersion = null;
// 同意回调只允许触发一次 continueBootstrap，防止连点重复进入
let agreedStarted = false;

function readTelemetryConsent() {
  try {
    const v = localStorage.getItem(TELEMETRY_CONSENT_KEY);
    if (v === "allow" || v === "deny") return v;
  } catch (e) {}
  return null;
}

function writeTelemetryConsent(value) {
  try {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, value);
  } catch (e) {}
}

function getManifestVersion() {
  if (cachedManifestVersion != null) return cachedManifestVersion;
  let version = "";
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
      version = chrome.runtime.getManifest().version || "";
    }
  } catch (e) {}
  cachedManifestVersion = version;
  return version;
}

function track(event, fields = {}) {
  try {
    if (readTelemetryConsent() === "deny") return;
    const version = getManifestVersion();
    if (!version) return;
    const body = { event, version };
    if (event === "feature_used" && fields.feature) body.feature = fields.feature;
    if (event === "error" && fields.error) body.error = fields.error;
    fetch(TELEMETRY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(() => {});
  } catch (e) {}
}

// 欢迎协议门禁：返回 true 表示弹出了遮罩（调用方须停止启动流程）。
// 已 allow 返回 false；找不到遮罩元素也返回 false（不拦）。函数本身不拉数据。
function setupAgreement() {
  if (readTelemetryConsent() === "allow") return false;
  const overlay = $("#agreementOverlay");
  if (!overlay) return false;
  overlay.hidden = false;
  const blocked = $("#agreementBlocked");
  if (readTelemetryConsent() === "deny" && blocked) blocked.hidden = false;
  const confirmBtn = $("#agreementConfirm");
  const denyBtn = $("#agreementDeny");
  if (confirmBtn && !confirmBtn.dataset.bound) {
    confirmBtn.dataset.bound = "1";
    confirmBtn.addEventListener("click", () => {
      writeTelemetryConsent("allow");
      overlay.hidden = true;
      continueBootstrap();
    });
  }
  if (denyBtn && !denyBtn.dataset.bound) {
    denyBtn.dataset.bound = "1";
    denyBtn.addEventListener("click", () => {
      writeTelemetryConsent("deny");
      if (blocked) blocked.hidden = false;
    });
  }
  return true;
}

// ============ 请求 ============

// 所有请求统一用 credentials:"include"：在 host_permissions 授权下，
// 浏览器会自动携带该域的完整 cookie（含 HttpOnly），无需也不应手动注入
// Cookie 头（Cookie 是 Forbidden Header，会被浏览器过滤）。
const REFERER_INTERACTION = "https://mooc2-ans.chaoxing.com/visit/interaction";

async function cxFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("accept")) headers.set("accept", "text/html,application/xhtml+xml,*/*;q=0.8");
  // 默认 30s 超时中止（AbortSignal.timeout 需 Chrome 103+，manifest 未声明更低版本下限）；
  // 调用方自带 signal 时不覆盖。超时抛 TimeoutError，由各调用方的 catch 统一处理。
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
    signal: options.signal ?? AbortSignal.timeout(30000)
  });
  return res;
}

function isLoginRedirect(text, loginDetect) {
  if (loginDetect) return loginDetect(text);
  return !/<li[^>]*data="[^"]*taskrefId/.test(text);
}

async function fetchWithFallback(url, options = {}, loginDetect, label = url) {
  const r = await cxFetch(url, options);
  const t = await r.text();
  const ok = r.ok && !isLoginRedirect(t, loginDetect);
  log(ok ? "✓" : "✗", label, "status=" + r.status, "len=" + t.length, ok ? "" : "（未通过登录检测，可能被重定向登录）");
  return { text: t, ok, status: r.status };
}

// ============ 登录（passport2 / fanyalogin） ============

class NeedLoginError extends Error {
  constructor(message) {
    super(message || "需要登录学习通");
    this.name = "NeedLoginError";
  }
}

function isNeedLogin(err) {
  return !!err && err.name === "NeedLoginError";
}

const LOGIN_KEY = "chaoxing.login.v1";
const VAULT_DB = "chaoxing.vault";
const VAULT_STORE = "kv";
const VAULT_KEY_ID = "aes";
const VAULT_CRED_ID = "login";
const CX_AES_KEY = "u2oh6Vu^HWe4_AES";
const CX_LOGIN_URL = "https://passport2.chaoxing.com/fanyalogin";
const CX_PASSPORT_PAGE = "https://passport2.chaoxing.com/login?fid=&newversion=true&refer=http://i.chaoxing.com";

let autoLoginTried = false;
let autoLoginOk = false;
let loginInflight = null;
let cxAesKeyPromise = null;
let vaultDbPromise = null;
let vaultKeyPromise = null;
let savedLoginCache = undefined;

function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function openVaultDb() {
  if (vaultDbPromise) return vaultDbPromise;
  vaultDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(VAULT_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) db.createObjectStore(VAULT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      vaultDbPromise = null;
      reject(req.error);
    };
  });
  return vaultDbPromise;
}

function vaultReq(mode, run) {
  return openVaultDb().then(db => new Promise((resolve, reject) => {
    const req = run(db.transaction(VAULT_STORE, mode).objectStore(VAULT_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function vaultGet(key) { return vaultReq("readonly", s => s.get(key)); }
function vaultSet(key, value) { return vaultReq("readwrite", s => s.put(value, key)); }
function vaultDel(key) { return vaultReq("readwrite", s => s.delete(key)); }

function getVaultKey() {
  if (vaultKeyPromise) return vaultKeyPromise;
  vaultKeyPromise = (async () => {
    try {
      const existing = await vaultGet(VAULT_KEY_ID);
      if (existing) return existing;
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
      await vaultSet(VAULT_KEY_ID, key);
      return key;
    } catch (e) {
      vaultKeyPromise = null;
      throw e;
    }
  })();
  return vaultKeyPromise;
}

function parseLoginObject(obj) {
  if (!obj || typeof obj.phone !== "string" || typeof obj.password !== "string") return null;
  if (!obj.phone || !obj.password) return null;
  return { phone: obj.phone, password: obj.password };
}

function readPlainLoginV1() {
  try {
    const raw = localStorage.getItem(LOGIN_KEY);
    if (!raw) return null;
    return parseLoginObject(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

function removePlainLoginV1() {
  try { localStorage.removeItem(LOGIN_KEY); } catch (e) {}
}

function getCxAesKey() {
  if (!cxAesKeyPromise) {
    cxAesKeyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(CX_AES_KEY),
      { name: "AES-CBC" },
      false,
      ["encrypt"]
    );
  }
  return cxAesKeyPromise;
}

// Web Crypto 的 AES-CBC 自带 PKCS7，与超星 fanyalogin 一致。
async function cxEncrypt(plain) {
  const key = await getCxAesKey();
  const iv = new TextEncoder().encode(CX_AES_KEY);
  const buf = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    new TextEncoder().encode(String(plain))
  );
  return bytesToBase64(new Uint8Array(buf));
}

async function decryptSavedLogin(record) {
  if (!record || typeof record.iv !== "string" || typeof record.ct !== "string") return null;
  const key = await getVaultKey();
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.iv) },
    key,
    base64ToBytes(record.ct)
  );
  return parseLoginObject(JSON.parse(new TextDecoder().decode(buf)));
}

async function readSavedLogin() {
  if (savedLoginCache !== undefined) return savedLoginCache;
  try {
    const record = await vaultGet(VAULT_CRED_ID);
    if (record) {
      try {
        const saved = await decryptSavedLogin(record);
        if (saved) {
          removePlainLoginV1();
          savedLoginCache = saved;
          return saved;
        }
      } catch (e) {
        log("✗ 登录密文解密失败:", e.message);
      }
    }
    const legacy = readPlainLoginV1();
    if (legacy) {
      const ok = await writeSavedLogin(legacy.phone, legacy.password);
      removePlainLoginV1();
      if (ok) {
        savedLoginCache = legacy;
        return legacy;
      }
      log("✗ 明文登录信息无法迁入保险箱，已删除本机明文，请重新登录");
      savedLoginCache = null;
      return null;
    }
    savedLoginCache = null;
    return null;
  } catch (e) {
    log("✗ 登录信息读取失败:", e.message);
    savedLoginCache = null;
    return null;
  }
}

async function writeSavedLogin(phone, password) {
  try {
    const key = await getVaultKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify({ phone, password }))
    );
    await vaultSet(VAULT_CRED_ID, { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(buf)) });
    removePlainLoginV1();
    savedLoginCache = { phone, password };
    return true;
  } catch (e) {
    log("✗ 登录信息写入失败:", e.message);
    return false;
  }
}

async function clearSavedLogin() {
  savedLoginCache = null;
  try {
    await vaultDel(VAULT_CRED_ID);
  } catch (e) {
    log("✗ 登录信息清除失败:", e.message);
  }
  removePlainLoginV1();
}

function setLoginError(msg) {
  const box = $("#loginError");
  if (!box) return;
  if (!msg) {
    box.style.display = "none";
    box.textContent = "";
    return;
  }
  box.style.display = "block";
  box.textContent = msg;
}

async function showLoginCard(errMsg) {
  const card = $("#loginCard");
  if (!card) return;
  const saved = await readSavedLogin();
  const phoneEl = $("#loginPhone");
  const passEl = $("#loginPassword");
  const remEl = $("#loginRemember");
  if (phoneEl && saved && !phoneEl.value) phoneEl.value = saved.phone;
  if (passEl && saved && !passEl.value) passEl.value = saved.password;
  if (remEl && saved) remEl.checked = true;
  const msg = errMsg && errMsg !== "需要登录学习通" ? errMsg : "";
  setLoginError(msg);
  card.style.display = "flex";
  hideError();
  setStatus("请登录学习通");
}

function hideLoginCard() {
  const card = $("#loginCard");
  if (card) card.style.display = "none";
  setLoginError("");
}

async function cxLogin({ phone, password }) {
  const uname = await cxEncrypt(phone);
  const pwd = await cxEncrypt(password);
  const body = new URLSearchParams({
    fid: "-1",
    uname,
    password: pwd,
    refer: "https://i.chaoxing.com",
    t: "true",
    forbidotherlogin: "0",
    validate: "",
    doubleFactorLogin: "0",
    independentId: "0"
  });
  const res = await fetch(CX_LOGIN_URL, {
    method: "POST",
    credentials: "include",
    referrer: CX_PASSPORT_PAGE,
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "accept": "application/json, text/javascript, */*; q=0.01"
    },
    body
  });
  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch (e) {
    throw new Error("登录响应异常");
  }
  if (!data || data.status !== true) {
    throw new Error((data && (data.msg2 || data.msg)) || "登录失败");
  }
  let next = "https://i.chaoxing.com/";
  if (data.url) {
    const safe = chaoxingHttpsUrl(data.url);
    if (safe) next = safe;
    else log("↻ 登录跳转不是学习通域名，改为打开首页");
  }
  try {
    await fetch(next, { credentials: "include", redirect: "follow" });
  } catch (e) {
    log("↻ 登录后跳转失败（可忽略）:", e.message);
  }
  log("✓ 学习通登录成功");
  return true;
}

// 仅在判定未登录后调用：有保存账号则静默 POST 一次，否则抛 NeedLoginError。
// 作业 / 考试并行时共用同一 Promise，避免第二次直接失败。
async function ensureLoggedIn() {
  if (loginInflight) return loginInflight;
  loginInflight = (async () => {
    try {
      const saved = await readSavedLogin();
      if (!saved) throw new NeedLoginError();
      // 本页已失败过则不再打 passport（避免滑块）；成功过但 cookie 又失效则允许再登一次
      if (autoLoginTried && !autoLoginOk) throw new NeedLoginError();
      autoLoginTried = true;
      autoLoginOk = false;
      log("检测到未登录，使用已保存账号自动登录");
      try {
        await cxLogin(saved);
        autoLoginOk = true;
      } catch (e) {
        log("✗ 自动登录失败:", e.message);
        track("error", { error: "login_failed" });
        throw new NeedLoginError(e.message);
      }
    } finally {
      loginInflight = null;
    }
  })();
  return loginInflight;
}

let silentLoginReminded = false;

async function handleLoginFailure(err, { silent, loaded, treatAsForce, label }) {
  if (isNeedLogin(err)) {
    if (silent && loaded && !treatAsForce) {
      log("✗ 后台刷新" + label + "失败（未登录），保留现有数据:", err.message);
      // 静默降级不能完全不可见：底部错误条提示登录已失效（非阻断，不弹登录卡）
      if (!silentLoginReminded) {
        silentLoginReminded = true;
        showError("登录已失效，后台刷新" + label + "失败；数据可能已过期，点击「刷新」重新登录。");
        setStatus("登录已失效");
      }
    } else {
      await showLoginCard(err.message);
      track("error", { error: "need_login" });
    }
    return true;
  }
  return false;
}

// ============ 数据获取 ============

async function fetchStuWork() {
  // loginDetect 语义：返回 true 表示"是登录页"。仿考试链路（fetchExams）接受页面骨架特征：
  // 不能只看 <li data="...taskrefId...">——作业列表为空时同样没有该标记，会被误判成登录页，
  // 触发不必要的自动登录乃至弹登录卡。taskrefId/workRelationId 来自列表项 data 属性（见 parseWorks），
  // task-work 是条目图标文件名，goTask 与电脑版作业集合页同款骨架标记（见 work/list 的 loginDetect）。
  // 登录页（passport2）不含这些特征，只有连骨架都不在时才判为登录页。
  const load = () => fetchWithFallback(
    "https://mooc1-api.chaoxing.com/work/stu-work",
    {}, t => !(/taskrefId|workRelationId|task-work|goTask/.test(t)), "作业聚合页 stu-work"
  );
  let { text, ok } = await load();
  if (!ok) {
    await ensureLoggedIn();
    ({ text, ok } = await load());
  }
  if (!ok) throw new NeedLoginError("登录后仍无法读取作业，可点「打开学习通登录页」完成验证后再刷新。");
  return text;
}

function parseWorks(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [];
  for (const li of $$("li", doc)) {
    const dataUrl = li.getAttribute("data");
    if (!dataUrl || !/taskrefId|workRelationId/.test(dataUrl)) continue;
    const q = parseQuery(dataUrl.split("?")[1] || "");
    const titleP = $('p[aria-hidden="true"]', li);
    const courseSpan = [...$$("span", li)].find(s => /《.+》/.test(s.textContent));
    const workId = q.taskrefId || q.workRelationId || "";
    if (!workId) continue;
    // 过期作业图片为 task-work-gray.png，未过期为 task-work.png（可提交）
    const imgSrc = $("img", li) && $("img", li).getAttribute("src") || "";
    const expired = /task-work-gray/.test(imgSrc);
    // 剩余时间形如 <span class="fr" aria-hidden="true">剩余218小时9分钟</span>
    // 页面无绝对截止时间，用「解析时刻 + 剩余时长」推算
    const remainSpan = $(".fr", li);
    const remainText = remainSpan ? remainSpan.textContent.trim() : "";
    const remainMs = parseRemainMs(remainText);
    items.push({
      title: (titleP && titleP.textContent.trim()) || "（未命名作业）",
      status: ($(".status", li) && $(".status", li).textContent.trim()) || "",
      course: courseSpan ? courseSpan.textContent.trim() : "",
      courseId: q.courseId || "",
      clazzId: q.clazzId || "",
      workId,
      expired,
      remainText,
      remainMs,
      deadline: remainMs == null ? null : Date.now() + remainMs,
      rawUrl: dataUrl
    });
  }
  return items;
}

// ============ 考试数据 ============

// 解析手机版考试聚合页，返回考试列表
function parseExams(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [];
  for (const li of $$("li", doc)) {
    const dataUrl = li.getAttribute("data");
    if (!dataUrl || !/task-exam/.test(dataUrl)) continue;
    const q = parseQuery(dataUrl.split("?")[1] || "");
    const dt = $("dt", li);
    const state = $(".ks_state", li);
    if (!q.taskrefId) continue;
    // 过期考试图片为 ks_02.png（学习通页上不可点），未过期为 ks_01 等
    const imgSrc = $("img", li) && $("img", li).getAttribute("src") || "";
    const expired = /ks_02/.test(imgSrc);
    // 剩余时间在 <dl class="ks_text"><dd>剩余4290小时58分钟</dd>，
    // dd 缺失时回退解析 aria-label 中的「剩余时间：…」
    const dd = $("dd", li);
    let remainText = dd ? dd.textContent.trim() : "";
    if (!remainText) {
      const dl = $(".ks_text", li);
      const aria = (dl && dl.getAttribute("aria-label")) || "";
      const mt = /剩余时间[:：]\s*([^;；]*)/.exec(aria);
      if (mt) remainText = mt[1].trim();
    }
    const remainMs = parseRemainMs(remainText);
    items.push({
      title: (dt && dt.textContent.trim()) || li.getAttribute("title") || "（未命名考试）",
      status: (state && state.textContent.trim()) || "",
      courseId: q.courseId || "",
      clazzId: q.classId || q.clazzId || "",
      examId: q.taskrefId,
      expired,
      remainText,
      remainMs,
      deadline: remainMs == null ? null : Date.now() + remainMs,
      // 手机版考试链接（回退用，能考）。data 实测为相对路径
      // （/exam-ans/exam/phone/task-exam?taskrefId=..&courseId=..&classId=..&from=examlist），
      // 若将来页面改成绝对地址则直接用，避免拼出 https://hosthttps://...
      rawUrl: /^https?:\/\//i.test(dataUrl) ? dataUrl : "https://mooc1-api.chaoxing.com" + dataUrl
    });
  }
  return items;
}

// 拉手机版考试聚合页。
// 失败一律抛 NeedLoginError（由考试链路的 handleLoginFailure 统一处理），
// 不会返回 null——"请求失败"永远不会被当成"确实一场考试都没有"，避免覆盖有效缓存。
async function fetchExams() {
  const load = () => fetchWithFallback(
    "https://mooc1-api.chaoxing.com/exam-ans/exam/phone/examcode",
    {}, t => !(/task-exam|ks_list|goTask/.test(t)), "考试聚合页 examcode"
  );
  let { text, ok } = await load();
  if (!ok) {
    await ensureLoggedIn();
    ({ text, ok } = await load());
  }
  if (!ok) {
    log("✗ 考试聚合页未通过登录检测，本次视为失败（保留已有数据与缓存）");
    throw new NeedLoginError("登录后仍无法读取考试，可点「打开学习通登录页」完成验证后再刷新。");
  }
  const exams = parseExams(text);
  log("解析到考试:", exams.length, "个");
  return exams;
}

// 电脑版考试集合页地址（未交卷考试的电脑版入口；「打开本课考试集合页」也复用它）。
// 实测该页是前端壳、列表由页内 JS 拉取，带 courseid/clazzid 即可打开（cpi/enc 可选，带上更贴近站内用法）。
function examListUrl(courseId, clazzId, { cpi = "", enc = "" } = {}) {
  return cxUrl("https://mooc1.chaoxing.com/exam-ans/mooc2/exam/exam-list", {
    courseid: courseId, clazzid: clazzId, cpi, enc
  });
}

// 为某课程的每个考试推导电脑版链接，构建 examId→电脑版链接映射。
// 原理：已完成考试的手机 task-exam 链接会 302 重定向到 /exam/phone/look?examAnswerId=xxx，
// 据此得到答卷 id 与 cpi，即可组装电脑版"查看答卷"页链接
// （与 chaoxing 电脑版考试集合页前端的 viewExamAnswer() 完全一致：/exam-ans/exam/test/look?courseId&classId&examId&examAnswerId&cpi）。
// 关键：必须 redirect:"follow" —— manual 重定向返回的是 opaque-redirect 响应
// （type=opaqueredirect、status=0、headers 为空、body=null），浏览器一律不允许读取 Location，
// 所以旧写法读 Location 恒定拿不到 examAnswerId/cpi，电脑版链接永远为空（已实测）。
// 未交考试的手机链接直接 200 到作答页、无 examAnswerId：它没有"查看答卷"页，
// 而"进入考试"需要服务端校验（考试码/验证码/签名/人脸，见集合页 startTest→reVersionTestStartNew），
// 扩展不自行拼 start 链接，改为指向本课电脑版考试集合页，由 chaoxing 页面内完成"进入考试"。
async function buildExamDesktopMap(courseId, clazzId, exams) {
  const map = {};
  for (const e of exams) {
    if (e.expired) {
      log("跳过过期考试", e.examId, "的电脑版探测");
      continue;
    }
    try {
      const probeUrl = chaoxingHttpsUrl(e.rawUrl, "https://mooc1-api.chaoxing.com");
      if (!probeUrl) {
        log("⚠ 考试", e.examId, "链接不是学习通域名，跳过探测");
        continue;
      }
      const r = await fetch(probeUrl, {
        credentials: "include",
        redirect: "follow",
        headers: { "accept": "text/html,application/xhtml+xml,*/*;q=0.8" }
      });
      // 消费响应体：避免 devtools 里留下挂起/已取消的条目（该面板是主要排查入口）
      const body = await r.text();
      const finalUrl = chaoxingHttpsUrl(r.url || "");
      if (!finalUrl) {
        log("⚠ 考试", e.examId, "探测无学习通最终 URL，保持手机版");
        continue;
      }
      // 最终地址形如 .../exam-ans/exam/phone/look?...&examAnswerId=xxx&cpi=xxx#INNER，
      // 用 URLSearchParams 取值可自动忽略 #INNER 片段
      const sp = new URL(finalUrl).searchParams;
      const answerId = sp.get("examAnswerId") || "";
      const cpi = sp.get("cpi") || "";
      if (/^\d+$/.test(answerId) && /^\d+$/.test(cpi)) {
        // 已完成：有"查看答卷"页，直接给它电脑版链接
        const desktopUrl = cxUrl("https://mooc1-api.chaoxing.com/exam-ans/exam/test/look", {
          courseId, classId: clazzId, examId: e.examId, examAnswerId: answerId, cpi
        });
        map[e.examId] = desktopUrl;
        log("✓ 考试", e.examId, "电脑版查看试卷 →", desktopUrl);
        continue;
      }
      // 未交卷 / 暂无答卷：从作答准备页里取 cpi（<input id="cpi" value="...">），指向电脑版集合页
      const cpiInPage = /id="cpi"[^>]*value="(\d+)"/.exec(body);
      if (cpiInPage) {
        const listUrl = examListUrl(courseId, clazzId, { cpi: cpiInPage[1] });
        map[e.examId] = listUrl;
        log("✓ 考试", e.examId, "未交卷 → 电脑版考试集合页（页内点「进入考试」）", listUrl);
      } else {
        log("⚠ 考试", e.examId, "无电脑版（未交或暂无答卷），保持手机版");
      }
    } catch (err) {
      log("✗ 考试", e.examId, "电脑版链接推导失败:", err.message);
    }
  }
  return map;
}

// 为所有考试课程构建 examId→电脑版链接映射 { [courseId_clazzId]: { [examId]: desktopUrl } }。
// prevMaps 为上一次的映射；reuse=true（后台静默刷新）且某课程的考试集合完全没变时直接复用，
// 跳过该课程的逐场 302 探测——探测是请求量最大的部分，也是高频调用拦截的主要来源。
async function buildAllExamDesktopMaps(exams, prevMaps = {}, { reuse = false } = {}) {
  const maps = {};
  const groups = groupByCourse(exams);
  for (const [key, g] of groups) {
    const [courseId, clazzId] = key.split("_");
    const prev = prevMaps[key] || {};
    const probeList = g.list.filter(e => !e.expired);
    const ids = probeList.map(e => e.examId).sort().join(",");
    const prevIds = Object.keys(prev).sort().join(",");
    if (!probeList.length) {
      maps[key] = {};
      log("课程", key, "考试均已过期，跳过电脑版探测");
      continue;
    }
    if (reuse && prevIds && prevIds === ids) {
      maps[key] = prev;
      log("课程", key, "考试集合未变化，复用电脑版链接", Object.keys(prev).length, "个（跳过逐场探测）");
      continue;
    }
    try {
      const m = await buildExamDesktopMap(courseId, clazzId, probeList);
      maps[key] = m;
      log("课程", key, "电脑版考试链接:", Object.keys(m).length, "/", probeList.length, "个");
    } catch (e) {
      maps[key] = {};
      log("课程", key, "电脑版考试获取失败:", e.message);
    }
  }
  return maps;
}

const desktopCache = {};
const desktopEncCache = {};

// 进入课程中间页，拿到含 workEnc/examEnc 的中间页 HTML。
// 关键：stucoursemiddle 需要带 referer=interaction 才会正确 302 到课程中间页，
// 否则重定向到登录。中间页的 enc+t 由服务端在 302 时生成并绑定。
async function getMiddlePage(courseId, clazzId) {
  const entry = cxUrl("https://mooc1.chaoxing.com/visit/stucoursemiddle", {
    courseid: courseId, clazzid: clazzId, ismooc2: "1", v: "2"
  });

  // redirect follow + referrer 固定为 interaction，让浏览器自动跟随到中间页。
  // 注意：Referer 是 Forbidden header，写进 headers 会被浏览器静默丢弃，真正生效的是 referrer 选项。
  // 该 referrer 与请求地址不同源，浏览器会把此请求的引用站点策略强制为 unsafe-url
  // （devtools 里「引用站点策略: unsafe-url」即来源于此），属预期副作用而非错误。
  try {
    const r = await fetch(entry, {
      credentials: "include",
      redirect: "follow",
      referrer: REFERER_INTERACTION
    });
    const url = chaoxingHttpsUrl(r.url);
    const text = await r.text();
    if (url && /mycourse\/stu/.test(url) && /workEnc|examEnc/.test(text)) {
      log("✓ 中间页 follow 成功 url=", url);
      return text;
    }
    log("↻ follow 未到中间页（url=" + (url || r.url || "").slice(0, 60) + "…）");
  } catch (e) {
    log("↻ follow 异常:", e.message);
  }
  return null;
}

async function getDesktopWorkMap(courseId, clazzId) {
  const key = `${courseId}_${clazzId}`;
  if (desktopCache[key]) return desktopCache[key];

  log("—— 获取电脑版链接 课程 " + courseId + "/" + clazzId + " ——");

  // 1. 进入课程中间页，拿到含 workEnc 的 HTML（复用 getWorkEnc：同样的 getMiddlePage +
  //    workEnc 正则提取 + desktopEncCache 缓存，缓存键与错误文案一致）
  const workEnc = await getWorkEnc(courseId, clazzId);
  log("✓ workEnc:", workEnc);

  // 3. 访问电脑版作业集合页，提取电脑版链接
  // 不写 referer 头：Referer 是 Forbidden header，放进 headers 会被浏览器静默丢弃，
  // 写了等于没写，删掉以免被误读成"已带 referer"（当前行为保持不变）。
  const listUrl = cxUrl("https://mooc1.chaoxing.com/mooc2/work/list", {
    courseId, classId: clazzId, enc: workEnc
  });
  const { text: listHtml, ok: listOk } = await fetchWithFallback(
    listUrl, {},
    // loginDetect 语义：返回 true 表示"是登录页"。正常集合页含 work/task 或 goTask。
    t => !(/work\/task\?|goTask/.test(t)), "作业集合页 work/list"
  );
  if (!listOk) throw new Error("作业集合页访问失败或返回登录页");

  const map = {};
  const re = /work\/task\?([^"'\\]+)/g;
  let m;
  while ((m = re.exec(listHtml)) !== null) {
    const q = parseQuery(m[1]);
    if (q.workId && q.answerId) {
      map[q.workId] = `https://mooc1.chaoxing.com/mooc-ans/mooc2/work/task?${m[1]}`;
    }
  }
  log("✓ 电脑版链接数:", Object.keys(map).length);
  if (Object.keys(map).length === 0) throw new Error("作业集合页无电脑版作业链接");
  desktopCache[key] = map;
  return map;
}

async function fetchCourseNames() {
  try {
    const { text: html, ok } = await fetchWithFallback(
      "https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest"
        },
        body: "courseType=1&courseFolderId=0&query=&pageHeader=-1&single=0&superstarClass=0&isFirefly=0&fid="
      },
      t => !(/course-list|courseName|课程/.test(t)),
      "课程列表 courselistdata"
    );
    if (!ok) return {};
    const doc = new DOMParser().parseFromString(html, "text/html");
    const map = {};
    for (const card of $$(".course", doc)) {
      const courseId = $(".courseId", card) && $(".courseId", card).value;
      const clazzId = $(".clazzId", card) && $(".clazzId", card).value;
      const name = $(".course-name", card) && $(".course-name", card).textContent.trim();
      if (courseId && clazzId && name) map[`${courseId}_${clazzId}`] = name;
    }
    return map;
  } catch (e) {
    log("课程名获取异常:", e.message);
    return {};
  }
}

// ============ 隐藏记录（作业 / 考试，localStorage 持久化） ============

// MV3 扩展页面同源可用 localStorage，因此无需新增 storage 权限、不改 manifest.json。
// v2 用 courseId_clazzId_itemId，避免跨课撞 ID 时藏一个带掉另一个。
// 旧键 { work: [workId...], exam: [examId...] } 与更早的纯数组会自动迁移（旧键保留不删）。
const HIDDEN_KEY = "chaoxing.hiddenItems.v2";
const HIDDEN_LEGACY_V1_KEY = "chaoxing.hiddenItems.v1";
const HIDDEN_LEGACY_WORK_KEY = "chaoxing.hiddenWorks.v1";

const KINDS = ["work", "exam"];

function itemHideKey(item, kind) {
  const id = kind === "exam" ? item.examId : item.workId;
  if (!id) return "";
  return `${item.courseId || ""}_${item.clazzId || ""}_${id}`;
}

function isBareId(s) {
  return typeof s === "string" && s && !s.includes("_");
}

function toIdSet(arr) {
  return new Set((Array.isArray(arr) ? arr : []).filter(x => typeof x === "string" && x));
}

// 隐藏集合：唯一状态真源，内部用 Set 维护被隐藏的 id（判存 O(1)），变更即落盘。
// 读写均包 try/catch：解析失败或存储不可用时降级为内存态，不阻塞列表渲染。
const hiddenStore = (() => {
  const state = { work: new Set(), exam: new Set() };

  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (raw) {
      // 主路径复用 readJsonStorage（getItem 幂等，二次读取安全）：
      // 解析异常在内部记「✗ …读取失败，已重置」，格式异常在 validate 里记「⚠ …」，均保持空集合。
      const obj = readJsonStorage(HIDDEN_KEY, {
        label: "隐藏记录读取失败，已重置",
        validate: o => {
          if (o && typeof o === "object" && !Array.isArray(o)) return true;
          log("⚠ 隐藏记录格式异常，已重置");
          return false;
        }
      });
      if (obj) {
        for (const k of KINDS) state[k] = toIdSet(obj[k]);
      }
    } else {
      let migrated = false;
      const v1raw = localStorage.getItem(HIDDEN_LEGACY_V1_KEY);
      if (v1raw) {
        const obj = JSON.parse(v1raw);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          for (const k of KINDS) state[k] = toIdSet(obj[k]);
          migrated = true;
          log("迁移 v1 隐藏记录: 作业", state.work.size, "个 / 考试", state.exam.size, "个（裸 ID 在加载列表后补全课程前缀）");
        }
      } else {
        const legacy = localStorage.getItem(HIDDEN_LEGACY_WORK_KEY);
        if (legacy) {
          const arr = JSON.parse(legacy);
          if (Array.isArray(arr)) {
            state.work = toIdSet(arr);
            migrated = true;
            log("迁移旧版隐藏作业记录:", state.work.size, "个");
          }
        }
      }
      if (migrated) persist();
    }
  } catch (e) {
    log("✗ 隐藏记录读取失败，已重置:", e.message);
  }

  function persist() {
    const payload = {};
    for (const k of KINDS) payload[k] = [...state[k]];
    writeJsonStorage(HIDDEN_KEY, payload, { label: "隐藏记录写入失败（本次会话仍生效）" });
  }

  function summary() {
    return "当前已隐藏 作业" + state.work.size + "个 / 考试" + state.exam.size + "个";
  }

  function match(kind, item) {
    const set = state[kind];
    if (!set) return false;
    const composite = itemHideKey(item, kind);
    const bare = kind === "exam" ? item.examId : item.workId;
    return !!(composite && set.has(composite)) || !!(bare && set.has(bare));
  }

  return {
    has: match,
    // 不传 kind 时返回隐藏总数
    size: kind => (kind ? (state[kind] ? state[kind].size : 0) : KINDS.reduce((n, k) => n + state[k].size, 0)),
    list: kind => (state[kind] ? [...state[kind]] : []),
    hide(kind, item) {
      const id = itemHideKey(item, kind);
      if (!id || !state[kind] || state[kind].has(id)) return false;
      state[kind].add(id);
      persist();
      log("隐藏" + PIPELINES[kind].label + " " + id + "，" + summary());
      track("feature_used", { feature: "hide_item" });
      return true;
    },
    restore(kind, item) {
      const set = state[kind];
      if (!set) return false;
      const composite = itemHideKey(item, kind);
      const bare = kind === "exam" ? item.examId : item.workId;
      let changed = false;
      if (composite && set.delete(composite)) changed = true;
      if (bare && set.delete(bare)) changed = true;
      if (!changed) return false;
      persist();
      log("取消隐藏" + PIPELINES[kind].label + " " + (composite || bare) + "，" + summary());
      track("feature_used", { feature: "restore_item" });
      return true;
    },
    // 列表加载后：把旧版裸 ID 升成 courseId_clazzId_id，避免跨课撞号
    migrateBareIds(kind, items) {
      const set = state[kind];
      if (!set || !items || !items.length) return;
      const bares = [...set].filter(isBareId);
      if (!bares.length) return;
      const bareSet = new Set(bares);
      let n = 0;
      for (const it of items) {
        const bare = kind === "exam" ? it.examId : it.workId;
        if (!bare || !bareSet.has(bare)) continue;
        const composite = itemHideKey(it, kind);
        if (!composite) continue;
        set.delete(bare);
        set.add(composite);
        n++;
      }
      if (n) {
        persist();
        log("隐藏" + PIPELINES[kind].label + "裸 ID 已补全课程前缀:", n, "个");
      }
    }
  };
})();

// ============ 右键菜单（单例复用） ============

let ctxMenuEl = null;      // 菜单容器，懒创建后全局复用
let ctxMenuBound = false;  // 全局关闭事件是否已绑定

function closeContextMenu() {
  if (ctxMenuEl && ctxMenuEl.style.display !== "none") {
    ctxMenuEl.style.display = "none";
    log("关闭右键菜单");
  }
}

function ensureContextMenu() {
  if (!ctxMenuEl) {
    ctxMenuEl = el("div", { class: "ctx-menu", role: "menu" });
    ctxMenuEl.style.display = "none";
    // 菜单自身右键不再触发原生菜单
    ctxMenuEl.addEventListener("contextmenu", e => e.preventDefault());
    document.body.appendChild(ctxMenuEl);
  }
  if (!ctxMenuBound) {
    ctxMenuBound = true;
    document.addEventListener("mousedown", e => {
      if (ctxMenuEl && ctxMenuEl.style.display !== "none" && !ctxMenuEl.contains(e.target)) closeContextMenu();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeContextMenu(); });
    // capture 阶段监听滚动，可捕获任意可滚动容器的滚动
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("blur", closeContextMenu);
    window.addEventListener("resize", closeContextMenu);
  }
  return ctxMenuEl;
}

// 在鼠标位置弹出菜单；items: [{ text, onClick, danger? }]，顺序即展示顺序
function showContextMenu(x, y, items) {
  const menu = ensureContextMenu();
  menu.replaceChildren();
  for (const it of items) {
    const btn = el("button", {
      class: "ctx-menu-item" + (it.danger ? " danger" : ""),
      type: "button",
      text: it.text
    });
    btn.addEventListener("click", e => {
      e.stopPropagation();
      closeContextMenu();
      if (it.onClick) it.onClick();
    });
    menu.appendChild(btn);
  }
  // 先按左上角显示以取得真实尺寸，再做视口边缘修正，避免菜单被裁切
  menu.style.left = "0px";
  menu.style.top = "0px";
  menu.style.display = "block";
  const rect = menu.getBoundingClientRect();
  const pad = 8;
  const left = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad));
  const top = Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad));
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  log("打开右键菜单", { x: Math.round(left), y: Math.round(top), items: items.map(i => i.text) });
}

// ============ 界面渲染 ============

function statusClass(status) {
  const s = status || "";
  if (/未提交|未交|待完成/.test(s)) return "pending";
  if (/待互评|互评/.test(s)) return "review";
  return "done";
}
function statusText(status) { return status || "已完成"; }

// ============ 截止时间展示与排序 ============

const SORT_DEFAULT = "default";
const SORT_DESC = "deadline-desc";

// 生成截止时间元素：绝对截止时间 + 加粗的相对剩余时长。
// 分色规则：剩余 < 3 天=红，< 14 天=黄，其余=绿；已完成的条目不参与分色。
// 无有效剩余时间（如已完成项）返回 null。
function deadlineEl(remainMs, isDone) {
  if (remainMs == null || remainMs <= 0) return null;
  const level = isDone ? "" : remainMs < 3 * 86400000 ? "danger" : remainMs < 14 * 86400000 ? "warn" : "ok";
  const node = el("span", { class: "work-deadline" + (level ? " " + level : "") });
  node.appendChild(document.createTextNode(`${formatDeadline(Date.now() + remainMs)} 截止（`));
  node.appendChild(el("b", { class: "work-deadline-remain", text: formatRemain(remainMs) }));
  node.appendChild(document.createTextNode("）"));
  return node;
}

// 按截止时间排序：有有效截止时间且未完成的条目在前（升/降序），
// 已完成或无截止时间的条目稳定置于末尾，避免无意义剩余时间污染排序。
function sortByDeadline(list, mode) {
  const withTime = [];
  const withoutTime = [];
  for (const it of list) {
    if (it.deadline == null || statusClass(it.status) === "done") withoutTime.push(it);
    else withTime.push(it);
  }
  const dir = mode === SORT_DESC ? -1 : 1;
  withTime.sort((a, b) => dir * (a.deadline - b.deadline));
  return withTime.concat(withoutTime);
}

// 课程显示名：优先课程名映射，其次页面简称，最后用 id 兜底
function courseLabel(courseId, clazzId, fallback, courseNameMap) {
  return courseNameMap[`${courseId}_${clazzId}`] || fallback || `课程 ${courseId}`;
}

function itemCourseKey(it) {
  return `${it.courseId || ""}_${it.clazzId || ""}`;
}

function readSearchQuery() {
  const node = $("#searchInput");
  return node ? node.value.trim() : "";
}

function matchesQuery(it, q, courseNameMap) {
  if (!q) return true;
  const needle = q.toLowerCase();
  if ((it.title || "").toLowerCase().includes(needle)) return true;
  return courseLabel(it.courseId, it.clazzId, it.course, courseNameMap).toLowerCase().includes(needle);
}

function applyQueryAndCourse(list, courseNameMap) {
  const q = readSearchQuery();
  const course = preferredCourseKey || (($("#courseSelect") && $("#courseSelect").value) || "");
  if (!q && !course) return list;
  return list.filter(it => {
    if (course && itemCourseKey(it) !== course) return false;
    return matchesQuery(it, q, courseNameMap);
  });
}

function hasQueryOrCourse() {
  return !!(readSearchQuery() || preferredCourseKey || (($("#courseSelect") && $("#courseSelect").value)));
}

function uniqueCourses(items, courseNameMap) {
  const map = new Map();
  for (const it of items) {
    if (!it.courseId) continue;
    const key = itemCourseKey(it);
    if (!map.has(key)) map.set(key, courseLabel(it.courseId, it.clazzId, it.course, courseNameMap));
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh"));
}

function syncCourseSelect(items, courseNameMap) {
  const sel = $("#courseSelect");
  if (!sel) return;
  const prev = preferredCourseKey || sel.value;
  const courses = uniqueCourses(items, courseNameMap);
  // 当前页签没有这门课也保留选择（切作业/考试时不冲掉；列表会显示为空）
  sel.replaceChildren(el("option", { value: "", text: "全部课程" }));
  for (const [k, name] of courses) sel.appendChild(el("option", { value: k, text: name }));
  if (prev && !courses.some(([k]) => k === prev)) {
    sel.appendChild(el("option", { value: prev, text: courseNameMap[prev] || "已选课程" }));
  }
  sel.value = prev;
}

function emptyFilterNodes(kindLabel) {
  return [
    el("div", { class: "empty-title", text: `没有匹配的${kindLabel}` }),
    el("div", { class: "empty-tip", text: "试试清空搜索或更换课程" })
  ];
}

function isPendingItem(it) {
  return statusClass(it.status) !== "done";
}

// 可提交：作业看灰图过期；考试看 ks_02 过期或剩余时间。无截止信息时视为仍可提交。
function isSubmittableItem(it) {
  if (it.expired) return false;
  if (it.remainMs != null && it.remainMs <= 0) return false;
  return true;
}

function isActionableItem(it) {
  return isPendingItem(it) && isSubmittableItem(it);
}

function summarizeWorks(list) {
  let pending = 0, submittable = 0, expired = 0;
  for (const w of list) {
    if (isPendingItem(w)) pending++;
    if (w.expired) expired++;
    if (isSubmittableItem(w)) submittable++;
  }
  return { total: list.length, pending, submittable, expired, done: list.length - pending };
}

function summarizeExams(list) {
  let pending = 0, submittable = 0, expired = 0;
  for (const e of list) {
    if (isPendingItem(e)) pending++;
    if (e.expired) expired++;
    if (isSubmittableItem(e)) submittable++;
  }
  return { total: list.length, pending, submittable, expired, done: list.length - pending };
}

function setNavBadge(id, count, muted, title) {
  const node = $("#" + id);
  if (!node) return;
  if (!count) {
    node.hidden = true;
    node.textContent = "";
    node.removeAttribute("title");
    return;
  }
  node.hidden = false;
  node.textContent = count > 99 ? "99+" : String(count);
  node.classList.toggle("muted", !!muted);
  if (title) node.title = title;
}

function updateNavBadges() {
  const workCount = PIPELINES.work.loaded
    ? PIPELINES.work.items.filter(w => !hiddenStore.has("work", w) && isActionableItem(w)).length
    : 0;
  const examCount = PIPELINES.exam.loaded
    ? PIPELINES.exam.items.filter(e => !hiddenStore.has("exam", e) && isActionableItem(e)).length
    : 0;
  setNavBadge("badgeWork", workCount, false, "可提交未完成作业 " + workCount);
  setNavBadge("badgeExam", examCount, false, "可提交未完成考试 " + examCount);
  const hiddenTotal = hiddenStore.size();
  setNavBadge("badgeHidden", hiddenTotal, true, "已隐藏 " + hiddenTotal);
}

// 封装作业/考试条目的公共控件逻辑（buildWorkList/buildExamList 除变量名、kind、dataset 键名外逐字相同，抽此处复用）：
// - hidden 视图（isHiddenView 为 true）：向 children 末位追加「恢复」按钮，并绑定其点击（恢复后重渲染）；
//   li 附加 hidden-item 类。
// - 右键菜单：hidden 视图为「取消隐藏」，普通视图为「隐藏作业/隐藏考试」，操作成功后重渲染。
// - li 的 class（work-item，附加 expired/hidden-item 修饰）与 dataset（键名由调用方经 idKey 传入）。
// kind: "work" | "exam"；返回创建好的 li，调用方再绑定各自专属的 click 行为（openWork/openExam）。
function addHiddenControls(item, kind, { children, isHiddenView, idKey }) {
  if (isHiddenView) {
    children.push(el("button", { class: "btn small restore-btn", type: "button", text: "恢复" }));
  }
  const li = el("li", {
    class: `work-item${item.expired ? " expired" : ""}${isHiddenView ? " hidden-item" : ""}`,
    dataset: { [idKey]: item[idKey] }
  }, children);
  li.addEventListener("contextmenu", ev => {
    ev.preventDefault();
    showContextMenu(ev.clientX, ev.clientY, [
      isHiddenView
        ? { text: "取消隐藏", onClick: () => { if (hiddenStore.restore(kind, item)) render(); } }
        : { text: kind === "work" ? "隐藏作业" : "隐藏考试", onClick: () => { if (hiddenStore.hide(kind, item)) render(); } }
    ]);
  });
  if (isHiddenView) {
    li.querySelector(".restore-btn").addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (hiddenStore.restore(kind, item)) render();
    });
  }
  return li;
}

// 构建作业列表 DOM；showCourse 为 true 时在条目内显示课程名（扁平排序模式）。
// opts.context === "hidden" 时为「已隐藏」视图：条目附加「恢复」按钮，右键菜单为「取消隐藏」。
function buildWorkList(items, courseNameMap, showCourse, opts = {}) {
  const isHiddenView = opts.context === "hidden";
  const ul = el("ul", { class: "work-list" });
  for (const w of items) {
    const children = [];
    // 扁平排序模式：课程名置于最左侧，便于按课程快速辨认
    if (showCourse) {
      children.push(el("span", {
        class: "work-course",
        text: courseLabel(w.courseId, w.clazzId, w.course, courseNameMap)
      }));
    }
    children.push(el("span", { class: "work-title", text: w.title }));
    const dl = deadlineEl(w.remainMs, statusClass(w.status) === "done");
    if (dl) children.push(dl);
    children.push(el("span", { class: "work-link-type", text: w.expired ? "已过期" : "待打开" }));
    children.push(el("span", { class: `badge ${statusClass(w.status)}`, text: statusText(w.status) }));

    const li = addHiddenControls(w, "work", { children, isHiddenView, idKey: "workId" });
    li.addEventListener("click", () => openWork(w, li));
    ul.appendChild(li);
  }
  return ul;
}

// 渲染列表公共主体（作业/考试同构）：隐藏/未完成/可提交过滤、查询与课程过滤、空态四分支、追加列表主体。
// kind: "work" | "exam"（决定 hiddenStore 键与日志 context 回退值）；kindLabel: "作业"/"考试"（空态文案）。
// appendBody(content, list, extra) 负责生成并追加列表主体；extra 为调用方透传对象（考试版携带 examDesktopMaps）。
function renderList({ kind, kindLabel, items, onlyPending, onlySubmittable, courseNameMap, mode, opts = {}, extra, appendBody }) {
  const content = $("#content");
  content.innerHTML = "";

  const isHiddenView = opts.context === "hidden";
  let list = items.slice();
  if (isHiddenView) {
    // 「已隐藏」视图：只保留隐藏集合中的项；「仅看未完成/可提交」在此没有语义，不做过滤
    list = list.filter(it => hiddenStore.has(kind, it));
  } else {
    list = list.filter(it => !hiddenStore.has(kind, it));
    if (onlyPending) list = list.filter(it => statusClass(it.status) !== "done");
    if (onlySubmittable) list = list.filter(it => isSubmittableItem(it));
  }
  list = applyQueryAndCourse(list, courseNameMap);
  log("渲染" + kindLabel + "列表: context=" + (isHiddenView ? "hidden" : kind) + ", 条目 " + list.length + " 个, 排序 " + mode);

  if (list.length === 0) {
    if (hasQueryOrCourse()) {
      content.appendChild(el("div", { class: "empty" }, emptyFilterNodes(kindLabel)));
    } else if (isHiddenView) {
      // 空态引导：告知用户隐藏入口
      content.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "empty-title", text: "暂无已隐藏的" + kindLabel }),
        el("div", { class: "empty-tip", text: "右键" + kindLabel + "可以将其隐藏" })
      ]));
    } else {
      const hiddenCount = hiddenStore.size(kind);
      if (hiddenCount) {
        // 条目被全部隐藏时，引导用户去「已隐藏」页签找回
        content.appendChild(el("div", { class: "empty" }, [
          el("div", { class: "empty-title", text: "没有找到" + kindLabel }),
          el("div", { class: "empty-tip", text: `已隐藏 ${hiddenCount} 个${kindLabel}，可在左侧「已隐藏」中查看` })
        ]));
      } else {
        content.appendChild(el("div", { class: "empty", text: "没有找到" + kindLabel }));
      }
    }
    return [];
  }

  appendBody(content, list, extra);
  return list;
}

// 渲染作业列表：mode 为 default 时按课程分组，否则全局按截止时间扁平排序。
// opts.context 默认 "work"（过滤已隐藏项，等价旧行为）；"hidden" 时只展示已隐藏项。
function renderWorks(works, onlyPending, onlySubmittable, courseNameMap = {}, mode = "deadline-asc", opts = {}) {
  return renderList({
    kind: "work", kindLabel: "作业", items: works,
    onlyPending, onlySubmittable, courseNameMap, mode, opts,
    appendBody: (content, list) => appendWorkBody(content, list, courseNameMap, mode, opts)
  });
}

// 按 courseId_clazzId 将条目分组成 Map（保持首次出现顺序），组对象含 course/courseId/clazzId/list。
// courseSource 返回组头课程名的回退值（取组内首条的值）：作业版取条目 course 字段，考试版传空串保持原回退行为。
function groupByCourse(list, courseSource) {
  const groups = new Map();
  for (const it of list) {
    const key = `${it.courseId}_${it.clazzId}`;
    if (!groups.has(key)) groups.set(key, { course: courseSource ? courseSource(it) : undefined, courseId: it.courseId, clazzId: it.clazzId, list: [] });
    groups.get(key).list.push(it);
  }
  return groups;
}

// 列表主体公共实现（按课程分组 / 扁平排序），appendWorkBody/appendExamBody 的同构部分。
// opts.flatHeader === false 时不输出扁平模式的总标题（「已隐藏」页签使用自绘的分节标题）。
// hooks 参数化两版的已确认差异：
// - courseSource: 条目 → 组头课程名回退值（work 为 item.course，exam 为空串）
// - countText(g): 组头计数文案（exam 版附加「· 电脑版N」后缀，work 版没有）
// - openLinkText / onOpenCourse: 组头「打开集合页」链接文案与点击回调（openCourseList/openExamCourseList）
// - buildList(items, showCourse): 条目列表构建（buildWorkList/buildExamList，courseNameMap/opts 经闭包携带）
// - bodyLabel: 扁平模式总标题中的「作业/考试」字样
function appendGroupedList(container, list, courseNameMap, mode, opts, hooks) {
  const { courseSource, countText, openLinkText, onOpenCourse, buildList, bodyLabel } = hooks;
  // 默认顺序：保留按课程分组展示
  if (mode === SORT_DEFAULT) {
    const groups = groupByCourse(list, courseSource);

    for (const g of groups.values()) {
      const header = el("div", { class: "course-header" }, [
        el("span", { class: "course-name", text: courseLabel(g.courseId, g.clazzId, g.course, courseNameMap) }),
        el("span", { class: "course-count", text: countText(g) }),
        el("a", { class: "course-open", href: "#", text: openLinkText })
      ]);
      header.querySelector(".course-open").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenCourse(g.courseId, g.clazzId);
      });

      container.appendChild(el("div", { class: "course-group" }, [header, buildList(g.list, false)]));
    }
    return;
  }

  // 按截止时间：打散课程分组，全部条目扁平排列
  const sorted = sortByDeadline(list, mode);
  const bodyList = buildList(sorted, true);
  if (opts.flatHeader === false) {
    container.appendChild(bodyList);
    return;
  }
  const sortLabel = mode === SORT_DESC ? "截止最晚优先" : "截止最早优先";
  const header = el("div", { class: "course-header" }, [
    el("span", { class: "course-name", text: `${opts.context === "hidden" ? "已隐藏" + bodyLabel : "全部" + bodyLabel} · ${sortLabel}` }),
    el("span", { class: "course-count", text: `${sorted.length} 项` })
  ]);
  container.appendChild(el("div", { class: "course-group" }, [header, bodyList]));
}

// 生成作业列表主体（按课程分组 / 扁平排序）并追加到 container，供「作业」与「已隐藏」两个页签复用。
function appendWorkBody(container, list, courseNameMap, mode, opts = {}) {
  appendGroupedList(container, list, courseNameMap, mode, opts, {
    courseSource: w => w.course,
    countText: g => `${g.list.length} 项`,
    openLinkText: "打开本课集合页",
    onOpenCourse: openCourseList,
    buildList: (items, showCourse) => buildWorkList(items, courseNameMap, showCourse, opts),
    bodyLabel: "作业"
  });
}

// 构建考试列表 DOM；showCourse 为 true 时在条目内显示课程名（扁平排序模式）。
// opts.context === "hidden" 时为「已隐藏」视图：条目附加「恢复」按钮，右键菜单为「取消隐藏」。
// examDesktopMaps: { [courseId_clazzId]: { [examId]: desktopUrl } }
function buildExamList(items, courseNameMap, examDesktopMaps, showCourse, opts = {}) {
  const isHiddenView = opts.context === "hidden";
  const ul = el("ul", { class: "work-list" });
  for (const e of items) {
    const courseKey = `${e.courseId}_${e.clazzId}`;
    const courseMap = examDesktopMaps[courseKey] || {};
    const desktopUrl = courseMap[e.examId] || "";
    const hasDesktop = !!desktopUrl;
    // 未交卷考试的电脑版入口是"本课考试集合页"，鼠标悬停时说明清楚，避免点开以为是单场考试
    const isExamListLink = /exam-list/.test(desktopUrl);

    const children = [];
    // 扁平排序模式：课程名置于最左侧
    if (showCourse) {
      children.push(el("span", { class: "work-course", text: courseLabel(e.courseId, e.clazzId, e.course, courseNameMap) }));
    }
    children.push(el("span", { class: "work-title", text: e.title }));
    const dl = deadlineEl(e.remainMs, statusClass(e.status) === "done");
    if (dl) children.push(dl);
    children.push(el("span", {
      class: "work-link-type",
      text: e.expired ? "已过期" : (hasDesktop ? "电脑版" : "手机版"),
      style: e.expired ? "" : `color:${hasDesktop ? "#27ae60" : "#e67e22"}`,
      title: e.expired
        ? "已过期，无法进入"
        : hasDesktop
          ? (isExamListLink ? "未交卷：打开本课电脑版考试集合页，在页内点击「进入考试」" : "打开电脑版查看试卷")
          : "打开手机版页面"
    }));
    children.push(el("span", { class: `badge ${statusClass(e.status)}`, text: statusText(e.status) }));

    const li = addHiddenControls(e, "exam", { children, isHiddenView, idKey: "examId" });
    li.addEventListener("click", () => {
      if (e.expired) return;
      openExam(e, courseMap[e.examId]);
    });
    ul.appendChild(li);
  }
  return ul;
}

// 渲染考试列表：mode 为 default 时按课程分组，否则全局按截止时间扁平排序。
// opts.context 默认 "exam"（过滤已隐藏项）；"hidden" 时只展示已隐藏项。
function renderExams(exams, onlyPending, onlySubmittable, courseNameMap = {}, examDesktopMaps = {}, mode = "deadline-asc", opts = {}) {
  return renderList({
    kind: "exam", kindLabel: "考试", items: exams,
    onlyPending, onlySubmittable, courseNameMap, mode, opts,
    extra: { examDesktopMaps },
    appendBody: (content, list, extra) => appendExamBody(content, list, courseNameMap, extra.examDesktopMaps, mode, opts)
  });
}

// 生成考试列表主体（按课程分组 / 扁平排序）并追加到 container，供「考试」与「已隐藏」两个页签复用。
function appendExamBody(container, list, courseNameMap, examDesktopMaps, mode, opts = {}) {
  appendGroupedList(container, list, courseNameMap, mode, opts, {
    courseSource: () => "",
    countText: g => {
      const courseMap = examDesktopMaps[`${g.courseId}_${g.clazzId}`] || {};
      return `${g.list.length} 项 · 电脑版${Object.keys(courseMap).length}`;
    },
    openLinkText: "打开本课考试集合页",
    onOpenCourse: openExamCourseList,
    buildList: (items, showCourse) => buildExamList(items, courseNameMap, examDesktopMaps, showCourse, opts),
    bodyLabel: "考试"
  });
}

// 「已隐藏」页签：分「已隐藏作业」「已隐藏考试」两块展示，均支持右键与「恢复」按钮取消隐藏
function renderHidden(courseNameMap, examDesktopMaps, mode) {
  const content = $("#content");
  content.innerHTML = "";

  const hiddenWorks = applyQueryAndCourse(PIPELINES.work.items.filter(w => hiddenStore.has("work", w)), courseNameMap);
  const hiddenExams = applyQueryAndCourse(PIPELINES.exam.items.filter(e => hiddenStore.has("exam", e)), courseNameMap);
  log("渲染已隐藏列表: 作业 " + hiddenWorks.length + " 个, 考试 " + hiddenExams.length + " 个, 排序 " + mode);

  if (hiddenWorks.length + hiddenExams.length === 0) {
    if (hasQueryOrCourse()) {
      content.appendChild(el("div", { class: "empty" }, emptyFilterNodes("已隐藏条目")));
    } else {
      // 空态引导：告知用户隐藏入口
      content.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "empty-title", text: "暂无已隐藏的作业或考试" }),
        el("div", { class: "empty-tip", text: "右键作业或考试可以将其隐藏" })
      ]));
    }
    return { workCount: 0, examCount: 0 };
  }

  const sections = [
    {
      label: "已隐藏作业",
      tip: "右键作业可以将其隐藏",
      count: hiddenWorks.length,
      build: c => appendWorkBody(c, hiddenWorks, courseNameMap, mode, { context: "hidden", flatHeader: false })
    },
    {
      label: "已隐藏考试",
      tip: "右键考试可以将其隐藏",
      count: hiddenExams.length,
      build: c => appendExamBody(c, hiddenExams, courseNameMap, examDesktopMaps, mode, { context: "hidden", flatHeader: false })
    }
  ];

  for (const s of sections) {
    content.appendChild(el("div", { class: "hidden-section-title" }, [
      el("span", { class: "hidden-section-name", text: s.label }),
      el("span", { class: "hidden-section-count", text: `${s.count} 项` })
    ]));
    if (s.count === 0) {
      content.appendChild(el("div", { class: "hidden-section-tip", text: "暂无 · " + s.tip }));
      continue;
    }
    s.build(content);
  }
  return { workCount: hiddenWorks.length, examCount: hiddenExams.length };
}

// 打开单个考试：优先电脑版，回退手机版
function openExam(exam, desktopUrl) {
  if (exam.expired) return;
  openTab(desktopUrl || exam.rawUrl);
  track("feature_used", { feature: "open_exam" });
}

// 打开某课电脑版考试集合页
async function openExamCourseList(courseId, clazzId) {
  try {
    const midHtml = await getMiddlePage(courseId, clazzId);
    const examEnc = /id="examEnc"[^>]*value="([^"]+)"/.exec(midHtml || "");
    if (!examEnc) { alert("无法获取该课考试入口"); return; }
    const cpi = /id="cpi"[^>]*value="([^"]+)"/.exec(midHtml) || [];
    const url = examListUrl(courseId, clazzId, { cpi: cpi[1] || "", enc: examEnc[1] });
    openTab(url);
  } catch (err) {
    alert("打开考试集合页失败：" + err.message);
  }
}

// 打开单个作业：优先电脑版链接，失败回退手机版
async function openWork(w, li) {
  const typeLabel = $(".work-link-type", li);
  // 上一轮已成功时标签停在「电脑版」，此时 orig 不能捕获「电脑版」——否则本轮失败（走手机版
  // 路径）后 1.5s 恢复会把失败结果改回「电脑版」，与失败矛盾。改取条目初始文案，
  // 与 buildWorkList 渲染一致：过期「已过期」/未过期「待打开」。
  const orig = typeLabel.textContent === "电脑版"
    ? (w.expired ? "已过期" : "待打开")
    : typeLabel.textContent;
  // 1.5s 内重复点击同一条目：先清掉上一轮遗留的恢复定时器，避免它覆盖本轮「获取中…」
  if (typeLabel._restoreTimer) clearTimeout(typeLabel._restoreTimer);
  typeLabel.textContent = "获取中…";
  typeLabel.style.color = "#1e6fff";
  try {
    const map = await getDesktopWorkMap(w.courseId, w.clazzId);
    const url = map[w.workId];
    if (url) {
      typeLabel.textContent = "电脑版";
      typeLabel.style.color = "#27ae60";
      openTab(url);
      track("feature_used", { feature: "open_work" });
    } else {
      typeLabel.textContent = "手机版";
      typeLabel.style.color = "#e67e22";
      log("⚠ 课程集合页无该作业电脑版链接 workId=" + w.workId + "，回退手机版");
      openTab(w.rawUrl);
      track("feature_used", { feature: "open_work" });
    }
  } catch (err) {
    typeLabel.textContent = "手机版";
    typeLabel.style.color = "#e67e22";
    log("✗ 打开电脑版失败:", err.message, "回退手机版");
    openTab(w.rawUrl);
    track("feature_used", { feature: "open_work" });
  } finally {
    // 成功命中电脑版时保留「电脑版」标签不再恢复；其余路径 1.5s 后恢复原文案
    if (typeLabel.textContent !== "电脑版") {
      typeLabel._restoreTimer = setTimeout(() => {
        // 守卫：新一轮点击的「获取中…」或已成功的「电脑版」不被旧定时器覆盖
        if (typeLabel.textContent !== "获取中…" && typeLabel.textContent !== "电脑版") {
          typeLabel.textContent = orig;
        }
      }, 1500);
    }
  }
}

async function getWorkEnc(courseId, clazzId) {
  const key = `${courseId}_${clazzId}`;
  if (desktopEncCache[key]) return desktopEncCache[key];

  // 轻量路径：只要中间页的 workEnc，不依赖作业链接提取是否成功
  const midHtml = await getMiddlePage(courseId, clazzId);
  if (!midHtml) throw new Error("无法进入课程中间页");
  // 注意：下面这类从 HTML 抠 enc/cpi 的正则与站点页面结构强耦合
  // （本文件同类的还有 cpi/examEnc 的提取），站点改版会静默失效；
  // 排查「电脑版链接全部为空」一类问题时，先人工核对一次页面结构再改这里。
  const workEncMatch = /id="workEnc"[^>]*value="([^"]+)"/.exec(midHtml);
  if (!workEncMatch) throw new Error("中间页未找到 workEnc");
  desktopEncCache[key] = workEncMatch[1];
  return desktopEncCache[key];
}

async function openCourseList(courseId, clazzId) {
  try {
    // 集合页必须带 enc（同 getDesktopWorkMap 内部抓取逻辑），否则会跳登录/报错
    const workEnc = await getWorkEnc(courseId, clazzId);
    const listUrl = cxUrl("https://mooc1.chaoxing.com/mooc2/work/list", {
      courseId, classId: clazzId, enc: workEnc
    });
    openTab(listUrl);
  } catch (err) {
    alert("打开集合页失败：" + err.message);
  }
}

// ============ 版本号 ============

// 从 manifest 读取当前扩展版本号，展示在侧边栏「留言反馈」下方
function renderVersion() {
  const tag = $("#versionTag");
  if (!tag) return;
  const version = getManifestVersion();
  tag.textContent = version ? "v" + version : "版本未知";
  tag.title = "当前扩展版本" + (version ? " v" + version : "");
  log("扩展版本:", version || "(未知)");
}

// ============ 高级页签解锁 ============

// 「高级」页签默认隐藏（普通用户用不到），只有连续点击左下角版本号 5 次才显示。
// 版本号刻意保持纯文本外观：不加 cursor:pointer、不加 hover 高亮、不做按钮样式，
// 避免被当成可点按钮误触。
const ADVANCED_CLICKS_NEEDED = 5;
// 两次点击间隔超过该值就重新计数，防止零散点击跨会话凑满 5 次而意外解锁
const ADVANCED_CLICK_RESET_MS = 1500;

let advancedClickCount = 0;
let advancedClickAt = 0;
let advancedUnlocked = false;

// 显示「高级」页签（不自动跳转，避免误触后被弹到调试页）
function revealAdvancedTab() {
  const li = $("#navAdvanced");
  if (li) li.style.display = "";
  setStatus("已显示「高级」页签");
  log("高级页签已显示（连续点击版本号）");
}

function setupAdvancedUnlock() {
  const tag = $("#versionTag");
  if (!tag) return;
  tag.addEventListener("click", () => {
    if (advancedUnlocked) return;
    const now = Date.now();
    advancedClickCount = (now - advancedClickAt > ADVANCED_CLICK_RESET_MS) ? 1 : advancedClickCount + 1;
    advancedClickAt = now;
    if (advancedClickCount < ADVANCED_CLICKS_NEEDED) return;
    advancedUnlocked = true;
    advancedClickCount = 0;
    revealAdvancedTab();
  });
}

// ============ 主流程 ============

// 两条数据链路（work=作业 / exam=考试）的 per-kind 状态与配置，统一收敛于 PIPELINES
//（原先以十来个零散的顶层变量 / 常量分别维护，现按 kind 合并）。
//   items        列表数据
//   loaded       「已加载」标记：不能用数组长度判断（空列表同样是加载成功），
//                否则空数据会反复触发同一请求，等于把高频调用又请回来。
//   inflight     各链路的在途 Promise：连点刷新 / 反复切页签时复用同一请求（并发去重）
//   flags        在途请求的语义：silent 失败默认只写日志；若期间点了「刷新」则记 force，失败时仍弹错误
//   ts / source  数据获取时间戳与来源（"cache"=读缓存 / "net"=本次请求所得），
//                用于工具栏右侧「数据/缓存 · Ns 前」提示
const PIPELINES = {
  work: {
    label: "作业",
    cacheKey: "chaoxing.cache.works.v1",
    loadingText: "正在逐科目检查作业…",
    trackFeature: "fetch_works",
    items: [],
    loaded: false,
    inflight: null,
    flags: { silent: false, force: false },
    ts: 0,
    source: ""
  },
  exam: {
    label: "考试",
    cacheKey: "chaoxing.cache.exams.v1",
    loadingText: "正在逐科目检查考试…",
    trackFeature: "fetch_exams",
    items: [],
    loaded: false,
    inflight: null,
    flags: { silent: false, force: false },
    ts: 0,
    source: ""
  }
};

let courseNameMap = {};
let examDesktopMaps = {};

function fingerprintWorks(items, names) {
  const namePart = names && typeof names === "object" ? JSON.stringify(names) : "";
  return items.map(w =>
    [w.courseId, w.clazzId, w.workId, w.status, w.expired ? 1 : 0, w.title].join("\t")
  ).join("\n") + "\n#" + namePart;
}

function fingerprintExams(items, maps) {
  return items.map(e => {
    const url = ((maps || {})[`${e.courseId}_${e.clazzId}`] || {})[e.examId] || "";
    return [e.courseId, e.clazzId, e.examId, e.status, e.expired ? 1 : 0, e.title, url].join("\t");
  }).join("\n");
}

// 正在阻塞加载的链路集合：两条链路并存时，全部结束才撤掉遮罩
const activeLoads = new Set();

// 静默刷新计数：>0 时显示「正在刷新数据中…」胶囊
let silentRefreshing = 0;

// 当前激活的 tab："work" | "exam" | "hidden" | "advanced"
let activeTab = "work";

// 当前排序方式："deadline-asc" | "deadline-desc" | "default"
let sortMode = "deadline-asc";

// 课程筛选项：下拉重建前先记在这里，避免数据未到时把偏好冲掉
let preferredCourseKey = "";

// ---------- 界面偏好（筛选 / 排序 / 页签，localStorage 持久化） ----------

// 刷新或重新打开后仍保留「仅看未完成」「仅看可提交」、排序方式和当前页签。
// 「高级」页签不持久化（默认隐藏，需连点版本号解锁）。
const UI_PREFS_KEY = "chaoxing.uiPrefs.v1";
const VALID_SORT = new Set(["deadline-asc", "deadline-desc", "default"]);
const VALID_TAB = new Set(["work", "exam", "hidden"]);

function readUiPrefs() {
  return readJsonStorage(UI_PREFS_KEY, {
    label: "界面偏好读取失败",
    validate: obj => {
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return true;
      log("⚠ 界面偏好格式异常，已忽略");
      return false;
    }
  });
}

function writeUiPrefs() {
  try {
    const sortEl = $("#sortSelect");
    const pendingEl = $("#onlyPending");
    const subEl = $("#onlySubmittable");
    const courseEl = $("#courseSelect");
    const searchEl = $("#searchInput");
    const payload = {
      onlyPending: !!(pendingEl && pendingEl.checked),
      onlySubmittable: !!(subEl && subEl.checked),
      sortMode: (sortEl && VALID_SORT.has(sortEl.value)) ? sortEl.value : "deadline-asc",
      activeTab: VALID_TAB.has(activeTab) ? activeTab : "work",
      courseKey: preferredCourseKey || ((courseEl && courseEl.value) || ""),
      searchQuery: searchEl ? searchEl.value : ""
    };
    // 停留在「高级」时不改写页签，避免刷新后落到作业页
    if (!VALID_TAB.has(activeTab)) {
      const prev = readUiPrefs();
      if (prev && VALID_TAB.has(prev.activeTab)) payload.activeTab = prev.activeTab;
    }
    writeJsonStorage(UI_PREFS_KEY, payload, { label: "界面偏好写入失败（本次会话仍生效）" });
  } catch (e) {
    log("✗ 界面偏好写入失败（本次会话仍生效）:", e.message);
  }
}

function applyUiPrefs() {
  const prefs = readUiPrefs();
  if (!prefs) return;
  const pendingEl = $("#onlyPending");
  const subEl = $("#onlySubmittable");
  const sortEl = $("#sortSelect");
  if (pendingEl && typeof prefs.onlyPending === "boolean") pendingEl.checked = prefs.onlyPending;
  if (subEl && typeof prefs.onlySubmittable === "boolean") subEl.checked = prefs.onlySubmittable;
  if (sortEl && VALID_SORT.has(prefs.sortMode)) {
    sortEl.value = prefs.sortMode;
    sortMode = prefs.sortMode;
  }
  if (VALID_TAB.has(prefs.activeTab)) {
    activeTab = prefs.activeTab;
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.type === activeTab));
  }
  const searchEl = $("#searchInput");
  if (searchEl && typeof prefs.searchQuery === "string") searchEl.value = prefs.searchQuery;
  if (typeof prefs.courseKey === "string") {
    preferredCourseKey = prefs.courseKey;
    const courseEl = $("#courseSelect");
    if (courseEl && prefs.courseKey) {
      if (![...courseEl.options].some(o => o.value === prefs.courseKey)) {
        courseEl.appendChild(el("option", { value: prefs.courseKey, text: "已选课程" }));
      }
      courseEl.value = prefs.courseKey;
    }
  }
  log("恢复界面偏好: onlyPending=" + !!(pendingEl && pendingEl.checked) +
    " onlySubmittable=" + !!(subEl && subEl.checked) +
    " sortMode=" + sortMode + " activeTab=" + activeTab +
    " courseKey=" + (preferredCourseKey || "(全部)") +
    " search=" + (searchEl ? searchEl.value : ""));
}

// ---------- 遮罩 / 静默刷新提示 ----------

// 加载遮罩：text 省略时沿用上一次文案
function setLoading(on, text) {
  const box = $("#loading");
  if (!box) return;
  if (text) $("#loadingText").textContent = text;
  box.style.display = on ? "flex" : "none";
}

function setLoadingFor(kind, on) {
  if (on) {
    activeLoads.add(kind);
    setLoading(true, PIPELINES[kind].loadingText);
  } else {
    activeLoads.delete(kind);
    if (!activeLoads.size) setLoading(false);
  }
}

// 后台静默刷新提示（数据已在屏幕上，只是正在悄悄取新数据，不阻塞操作）
function setRefreshPill(on) {
  silentRefreshing = Math.max(0, silentRefreshing + (on ? 1 : -1));
  const pill = $("#refreshPill");
  if (pill) pill.style.display = silentRefreshing > 0 ? "flex" : "none";
}

// ---------- 本地缓存 ----------

const CACHE_TTL_MS = 90000;
// 缓存键与遮罩/标签文案等 per-kind 配置见 PIPELINES[kind].cacheKey。
// MV3 扩展页面同源可用 localStorage，沿用 hiddenStore 的思路：不新增 storage 权限。

// 缓存结构（作业与考试各自独立、各自计时）：
//   work: { ts, items: WorkItem[], courseNameMap }
//   exam: { ts, items: ExamItem[], desktopMaps }
// 读写全部 try/catch：解析失败或存储不可用时降级为"不缓存"，不阻塞渲染。
function readCache(kind) {
  return readJsonStorage(PIPELINES[kind].cacheKey, {
    label: PIPELINES[kind].label + "缓存读取失败",
    validate: obj => {
      if (obj && typeof obj === "object" && typeof obj.ts === "number" && Array.isArray(obj.items)) return true;
      log("⚠ " + PIPELINES[kind].label + "缓存格式异常，已忽略");
      return false;
    }
  });
}

function writeCache(kind, payload) {
  writeJsonStorage(PIPELINES[kind].cacheKey, { ts: Date.now(), ...payload }, { label: PIPELINES[kind].label + "缓存写入失败（本次会话仍生效）" });
}

const cacheAgeMs = entry => (entry && typeof entry.ts === "number" ? Date.now() - entry.ts : Infinity);
const isCacheFresh = entry => cacheAgeMs(entry) < CACHE_TTL_MS;

// 缓存里的 remainMs 会随时间变旧，统一由 deadline 反推，
// 保证剩余时间文案、「仅看未完成」筛选与截止排序始终准确。
function rehydrateItems(items) {
  for (const it of items) {
    if (typeof it.deadline === "number") it.remainMs = it.deadline - Date.now();
  }
  return items;
}

// 把缓存装载为当前状态（同时把该链路标记为已加载）
function applyWorkCache(entry) {
  PIPELINES.work.items = rehydrateItems(entry.items);
  if (entry.courseNameMap && typeof entry.courseNameMap === "object") courseNameMap = entry.courseNameMap;
  PIPELINES.work.loaded = true;
  PIPELINES.work.ts = entry.ts;
  PIPELINES.work.source = "cache";
  hiddenStore.migrateBareIds("work", PIPELINES.work.items);
}

function applyExamCache(entry) {
  PIPELINES.exam.items = rehydrateItems(entry.items);
  if (entry.desktopMaps && typeof entry.desktopMaps === "object") examDesktopMaps = entry.desktopMaps;
  PIPELINES.exam.loaded = true;
  PIPELINES.exam.ts = entry.ts;
  PIPELINES.exam.source = "cache";
  hiddenStore.migrateBareIds("exam", PIPELINES.exam.items);
}

// ---------- 工具栏右侧的数据时间提示 ----------

let hintTimer = null;

// 当前页签展示的数据来源：已隐藏页取作业与考试里更旧的那份
function hintInfo() {
  if (activeTab === "exam") return PIPELINES.exam.loaded ? { ts: PIPELINES.exam.ts, src: PIPELINES.exam.source } : null;
  if (activeTab === "hidden") {
    const list = [];
    if (PIPELINES.work.loaded) list.push({ ts: PIPELINES.work.ts, src: PIPELINES.work.source });
    if (PIPELINES.exam.loaded) list.push({ ts: PIPELINES.exam.ts, src: PIPELINES.exam.source });
    if (!list.length) return null;
    return list.reduce((a, b) => (b.ts < a.ts ? b : a));
  }
  return PIPELINES.work.loaded ? { ts: PIPELINES.work.ts, src: PIPELINES.work.source } : null;
}

function updateDataHint() {
  const node = $("#cacheHint");
  if (!node) return;
  const info = activeTab === "advanced" ? null : hintInfo();
  if (!info || !info.ts) { node.style.display = "none"; return; }
  const age = Date.now() - info.ts;
  const fresh = age < CACHE_TTL_MS;
  node.style.display = "inline-flex";
  node.classList.toggle("stale", !fresh);
  node.textContent = `${info.src === "cache" ? "缓存" : "数据"} · ${formatAgo(age)}` + (fresh ? "" : " · 建议刷新");
  node.title = `${info.src === "cache" ? "缓存数据" : "数据"}获取于 ${new Date(info.ts).toLocaleTimeString()}，已过 ${formatAgo(age)}` +
    (fresh ? "（90 秒内再次打开不会重复请求）" : "，点「刷新」可立即更新");
}

// 秒数实时递增；只在提示可见时运行，切到「高级」页签即停
function startHintTimer() {
  if (hintTimer) return;
  hintTimer = setInterval(updateDataHint, 1000);
}

function stopHintTimer() {
  if (hintTimer) {
    clearInterval(hintTimer);
    hintTimer = null;
  }
}

// ---------- 数据链路：作业 / 考试（按需加载 + 并发去重 + 缓存） ----------

// ensureWorks / ensureExams 的公共骨架（两链路除参数化差异外逐行同构）：
//   force（手动刷新）→ 绕过缓存；缓存新鲜 → 直接用缓存、0 请求；
//   缓存过期 → 先渲染旧数据（页面秒开）再后台静默刷新；无缓存 → 弹遮罩加载。
// hooks 覆盖两条链路的全部非对称点：
//   applyCache     缓存装载（courseNameMap / examDesktopMaps 的归属与落态赋值各自不同）
//   fetchAndApply  发请求 + 落态 + writeCache + 成功日志，返回 same（去重比较键与成对
//                  apply 逻辑各自不同）。work 侧含电脑版链接缓存清理与 autoLoginTried
//                  补拉，exam 侧含 buildAllExamDesktopMaps，差异都收在各自闭包内。
function createEnsure(kind, { applyCache, fetchAndApply }) {
  const P = PIPELINES[kind];
  return async function ensure({ force = false, silent = false } = {}) {
    if (P.inflight) {
      if (force) {
        P.flags.force = true;
        log(P.label + "链路已在途，已记为强制刷新（失败时仍提示，不另发请求）");
      } else {
        log(P.label + "链路已在途，复用同一请求（去重）");
      }
      return P.inflight;
    }
    if (force) {
      log("强制刷新" + P.label + "（绕过缓存）");
    } else {
      const entry = readCache(kind);
      if (isCacheFresh(entry)) {
        applyCache(entry);
        log("✓ " + P.label + "命中新鲜缓存（" + formatAgo(cacheAgeMs(entry)) + "），本次不请求");
        render();
        track("feature_used", { feature: P.trackFeature });
        return;
      }
      if (entry) {
        applyCache(entry);
        log("↻ " + P.label + "缓存已过期（" + formatAgo(cacheAgeMs(entry)) + "），先渲染旧数据并后台静默刷新");
        render();
        silent = true;
      }
    }

    P.flags = { silent, force };
    P.inflight = (async () => {
      if (silent) setRefreshPill(true);
      else setLoadingFor(kind, true);
      if (!silent) hideError();
      try {
        const same = await fetchAndApply({ silent });
        // 本次网络加载成功（重新登录也已生效）：重新武装静默失效提醒。
        // 缓存命中路径在上方已提前 return，不会经过这里，故缓存数据不会误重置。
        silentLoginReminded = false;
        hideError();
        hideLoginCard();
        track("feature_used", { feature: P.trackFeature });
        if (same) {
          log(P.label + "数据无变化，跳过重绘（保留滚动位置）");
          updateDataHint();
        } else {
          render({ preserveScroll: silent });
        }
      } catch (err) {
        // 失败不覆盖已有数据与缓存：静默刷新失败只在日志里提示
        // 期间若点了「刷新」，按手动刷新把错误展示出来
        const treatAsForce = force || P.flags.force;
        if (await handleLoginFailure(err, { silent, loaded: P.loaded, treatAsForce, label: P.label })) {
          /* 未登录走登录卡，不再用底部 #error 长文案 */
        } else if (silent && P.loaded && !treatAsForce) {
          log("✗ 后台刷新" + P.label + "失败，保留现有数据:", err.message);
          track("error", { error: "request_failed" });
        } else {
          showError(err.message || String(err));
          setStatus("加载失败");
          track("error", { error: "request_failed" });
        }
      } finally {
        P.inflight = null;
        P.flags = { silent: false, force: false };
        if (silent) setRefreshPill(false);
        else setLoadingFor(kind, false);
      }
    })();
    return P.inflight;
  };
}

// 确保作业数据就绪
const ensureWorks = createEnsure("work", {
  applyCache: applyWorkCache,
  async fetchAndApply({ silent }) {
    // 真正发请求前才清电脑版链接缓存，避免沿用过期 enc/会话（读缓存时不清）
    for (const k of Object.keys(desktopCache)) delete desktopCache[k];
    for (const k of Object.keys(desktopEncCache)) delete desktopEncCache[k];

    // 课程名与作业聚合页并行（原实现是课程名先串行等待完，白多一个往返）
    let [names, workHtml] = await Promise.all([fetchCourseNames(), fetchStuWork()]);
    // 并行时课程名可能打在登录前；自动登录成功后再补一次
    if (autoLoginTried && !Object.keys(names).length) names = await fetchCourseNames();
    const items = parseWorks(workHtml);
    hiddenStore.migrateBareIds("work", items);

    const P = PIPELINES.work;
    const same = silent && P.loaded && fingerprintWorks(P.items, courseNameMap) === fingerprintWorks(items, names);
    courseNameMap = names;
    P.items = items;
    P.loaded = true;
    P.ts = Date.now();
    P.source = "net";
    writeCache("work", { items, courseNameMap });
    log("作业:", items.length, "个（含截止时间 " + items.filter(w => w.remainMs != null).length + " 个）; 已隐藏: 作业 " + hiddenStore.size("work") + " 个 / 考试 " + hiddenStore.size("exam") + " 个");
    return same;
  }
});

// 确保考试数据就绪（含电脑版链接映射）。语义与 ensureWorks 完全一致。
const ensureExams = createEnsure("exam", {
  applyCache: applyExamCache,
  async fetchAndApply({ silent }) {
    const exams = await fetchExams();
    // 失败时 fetchExams 抛 NeedLoginError，由 handleLoginFailure 统一处理，不会走到下面
    hiddenStore.migrateBareIds("exam", exams);

    // 静默刷新且某课考试集合没变时复用已有电脑版链接，跳过逐场 302 探测
    const maps = await buildAllExamDesktopMaps(exams, examDesktopMaps, { reuse: silent });
    const P = PIPELINES.exam;
    const same = silent && P.loaded && fingerprintExams(P.items, examDesktopMaps) === fingerprintExams(exams, maps);
    P.items = exams;
    P.loaded = true;
    P.ts = Date.now();
    P.source = "net";
    examDesktopMaps = maps;
    writeCache("exam", { items: exams, desktopMaps: examDesktopMaps });
    log("考试:", exams.length, "个（含截止时间 " + exams.filter(e => e.remainMs != null).length + " 个）");
    return same;
  }
});

// 打开页面：按上次保存的页签加载对应数据（作业 / 考试 / 已隐藏）。
// 90 秒内命中缓存时 ensureWorks/ensureExams 会直接返回，全程 0 请求。
async function bootstrap() {
  if (setupAgreement()) return; // 未同意：遮罩已弹出，禁止 track / render / 拉数据
  continueBootstrap();
}

// 同意协议后（或已 allow）才执行的启动逻辑；由同意回调与 bootstrap 调用。
// 各分支内部都会自行 render，这里先按已恢复的筛选/排序画一帧空态。
async function continueBootstrap() {
  if (agreedStarted) return;
  agreedStarted = true;
  log("======== 打开页面 ========");
  track("feature_used", { feature: "app_open" });
  render();
  if (activeTab === "exam") {
    if (!PIPELINES.exam.loaded) await ensureExams();
  } else if (activeTab === "hidden") {
    if (!PIPELINES.work.loaded) await ensureWorks();
    if (!PIPELINES.exam.loaded) await ensureExams();
  } else if (!PIPELINES.work.loaded) {
    await ensureWorks();
  }
}

// 手动刷新：只刷当前页签需要的数据，并绕过缓存强制取新
async function refreshCurrentTab() {
  log("手动刷新 · 页签:", activeTab);
  track("feature_used", { feature: "refresh" });
  if (activeTab === "exam") return ensureExams({ force: true });
  if (activeTab === "hidden") {
    await ensureWorks({ force: true });
    await ensureExams({ force: true });
    return;
  }
  if (activeTab === "advanced") {
    setStatus("高级 · 调试日志");
    return;
  }
  return ensureWorks({ force: true });
}

// 按当前 tab 渲染。opts.preserveScroll：静默刷新时尽量保住滚动位置，并关掉已失效的右键菜单
function render(opts = {}) {
  const scroller = $(".main-scroll");
  const keepTop = opts.preserveScroll && scroller ? scroller.scrollTop : null;
  if (keepTop != null) closeContextMenu();
  const listView = $("#listView");
  const advancedView = $("#advancedView");
  if (activeTab === "advanced") {
    listView.style.display = "none";
    advancedView.style.display = "block";
    setStatus("高级 · 调试日志");
    stopHintTimer();
    updateDataHint();
    updateNavBadges();
    if (keepTop != null && scroller) scroller.scrollTop = keepTop;
    return;
  }
  listView.style.display = "block";
  advancedView.style.display = "none";
  const onlyPending = $("#onlyPending").checked;
  const onlySubmittable = $("#onlySubmittable").checked;
  const sortSel = $("#sortSelect");
  if (sortSel) sortMode = sortSel.value;

  // 「已隐藏」视图下「仅看未完成/可提交」没有语义，隐藏对应筛选项避免误解
  const hideFilters = activeTab === "hidden";
  $$(".toolbar .filter").forEach(lbl => { lbl.style.display = hideFilters ? "none" : "flex"; });

  const hiddenWorkCount = hiddenStore.size("work");
  const hiddenExamCount = hiddenStore.size("exam");
  syncCourseSelect(PIPELINES.work.items.concat(PIPELINES.exam.items), courseNameMap);
  if (activeTab === "exam") {
    if (PIPELINES.exam.loaded) rehydrateItems(PIPELINES.exam.items);
    const visible = PIPELINES.exam.items.filter(e => !hiddenStore.has("exam", e));
    const shown = renderExams(PIPELINES.exam.items, onlyPending, onlySubmittable, courseNameMap, examDesktopMaps, sortMode, { context: "exam" });
    const s = summarizeExams(visible);
    const parts = [`未完成 ${s.pending}`, `可提交 ${s.submittable}`, `已过期 ${s.expired}`];
    if (hiddenExamCount) parts.push(`已隐藏 ${hiddenExamCount}`);
    if (shown.length !== visible.length) parts.push(`显示 ${shown.length}`);
    setStatus(parts.join(" · "));
  } else if (activeTab === "hidden") {
    if (PIPELINES.work.loaded) rehydrateItems(PIPELINES.work.items);
    if (PIPELINES.exam.loaded) rehydrateItems(PIPELINES.exam.items);
    const shown = renderHidden(courseNameMap, examDesktopMaps, sortMode) || { workCount: 0, examCount: 0 };
    const shownTotal = shown.workCount + shown.examCount;
    const hiddenTotal = hiddenWorkCount + hiddenExamCount;
    setStatus(`已隐藏：作业 ${hiddenWorkCount} 个 · 考试 ${hiddenExamCount} 个` +
      (shownTotal !== hiddenTotal ? ` · 显示 ${shownTotal}` : ""));
  } else {
    if (PIPELINES.work.loaded) rehydrateItems(PIPELINES.work.items);
    const visible = PIPELINES.work.items.filter(w => !hiddenStore.has("work", w));
    const shown = renderWorks(PIPELINES.work.items, onlyPending, onlySubmittable, courseNameMap, sortMode, { context: "work" });
    const s = summarizeWorks(visible);
    const parts = [`未完成 ${s.pending}`, `可提交 ${s.submittable}`, `已过期 ${s.expired}`];
    if (hiddenWorkCount) parts.push(`已隐藏 ${hiddenWorkCount}`);
    if (shown.length !== visible.length) parts.push(`显示 ${shown.length}`);
    setStatus(parts.join(" · "));
  }

  updateNavBadges();

  // 数据尚未就绪时，状态栏给出与遮罩一致的进度文案
  if (activeTab === "work" && !PIPELINES.work.loaded) {
    setStatus(PIPELINES.work.loadingText);
  } else if (activeTab === "exam" && !PIPELINES.exam.loaded) {
    setStatus(PIPELINES.exam.loadingText);
  } else if (activeTab === "hidden" && (!PIPELINES.work.loaded || !PIPELINES.exam.loaded)) {
    if (!PIPELINES.work.loaded && !PIPELINES.exam.loaded) setStatus("正在逐科目检查作业与考试…");
    else if (!PIPELINES.work.loaded) setStatus(PIPELINES.work.loadingText);
    else setStatus(PIPELINES.exam.loadingText);
  }

  updateDataHint();
  startHintTimer();
  if (keepTop != null && scroller) scroller.scrollTop = keepTop;
}

// 切换 tab：只加载该页签需要的数据（作业与考试各自独立链路）
function setTab(type) {
  activeTab = type;
  closeContextMenu();
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.type === type));
  log("切换页签:", type);
  writeUiPrefs();
  // 先把已有数据渲染出来（无数据时是空态，遮罩会盖住），再按需补数据
  render();

  if (type === "exam") {
    if (!PIPELINES.exam.loaded) ensureExams();
  } else if (type === "hidden") {
    // 「已隐藏」同时展示作业与考试，缺哪份补哪份（顺序执行，避免并发请求同一批接口）
    (async () => {
      if (!PIPELINES.work.loaded) await ensureWorks();
      if (!PIPELINES.exam.loaded) await ensureExams();
    })();
  } else if (type === "work") {
    if (!PIPELINES.work.loaded) ensureWorks();
  }
}

function setStatus(text) { $("#status").textContent = text; }
function showError(msg) {
  const box = $("#error");
  box.style.display = "block";
  box.textContent = msg;
}
function hideError() { $("#error").style.display = "none"; }

// ============ 事件绑定 ============

function persistAndRender() {
  writeUiPrefs();
  render();
}

$("#refreshBtn").addEventListener("click", refreshCurrentTab);
$("#onlyPending").addEventListener("change", persistAndRender);
$("#onlySubmittable").addEventListener("change", persistAndRender);
$("#sortSelect").addEventListener("change", persistAndRender);
$("#courseSelect").addEventListener("change", () => {
  preferredCourseKey = $("#courseSelect").value;
  persistAndRender();
});
let searchTimer = null;
$("#searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(persistAndRender, 120);
});
$("#searchInput").addEventListener("search", persistAndRender);
$("#searchInput").addEventListener("keydown", e => {
  if (e.key === "Escape") {
    e.preventDefault();
    $("#searchInput").value = "";
    persistAndRender();
  }
});
document.addEventListener("keydown", e => {
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  e.preventDefault();
  const box = $("#searchInput");
  if (box) box.focus();
});
$$(".tab").forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.type)));
$("#clearLog").addEventListener("click", () => { $("#logBody").innerHTML = ""; });

const loginForm = $("#loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const phone = ($("#loginPhone") && $("#loginPhone").value.trim()) || "";
    const password = ($("#loginPassword") && $("#loginPassword").value) || "";
    if (!phone || !password) {
      setLoginError("请输入手机号和密码");
      return;
    }
    const btn = $("#loginSubmit");
    if (btn) btn.disabled = true;
    setLoginError("");
    try {
      await cxLogin({ phone, password });
      autoLoginTried = true;
      autoLoginOk = true;
      if ($("#loginRemember") && $("#loginRemember").checked) {
        if (!(await writeSavedLogin(phone, password))) {
          log("✗ 已登录，但本机加密保存失败");
          setStatus("已登录，本机保存失败，下次仍需手动登录");
        }
      } else await clearSavedLogin();
      hideLoginCard();
      track("feature_used", { feature: "login" });
      await refreshCurrentTab();
    } catch (err) {
      setLoginError(err.message || String(err));
      track("error", { error: "login_failed" });
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}
const loginOpenPage = $("#loginOpenPage");
if (loginOpenPage) {
  loginOpenPage.addEventListener("click", () => openTab(CX_PASSPORT_PAGE));
}
const loginClear = $("#loginClear");
if (loginClear) {
  loginClear.addEventListener("click", async () => {
    await clearSavedLogin();
    autoLoginTried = false;
    autoLoginOk = false;
    const phoneEl = $("#loginPhone");
    const passEl = $("#loginPassword");
    if (phoneEl) phoneEl.value = "";
    if (passEl) passEl.value = "";
    const remEl = $("#loginRemember");
    if (remEl) remEl.checked = false;
    setLoginError("已清除本机保存的账号");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderVersion();
  setupAdvancedUnlock();
  applyUiPrefs();
  bootstrap();
});
