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
        { text: `你是一位專業的健康紀錄助理。
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
