/**
 * --- 系統監控與錯誤處理工具 ---
 */

/**
 * 集中式日誌工具
 */
var SysLog = {
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
    if (code >= 400) {
      SysLog.error(tag, `HTTP Error ${code}`, { url: url, response: res.getContentText() });
    }
    return res;
  } catch (e) {
    SysLog.critical(tag, "Network/Fetch Exception", e.message);
    return null;
  }
}
