import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://192.168.0.57:8080";
const proxy: Record<string, any> = {
  "/api": {
    target: proxyTarget,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, "")
  },
  "/metrics": { target: proxyTarget, changeOrigin: true },
  "/health": { target: proxyTarget, changeOrigin: true }
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy
  }
});
