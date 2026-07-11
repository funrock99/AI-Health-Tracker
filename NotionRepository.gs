/**
 * Notion API：寫入資料
 */
function saveToNotion(bg, insulin, food, note, time, petName) {
  const tag = "NotionSave";
  try {
    const url = 'https://api.notion.com/v1/pages';
    const payload = {
      parent: { database_id: DATABASE_ID },
      properties: {
        "寵物名字": { title: [{ text: { content: petName || PET_NAME } }] },
        "血糖值": { number: parseFloat(bg) || 0 },
        "胰島素劑量": { number: parseFloat(insulin) || 0 },
        "餵食量": { number: parseFloat(food) || 0 },
        "時間": { date: { start: time } },
        "備註": { rich_text: [{ text: { content: note } }] }
      }
    };
    const options = {
      method: 'post',
      headers: { 
        'Authorization': 'Bearer ' + NOTION_TOKEN, 
        'Content-Type': 'application/json', 
        'Notion-Version': '2022-06-28' 
      },
      payload: JSON.stringify(payload)
    };
    const res = safeFetch(url, options, tag);
    const code = res ? res.getResponseCode() : 500;
    const content = res ? res.getContentText() : "No response";
    const success = code === 200;
    
    // 如果寫入成功，更新最後異動時間，以使快取失效
    if (success) {
      CacheService.getScriptCache().put("notion_last_update", Date.now().toString(), 21600);
      return { success: true };
    } else {
      SysLog.error(tag, `HTTP ${code}`, content);
      return { success: false, error: `HTTP ${code}: ${content}` };
    }
  } catch (e) {  
    SysLog.error(tag, "Unexpected Error", e.message);
    return { success: false, error: e.message }; 
  }
}

/**
 * Notion API：讀取歷史數據 (支援分頁、日期過濾、限制筆數)
 */
function fetchFromNotion(startDate, endDate) {
  const tag = "NotionQuery";
  let allResults = [];
  let hasMore = true;
  let nextCursor = null;
  const MAX_RECORDS = 300; // 限制單次回傳最大筆數

  try {
    const url = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
    
    const filter = { and: [] };
    if (startDate) {
      filter.and.push({ property: '時間', date: { on_or_after: startDate } });
    }
    if (endDate) {
      filter.and.push({ property: '時間', date: { on_or_before: endDate } }); 
    }

    while (hasMore && allResults.length < MAX_RECORDS) {
      const payload = {
        sorts: [{ property: '時間', direction: 'ascending' }],
        page_size: 100 // 單頁限制
      };
      
      if (filter.and.length > 0) {
        payload.filter = filter;
      }
      if (nextCursor) payload.start_cursor = nextCursor;

      const options = {
        method: 'post',
        headers: { 
          'Authorization': 'Bearer ' + NOTION_TOKEN, 
          'Content-Type': 'application/json', 
          'Notion-Version': '2022-06-28' 
        },
        payload: JSON.stringify(payload)
      };

      const res = safeFetch(url, options, tag);
      if (!res || res.getResponseCode() !== 200) {
        let errorMsg = res ? res.getContentText() : "Unknown error";
        throw new Error("Failed to fetch data from Notion: " + errorMsg);
      }
      
      const data = JSON.parse(res.getContentText());
      allResults = allResults.concat(data.results);
      hasMore = data.has_more;
      nextCursor = data.next_cursor;
    }

    // 如果超過最大筆數，進行截斷
    if (allResults.length > MAX_RECORDS) {
      allResults = allResults.slice(0, MAX_RECORDS);
    }

    return allResults.map(p => {
      const props = p.properties;
      return {
        pet: (props["寵物名字"] && props["寵物名字"].title && props["寵物名字"].title.length > 0) ? props["寵物名字"].title[0].text.content : 
             ((props["姓名"] && props["姓名"].title && props["姓名"].title.length > 0) ? props["姓名"].title[0].text.content : PET_NAME),
        bg: (props["血糖值"] && props["血糖值"].number) ? props["血糖值"].number : 0,
        insulin: (props["胰島素劑量"] && props["胰島素劑量"].number) ? props["胰島素劑量"].number : ((props["胰島素"] && props["胰島素"].number) ? props["胰島素"].number : 0),
        food: (props["餵食量"] && props["餵食量"].number) ? props["餵食量"].number : ((props["飲食量"] && props["飲食量"].number) ? props["飲食量"].number : 0),
        time: (props["時間"] && props["時間"].date) ? props["時間"].date.start : "",
        note: (props["備註"] && props["備註"].rich_text && props["備註"].rich_text.length > 0) ? props["備註"].rich_text[0].text.content : ""
      };
    });
  } catch (e) {
    SysLog.error(tag, "Query Failed", e.message);
    return [];
  }
}
