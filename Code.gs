/**
 * 健康數據紀錄系統 - Google Apps Script (GAS) 後端 (v2.0 正式版) - 模組化重構
 * 
 * 核心功能：
 * 1. LINE 多步驟引導輸入 (姓名 -> 血糖 -> 胰島素 -> 飲食量 -> 備註)
 * 2. 台灣時區自動修正 (+08:00)，確保 Notion 顯示正確時間
 * 3. 雙重防呆邏輯：狀態原子檢查 + 資料即時銷毀，徹底杜絕重複提交
 * 4. 支援 Notion API 分頁讀取，可完整抓取所有歷史數據
 */

function doGet(e) {
  const tag = "GetRequest";
  try {
    const action = e.parameter && e.parameter.action;
    
    // 1. 簡易健康檢查
    if (action === 'healthCheck') {
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok', version: '2.3' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput("Dashboard API has been migrated to POST.");
  } catch (err) {
    SysLog.error(tag, "Unexpected Error", err.message);
    return ContentService.createTextOutput("Error: " + err.message);
  }
}

/**
 * 處理 POST 請求 - LINE Webhook 核心邏輯與 API 路由
 */
function doPost(e) {
  const tag = "Webhook";
  try {
    if (!e || !e.postData || !e.postData.contents) {
      SysLog.warn(tag, "Empty Payload received");
      return ContentService.createTextOutput("Empty Payload");
    }
    const contents = JSON.parse(e.postData.contents);
    
    // 移除 Log 中的 Token 與完整 Payload 以確保安全性
    const logContents = { ...contents };
    if (logContents.accessToken) logContents.accessToken = "[HIDDEN]";
    if (logContents.idToken) logContents.idToken = "[HIDDEN]";
    if (logContents.events) logContents.events = "[EVENTS HIDDEN]";
    SysLog.info(tag, "Received Payload", logContents);
    
    // --- 路由：處理來自 Dashboard (LIFF) 的查詢請求 ---
    if (contents.action === 'getDashboardData') {
      return handleDashboardRequest(contents);
    }

    // --- 路由：處理來自網頁表單 (LIFF) 的提交 ---
    if (contents.action === 'webSubmit') {
      return handleWebSubmitRequest(contents);
    }

    // --- 路由：處理 LINE 驗證與事件 ---
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
    if (!isUserAllowed(userId)) {
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
        if (isValidNumber(userMsg)) {
          cache.put(userId + "_bg", userMsg, 600);
          cache.put(userId + "_state", "IDLE", 600);
          sendFlexTable(replyToken, userId);
        } else {
          replyMessage(replyToken, "請輸入數字格式喔！");
        }
      }
      else if (state === "WAITING_INSULIN") {
        if (isValidNumber(userMsg)) {
          cache.put(userId + "_insulin", userMsg, 600);
          cache.put(userId + "_state", "IDLE", 600);
          sendFlexTable(replyToken, userId);
        } else {
          replyMessage(replyToken, "請輸入數字格式喔！");
        }
      }
      else if (state === "WAITING_FOOD") {
        if (isValidNumber(userMsg)) {
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

    // 5. 處理 Postback 點擊事件
    if (event.type === 'postback') {
      const data = event.postback.data;
      
      if (data === 'action=input_pet') {
        cache.put(userId + "_state", "WAITING_PET_NAME", 600);
        replyWithQuickReply(replyToken, "請輸入姓名:", [PET_NAME]);
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
        replyWithQuickReply(replyToken, "請輸入飲食量 (克):", ["0", "10", "20", "30"]);
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
          replyMessage(replyToken, "✅ 紀錄已成功同步至 Notion！\n姓名：" + petName + "\n時間：" + finalDisplayTime);
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

// Trigger deploy

// Trigger deploy after token update
