# 好男人陀螺實驗室 - 多裁判即時賽事管理系統需求與架構說明書 (memory.md)

本文件詳實記錄了「好男人陀螺實驗室」在進行系統升級時的核心需求、技術架構決策與核心演算法邏輯，以利後續的系統維護、二次開發與需求對齊。

---

## 🏆 1. 核心業務需求與使用情境

本系統原為單機運作的陀螺分組與計分小工具，為因應現場賽事規模擴大，全面升級為**多裁判分布式大會實時評分與賽程同步系統**。

### 👥 現場使用情境 (User Story)
1.  **賽事主控端 (大會管理員)**：
    *   在賽事開始前，設定大會對戰台（裁判）數量與獲勝分數門檻（預設 4 分）。
    *   輸入或貼上參賽選手名單，可選擇一鍵隨機洗牌，並點擊生成對戰賽程。
    *   隨時可以在管理後台監管各個對戰台的即時對打選手與連線狀態，並可一鍵投射指定對戰台的 QR Code。
2.  **現場裁判端 (Referees)**：
    *   每位裁判分配到一個「對戰台編號」。裁判用手機掃描大會大螢幕或控制台提供的專屬 QR Code，快速登入該對戰台。
    *   登入後，手機計分板會進入「等待指派」遮罩狀態。
    *   一旦大會有比賽分派至該對戰台，計分板會自動解鎖並載入兩位選手的姓名。裁判只需專心計分（轉停 +1、擊飛 +2、爆裂 +2、極限 +3）。
    *   裁判每次點擊得分，分數與得分歷史會**毫秒級即時同步**到大會總覽大螢幕。
    *   **左右位置交換功能 (Fighter Swap)**：裁判端保留「交換位置」按鈕。當實體現場對戰雙方互換對戰位置時，裁判點擊此按鈕，兩側選手的名稱、分數與對戰歷史會即時互換，並**即時同步更新至雲端與大會投影大螢幕**，確保大會看板的左右對戰視野與實體現場完全一致！
    *   當某位選手達標（如 4 分）時，計分板鎖定並顯示「送出大會結果」按鈕，確認後送出，對戰台重回等待狀態。
3.  **大螢幕總覽看板 (Dashboard / Audience)**：
    *   在大會現場用投影機或大電視投放，以精美、高科技感霓虹電競風格呈現。
    *   上方以網格卡片即時同步呈現各個對戰台的對打選手姓名、即時分數與近期得分軌跡。
    *   下方呈現動態的單淘汰對戰樹狀圖（Bracket），完賽後自動以金色高亮晉級線將勝者送往下一輪，並動態點亮正在對戰中的對戰格與其分配的對戰台編號。

---

## 🏗️ 2. 技術架構決策

為確保本專案能**永久免費、零主機成本、極簡部署**，我們放棄了傳統的「PHP + MySQL + 輪詢」或「Node.js + WebSocket」伺服器架構，採用了 **無伺服器 (Serverless) 即時同步架構**：

```
       [ 裁判手機端 ]              [ 大會大螢幕看板 ]
     (Point/html.html)            (dashboard.html)
             \                           /
    (JS SDK)  \                         /  (JS SDK)
               v                       v
          [ ☁️ Google Firebase Realtime Database ]
                       ^
                       | (JS SDK)
                 [ 賽事管理後台 ]
                  (admin.html)
```

### 1. 靜態網頁代管：GitHub Pages
*   **優點**：100% 免費、超快 CDN 載入、直接對接 Git 版本控制。
*   **影響**：無法運行後端腳本（如 PHP、Node.js），整個系統的所有運算邏輯（賽程樹生成、晉級推導、場地分配）必須**完全在前端瀏覽器（Client-side JavaScript）中完成**，並直接向雲端資料庫寫入結果。

### 2. 即時資料庫：Google Firebase Realtime Database
*   **為什麼選擇它**：
    *   **真正即時 (WebSocket)**：裁判點擊得分時，雲端會即時發送 delta 更新，大螢幕同步延遲低於 0.1 秒，極大增強現場氣氛！
    *   **Serverless**：無須架設後端主機，全前端 SDK 載入，完美相容 GitHub Pages。
    *   **巨大免費額度**：1 GB 存儲與 100 個同時在線限制，對中小型實體賽事來說相當於**永久免費**。
*   **免登入本地模擬支援 (Developer Experience)**：
    *   考慮到用戶可能在無網路或尚未配置 Firebase Key 的情況下測試，我們在 `firebase-service.js` 中內建了 **LocalStorage 替代模擬機制**。
    *   若設定檔中的金鑰為預設佔位符，系統會自動在瀏覽器本地資料庫中進行數據儲存與事件派發，讓用戶在一台電腦打開多個分頁就能體驗完美的即時更新！

---

## 📊 3. 資料庫 Schema 設計 (`tournament` 節點)

資料庫採用單一扁平 JSON 結構，以便於實時監聽與部分更新：

