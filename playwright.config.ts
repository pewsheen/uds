import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/smoke",
  fullyParallel: false,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "reports/playwright" }],
  ],
});
