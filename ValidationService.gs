/**
 * 檢查使用者是否在允許名單內
 */
function isUserAllowed(userId) {
  if (!ALLOWED_USERS || ALLOWED_USERS.length === 0) {
    SysLog.error("Auth", "ALLOWED_USERS is not set! Rejecting all requests for security.", { userId: userId });
    return false; // 若未設定白名單，拒絕所有請求並記錄錯誤
  }
  return ALLOWED_USERS.includes(userId);
}

/**
 * 驗證是否為有效數字
 */
function isValidNumber(value) {
  if (value === null || value === undefined || value === "") return false;
  return !isNaN(value);
}

/**
 * 驗證解析後的健康數據是否合理
 * 1. 血糖是否為合理正數
 * 2. 胰島素是否為合理非負值
 * 3. 飲食量是否為合理非負值
 * 4. 日期格式是否有效
 * 5. 必填欄位 (血糖) 是否遺漏
 */
function validateHealthData(data) {
  const errors = [];

  // 檢查是否漏掉必要欄位：本系統核心為血糖紀錄，因此強制要求血糖
  if (data.glucose === null || data.glucose === undefined || data.glucose === "") {
    errors.push("未偵測到血糖數值");
  } else {
    const bg = parseFloat(data.glucose);
    if (isNaN(bg) || bg <= 0) {
      errors.push("血糖值必須大於 0");
    } else if (bg < 20 || bg > 1000) {
      errors.push(`血糖數值 ${bg} 異常 (合理範圍: 20~1000)`);
    }
  }

  if (data.insulin != null && data.insulin !== "") {
    const ins = parseFloat(data.insulin);
    if (isNaN(ins) || ins < 0) {
      errors.push("胰島素必須為非負數");
    } else if (ins > 50) {
      errors.push(`胰島素劑量 ${ins} 異常過高`);
    }
  }

  if (data.food != null && data.food !== "") {
    const food = parseFloat(data.food);
    if (isNaN(food) || food < 0) {
      errors.push("飲食量必須為非負數");
    } else if (food > 1000) {
      errors.push(`飲食量 ${food} 克異常過多`);
    }
  }

  if (data.datetime && data.datetime !== "null" && data.datetime !== "undefined") {
    // 簡單檢查時間格式 YYYY-MM-DD HH:mm 或是 Date.parse() 可解析
    const parsedTime = Date.parse(data.datetime);
    if (isNaN(parsedTime)) {
      errors.push(`解析的時間格式無效: ${data.datetime}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}
