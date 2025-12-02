// 提供运行时默认值，避免 404 返回 HTML 导致语法错误；Docker 启动时会覆盖此文件
(function () {
  if (typeof window === "undefined") return;
  window.__API_BASE__ = window.__API_BASE__ || "/api";
  window.__API_TOKEN__ = window.__API_TOKEN__ || "dev-token";
  window.__PREVIEW_BASE__ = window.__PREVIEW_BASE__ || "";
})();
