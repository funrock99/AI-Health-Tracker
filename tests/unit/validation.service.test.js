const { loadGasContext } = require("../helpers/gasTestHarness");

describe("validateHealthData", () => {
  test("accepts valid health data", () => {
    const ctx = loadGasContext();
    const result = ctx.validateHealthData({
      glucose: 135,
      insulin: 1.5,
      food: 30,
      datetime: "2026-07-12 08:30"
    });

    expect(result).toEqual({ isValid: true, errors: [] });
  });

  test("rejects missing glucose", () => {
    const ctx = loadGasContext();
    const result = ctx.validateHealthData({
      insulin: 1,
      food: 20
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("未偵測到血糖數值");
  });

  test("rejects invalid insulin, food and datetime", () => {
    const ctx = loadGasContext();
    const result = ctx.validateHealthData({
      glucose: 100,
      insulin: -1,
      food: 2000,
      datetime: "not-a-date"
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("胰島素必須為非負數");
    expect(result.errors).toContain("飲食量 2000 克異常過多");
    expect(result.errors).toContain("解析的時間格式無效: not-a-date");
  });
});
