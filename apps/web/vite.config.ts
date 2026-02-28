import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
const allowedHosts = [
  "localhost",
  "127.0.0.1",
  ".up.railway.app",
  ...(railwayDomain ? [railwayDomain] : []),
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    allowedHosts,
  },
});
