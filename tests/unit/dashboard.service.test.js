const { loadGasContext } = require("../helpers/gasTestHarness");

describe("DashboardService", () => {
  let ctx;

  beforeEach(() => {
    ctx = loadGasContext();
  });

  test("handleDashboardRequest rejects missing token", () => {
    const response = ctx.handleDashboardRequest({});
    expect(JSON.parse(response.getContent())).toEqual({
      status: "error",
      message: "Missing Token"
    });
  });

  test("handleDashboardRequest returns cached data when cache is fresh", () => {
    ctx.verifyIdToken = vi.fn(() => ({ sub: "user-1" }));
    ctx.isUserAllowed = vi.fn(() => true);
    ctx.fetchFromNotion = vi.fn();
    ctx.__scriptCache.put("notion_last_update", "100");
    ctx.__scriptCache.put("notion_data_v4_2026-07-01_2026-07-12", JSON.stringify([{ bg: 120 }]));
    ctx.__scriptCache.put("notion_data_v4_2026-07-01_2026-07-12_time", "100");

    const response = ctx.handleDashboardRequest({
      idToken: "token",
      startDate: "2026-07-01",
      endDate: "2026-07-12"
    });

    expect(JSON.parse(response.getContent())).toEqual({
      status: "ok",
      data: [{ bg: 120 }]
    });
    expect(ctx.fetchFromNotion).not.toHaveBeenCalled();
  });

  test("handleWebSubmitRequest validates user, payload and save call", () => {
    ctx.getUserIdFromToken = vi.fn(() => "user-1");
    ctx.isUserAllowed = vi.fn(() => true);
    ctx.saveToNotion = vi.fn(() => ({ success: true }));

    const response = ctx.handleWebSubmitRequest({
      accessToken: "token",
      petName: "斑斑",
      bg: "122",
      insulin: "",
      food: "",
      time: "2026-07-12T09:15",
      note: ""
    });

    expect(ctx.saveToNotion).toHaveBeenCalledWith(
      "122",
      "0",
      "0",
      "無",
      "2026-07-12 09:15:00+08:00",
      "斑斑"
    );
    expect(JSON.parse(response.getContent())).toEqual({
      status: "ok",
      message: ""
    });
  });
});
