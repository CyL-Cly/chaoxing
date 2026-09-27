// ba-click-fx：《蔚蓝档案》风格点击特效（MIT，https://github.com/CialloKing/ba-click-fx）
// 默认常开；用户系统开启「减弱动态效果」时跳过；初始化失败仅告警，不影响扩展功能。
import { BAClickFX } from "./ba-click-fx.js";

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
  } catch (e) {
    console.warn("点击特效初始化失败:", e);
  }
}
