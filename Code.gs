/**
 * 寵物血糖紀錄系統 - Google Apps Script (GAS) 後端 (v2.0 正式版)
 * 
 * 核心功能：
 * 1. LINE 多步驟引導輸入 (寵物名字 -> 血糖 -> 胰島素 -> 餵食量 -> 備註)
 * 2. 台灣時區自動修正 (+08:00)，確保 Notion 顯示正確時間
 * 3. 雙重防呆邏輯：狀態原子檢查 + 資料即時銷毀，徹底杜絕重複提交
 * 4. 支援 Notion API 分頁讀取，可完整抓取所有歷史數據
 */

const properties = PropertiesService.getScriptProperties();
const NOTION_TOKEN = properties.getProperty('NOTION_TOKEN');
const DATABASE_ID = properties.getProperty('DATABASE_ID');
const LINE_ACCESS_TOKEN = properties.getProperty('LINE_ACCESS_TOKEN');
const APP_SECRET = properties.getProperty('APP_SECRET') || "my-secret-key"; 
const ALLOWED_USERS = properties.getProperty('ALLOWED_USERS') ? properties.getProperty('ALLOWED_USERS').split(',') : []; 
const PET_NAME = properties.getProperty('PET_NAME') || "斑斑"; 
const GEMINI_API_KEY = properties.getProperty('GEMINI_API_KEY');

