const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173"
  },
  webServer: {
    command: "node tests/e2e/static-server.cjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true
  }
});
