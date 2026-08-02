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
      // Keep Kimi's /api/chat route inside React Router and forward the
      // remaining API surface to Flask over the same browser origin.
      "^/api/(?!chat(?:/|$)|schedule(?:/|$))": {
        target: "http://127.0.0.1:6000",
        changeOrigin: true,
      },
    },
  },
});


// miss Dutt if you are reading this,
// im trying to build the frontend by using the app vites, 
// it has a free code showcase so there is no plagiarism here :)