function doGet(e) {
  const tag = "GetRequest";
  try {
    const action = e.parameter.action;
    const key = e.parameter.key;
    
    // 1. 簡易健康檢查 (不需金鑰)
    if (action === 'healthCheck') {
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok', version: '2.1' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. 安全檢查：驗證金鑰
    if (key !== APP_SECRET) {
      SysLog.warn(tag, "Unauthorized access attempt", { key: key });
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getData') {
      const data = fetchFromNotion();
      return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput("Invalid Action");
  } catch (err) {
    SysLog.error(tag, "Unexpected Error", err.message);
    return ContentService.createTextOutput("Error: " + err.message);
  }
}

/**
 * 驗證 LIFF 提供的 Access Token 並取得 userId
 */
function getUserIdFromToken(accessToken) {
  try {
    const url = 'https://api.line.me/v2/profile';
    const options = {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    };
    const res = safeFetch(url, options, "VerifyLIFFToken");
    if (res && res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText()).userId;
    }
    return null;
  } catch (e) { 
    SysLog.error("VerifyLIFFToken", "Parse Error", e.message);
    return null; 
  }
}

/**
 * 處理 POST 請求 - LINE Webhook 核心邏輯
 */
function doPost(e) {
  const tag = "Webhook";
  try {
    if (!e || !e.postData || !e.postData.contents) {
      SysLog.warn(tag, "Empty Payload received");
      return ContentService.createTextOutput("Empty Payload");
    }
    const contents = JSON.parse(e.postData.contents);
    SysLog.info(tag, "Received Payload", contents);
    
    // --- 新增：處理來自網頁表單 (LIFF) 的提交 ---
    if (contents.action === 'webSubmit') {
      const subTag = "WebSubmit";
      // 安全檢查：驗證 LIFF Token
      const userId = getUserIdFromToken(contents.accessToken);
      if (!userId || (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(userId))) {
        SysLog.warn(subTag, "Unauthorized attempt", { userId: userId });
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Forbidden' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const { petName, bg, insulin, food, time, note } = contents;
      const finalTime = time.replace('T', ' ') + ":00+08:00";
      const success = saveToNotion(bg, insulin || "0", food || "0", note || "無", finalTime, petName);
      
      SysLog.info(subTag, success ? "Success" : "Failed", { pet: petName, bg: bg });
      return ContentService.createTextOutput(JSON.stringify({ status: success ? 'ok' : 'error' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // --- 原有邏輯：處理 LINE 驗證與事件 ---
    if (!contents.events || contents.events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({status: 'ok'})).setMimeType(ContentService.MimeType.JSON);
    }

    const event = contents.events[0];
    const replyToken = event.replyToken;
    const userId = event.source.userId;

    // --- 1. 優先處理「查詢 ID」指令 (對所有人開放) ---
    if (event.type === 'message' && event.message.type === 'text') {
      const userMsg = event.message.text.trim();
      const lowerMsg = userMsg.toLowerCase();
      if (lowerMsg === "我的id" || lowerMsg === "id") {
        replyMessage(replyToken, "🔍 您的 LINE userId 為：\n" + userId + "\n\n(請將此 ID 填入 GAS 的 ALLOWED_USERS 屬性中)");
        return ContentService.createTextOutput("ok");
      }
    }

    // --- 2. 針對其餘 LINE 聊天室事件的白名單檢查 ---
    if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(userId)) {
      SysLog.warn(tag, "Forbidden User", { userId: userId });
      replyMessage(replyToken, "⚠️ 您目前為非授權人員，無法使用紀錄功能。\n請將您的 ID 提供給管理員以獲得權限。");
      return ContentService.createTextOutput(JSON.stringify({status: 'ok'})).setMimeType(ContentService.MimeType.JSON);
    }

    const cache = CacheService.getUserCache();

    // --- 3. 處理語音訊息 (音訊分析) ---
    if (event.type === 'message' && event.message.type === 'audio') {
      const subTag = "AudioEvent";
      try {
        const audioBlob = getLineMessageContent(event.message.id);
        if (!audioBlob) {
          replyMessage(replyToken, "❌ 無法從 LINE 取得音檔，請稍後再試。");
          return ContentService.createTextOutput("ok");
        }

        const result = analyzeAudioWithGemini(audioBlob);
        if (result && result.error) {
          replyMessage(replyToken, "❌ 語音解析失敗：" + result.error);
        } else if (result && (result.glucose != null || result.insulin != null || result.food != null || result.note)) {
          sendVoiceResultFlex(replyToken, result, userId);
        } else {
          SysLog.warn(subTag, "No data extracted from audio", result);
          replyWithQuickReply(replyToken, "⚠️ 語音中似乎沒有包含數值紀錄，請重新錄音。", ["紀錄"]);
        }
      } catch (e) {
        SysLog.error(subTag, "Process Error", e.message);
        replyWithQuickReply(replyToken, "❌ 語音處理發生非預期錯誤，請聯絡管理員。", ["紀錄"]);
      }
      return ContentService.createTextOutput("ok");
    }

    // 4. 處理文字訊息 (紀錄指令與數值輸入)
    if (event.type === 'message' && event.message.type === 'text') {
      const userMsg = event.message.text.trim();
      const state = cache.get(userId + "_state");

      // 指令判斷：開始紀錄或重啟表單
      if (userMsg === "紀錄" || userMsg === "紀錄血糖" || userMsg === "start" || userMsg === "開始") {
        cache.put(userId + "_state", "IDLE", 600);
        if (!cache.get(userId + "_pet_name")) cache.put(userId + "_pet_name", PET_NAME, 600);
        sendFlexTable(replyToken, userId);
        return ContentService.createTextOutput("ok");
      }
      
      // 根據狀態處理輸入
      if (state === "WAITING_PET_NAME") {
        cache.put(userId + "_pet_name", userMsg, 600);
        cache.put(userId + "_state", "IDLE", 600);
        sendFlexTable(replyToken, userId);
      }
      else if (state === "WAITING_BG") {
        if (!isNaN(userMsg)) {
          cache.put(userId + "_bg", userMsg, 600);
          cache.put(userId + "_state", "IDLE", 600);
          sendFlexTable(replyToken, userId);
        } else {
          replyMessage(replyToken, "請輸入數字格式喔！");
        }
      }
      else if (state === "WAITING_INSULIN") {
        if (!isNaN(userMsg)) {
          cache.put(userId + "_insulin", userMsg, 600);
          cache.put(userId + "_state", "IDLE", 600);
          sendFlexTable(replyToken, userId);
        } else {
          replyMessage(replyToken, "請輸入數字格式喔！");
        }
      }
      else if (state === "WAITING_FOOD") {
        if (!isNaN(userMsg)) {
          cache.put(userId + "_food", userMsg, 600);
          cache.put(userId + "_state", "IDLE", 600);
          sendFlexTable(replyToken, userId);
        } else {
          replyMessage(replyToken, "請輸入數字格式喔！");
        }
      }
      else if (state === "WAITING_NOTE") {
        cache.put(userId + "_note", userMsg, 600);
        cache.put(userId + "_state", "IDLE", 600);
        sendFlexTable(replyToken, userId);
      }
    }

    // 2. 處理 Postback 點擊事件
    if (event.type === 'postback') {
      const data = event.postback.data;
      
      if (data === 'action=input_pet') {
        cache.put(userId + "_state", "WAITING_PET_NAME", 600);
        replyWithQuickReply(replyToken, "請輸入寵物名字:", [PET_NAME]);
      }
      else if (data === 'action=input_bg') {
        cache.put(userId + "_state", "WAITING_BG", 600);
        replyMessage(replyToken, "請輸入血糖數值 (mg/dL):");
      }
      else if (data === 'action=input_insulin') {
        cache.put(userId + "_state", "WAITING_INSULIN", 600);
        replyWithQuickReply(replyToken, "請輸入胰島素劑量 (U):", ["0", "0.5", "1.0", "1.5"]);
      }
      else if (data === 'action=input_food') {
        cache.put(userId + "_state", "WAITING_FOOD", 600);
        replyWithQuickReply(replyToken, "請輸入餵食量 (克):", ["0", "10", "20", "30"]);
      }
      else if (data === 'action=input_note') {
        cache.put(userId + "_state", "WAITING_NOTE", 600);
        replyWithQuickReply(replyToken, "請輸入備註:", ["無", "剛吃完飯", "剛運動完"]);
      }
      else if (data === 'action=select_time') {
        const selectedTime = event.postback.params.datetime;
        cache.put(userId + "_selected_time", selectedTime, 600);
        sendFlexTable(replyToken, userId);
      }
      
      else if (data === 'action=submit') {
        const bg = cache.get(userId + "_bg");
        if (!bg) {
          replyMessage(replyToken, "⚠️ 請先填寫血糖值再提交。");
          return ContentService.createTextOutput("No BG");
        }

        const lockKey = userId + "_lock";
        if (cache.get(lockKey) === "true") return ContentService.createTextOutput("Locked");
        cache.put(lockKey, "true", 15);

        const insulin = cache.get(userId + "_insulin") || "0";
        const food = cache.get(userId + "_food") || "0";
        const note = cache.get(userId + "_note") || "無";
        const petName = cache.get(userId + "_pet_name") || PET_NAME;
        const selectedTime = cache.get(userId + "_selected_time");

        let finalTime;
        if (selectedTime) {
          finalTime = selectedTime + ":00+08:00"; 
        } else {
          const now = new Date();
          const tzOffset = 8 * 60;
          const localTime = new Date(now.getTime() + tzOffset * 60000);
          finalTime = localTime.toISOString().replace('Z', '+08:00');
        }
        
        const success = saveToNotion(bg, insulin, food, note, finalTime, petName);
        if (success) {
          const finalDisplayTime = (selectedTime ? selectedTime.replace('T', ' ') : "現在");
          ["_state", "_bg", "_insulin", "_food", "_note", "_pet_name", "_selected_time", "_lock"].forEach(k => cache.remove(userId + k));
          replyMessage(replyToken, "✅ 紀錄已成功同步至 Notion！\n寵物：" + petName + "\n時間：" + finalDisplayTime);
        } else {
          cache.remove(lockKey);
          replyMessage(replyToken, "❌ 上傳失敗，請再點一次提交。");
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({status: 'ok'})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    SysLog.critical(tag, "Fatal Error", error.message);
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: error.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

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
    return res && res.getResponseCode() === 200;
  } catch (e) { 
    SysLog.error(tag, "Unexpected Error", e.message);
    return false; 
  }
}

/**
 * Notion API：讀取所有歷史數據 (支援分頁)
 */
function fetchFromNotion() {
  const tag = "NotionQuery";
  let allResults = [];
  let hasMore = true;
  let nextCursor = null;

  try {
    const url = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
    
    while (hasMore) {
      const payload = {
        sorts: [{ property: '時間', direction: 'ascending' }]
      };
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
        throw new Error("Failed to fetch data from Notion");
      }
      
      const data = JSON.parse(res.getContentText());
      allResults = allResults.concat(data.results);
      hasMore = data.has_more;
      nextCursor = data.next_cursor;
    }

    return allResults.map(p => ({
      pet: p.properties["寵物名字"] ? p.properties["寵物名字"].title[0].text.content : PET_NAME,
      bg: p.properties["血糖值"] ? p.properties["血糖值"].number : 0,
      insulin: p.properties["胰島素劑量"] ? p.properties["胰島素劑量"].number : 0,
      food: p.properties["餵食量"] ? p.properties["餵食量"].number : 0,
      time: p.properties["時間"] ? p.properties["時間"].date.start : "",
      note: (p.properties["備註"] && p.properties["備註"].rich_text[0]) ? p.properties["備註"].rich_text[0].text.content : ""
    }));
  } catch (e) {
    SysLog.error(tag, "Query Failed", e.message);
    return [];
  }
}

/**
 * LINE 訊息發送封裝
 */
function replyMessage(replyToken, text) {
  safeFetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post', headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: text }] })
  }, "LINEReply");
}

function replyWithQuickReply(replyToken, text, optionsArray) {
  safeFetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post', headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: "text", text: text, quickReply: { items: optionsArray.map(opt => ({ type: "action", action: { type: "message", label: opt, text: opt } })) } }] })
  }, "LINEQuickReply");
}

/**
 * 發送表格式輸入 Flex Message
 */
function sendFlexTable(replyToken, userId) {
  const tag = "LINEFlexTable";
  const cache = CacheService.getUserCache();
  const petName = cache.get(userId + "_pet_name") || PET_NAME;
  const bg = cache.get(userId + "_bg") || "未填寫";
  const insulin = cache.get(userId + "_insulin") || "0";
  const food = cache.get(userId + "_food") || "0";
  const note = cache.get(userId + "_note") || "無";
  const selectedTime = cache.get(userId + "_selected_time");
  const displayTime = selectedTime ? selectedTime.replace('T', ' ') : "現在 (自動抓取)";

  const flexData = {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", contents: [
        { type: "text", text: "🩸 血糖紀錄表單", weight: "bold", size: "lg", color: "#FFFFFF" }
      ], backgroundColor: "#1DB446"
    },
    body: {
      type: "box", layout: "vertical", spacing: "md", contents: [
        { type: "box", layout: "horizontal", action: { type: "postback", data: "action=input_pet" }, contents: [
          { type: "text", text: "🐾 寵物", color: "#aaaaaa", size: "sm", flex: 2 },
          { type: "text", text: petName, size: "sm", color: "#111111", align: "end", flex: 4 }
        ]},
        { type: "separator" },
        { type: "box", layout: "horizontal", action: { type: "postback", data: "action=input_bg" }, contents: [
          { type: "text", text: "💉 血糖值", color: "#aaaaaa", size: "sm", flex: 2 },
          { type: "text", text: bg + (bg === "未填寫" ? "" : " mg/dL"), size: "sm", color: bg === "未填寫" ? "#FF0000" : "#111111", align: "end", flex: 4 }
        ]},
        { type: "separator" },
        { type: "box", layout: "horizontal", action: { type: "datetimepicker", data: "action=select_time", mode: "datetime" }, contents: [
          { type: "text", text: "⏰ 時間", color: "#aaaaaa", size: "sm", flex: 2 },
          { type: "text", text: displayTime, size: "xs", color: "#111111", align: "end", flex: 4 }
        ]},
        { type: "separator" },
        { type: "box", layout: "horizontal", action: { type: "postback", data: "action=input_insulin" }, contents: [
          { type: "text", text: "🧪 胰島素", color: "#aaaaaa", size: "sm", flex: 2 },
          { type: "text", text: insulin + " U", size: "sm", color: "#111111", align: "end", flex: 4 }
        ]},
        { type: "separator" },
        { type: "box", layout: "horizontal", action: { type: "postback", data: "action=input_food" }, contents: [
          { type: "text", text: "🍽️ 餵食量", color: "#aaaaaa", size: "sm", flex: 2 },
          { type: "text", text: food + " g", size: "sm", color: "#111111", align: "end", flex: 4 }
        ]},
        { type: "separator" },
        { type: "box", layout: "horizontal", action: { type: "postback", data: "action=input_note" }, contents: [
          { type: "text", text: "📝 備註", color: "#aaaaaa", size: "sm", flex: 2 },
          { type: "text", text: note, size: "sm", color: "#111111", align: "end", flex: 4, wrap: true }
        ]}
      ]
    },
    footer: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "button", style: "primary", color: "#1DB446", action: { type: "uri", label: "🚀 快速填寫表單", uri: "https://liff.line.me/2009743467-MeXtvnXF" } },
        { type: "button", style: "secondary", color: "#EEEEEE", action: { type: "postback", label: "✅ 確認提交(分步)", data: "action=submit" } }
      ]
    }
  };

  safeFetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post', headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: "flex", altText: "血糖紀錄表單", contents: flexData }] })
  }, tag);
}

