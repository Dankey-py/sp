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
      // Keep the existing Flask user endpoint available during development.
      // Other /api routes, including /api/chat, are handled by React Router.
      "/api/user": {
        target: "http://localhost:6000",
        changeOrigin: true,
      },
    },
  },
});


// miss Dutt if you are reading this,
// im trying to build the frontend by using the app vites, 
// it has a free code showcase so there is no plagiarism here :)
