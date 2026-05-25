/**
 * 好男人陀螺實驗室 - Firebase 資料服務封裝
 * 
 * 封裝了所有與 Firebase Realtime Database 互動的 API。
 */

const FirebaseService = {
    // 檢查 Firebase 是否已正確設定
    isConfigured: function() {
        return typeof firebaseConfig !== 'undefined' && 
               firebaseConfig.apiKey && 
               !firebaseConfig.apiKey.startsWith("YOUR_");
    },

    // 顯示 Firebase 未設定的警告提示
    checkConfiguration: function() {
        if (!this.isConfigured()) {
            console.warn("Firebase config is using default placeholder values. Real-time features will be disabled.");
            this.showWarningBanner();
            return false;
        }
        return true;
    },

    showWarningBanner: function() {
        if (document.getElementById('firebase-warning-banner')) return;
        
        const banner = document.createElement('div');
        banner.id = 'firebase-warning-banner';
        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background-color: #ff3860;
            color: white;
            text-align: center;
            padding: 12px 20px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: bold;
            z-index: 99999;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 15px;
        `;
        
        banner.innerHTML = `
            <span>⚠️ 偵測到 Firebase 尚未設定！請先設定 <a href="file:///Users/goodman/Desktop/個人資料/戰鬥陀螺/BeybladeX/js/firebase-config.js" style="color: yellow; text-decoration: underline;">js/firebase-config.js</a> 才能啟用分佈式多裁判即時同步功能。</span>
            <button onclick="document.getElementById('firebase-warning-banner').remove()" style="background: rgba(0,0,0,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;">關閉</button>
        `;
        
        document.body.appendChild(banner);
        // 為了不影響頁面頂部元素，給 body 加一個 padding
        document.body.style.paddingTop = '45px';
    },

    // 取得資料庫參照
    getDb: function() {
        if (!this.isConfigured()) return null;
        return firebase.database();
    },

    // 監聽賽事狀態 (即時同步)
    listenToTournament: function(callback) {
        if (!this.checkConfiguration()) {
            // 如果沒設定，嘗試從本地儲存讀取作為測試替代
            const localData = localStorage.getItem('mock_tournament_state');
            if (localData) {
                callback(JSON.parse(localData));
            }
            return null;
        }

        const db = this.getDb();
        const ref = db.ref('tournament');
        ref.on('value', (snapshot) => {
            const data = snapshot.val();
            callback(data);
        });

        return ref;
    },

    // 取消監聽
    stopListening: function(ref) {
        if (ref && typeof ref.off === 'function') {
            ref.off();
        }
    },

    // 初始化賽事
    initTournament: function(players, stadiumsCount, targetScore = 4) {
        const numPlayers = players.length;
        
        // 1. 計算最接近大於等於 N 的 2 的次方
        let nextPower = 1;
        while (nextPower < numPlayers) {
            nextPower *= 2;
        }
        if (nextPower < 2) nextPower = 2; // 最少兩位選手

        const numRounds = Math.log2(nextPower);
        
        // 2. 處理選手名單
        const processedPlayers = [...players];
        
        // 將名單反轉，這樣 pop() 出來的順序會與名單正序一致！
        processedPlayers.reverse();

        // 3. 建立所有輪次的空對戰物件
        const matches = {};
        
        // 首輪 (Round 1) 賽事生成
        const r1MatchesCount = nextPower / 2;
        const numByes = nextPower - numPlayers; // 需要輪空的數量
        
        // 生成首輪對戰，完美均勻分配 BYE 輪空，確保 BYE 絕不互打
        for (let i = 0; i < r1MatchesCount; i++) {
            let player1, player2;
            
            if (i < numByes) {
                // 輪空配對：一名真實選手 vs BYE
                player1 = processedPlayers.pop() || "待定";
                player2 = "BYE";
            } else {
                // 正常配對：兩名真實選手對戰
                player1 = processedPlayers.pop() || "待定";
                player2 = processedPlayers.pop() || "待定";
            }
            
            const matchId = `R1-M${i + 1}`;
            let status = "pending";
            let winner = null;
            
            if (player1 === "BYE" && player2 === "BYE") {
                status = "completed";
                winner = "BYE";
            } else if (player1 === "BYE") {
                status = "completed";
                winner = player2;
            } else if (player2 === "BYE") {
                status = "completed";
                winner = player1;
            }

            matches[matchId] = {
                id: matchId,
                round: 1,
                matchNum: i + 1,
                player1: player1,
                player2: player2,
                score1: 0,
                score2: 0,
                rounds: [],
                status: status,
                winner: winner,
                stadiumId: null
            };
        }

        // 後續輪次空對戰生成
        let currentRoundMatches = r1MatchesCount;
        for (let r = 2; r <= numRounds; r++) {
            currentRoundMatches /= 2;
            for (let m = 1; m <= currentRoundMatches; m++) {
                const matchId = `R${r}-M${m}`;
                matches[matchId] = {
                    id: matchId,
                    round: r,
                    matchNum: m,
                    player1: null,
                    player2: null,
                    score1: 0,
                    score2: 0,
                    rounds: [],
                    status: "pending",
                    winner: null,
                    stadiumId: null
                };
            }
        }

        // 3. 建立對戰台清單
        const stadiums = [];
        for (let i = 1; i <= stadiumsCount; i++) {
            stadiums.push({
                id: i,
                name: `對戰台 ${i}`,
                currentMatchId: null,
                status: "idle"
            });
        }

        // 4. 將自動晉級首輪的勝者推送到第二輪對應的插槽
        for (let i = 0; i < r1MatchesCount; i++) {
            const matchId = `R1-M${i + 1}`;
            const match = matches[matchId];
            if (match.status === "completed" && match.winner !== "BYE") {
                const nextMatchId = `R2-M${Math.ceil(match.matchNum / 2)}`;
                const position = (match.matchNum % 2 !== 0) ? "player1" : "player2";
                matches[nextMatchId][position] = match.winner;
                
                // 檢查第二輪的這場比賽是否因為對手也是 BYE 或直接晉級而成立
                const nextMatch = matches[nextMatchId];
                if (nextMatch.player1 === "BYE" || nextMatch.player2 === "BYE") {
                     // 處理下一輪輪空
                     if (nextMatch.player1 && nextMatch.player2) {
                         nextMatch.winner = nextMatch.player1 === "BYE" ? nextMatch.player2 : nextMatch.player1;
                         nextMatch.status = "completed";
                     }
                }
            }
        }

        // 建立完整賽事狀態結構
        const state = {
            config: {
                numPlayers: numPlayers,
                numStadiums: stadiumsCount,
                targetScore: targetScore,
                lastUpdated: Date.now()
            },
            stadiums: stadiums,
            players: players,
            matches: matches
        };

        // 自動分配首輪準備好的比賽到對戰台
        this._autoAssignStadiums(state);

        // 儲存狀態
        this.saveState(state);
        return state;
    },

    // 保存賽事狀態
    saveState: function(state) {
        state.config.lastUpdated = Date.now();
        
        if (!this.isConfigured()) {
            localStorage.setItem('mock_tournament_state', JSON.stringify(state));
            console.log("Saved state to LocalStorage (Mock Mode)");
            return Promise.resolve(state);
        }

        return this.getDb().ref('tournament').set(state)
            .then(() => state)
            .catch(err => {
                console.error("Firebase write error:", err);
                throw err;
            });
    },

    // 裁判即時更新局分
    updateLiveScore: function(matchId, score1, score2, scorerName, points, method) {
        if (!this.isConfigured()) {
            const localData = localStorage.getItem('mock_tournament_state');
            if (localData) {
                const state = JSON.parse(localData);
                const match = state.matches[matchId];
                if (match) {
                    match.score1 = score1;
                    match.score2 = score2;
                    match.rounds.push({
                        round: match.rounds.length + 1,
                        scorer: scorerName,
                        points: points,
                        method: method,
                        timestamp: Date.now()
                    });
                    this.saveState(state);
                    // 觸發重新讀取回調
                    window.dispatchEvent(new CustomEvent('mock-db-update', { detail: state }));
                }
            }
            return Promise.resolve();
        }

        const db = this.getDb();
        const matchRef = db.ref(`tournament/matches/${matchId}`);
        
        // 讀取當前 match，追加 round 詳情並更新分數
        return matchRef.once('value').then(snapshot => {
            const match = snapshot.val();
            if (!match) return;

            const rounds = match.rounds || [];
            rounds.push({
                round: rounds.length + 1,
                scorer: scorerName,
                points: points,
                method: method,
                timestamp: Date.now()
            });

            return matchRef.update({
                score1: score1,
                score2: score2,
                rounds: rounds
            });
        });
    },

    // 提交比賽結果，並推進晉級
    submitMatchResult: function(matchId, score1, score2, winnerName) {
        if (!this.isConfigured()) {
            const localData = localStorage.getItem('mock_tournament_state');
            if (localData) {
                const state = JSON.parse(localData);
                this._processMatchCompletion(state, matchId, score1, score2, winnerName);
                this.saveState(state);
                window.dispatchEvent(new CustomEvent('mock-db-update', { detail: state }));
            }
            return Promise.resolve();
        }

        const db = this.getDb();
        return db.ref('tournament').once('value').then(snapshot => {
            const state = snapshot.val();
            if (!state) return;

            this._processMatchCompletion(state, matchId, score1, score2, winnerName);
            return this.saveState(state);
        });
    },

    // 手動重置整場比賽
    resetTournament: function() {
        if (!this.isConfigured()) {
            localStorage.removeItem('mock_tournament_state');
            window.dispatchEvent(new CustomEvent('mock-db-update', { detail: null }));
            return Promise.resolve();
        }
        return this.getDb().ref('tournament').remove();
    },

    // 私有方法：處理比賽結束後的晉級與場地釋放
    _processMatchCompletion: function(state, matchId, score1, score2, winnerName) {
        const match = state.matches[matchId];
        if (!match) return;

        // 1. 更新此場比賽狀態
        match.score1 = score1;
        match.score2 = score2;
        match.winner = winnerName;
        match.status = "completed";

        // 2. 釋放對戰台
        const stadiumId = match.stadiumId;
        if (stadiumId) {
            const stadium = state.stadiums.find(s => s.id === parseInt(stadiumId));
            if (stadium) {
                stadium.currentMatchId = null;
                stadium.status = "idle";
            }
        }
        match.stadiumId = null; // 比賽結束，解除對戰台綁定

        // 3. 推送勝者晉級至下一輪
        const curRound = match.round;
        const curMatchNum = match.matchNum;
        
        // 判斷是否為冠亞軍賽 (最後一輪只有一場)
        const nextRound = curRound + 1;
        const totalMatchesInRound = Object.values(state.matches).filter(m => m.round === curRound).length;
        
        if (totalMatchesInRound > 1) {
            const nextMatchNum = Math.ceil(curMatchNum / 2);
            const nextMatchId = `R${nextRound}-M${nextMatchNum}`;
            const nextMatch = state.matches[nextMatchId];
            
            if (nextMatch) {
                const position = (curMatchNum % 2 !== 0) ? "player1" : "player2";
                nextMatch[position] = winnerName;
                
                // 檢查下一輪是否因為輪空 (另一方是 BYE) 也要自動晉級
                if (nextMatch.player1 === "BYE" || nextMatch.player2 === "BYE") {
                    if (nextMatch.player1 && nextMatch.player2) {
                        nextMatch.winner = nextMatch.player1 === "BYE" ? nextMatch.player2 : nextMatch.player1;
                        nextMatch.status = "completed";
                        // 遞迴呼叫處理下一輪的晉級
                        this._processMatchCompletion(state, nextMatchId, 0, 0, nextMatch.winner);
                    }
                }
            }
        }

        // 4. 比賽結束釋放了對戰台，自動分配新的對戰
        this._autoAssignStadiums(state);
    },

    // 私有方法：自動分配空閒對戰台
    _autoAssignStadiums: function(state) {
        // 尋找所有閒置對戰台
        const idleStadiums = state.stadiums.filter(s => s.status === "idle");
        if (idleStadiums.length === 0) return;

        // 尋找所有「準備好」但尚未開始的比賽 (兩邊都有選手且非輪空，且為 pending 狀態)
        const pendingMatches = Object.values(state.matches)
            .filter(m => m.status === "pending" && 
                         m.player1 !== null && m.player2 !== null && 
                         m.player1 !== "BYE" && m.player2 !== "BYE")
            // 優先排定早期的輪次 (Round)，其次依場次 (matchNum) 排序
            .sort((a, b) => {
                if (a.round !== b.round) return a.round - b.round;
                return a.matchNum - b.matchNum;
            });

        // 進行分配
        let matchIndex = 0;
        for (let i = 0; i < idleStadiums.length; i++) {
            if (matchIndex >= pendingMatches.length) break;

            const stadium = idleStadiums[i];
            const match = pendingMatches[matchIndex];

            // 綁定
            stadium.currentMatchId = match.id;
            stadium.status = "playing";

            match.stadiumId = stadium.id;
            match.status = "playing";

            matchIndex++;
        }
    }
};

// 網頁載入時自動執行設定檢查
window.addEventListener('DOMContentLoaded', () => {
    FirebaseService.checkConfiguration();
});