/**
 * --- 語音輸入功能輔助函數 ---
 */

/**
 * 從 LINE 取得音檔
 */
function getLineMessageContent(messageId) {
  const tag = "LINEAudioDownload";
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const options = {
    headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN }
  };
  const res = safeFetch(url, options, tag);
  if (res && res.getResponseCode() === 200) {
    return res.getBlob();
  }
  return null;
}

/**
 * 呼叫 Gemini 解析音檔
 */
function analyzeAudioWithGemini(audioBlob) {
  const tag = "GeminiAudio";
  if (!GEMINI_API_KEY) {
    SysLog.error(tag, "GEMINI_API_KEY is missing.");
    return { error: "缺乏 GEMINI_API_KEY 設定" };
  }
  
  // 使用原始模型名稱 (2026 基準)
  const model = "gemini-2.5-flash"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  
  // 取得目前台灣時間作為解析基準
  const now = new Date();
  const tzOffset = 8 * 60;
  const localTime = new Date(now.getTime() + tzOffset * 60000);
  const currentRefTime = localTime.toISOString().slice(0, 16).replace('T', ' ');

  const base64Data = Utilities.base64Encode(audioBlob.getBytes());
  const payload = {
    contents: [{
      parts: [
        { text: `你是一位專業的寵物健康紀錄助理。
錄音環境可能包含背景噪音、風聲或雜亂人聲，請自動忽略噪音，專注提取使用者的口述數據。

【基準時間 (當下時刻)】：${currentRefTime}

【解析規則】：
1. 抗噪提取：即使錄音模糊，請嘗試根據關鍵字（如：血糖、胰島素、飯、克、單位）判斷數據。
2. 時間優先權：錄音中提到的時間 > 基準時間。若提到「剛剛、現在」，使用基準時間；若提到「早上7:30、昨晚」，請結合基準時間推算日期。
3. 預設值：若完全未提及時間，務必回傳基準時間。
4. Note 欄位：僅保留額外補充。若無補充則設為 null。

【輸出格式】：
只回傳 JSON，格式如下：
{ 
  "glucose": number, 
  "insulin": number, 
  "food": number, 
  "note": "string", 
  "datetime": "YYYY-MM-DD HH:mm" 
}` },
        { inline_data: { mime_type: "audio/mp4", data: base64Data } }
      ]
    }],
    generation_config: { response_mime_type: "application/json" }
  };

  const options = {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload)
  };

  const res = safeFetch(url, options, tag);
  if (!res) return { error: "網路連線異常" };
  
  const resCode = res.getResponseCode();
  const resText = res.getContentText();
  
  if (resCode !== 200) {
    SysLog.error(tag, "Gemini API Error", { code: resCode, body: resText });
    return { error: `API 錯誤 (${resCode})` };
  }

  try {
    const result = JSON.parse(resText);
    if (result.candidates && result.candidates[0].content.parts[0].text) {
      let parsedText = result.candidates[0].content.parts[0].text;
      SysLog.info(tag, "Raw AI Output", parsedText);
      
      // 處理可能的 Markdown 程式碼區塊包裹
      parsedText = parsedText.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(parsedText);
    }
  } catch (e) {
    SysLog.error(tag, "JSON Parse Error", { message: e.message, raw: resText });
    return { error: "資料格式解析失敗" };
  }
  return { error: "AI 未能產出有效結果" };
}

