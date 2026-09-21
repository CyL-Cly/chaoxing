// 点击工具栏图标：已有扩展页则切过去，避免反复新开标签
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("app.html");
  try {
    const tabs = await chrome.tabs.query({ url });
    const tab = tabs && tabs[0];
    if (tab && tab.id) {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
      return;
    }
  } catch (e) {
    console.warn("复用已开标签失败，改为新建:", e);
  }
  await chrome.tabs.create({ url });
});
