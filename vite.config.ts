import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      // every API belongs to spback now, including Kimi chat and scheduling.
      "/api": {
        target: "http://127.0.0.1:6000",
        changeOrigin: true,
      },
    },
  },
});


// miss Dutt if you are reading this,
// im trying to build the frontend by using the app vites,
// it has a free code showcase so there is no plagiarism here :)