/**
 * 發送語音解析結果 Flex Message
 */
function sendVoiceResultFlex(replyToken, result, userId) {
  const liffId = "2009743467-MeXtvnXF"; 
  const liffUrl = `https://liff.line.me/${liffId}`;
  
  // 處理時間：優先使用 Gemini 解析結果（需為有效字串且非 "null"），否則使用目前台灣時間
  let finalTimeStr = (result.datetime && result.datetime !== "null" && result.datetime !== "undefined") ? result.datetime : "";
  if (!finalTimeStr) {
    const now = new Date();
    const tzOffset = 8 * 60;
    const localTime = new Date(now.getTime() + tzOffset * 60000);
    finalTimeStr = localTime.toISOString().slice(0, 16).replace('T', ' ');
  }

  const params = [];
  // 使用 != null 以便保留 0 值的數值數據
  if (result.glucose != null) params.push(`bg=${result.glucose}`);
  if (result.insulin != null) params.push(`ins=${result.insulin}`);
  if (result.food != null) params.push(`food=${result.food}`);
  if (result.note) params.push(`note=${encodeURIComponent(result.note)}`);
  params.push(`time=${encodeURIComponent(finalTimeStr)}`);
  params.push(`pet=${encodeURIComponent(PET_NAME)}`);
  
  const finalUrl = liffUrl + (params.length > 0 ? "?" + params.join("&") : "");

  const flexData = {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", contents: [
        { type: "text", text: "🎙️ 語音解析結果", weight: "bold", size: "lg", color: "#FFFFFF" }
      ], backgroundColor: "#4A90E2"
    },
    body: {
      type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: "辨識內容如下，請點擊按鈕確認：", size: "sm", color: "#666666", wrap: true },
        { type: "box", layout: "vertical", margin: "md", spacing: "xs", contents: [
          { type: "box", layout: "horizontal", contents: [
            { type: "text", text: "💉 血糖", size: "sm", color: "#aaaaaa", flex: 1 },
            { type: "text", text: (result.glucose || "未偵測") + " mg/dL", size: "sm", align: "end", flex: 2 }
          ]},
          { type: "box", layout: "horizontal", contents: [
            { type: "text", text: "⏰ 時間", size: "sm", color: "#aaaaaa", flex: 1 },
            { type: "text", text: finalTimeStr, size: "sm", align: "end", flex: 2 }
          ]},
          { type: "box", layout: "horizontal", contents: [
            { type: "text", text: "🧪 胰島素", size: "sm", color: "#aaaaaa", flex: 1 },
            { type: "text", text: (result.insulin || "0") + " U", size: "sm", align: "end", flex: 2 }
          ]},
          { type: "box", layout: "horizontal", contents: [
            { type: "text", text: "🍽️ 餵食量", size: "sm", color: "#aaaaaa", flex: 1 },
            { type: "text", text: (result.food || "0") + " g", size: "sm", align: "end", flex: 2 }
          ]},
          { type: "box", layout: "horizontal", contents: [
            { type: "text", text: "📝 備註", size: "sm", color: "#aaaaaa", flex: 1 },
            { type: "text", text: result.note || "無", size: "sm", align: "end", flex: 2, wrap: true }
          ]}
        ]}
      ]
    },
    footer: { type: "box", layout: "vertical", contents: [
      { type: "button", style: "primary", color: "#4A90E2", action: { type: "uri", label: "✅ 確認並開啟表單", uri: finalUrl } }
    ]}
  };

  const res = safeFetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post', headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: "flex", altText: "語音解析結果", contents: flexData }] })
  }, "LINE Voice Flex");
}

