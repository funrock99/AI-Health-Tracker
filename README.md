# AI Health Tracker

以 LINE 為入口的多模態 AI 健康紀錄系統，支援文字、語音與 LIFF 表單輸入，透過 Gemini 將非結構化內容轉換為可查詢的健康資料，並提供 Notion 儲存與線上 Dashboard 趨勢分析。

[線上 Dashboard](https://funrock99.github.io/AI-Health-Tracker/) · [系統架構](#系統架構) · [自動化測試](#自動化測試) · [部署方式](#部署方式)

> Demo Dashboard 已啟用存取控制。公開頁面僅展示介面，實際紀錄僅限授權使用者查看。

## 專案亮點

- LINE 文字、語音與 LIFF 表單多管道輸入
- Gemini 多模態音訊理解與結構化欄位抽取
- Human-in-the-Loop 人工確認流程
- 白名單、Token 驗證與防重複提交
- Notion 紀錄管理與 Dashboard 趨勢查詢
- Vitest 單元測試與 Playwright E2E 測試

## 專案背景與解決的問題

針對需要長期追蹤血糖、胰島素與飲食狀況的使用者與照護對象，設計並實作一套以 LINE 為入口的多模態 AI 健康紀錄系統。

1. 降低日常紀錄操作成本：使用者不需開啟傳統後台，可直接透過 LINE 完成輸入。
2. 控制 AI 輸出的不確定性：語音辨識可能受到環境噪音、語速與口音影響，因此 AI 結果不直接寫入正式資料。
3. 避免單一輸入方式失效：語音解析失敗時，可改用 LINE 文字或 LIFF 表單補正。
4. 維持資料品質與一致性：寫入前執行欄位驗證、合理性檢查、人工確認與防重複提交。

## 核心功能

### 多管道資料輸入

使用者可透過 LINE 文字、LINE 語音或 LIFF 網頁表單新增紀錄。

### 多模態 AI 解析

Gemini 直接理解 LINE 音訊，並抽取血糖、胰島素、飲食、時間與備註等結構化欄位。

### 資料品質控制

AI 輸出不直接寫入 Notion，必須經過欄位驗證、合理性檢查與使用者確認。

### 容錯與備援

語音受環境噪音、口音或語速影響時，使用者可改用 LINE 文字或 LIFF 表單補正。

### 存取控制

使用 LINE userId 白名單限制未授權寫入；Dashboard 則以 LINE Login 與後端 ID Token 驗證控制讀取權限。

### 趨勢視覺化

Dashboard 支援日期區間篩選、紀錄對象切換，以及血糖、胰島素、飲食與備註查詢。

## 系統架構

```mermaid
flowchart LR
    U[使用者] --> LINE[LINE Bot]
    U --> LIFF[LIFF 表單]

    LINE --> GAS[Google Apps Script]
    LIFF --> GAS

    GAS --> AUTH[白名單與 Token 驗證]
    GAS --> GEMINI[Gemini Multimodal API]
    GAS --> CACHE[狀態與防重複控制]
    GAS --> NOTION[Notion Database]

    NOTION --> DASH[Web Dashboard]
    DASH --> LOGIN[LINE Login]
```

## 端到端資料流程

```mermaid
sequenceDiagram
    actor User
    participant LINE
    participant GAS
    participant Gemini
    participant LIFF
    participant Notion

    User->>LINE: 傳送語音紀錄
    LINE->>GAS: Webhook Event
    GAS->>GAS: 驗證 userId 白名單
    GAS->>LINE: 下載音訊
    GAS->>Gemini: 音訊＋結構化抽取 Prompt
    Gemini-->>GAS: JSON 結果
    GAS->>GAS: 驗證欄位與格式
    GAS-->>User: 顯示解析結果
    User->>LIFF: 確認或修正
    LIFF->>GAS: 提交正式紀錄
    GAS->>GAS: 驗證 Token 與防重複
    GAS->>Notion: 儲存資料
```

## 多模態 AI 資料處理

本系統不是將 Speech-to-Text 結果直接存入資料庫，而是將 LINE 語音音訊交由 Gemini 進行語音理解與語意抽取，輸出固定格式的結構化健康紀錄。

資料流程：
LINE 音訊 → Gemini 多模態理解 → 結構化欄位抽取 → 格式與合理性檢查 → 使用者確認或補正 → 寫入 Notion

結構化輸出範例：

```json
{
  "glucose": 120,
  "insulin": 2,
  "food": 35,
  "note": "飯後兩小時",
  "datetime": "2026-07-11 08:30"
}
```

## AI 可靠性與容錯設計

依據 Garbage In, Garbage Out 原則，本系統不將 AI 輸出視為完全可信。可能影響語音輸入品質的因素包括：環境噪音、風聲與背景人聲、使用者口音與語速、數字發音不清楚、欄位缺漏、模型輸出格式錯誤。

因此系統採用：

1. 固定 Schema 的結構化輸出
2. 必要欄位與資料型別驗證
3. 數值合理性檢查
4. Human-in-the-Loop 使用者確認
5. LINE 文字與 LIFF 表單備援
6. 解析失敗時不寫入正式資料

## 存取控制

- LINE Bot 與 LIFF 寫入流程使用 LINE userId 白名單，防止未授權使用者向 Notion 寫入垃圾資料。
- LIFF 表單提交時，由後端以 LINE Access Token 取得可信任的 userId，不直接信任前端傳入的身分資訊。
- Dashboard 使用 LINE Login 與後端 ID Token 驗證，取代 URL Query String 共用金鑰。
- 系統使用短效狀態與提交鎖，降低 Webhook 重送或連續操作造成重複紀錄的風險。

### LINE Webhook Signature 的平台限制

LINE Messaging API 建議 Webhook 接收端驗證 HTTP Header 中的 `x-line-signature`，以確認請求確實由 LINE Platform 發出，且傳輸內容未遭篡改。

本專案目前採用 Google Apps Script Web App 作為 Webhook 接收端。然而，GAS 的 `doPost(e)` 並未提供讀取傳入 HTTP Headers 的介面，因此純 GAS 架構無法取得 `x-line-signature`，也無法直接完成 LINE 官方的 HMAC-SHA256 簽章驗證。

目前此專案定位為私人、低流量的健康紀錄工具，透過以下方式降低風險：

- 限制允許操作的 LINE userId
- 驗證事件資料結構與必要欄位
- 不在程式碼中保存 API Token 與密鑰
- 限制系統功能及資料存取範圍
- 對 LIFF 與 Dashboard 使用 LINE Token 驗證

若未來擴展為多人或正式服務，將在 GAS 前方增加 Cloud Run、Cloud Functions 或其他可讀取 HTTP Headers 的 Webhook Gateway，先完成 LINE Signature 驗證，再將通過驗證的事件安全轉送至 GAS。

## 核心設計決策

| 設計問題 | 決策 | 原因 |
|---|---|---|
| 為什麼使用 LINE？ | 以既有聊天介面作為主要入口 | 降低日常紀錄操作成本 |
| 為什麼不直接儲存逐字稿？ | 抽取結構化欄位並要求確認 | 控制語音與模型誤判 |
| 語音失敗怎麼辦？ | LINE 文字與 LIFF 表單備援 | 避免單一輸入管道失效 |
| 如何防止垃圾資料？ | userId 白名單與 Token 驗證 | 僅允許家庭成員寫入 |
| 如何防止重複紀錄？ | 短效狀態、Lock 與成功後清除 | 降低重送與連續提交風險 |
| 為什麼使用 Notion？ | 作為低維運成本的紀錄後台 | 適合私人追蹤情境，且支援透過 MCP 使用自然語言查詢 |

## 技術棧與元件責任

| 技術 | 系統責任 |
|---|---|
| LINE Messaging API | 接收文字、語音與互動事件 |
| LIFF | 提供資料確認與表單補正介面 |
| Gemini Multimodal API | 音訊理解與結構化欄位抽取 |
| Google Apps Script | Webhook、流程協調、驗證與第三方 API 整合 |
| Notion API | 健康紀錄保存與管理 |
| Chart.js | 血糖及相關紀錄趨勢視覺化 |
| GitHub Pages | LIFF 與 Dashboard 靜態頁面部署 |
| LINE Login | Dashboard 使用者身分驗證 |
| Vitest | GAS 邏輯單元測試 |
| Playwright | 前端流程 E2E 測試 |

## 專案畫面

![系統儀表板畫面](assets/screenshot_final.png)

## 專案狀態

### 已完成

- [x] LINE Bot 文字輸入
- [x] LINE 語音訊息解析
- [x] Gemini 多模態結構化抽取
- [x] LIFF 表單補正
- [x] LINE userId 寫入白名單
- [x] Notion 同步
- [x] Dashboard 與日期篩選
- [x] 防重複提交
- [x] Dashboard 整合 LINE Login
- [x] 移除 URL Query String 共用金鑰
- [x] GAS 後端驗證 LINE ID Token
- [x] 後端程式碼模組化
- [x] 自動化部署 (GitHub Actions + clasp)
- [x] 自動化測試 (Vitest Unit Tests + Playwright E2E Tests)

### 未來優化

- [ ] 建立更詳細的錯誤碼與 structured logging 機制
- [ ] 增加資料 CSV 匯出功能
- [ ] 增加異常趨勢主動提醒機制

## 自動化測試

本專案目前提供兩類自動化測試：

- Unit Tests：以 `Vitest` 驗證 GAS 後端的資料驗證、Dashboard 路由與 Notion 資料映射邏輯。
- E2E Tests：以 `Playwright` 驗證 `index.html` 與 `form.html` 的主要互動流程，並以 stub/mock 隔離 LINE LIFF、Chart.js 與 GAS API。

本機執行：

```bash
npm install
npx playwright install chromium
npm test
```

若只想分開執行：

```bash
npm run test:unit
npm run test:e2e
```

## 已知限制

- 本專案用於健康數據紀錄輔助，不提供專業醫療診斷。
- AI 解析結果可能受到環境噪音、口音與語速影響。
- 所有 AI 解析結果需經使用者確認後才寫入正式資料。
- Notion 適合私人與小規模紀錄，不適合大型即時交易場景。
- Google Apps Script 受執行時間與 API Quota 限制。

## 部署方式

若要自行部署此專案，請依照以下步驟將程式碼部署至 Google Apps Script：

### 1. 建立專案與匯入程式碼

1. 前往 Google Apps Script 建立新專案。
2. 建議直接透過下方第 6 步的自動化部署將所有 `.gs` 檔案同步到 GAS。

### 2. 設定環境變數

在 GAS 編輯器左側點擊「專案設定」，新增指令碼屬性：

- `NOTION_TOKEN`
- `DATABASE_ID`
- `LINE_ACCESS_TOKEN`
- `ALLOWED_USERS`
- `GEMINI_API_KEY`
- `LIFF_CHANNEL_ID`
- `PET_NAME`

### 3. 發布為網頁應用程式

1. 點擊「部署」>「新增部署作業」，選擇「網頁應用程式」。
2. 執行身分選擇「我」，誰可以存取選擇「所有人」。
3. 部署後取得 Web App URL。

### 4. 綁定 LINE Webhook

- 將 Web App URL 填入 LINE Developer Console 的 Webhook URL 並啟用。

### 5. 部署前端網頁

1. 打開 `form.html` 與 `index.html`。
2. 將 `GAS_URL` 替換為您的 Web App URL。
3. 將 `index.html` 中的 `LIFF_ID` 換成您註冊的 Dashboard LIFF ID。
4. 將前端檔案部署至 GitHub Pages 或其他靜態站點空間。
5. 在 LINE Developer Console 中設定 LIFF App 的 Endpoint URL。

### 6. 自動化部署

本專案已支援透過 GitHub Actions 與 `clasp` 自動推送 GAS 程式碼。

設定步驟：

1. 前往 [Google Apps Script 使用者設定頁面](https://script.google.com/home/usersettings) 開啟 GAS API。
2. 在 GAS 專案設定中複製指令碼 ID。
3. 建立 `.clasp.json`：

```json
{
  "scriptId": "您的指令碼_ID",
  "rootDir": "."
}
```

4. 在本機安裝 `@google/clasp` 並執行 `clasp login`。
5. 將 `~/.clasprc.json` 內容存到 GitHub Actions secret `CLASP_TOKEN`。
6. push 到 `main` 後，workflow 會先跑 `npm test`，成功後再執行 `clasp push -f`。

## 開發注意事項

- 修改 Token 驗證、Notion 欄位名稱、快取鍵或語音 schema 時，需同步更新測試。
- 不應提交 `node_modules/`、`test-results/`、`playwright-report/` 等產物。
- 若未來擴展為多人或正式服務，建議在 GAS 前加入可驗證 LINE signature 的 gateway。