```json
{
  "config": {
    "numPlayers": 6,        // 總參賽人數
    "numStadiums": 2,       // 對戰台總數
    "targetScore": 4,       // 獲勝門檻分數
    "lastUpdated": 1780000000000
  },
  "stadiums": [
    {
      "id": 1,
      "name": "對戰台 1",
      "currentMatchId": "R1-M1", // 目前指派的對戰 ID，若無則為 null
      "status": "playing"        // 狀態: "idle" | "playing"
    }
  ],
  "players": ["選手 A", "選手 B", "選手 C", "選手 D", "選手 E", "選手 F"],
  "matches": {
    "R1-M1": {
      "id": "R1-M1",
      "round": 1,
      "matchNum": 1,
      "player1": "選手 A",
      "player2": "選手 B",
      "score1": 2,
      "score2": 3,
      "rounds": [
        { "round": 1, "scorer": "選手 A", "points": 2, "method": "擊飛", "timestamp": 1780000050000 },
        { "round": 2, "scorer": "選手 B", "points": 3, "method": "極限", "timestamp": 1780000080000 }
      ],
      "status": "playing", // 狀態: "pending" (待定) | "playing" (對戰中) | "completed" (完賽)
      "winner": null,
      "stadiumId": 1
    },
    "R1-M2": {
      "id": "R1-M2",
      "round": 1,
      "matchNum": 2,
      "player1": "選手 C",
      "player2": "選手 D",
      "score1": 0,
      "score2": 0,
      "rounds": [],
      "status": "pending",
      "winner": null,
      "stadiumId": null
    }
  }
}
```

---

## 🧮 4. 核心演算法邏輯

### 1. 完美的單淘汰賽程樹與 BYE 分配演算法
當參賽人數 $N$ 不是 2 的次方時，會有 $P - N$ 位選手獲得首輪輪空（BYE）直接晉級（$P$ 為最接近大於等於 $N$ 的 2 的次方，如 $N=6 \rightarrow P=8$）。
*   **傳統做法的缺陷**：直接在名單尾部補 BYE，會造成 `BYE VS BYE` 對空打的無效比賽，導致有選手必須在第二輪才輪空。
*   **我們實現的完美分配演算法**：
    1.  首輪共有 $P/2$ 場比賽，輪空場次數為 $numByes = P - N$。
    2.  因為 $P - N$ 必定小於等於 $P/2$，我們將前 $numByes$ 場比賽全數排定為 `選手 VS BYE`。
    3.  剩餘的 $P/2 - numByes$ 場比賽排定為正常的 `選手 VS 選手`。
    4.  **結果**：首輪中，有輪空待遇的選手直接被設為 `"completed"` 並自動晉級至第二輪，其餘真實選手在第一輪正面對決。**徹底杜絕 BYE 互打與後續輪次輪空的瑕疵！**

### 2. 晉級關聯推導
對於 Round $R$ 的第 $M$ 場比賽：
*   其獲勝者將晉級到 Round $R+1$ 的第 $\lceil M/2 \rceil$ 場比賽。
*   若 $M$ 為奇數，晉級者填入下一場的 `player1`；若 $M$ 為偶數，填入 `player2`。
*   *代碼實作*：
    ```javascript
    const nextMatchId = `R${r + 1}-M${Math.ceil(m / 2)}`;
    const nextPosition = (m % 2 !== 0) ? "player1" : "player2";
    ```

### 3. 自動對戰台派發邏輯 (Stadium Auto-Allocation)
每當初始化賽事，或某場比賽完賽釋放對戰台時，系統自動執行以下指派：
1.  找出所有狀態為 `"idle"` 的對戰台。
2.  在 matches 中，篩選出狀態為 `"pending"`，且 `player1` 與 `player2` 皆已確定（不為 `null` 且不為 `"BYE"`）的待打比賽。
3.  依據**輪次優先 (Round 越早越優先)、場次優先 (MatchNum 越小越優先)**進行排序。
4.  將空閒對戰台與排在最前面的待打比賽進行雙向綁定更新，並將狀態設為 `"playing"`。

---

## 📱 5. QR Code 快速登入設計

為解決比賽現場裁判用手機登入時「手動輸入長網址極為不便」的痛點，系統提供了動態 QR Code 機制：
1.  **動態網址拼接**：
    系統在前端自動以 `window.location.origin + window.location.pathname` 動態取得當前的絕對部署路徑，並附加參數 `?stadium=stadiumId`。這使得不論在 `localhost` 區網 IP 還是 GitHub Pages，皆能產生 100% 精確的二維碼。
2.  **免套件超快生成**：
    我們利用免費開源的 `https://api.qrserver.com/v1/create-qr-code/` API，前端只需將拼接好的網址以 `encodeURIComponent` 帶入 `src`，即可完成免任何外部 JS 套件的超輕量 QR Code 載入。
3.  **雙入口便利性**：
    *   *管理端控制台*：點擊任何對戰台藥丸即可彈出霓虹 Modal 展示 QR Code。
    *   *裁判登入大廳*：裁判若在手機/平板上打開單機版評分頁面，可在最下方手動輸入對戰台編號，一鍵「直接登入」或「產生 QR Code」。

---

## 🚀 6. 未來擴充性規劃與考量

若後續專案要升級為「陀螺聯賽全功能平台（含選手生涯、季賽積分與全台排行榜）」，本架構具備極佳的擴充相容性：
1.  **選手資料庫化**：可在 Firebase 中新增 `/players/{playerId}` 節點，記錄每位選手的姓名、俱樂部、當季積分 (`seasonPoints`)、歷史勝負數等。
2.  **戰績自動結算**：在裁判送出結果觸發 `_processMatchCompletion`時，除了推動晉級，可同時對 Firebase 裡的獲勝選手進行 `seasonPoints` 的累積更新。
3.  **排行榜展示**：在 `index.html` 或 `Records.html` 引入 Firebase 唯讀監聽，利用 Firebase 的 `orderByChild('seasonPoints')` 語法直接在前端即時動態渲染「全台陀螺勇士即時排行榜」，無須搬遷主機。
