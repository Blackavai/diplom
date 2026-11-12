import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  // Only proxy configuration is read here; backend secrets are never exposed to the browser.
  const env = loadEnv(mode, process.cwd(), "API_PROXY_TARGET")
  const target = process.env.API_PROXY_TARGET || env.API_PROXY_TARGET || "http://127.0.0.1:5000"
  const proxy = {
    "^/api(?:/|$)": { target, changeOrigin: true },
    "^/api-docs(?:/|$)": { target, changeOrigin: true },
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: { host: "0.0.0.0", port: 5173, strictPort: true, proxy },
    preview: { proxy },
  }
})