/**
 * --- 系統監控與錯誤處理工具 (v2.1 新增) ---
 */

/**
 * 集中式日誌工具
 */
const SysLog = {
  levels: { INFO: "INFO", WARN: "WARN", ERROR: "ERROR", CRITICAL: "CRITICAL" },
  
  log(level, tag, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp: timestamp,
      level: level,
      tag: tag,
      message: message,
      data: data
    };
    
    // 1. 標準控制台輸出
    if (level === this.levels.ERROR || level === this.levels.CRITICAL) {
      console.error(`[${level}][${tag}] ${message}`, data ? JSON.stringify(data) : "");
    } else {
      console.log(`[${level}][${tag}] ${message}`, data ? JSON.stringify(data) : "");
    }

    // 2. 關鍵錯誤通知 (若有設定管理員)
    if (level === this.levels.CRITICAL && ALLOWED_USERS.length > 0) {
      this.notifyAdmin(`🚨 【系統緊急告警】\n位置：${tag}\n訊息：${message}`);
    }
  },

  info(tag, message, data) { this.log(this.levels.INFO, tag, message, data); },
  warn(tag, message, data) { this.log(this.levels.WARN, tag, message, data); },
  error(tag, message, data) { this.log(this.levels.ERROR, tag, message, data); },
  critical(tag, message, data) { this.log(this.levels.CRITICAL, tag, message, data); },

  notifyAdmin(text) {
    try {
      const adminId = ALLOWED_USERS[0]; // 預設名單第一位為管理員
      UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
        method: 'post',
        headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
        payload: JSON.stringify({ to: adminId, messages: [{ type: 'text', text: text }] }),
        muteHttpExceptions: true
      });
    } catch (e) {
      console.error("Failed to notify admin:", e.message);
    }
  }
};

/**
 * 封裝 UrlFetchApp 確保異常皆能被捕捉與記錄
 */
function safeFetch(url, options = {}, tag = "Fetch") {
  options.muteHttpExceptions = true;
  try {
    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    const body = res.getContentText();
    
    if (code >= 200 && code < 300) {
      SysLog.info(tag, `Success (${code})`);
      return res;
    } else {
      SysLog.error(tag, `HTTP Error (${code})`, { url: url, response: body });
      return res;
    }
  } catch (e) {
    SysLog.critical(tag, `Network/Internal Error: ${e.message}`, { url: url });
    return null;
  }
}

