# 🐾 Pet BG Tracker

Pet BG Tracker 是一個用來記錄與查看寵物血糖資料的輕量前端專案，主要搭配 **LINE LIFF、Google Apps Script (GAS)** 與 **Notion Database** 使用。它把「快速填寫紀錄」與「歷史趨勢檢視」拆成兩個靜態 HTML 頁面，方便直接部署到 GitHub Pages 或任何靜態網站空間。

## 專案目的

這個專案的核心目標是協助飼主：

- 在 LINE 內快速填寫血糖、胰島素、餵食量與備註
- 將資料送往 GAS 後端，再同步到 Notion
- 透過圖表查看寵物血糖歷史變化
- 依寵物與日期區間篩選資料，追蹤長期趨勢

## 主要功能

### 1. 快速紀錄表單（`form.html`）

- 使用 LIFF SDK，適合從 LINE App 直接開啟
- 可填寫寵物名稱、血糖值、胰島素、餵食量、紀錄時間與備註
- 送出時會以 `POST` 將 JSON 資料傳到 GAS Web App
- 支援用網址參數預填欄位，例如寵物名稱、血糖值與時間
- 提交成功後可自動關閉 LIFF 視窗或重新整理頁面

### 2. 趨勢儀表板（`index.html`）

- 使用 Chart.js 顯示血糖折線圖
- 從 GAS API 讀取資料後動態產生寵物選單
- 預設顯示最近 30 天資料
- 可依寵物與起訖日期過濾歷史紀錄
- Tooltip 會顯示對應的胰島素、餵食量與備註資訊

## 檔案結構

```text
.
├── form.html   # LINE LIFF 表單，負責新增血糖紀錄
├── index.html  # 圖表儀表板，負責查詢與視覺化
└── README.md   # 專案說明文件
```

## 技術組成

- **前端頁面**：原生 HTML / CSS / JavaScript
- **樣式**：Pico.css（CDN 載入）
- **圖表**：Chart.js（CDN 載入）
- **LINE 整合**：LIFF SDK
- **後端介接**：Google Apps Script Web App
- **資料儲存**：Notion Database（由 GAS 負責串接）

## 快速開始

此專案沒有建置步驟，也沒有額外套件安裝流程；只要能提供靜態檔案即可執行。

### 1. 下載或複製專案

```bash
git clone https://github.com/funrock99/pet-bg-tracker.git
cd pet-bg-tracker
```

### 2. 設定必要參數

請先檢查並依自己的環境調整以下常數：

- `form.html`
  - `GAS_URL`：GAS Web App 提交端點
  - `liff.init({ liffId: "..." })`：你的 LIFF ID
- `index.html`
  - `GAS_URL`：GAS Web App 查詢端點
  - `APP_KEY`：由網址參數 `?key=...` 取得的簡易存取金鑰

### 3. 啟動本機靜態伺服器

例如可以用 Python：

```bash
python3 -m http.server 8000
```

然後開啟：

- `http://localhost:8000/index.html`
- `http://localhost:8000/form.html`

## 使用方式

### 查看血糖趨勢

1. 開啟 `index.html`
2. 透過網址帶入查詢金鑰，例如：`index.html?key=YOUR_KEY`
3. 等待頁面向 GAS 載入資料
4. 透過寵物選單與日期區間查看特定紀錄

### 新增血糖紀錄

1. 在 LINE 環境或瀏覽器中開啟 `form.html`
2. 填入血糖、胰島素、餵食量、時間與備註
3. 按下提交後，資料會送至 GAS，再由後端寫入 Notion

若需要預填表單，可使用類似以下網址參數：

```text
form.html?pet=斑斑&bg=210&ins=1&food=40&note=飯後&time=2026-05-26 08:30
```

## 重要實作說明

- `index.html` 會呼叫 `?action=getData&key=...` 來取得歷史資料。
- 圖表資料來源預期至少包含 `pet`、`time`、`bg`、`insulin`、`food`、`note` 欄位。
- `form.html` 送出的 payload 會包含 `action: 'webSubmit'` 與 LIFF `accessToken`，表示授權與寫入流程主要由 GAS 驗證與處理。
- 專案目前是純前端靜態頁面，真正的商業邏輯、權限控制與 Notion 寫入都在外部 GAS 後端。

## 適合的部署方式

- GitHub Pages
- Google Drive / Apps Script Web Hosting
- Nginx / Apache 靜態站點
- 任何可提供 HTML 靜態檔的空間

## 注意事項

- 若 GAS 權限、CORS 或部署設定不正確，表單送出與圖表讀取都會失敗。
- 若未在 LINE 內執行，LIFF 相關流程可能無法完整模擬。
- README 依目前程式碼推測後端行為；若 GAS 或 Notion 結構已變更，請同步更新本文件。
