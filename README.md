# 🐾 AI Health Tracker

這是一個結合 **LINE Bot**、**Google Apps Script (GAS)** 與 **Notion** 的「健康數據紀錄系統」。系統支援多位使用者管理、文字指令與語音辨識（整合 Gemini API），並提供專屬的 LINE 網頁表單（LIFF）及數據視覺化儀表板，讓使用者能夠輕鬆且直覺地追蹤血糖波動與日常健康狀況。

## 🌟 核心特色

- **多管道快速紀錄**：
  - **LINE 聊天室對話**：支援文字多步驟引導與 Quick Reply 快捷選單。
  - **語音智慧辨識**：直接在 LINE 傳送語音訊息，透過 Gemini API 自動分析並提取數據（血糖、胰島素、飲食量等）。
  - **LIFF 網頁表單** (`form.html`)：在 LINE App 內一次性快速填表，免去繁瑣對話。
- **數據視覺化儀表板** (`index.html`)：
  - 串接 Notion 資料庫，即時繪製血糖趨勢圖表 (Chart.js)。
  - 支援多位使用者數據快速切換。
  - 支援自訂日期區間過濾歷史紀錄，精準掌握健康趨勢。
- **Notion 雲端資料庫同步**：
  - 所有紀錄自動同步至 Notion 資料庫，方便後續整理、檢視與匯出。
  - 系統層級自動修正台灣時區 (UTC+08:00)，確保紀錄時間準確無誤。
- **安全與防呆機制**：
  - 嚴格的白名單 (Allowed Users) 權限控管，保障資料隱私。
  - 雙重防呆邏輯，透過狀態原子檢查與即時銷毀，徹底杜絕重複提交。

## 📁 檔案結構說明

- **`Code.gs`**：系統的後端核心腳本 (GAS)。負責處理 LINE Webhook 接收、LIFF 身份驗證、Notion API 同步作業以及 Gemini 語音解析。
- **`form.html`**：LIFF 網頁表單前端代碼，提供簡潔直觀的數據填寫介面。
- **`index.html`**：數據視覺化面板前端代碼，包含圖表呈現與資料篩選邏輯。

## 🚀 部署準備與步驟

若要自行部署此專案，請依照以下步驟將程式碼部署至 Google Apps Script (GAS)：

### 1. 建立專案與貼上程式碼
1. 前往 [Google Apps Script](https://script.google.com/) 建立新專案。
2. 僅將本專案中的 `Code.gs` 內容複製並貼上至 GAS 編輯器中（`form.html` 與 `index.html` 為前端網頁，不需放到 GAS）。

### 2. 設定環境變數 (Script Properties)
在 GAS 編輯器左側，點擊「專案設定 (齒輪圖示)」，滑到下方的「指令碼屬性」，點擊「新增指令碼屬性」，並加入以下變數：
- `NOTION_TOKEN`: Notion Integration Secret。
- `DATABASE_ID`: Notion 資料庫 ID。
- `LINE_ACCESS_TOKEN`: LINE Bot 頻道存取權杖。
- `ALLOWED_USERS`: 授權使用的 LINE User IDs (以逗號分隔)。
- `GEMINI_API_KEY`: Google Gemini API Key (用於音訊解析)。
- `APP_SECRET`: 儀表板與後端通訊的安全密鑰。
- `PET_NAME`: 預設對象名稱 (例如：姓名)。

### 3. 發布為網頁應用程式 (Web App)
1. 點擊編輯器右上角的「部署」>「新增部署作業」。
2. 點選左側齒輪圖示，選擇「網頁應用程式 (Web App)」。
3. **執行身分**：選擇「我 (您的信箱)」。
4. **誰可以存取**：選擇「所有人 (Anyone)」。
5. 點擊「部署」，完成後您會得到一組「網頁應用程式網址 (Web App URL)」。

### 4. 綁定 LINE Webhook
- 將上一步取得的 Web App URL 貼上至 LINE Developer Console 的 **Webhook URL** 並啟用。

### 5. 部署前端網頁 (LIFF 與儀表板)
本專案的 `form.html` (LIFF 表單) 與 `index.html` (數據儀表板) 是純靜態網頁，請透過 GitHub Pages、Vercel 等服務託管：
1. 部署前，請先使用編輯器打開 `form.html` 與 `index.html`。
2. 找到檔案中的 `GAS_URL` 變數，替換為您在步驟 3 取得的「Web App URL」。
3. 將這兩個檔案部署至您的網頁代管空間。
4. 建立 LINE LIFF App，並將 Endpoint URL 指向您部署好的 `form.html` 公開網址，即可將 LIFF 連結分享至聊天室供填寫。

---
*我們期許這套系統能成為您健康管理路上的最佳助手！*
