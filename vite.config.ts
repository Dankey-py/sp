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
      // with options:
      // http://localhost:5173/api/bar
      //   -> http://jsonplaceholder.typicode.com/bar
      '/api': {
        target: 'http://localhost:6000',
        // -> http://localhost:6000/bar
        changeOrigin: true,
      },
    },
  },
});


// miss Dutt if you are reading this,
// im trying to build the frontend by using the app vites, 
// it has a free code showcase so there is no plagiarism here :)