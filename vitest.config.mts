import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: [{ find: /^react-native$/, replacement: "react-native-web" }],
  },
  oxc: { jsx: { runtime: "automatic" } },
});
