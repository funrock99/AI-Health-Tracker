const { test, expect } = require("@playwright/test");
const { dashboardData, draftData } = require("./fixtures");

function buildLiffStub({ loggedIn = true } = {}) {
  return `
    window.__closeWindowCalled = false;
    window.liff = {
      init: async () => {},
      isLoggedIn: () => ${loggedIn ? "true" : "false"},
      login: () => { window.__loginCalled = true; },
      logout: () => { window.__logoutCalled = true; },
      getProfile: async () => ({ displayName: '測試使用者', pictureUrl: 'https://example.com/avatar.png' }),
      getIDToken: () => 'id-token',
      getAccessToken: () => 'access-token',
      isInClient: () => true,
      closeWindow: () => { window.__closeWindowCalled = true; }
    };
  `;
}

async function stubExternalScripts(page) {
  await page.route("https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css", route =>
    route.fulfill({ body: "" })
  );
  await page.route("https://cdn.jsdelivr.net/npm/chart.js", route =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.Chart = function(ctx, config) { this.config = config; this.destroy = function() {}; window.__lastChartConfig = config; };"
    })
  );
  await page.route("https://static.line-scdn.net/liff/edge/2/sdk.js", route =>
    route.fulfill({ contentType: "application/javascript", body: "" })
  );
}

test("dashboard renders data after LIFF login", async ({ page }) => {
  await stubExternalScripts(page);
  await page.addInitScript(buildLiffStub());
  await page.route("**/exec", async route => {
    const body = JSON.parse(route.request().postData());
    expect(body.action).toBe("getDashboardData");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", data: dashboardData })
    });
  });

  await page.goto("/index.html");

  await expect(page.locator("#user-name")).toHaveText("測試使用者");
  await expect(page.locator("#filter-section")).toBeVisible();
  await expect(page.locator("#petSelector")).toHaveValue("斑斑");
  await expect.poll(() => page.evaluate(() => window.__lastChartConfig.data.datasets[0].label)).toBe("斑斑 的血糖值 (mg/dL)");
});

test("form loads draft data and submits to GAS", async ({ page }) => {
  await stubExternalScripts(page);
  await page.addInitScript(buildLiffStub());

  const alerts = [];
  page.on("dialog", async dialog => {
    alerts.push(dialog.message());
    await dialog.accept();
  });

  await page.route("**/exec", async route => {
    const body = JSON.parse(route.request().postData());

    if (body.action === "getDraftData") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", data: draftData })
      });
      return;
    }

    if (body.action === "webSubmit") {
      expect(body.petName).toBe("斑斑");
      expect(body.bg).toBe("123");
      expect(body.insulin).toBe("1");
      expect(body.food).toBe("30");
      expect(body.note).toBe("測試草稿");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" })
      });
      return;
    }

    throw new Error(`Unexpected action: ${body.action}`);
  });

  await page.goto("/form.html?draftId=test-draft");

  await expect(page.locator("#petName")).toHaveValue("斑斑");
  await expect(page.locator("#bg")).toHaveValue("123");
  await expect(page.locator("#time")).toHaveValue("2026-07-12T10:45");

  await page.locator("#recordForm").evaluate(form => form.requestSubmit());

  await expect.poll(() => alerts[0]).toBe("✅ 紀錄已成功同步至 Notion！");
  await expect.poll(() => page.evaluate(() => window.__closeWindowCalled)).toBe(true);
});
