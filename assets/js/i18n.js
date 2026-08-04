/* 客户端中英切换（v0.5.7 双语 UI）
 * GitHub Pages 不支持 jekyll-polyglot，用 JS + localStorage 实现：
 *  - 默认 site.lang（en）
 *  - 切换后 localStorage 记忆
 *  - 替换所有 [data-i18n] 元素 + 分类徽章 + 导航链接 */
(function () {
  var DEFAULT_LANG = window.SITE_LANG || "en";
  var I18N = window.SITE_I18N || {};

  function currentLang() {
    var saved = null;
    try { saved = localStorage.getItem("site_lang"); } catch (e) {}
    return saved || DEFAULT_LANG;
  }

  function applyLang(lang) {
    document.documentElement.setAttribute("data-lang", lang);
    // 替换 data-i18n 元素
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      var parts = key.split(".");
      var val = I18N;
      for (var j = 0; j < parts.length && val; j++) val = val[parts[j]];
      if (val && val[lang]) nodes[i].textContent = val[lang];
    }
    // 更新切换按钮显示（当前语言高亮）
    var btn = document.getElementById("lang-switcher");
    if (btn) {
      var cur = btn.querySelector(".lang-cur");
      var other = btn.querySelector(".lang-other");
      if (lang === "zh") {
        if (cur) cur.textContent = "中";
        if (other) other.textContent = "EN";
      } else {
        if (cur) cur.textContent = "EN";
        if (other) other.textContent = "中";
      }
    }
  }

  function toggleLang() {
    var next = currentLang() === "zh" ? "en" : "zh";
    try { localStorage.setItem("site_lang", next); } catch (e) {}
    applyLang(next);
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyLang(currentLang());
    var btn = document.getElementById("lang-switcher");
    if (btn) btn.addEventListener("click", toggleLang);
  });
})();
