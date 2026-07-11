/**
 * 處理來自 Dashboard (LIFF) 的查詢與提交請求
 */
function handleDashboardRequest(contents) {
  const subTag = "DashboardData";
  const idToken = contents.idToken;
  const startDate = contents.startDate;
  const endDate = contents.endDate;

  if (!idToken) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Missing Token' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // GAS 驗證 Token 的有效期限與 Channel ID
  const claims = verifyIdToken(idToken);
  if (!claims || !claims.sub) {
    SysLog.warn(subTag, "Invalid Token");
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid Token' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const userId = claims.sub;
  if (!isUserAllowed(userId)) {
    SysLog.warn(subTag, "Unauthorized user attempt", { userId: userId });
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Forbidden' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // 驗證成功後才查詢 Notion，加入快取機制
  const cache = CacheService.getScriptCache();
  const cacheKey = "notion_data_v4_" + (startDate || "all") + "_" + (endDate || "all");
  const cachedData = cache.get(cacheKey);
  const cachedTime = cache.get(cacheKey + "_time");
  const lastUpdate = cache.get("notion_last_update") || "0";
  
  let data;
  // 如果快取存在，且快取時間晚於最後更新時間，則使用快取
  if (cachedData && cachedTime && parseInt(cachedTime) >= parseInt(lastUpdate)) {
    data = JSON.parse(cachedData);
    SysLog.info(subTag, "Cache Hit", { key: cacheKey });
  } else {
    data = fetchFromNotion(startDate, endDate);
    // 將查詢結果快取 6 小時 (21600秒)
    cache.put(cacheKey, JSON.stringify(data), 21600);
    cache.put(cacheKey + "_time", Date.now().toString(), 21600);
    SysLog.info(subTag, "Cache Miss or Stale, fetched from Notion", { key: cacheKey });
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'ok', data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 處理來自網頁表單 (LIFF) 的提交
 */
function handleWebSubmitRequest(contents) {
  const subTag = "WebSubmit";
  // 安全檢查：驗證 LIFF Token
  const userId = getUserIdFromToken(contents.accessToken);
  if (!userId || !isUserAllowed(userId)) {
    SysLog.warn(subTag, "Unauthorized attempt", { userId: userId });
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Forbidden' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const { petName, bg, insulin, food, time, note } = contents;
  const finalTime = time.replace('T', ' ') + ":00+08:00";
  
  // 驗證數值
  if (!isValidNumber(bg)) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid BG' })).setMimeType(ContentService.MimeType.JSON);
  }

  const result = saveToNotion(bg, insulin || "0", food || "0", note || "無", finalTime, petName);
  
  const isSuccess = result && result.success;
  SysLog.info(subTag, isSuccess ? "Success" : "Failed", { pet: petName, bg: bg, error: isSuccess ? null : result.error });
  
  return ContentService.createTextOutput(JSON.stringify({ 
    status: isSuccess ? 'ok' : 'error', 
    message: isSuccess ? '' : (result ? result.error : 'Unknown Error')
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 處理來自網頁表單 (LIFF) 取得草稿資料的請求
 */
function handleDraftDataRequest(contents) {
  const subTag = "DraftData";
  // 安全檢查：驗證 LIFF Token
  const userId = getUserIdFromToken(contents.accessToken);
  if (!userId || !isUserAllowed(userId)) {
    SysLog.warn(subTag, "Unauthorized attempt", { userId: userId });
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Forbidden' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const draftId = contents.draftId;
  if (!draftId) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Missing draftId' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const cache = CacheService.getScriptCache();
  const cachedData = cache.get("draft_" + draftId);
  
  if (!cachedData) {
    SysLog.info(subTag, "Draft not found or expired", { draftId: draftId });
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Draft not found or expired' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'ok', data: JSON.parse(cachedData) }))
    .setMimeType(ContentService.MimeType.JSON);
}
