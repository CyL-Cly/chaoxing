// ba-click-fx：《蔚蓝档案》风格点击特效（MIT，https://github.com/CialloKing/ba-click-fx）
// 默认常开；用户系统开启「减弱动态效果」时跳过；工具栏「关闭蔚蓝档案效果」勾选后停用，
// 偏好写入 localStorage（chaoxing.uiPrefs.v1，与 app.js 的界面偏好同键，只增不覆盖）。
// 初始化失败仅告警，不影响扩展功能。
import { BAClickFX } from "./ba-click-fx.js";

const FX_PREFS_KEY = "chaoxing.uiPrefs.v1";

function fxDisabled() {
  try {
    const obj = JSON.parse(localStorage.getItem(FX_PREFS_KEY) || "null");
    return !!(obj && obj.fxOff === true);
  } catch (e) {
    return false;
  }
}

// 只写 fxOff 一个字段，其余界面偏好原样保留
function saveFxOff(off) {
  try {
    const raw = localStorage.getItem(FX_PREFS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      obj.fxOff = !!off;
      localStorage.setItem(FX_PREFS_KEY, JSON.stringify(obj));
    }
  } catch (e) {
    console.warn("点击特效偏好写入失败:", e);
  }
}

if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  try {
    const fx = new BAClickFX({
      outputCompositing: "browser-overlay",
      hostCompositing: "screen",
      hostCompositingSurface: "dom-backdrop",
    });
    // 特效主题色跟随 UI 强调色：浅色 #1496ff / 深色 #3aa4ff，并随系统切换实时更新
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => fx.setThemeColor(scheme.matches ? "#3aa4ff" : "#1496ff");
    applyTheme();
    scheme.addEventListener("change", applyTheme);

    const box = document.getElementById("fxOff");
    if (box) {
      box.checked = fxDisabled();
      if (box.checked) fx.setPaused(true, { clear: true });
      box.addEventListener("change", () => {
        fx.setPaused(box.checked, { clear: true });
        saveFxOff(box.checked);
      });
    }
  } catch (e) {
    console.warn("点击特效初始化失败:", e);
  }
}
