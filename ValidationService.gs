/**
 * 檢查使用者是否在允許名單內
 */
function isUserAllowed(userId) {
  if (ALLOWED_USERS.length === 0) {
    return true; // 若未設定白名單，預設全部放行
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
