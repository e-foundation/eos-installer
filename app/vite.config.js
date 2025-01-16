import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  base: "",
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@zip.js/zip.js/dist/z-worker-pako.js",
          dest: "vendor",
        },
        {
          src: "node_modules/pako/dist/pako_inflate.min.js",
          dest: "vendor",
        },
      ],
    }),
  ],
});
