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
