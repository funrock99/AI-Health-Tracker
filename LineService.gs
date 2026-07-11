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
        { type: "text", text: "🩸 數據紀錄表單", weight: "bold", size: "lg", color: "#FFFFFF" }
      ], backgroundColor: "#1DB446"
    },
    body: {
      type: "box", layout: "vertical", spacing: "md", contents: [
        { type: "box", layout: "horizontal", action: { type: "postback", data: "action=input_pet" }, contents: [
          { type: "text", text: "👤 姓名", color: "#aaaaaa", size: "sm", flex: 2 },
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
          { type: "text", text: "🍽️ 飲食量", color: "#aaaaaa", size: "sm", flex: 2 },
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
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: "flex", altText: "數據紀錄表單", contents: flexData }] })
  }, tag);
}

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
 * 發送語音解析結果 Flex Message
 */
function sendVoiceResultFlex(replyToken, result, userId) {
  const liffUrl = `https://liff.line.me/2009743467-MeXtvnXF`;
  
  // 處理時間：優先使用 Gemini 解析結果（需為有效字串且非 "null"），否則使用目前台灣時間
  let finalTimeStr = (result.datetime && result.datetime !== "null" && result.datetime !== "undefined") ? result.datetime : "";
  if (!finalTimeStr) {
    const now = new Date();
    const tzOffset = 8 * 60;
    const localTime = new Date(now.getTime() + tzOffset * 60000);
    finalTimeStr = localTime.toISOString().slice(0, 16).replace('T', ' ');
  }

  const draftId = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  
  const draftData = {
    bg: result.glucose,
    ins: result.insulin,
    food: result.food,
    note: result.note,
    time: finalTimeStr,
    pet: PET_NAME
  };
  
  cache.put("draft_" + draftId, JSON.stringify(draftData), 300); // 存活 5 分鐘
  const finalUrl = liffUrl + "?draftId=" + draftId;

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
            { type: "text", text: "🍽️ 飲食量", size: "sm", color: "#aaaaaa", flex: 1 },
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
