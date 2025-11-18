import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:8080";
const proxyPaths = [
  "/documents",
  "/search",
  "/upload",
  "/mcp",
  "/chunks",
  "/stats",
  "/metrics",
  "/attachments",
  "/health",
  "/queue"
];

const proxy = Object.fromEntries(
  proxyPaths.map((path) => [path, { target: proxyTarget, changeOrigin: true }])
);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy
  }
});
