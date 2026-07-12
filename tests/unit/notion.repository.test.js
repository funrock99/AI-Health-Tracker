const { loadGasContext } = require("../helpers/gasTestHarness");

function createResponse(code, body) {
  return {
    getResponseCode() {
      return code;
    },
    getContentText() {
      return JSON.stringify(body);
    }
  };
}

describe("NotionRepository", () => {
  test("fetchFromNotion maps mixed property names across pages", () => {
    const ctx = loadGasContext();
    ctx.NOTION_TOKEN = "token";
    ctx.DATABASE_ID = "db";

    const safeFetch = vi
      .fn()
      .mockReturnValueOnce(
        createResponse(200, {
          results: [
            {
              properties: {
                "寵物名字": { title: [{ text: { content: "斑斑" } }] },
                "血糖值": { number: 111 },
                "胰島素劑量": { number: 1.5 },
                "餵食量": { number: 20 },
                "時間": { date: { start: "2026-07-10T08:30:00+08:00" } },
                "備註": { rich_text: [{ text: { content: "飯後" } }] }
              }
            }
          ],
          has_more: true,
          next_cursor: "cursor-2"
        })
      )
      .mockReturnValueOnce(
        createResponse(200, {
          results: [
            {
              properties: {
                "姓名": { title: [{ text: { content: "咪咪" } }] },
                "血糖值": { number: 98 },
                "胰島素": { number: 0.5 },
                "飲食量": { number: 15 },
                "時間": { date: { start: "2026-07-11T09:00:00+08:00" } },
                "備註": { rich_text: [] }
              }
            }
          ],
          has_more: false,
          next_cursor: null
        })
      );

    ctx.safeFetch = safeFetch;

    const result = ctx.fetchFromNotion("2026-07-01", "2026-07-12");

    expect(result).toEqual([
      {
        pet: "斑斑",
        bg: 111,
        insulin: 1.5,
        food: 20,
        time: "2026-07-10T08:30:00+08:00",
        note: "飯後"
      },
      {
        pet: "咪咪",
        bg: 98,
        insulin: 0.5,
        food: 15,
        time: "2026-07-11T09:00:00+08:00",
        note: ""
      }
    ]);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  test("saveToNotion updates last update cache on success", () => {
    const ctx = loadGasContext();
    ctx.NOTION_TOKEN = "token";
    ctx.DATABASE_ID = "db";
    ctx.safeFetch = vi.fn(() => ({
      getResponseCode() {
        return 200;
      },
      getContentText() {
        return "{}";
      }
    }));

    const result = ctx.saveToNotion("120", "1", "10", "無", "2026-07-12 08:30:00+08:00", "斑斑");

    expect(result).toEqual({ success: true });
    expect(ctx.__scriptCache.get("notion_last_update")).toBeTruthy();
  });
});
