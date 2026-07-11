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
 * 驗證 LINE ID Token
 */
function verifyIdToken(idToken) {
  const tag = "VerifyIdToken";
  try {
    if (!LIFF_CHANNEL_ID) {
      SysLog.error(tag, "LIFF_CHANNEL_ID is missing in script properties");
      return null;
    }
    const url = 'https://api.line.me/oauth2/v2.1/verify';
    const payload = {
      id_token: idToken,
      client_id: LIFF_CHANNEL_ID
    };
    const options = {
      method: 'post',
      payload: payload
    };
    const res = safeFetch(url, options, tag);
    if (res && res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText());
    }
    return null;
  } catch (e) {
    SysLog.error(tag, "Verification Failed", e.message);
    return null;
  }
}
