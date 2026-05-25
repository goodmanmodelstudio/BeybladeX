/**
 * 好男人陀螺實驗室 - 裁判計分板核心邏輯
 * 支援「單機離線模式」與「大會分布式多裁判模式」
 */

let scores = {
    player1: 0,
    player2: 0
};

let details = {
    player1: { "轉停": 0, "擊飛": 0, "爆裂": 0, "極限": 0 },
    player2: { "轉停": 0, "擊飛": 0, "爆裂": 0, "極限": 0 }
};

let gameEnded = false;
let matches = [];   // 離線模式：儲存所有局的記錄
let rounds = [];    // 當前局每一場得分細節
let roundCount = 0; // 當前局場次計算

// 大會分布式模式專用變數
let isDistributedMode = false;
let currentStadiumId = null;
let currentMatchId = null;
let targetWinningScore = 4; // 預設 4 分獲勝
let dbListenerRef = null;

// 初始化頁面
window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const stadiumParam = urlParams.get('stadium');
    
    if (stadiumParam) {
        // === 啟用：大會多裁判分布式模式 ===
        isDistributedMode = true;
        currentStadiumId = parseInt(stadiumParam, 10);
        
        // 1. 調整 UI 以符合大會裁判端外觀
        document.getElementById('stadium-indicator').style.display = 'inline-block';
        document.getElementById('stadium-indicator').innerText = `對戰台 ${currentStadiumId} 終端`;
        document.getElementById('stadium-overlay-indicator').innerText = `對戰台 ${currentStadiumId} - 裁判計分端`;
        document.getElementById('terminal-title').innerText = `大會專用計分終端`;
        
        // 鎖定選手姓名輸入框，禁止裁判手動修改
        document.getElementById('player1-name-input').disabled = true;
        document.getElementById('player2-name-input').disabled = true;
        
        // 僅隱藏「匯出結果」按鈕，保留「交換位置」按鈕供現場左右對手調換
        document.getElementById('btn-export').style.display = 'none';
        
        // 隱藏大會登入卡片面板，因為已經進入該對戰台了
        document.getElementById('distributed-login-card').style.display = 'none';
        
        // 顯示等待指派遮罩，等待 Firebase 數據載入
        document.getElementById('referee-waiting-overlay').style.display = 'flex';
        
        // 2. 啟動 Firebase 監聽
        dbListenerRef = FirebaseService.listenToTournament(handleDistributedStateUpdate);
        
        // 針對 LocalStorage 測試替代的事件監聽
        window.addEventListener('mock-db-update', (e) => {
            handleDistributedStateUpdate(e.detail);
        });
    } else {
        // === 啟用：單機離線模式 (維持原功能) ===
        isDistributedMode = false;
        const player1 = urlParams.get('player1');
        const player2 = urlParams.get('player2');

        if (player1) document.getElementById('player1-name-input').value = player1;
        if (player2) document.getElementById('player2-name-input').value = player2;

        // 離線模式：載入原本的靜態 JSON 紀錄 (如果有的話)
        fetch('path/to/your/match_data.json')
            .then(response => response.json())
            .then(data => {
                matches = data;
                updateMatchDetailsOffline();
            })
            .catch(error => console.warn('Offline mode: No existing match_data.json loaded.'));
    }
}

// 監聽並處理大會的實時數據
function handleDistributedStateUpdate(state) {
    if (!state) return;

    targetWinningScore = state.config.targetScore || 4;

    // 尋找對應的對戰台
    const stadium = state.stadiums.find(s => s.id === currentStadiumId);
    if (!stadium) {
        alert(`找不到對戰台 ID: ${currentStadiumId}`);
        return;
    }

    // 情況 A：對戰台處於閒置狀態 -> 顯示等待遮罩，重置本地分數
    if (stadium.status === 'idle' || !stadium.currentMatchId) {
        document.getElementById('referee-waiting-overlay').style.display = 'flex';
        currentMatchId = null;
        resetGameLocalState();
        return;
    }

    // 情況 B：有指派對戰 -> 載入選手並隱藏等待遮罩
    currentMatchId = stadium.currentMatchId;
    const match = state.matches[currentMatchId];
    if (!match) return;

    // 填入選手名稱
    document.getElementById('player1-name-input').value = match.player1;
    document.getElementById('player2-name-input').value = match.player2;

    // 僅在初始化或本地分數與雲端相差較大時同步分數 (防止裁判點擊後被回傳覆蓋)
    if (scores.player1 !== match.score1 || scores.player2 !== match.score2) {
        // 如果雲端為 0-0，代表是新對戰，重置本地狀態
        if (match.score1 === 0 && match.score2 === 0) {
            resetGameLocalState();
        } else {
            scores.player1 = match.score1;
            scores.player2 = match.score2;
            document.getElementById('score1').innerText = scores.player1;
            document.getElementById('score2').innerText = scores.player2;
            
            // 重新解析細節明細
            rounds = match.rounds || [];
            roundCount = rounds.length;
            renderMatchDetailsList();
        }
    }

    // 隱藏等待遮罩，露出計分板
    document.getElementById('referee-waiting-overlay').style.display = 'none';

    // 檢查是否已分出勝負
    checkWinnerState(match);
}

// 核心計分方法
function addScore(player, points, method) {
    if (gameEnded) return;

    roundCount++; 
    let player1Name = document.getElementById('player1-name-input').value;
    let player2Name = document.getElementById('player2-name-input').value;

    let scoringEvent = {
        round: roundCount,
        scorer: document.getElementById(`${player}-name-input`).value,
        method: method,
        points: points,
        player1Name: player1Name,
        player2Name: player2Name
    };

    rounds.push(scoringEvent);

    // 更新本地分數
    scores[player] += points;
    document.getElementById(`score${player.slice(-1)}`).innerText = scores[player];
    details[player][method] += 1;

    renderMatchDetailsList();

    if (isDistributedMode) {
        // === 大會模式：即時同步至 Firebase ===
        FirebaseService.updateLiveScore(
            currentMatchId, 
            scores.player1, 
            scores.player2, 
            scoringEvent.scorer, 
            points, 
            method
        );
        
        // 判斷是否達到大會獲勝目標
        if (scores[player] >= targetWinningScore) {
            triggerGameEndDistributed(player);
        }
    } else {
        // === 離線模式：檢查是否獲勝 (固定 4 分) ===
        if (scores[player] >= 4) {
            triggerGameEndOffline();
        }
    }
}

// 離線模式結束對戰
function triggerGameEndOffline() {
    let player1Name = document.getElementById('player1-name-input').value;
    let player2Name = document.getElementById('player2-name-input').value;

    matches.push({
        player1: { name: player1Name, score: scores.player1, details: { ...details.player1 } },
        player2: { name: player2Name, score: scores.player2, details: { ...details.player2 } },
        roundDetails: [...rounds]
    });

    gameEnded = true;
    disableScoringButtons();
    
    document.getElementById('winner-display').innerHTML = `
        🏆 比賽結束! 
        <button class="btn btn-sm btn-neon btn-neon-cyan ms-3" onclick="goBackToGroup()">返回對戰分組</button>
    `;
}

// 大會模式達到獲勝分數
function triggerGameEndDistributed(winningPlayer) {
    gameEnded = true;
    disableScoringButtons();

    const winnerName = document.getElementById(`${winningPlayer}-name-input`).value;
    
    // 顯示「送出大會結果」按鈕
    const btnSubmit = document.getElementById('btn-submit');
    btnSubmit.style.display = 'inline-block';
    
    document.getElementById('winner-display').innerHTML = `🏆 獲勝者為：${winnerName}！請點擊下方送出結果。`;
    
    // 綁定送出點擊事件
    btnSubmit.onclick = function() {
        if (confirm(`確定要送出結果嗎？\n獲勝者：${winnerName}\n比分：${scores.player1} 比 ${scores.player2}`)) {
            btnSubmit.disabled = true;
            btnSubmit.innerText = "正在送出...";
            
            FirebaseService.submitMatchResult(currentMatchId, scores.player1, scores.player2, winnerName)
                .then(() => {
                    alert("賽事結果已成功送出！對戰台已釋放。");
                    btnSubmit.style.display = 'none';
                    btnSubmit.disabled = false;
                    btnSubmit.innerText = "送出對戰結果 🏁";
                    resetGameLocalState();
                });
        }
    };
}

// 檢查雲端回傳的狀態判斷是否完賽
function checkWinnerState(match) {
    if (match.status === 'completed' || scores.player1 >= targetWinningScore || scores.player2 >= targetWinningScore) {
        gameEnded = true;
        disableScoringButtons();
        
        if (isDistributedMode && !document.getElementById('btn-submit').style.display === 'inline-block') {
            const winnerVal = scores.player1 >= targetWinningScore ? 'player1' : 'player2';
            triggerGameEndDistributed(winnerVal);
        }
    }
}

// 渲染得分歷程表格
function renderMatchDetailsList() {
    let player1Name = document.getElementById('player1-name-input').value;
    let player2Name = document.getElementById('player2-name-input').value;

    let matchTable = `
        <table class="table table-bordered text-center text-white" style="background: rgba(0,0,0,0.2); border-color: var(--border-color);">
            <thead>
                <tr>
                    <th>場次</th>
                    <th>${player1Name}</th>
                    <th>${player2Name}</th>
                    <th>得分方式</th>
                </tr>
            </thead>
            <tbody>`;

    let player1Total = 0;
    let player2Total = 0;

    rounds.forEach((round, index) => {
        let player1Score = round.scorer === player1Name ? `+${round.points}` : '';
        let player2Score = round.scorer === player2Name ? `+${round.points}` : '';
        
        if (player1Score) player1Total += round.points;
        if (player2Score) player2Total += round.points;

        matchTable += `
            <tr>
                <td>第 ${index + 1} 場</td>
                <td class="${player1Score ? 'text-glow-cyan font-weight-bold' : ''}">${player1Score}</td>
                <td class="${player2Score ? 'text-glow-magenta font-weight-bold' : ''}">${player2Score}</td>
                <td style="font-size:13px;">${round.method}</td>
            </tr>`;
    });

    matchTable += `
            </tbody>
            <tfoot style="background: rgba(255,255,255,0.02);">
                <tr>
                    <th>總分</th>
                    <th class="text-glow-cyan font-weight-bold" style="font-family:'Orbitron',sans-serif; font-size:16px;">${player1Total}</th>
                    <th class="text-glow-magenta font-weight-bold" style="font-family:'Orbitron',sans-serif; font-size:16px;">${player2Total}</th>
                    <th></th>
                </tr>
            </tfoot>
        </table>`;

    document.getElementById('match-details').innerHTML = matchTable;
}

// 重置本地計分狀態
function resetGameLocalState() {
    scores = { player1: 0, player2: 0 };
    details = {
        player1: { "轉停": 0, "擊飛": 0, "爆裂": 0, "極限": 0 },
        player2: { "轉停": 0, "擊飛": 0, "爆裂": 0, "極限": 0 }
    };
    gameEnded = false;
    rounds = [];
    roundCount = 0;

    document.getElementById('score1').innerText = 0;
    document.getElementById('score2').innerText = 0;
    document.getElementById('match-details').innerHTML = '<div style="text-align:center; color:var(--text-muted);">尚無對戰數據</div>';
    document.getElementById('winner-display').innerText = '';
    document.getElementById('btn-submit').style.display = 'none';

    enableScoringButtons();
}

// 重新開始 (按鈕手動重置)
function resetGame() {
    if (isDistributedMode) {
        if (confirm("是否要重置本場比賽的所有分數並重新開始？這將同步清空大螢幕看板。")) {
            resetGameLocalState();
            // 同步清空雲端
            if (FirebaseService.isConfigured()) {
                const db = FirebaseService.getDb();
                db.ref(`tournament/matches/${currentMatchId}`).update({
                    score1: 0,
                    score2: 0,
                    rounds: []
                });
            }
        }
    } else {
        resetGameLocalState();
    }
}

// 交換選手位置
function swapPlayers() {
    let p1Val = document.getElementById('player1-name-input').value;
    let p2Val = document.getElementById('player2-name-input').value;

    document.getElementById('player1-name-input').value = p2Val;
    document.getElementById('player2-name-input').value = p1Val;

    let tempScore = scores.player1;
    scores.player1 = scores.player2;
    scores.player2 = tempScore;

    document.getElementById('score1').innerText = scores.player1;
    document.getElementById('score2').innerText = scores.player2;

    let tempDetails = details.player1;
    details.player1 = details.player2;
    details.player2 = tempDetails;

    renderMatchDetailsList();

    // === 大會模式：即時同步交換後的選手名稱與比分至 Firebase ===
    if (isDistributedMode && FirebaseService.isConfigured()) {
        const db = FirebaseService.getDb();
        db.ref(`tournament/matches/${currentMatchId}`).update({
            player1: p2Val,
            player2: p1Val,
            score1: scores.player1,
            score2: scores.player2
        }).then(() => {
            console.log("Fighter layout and scores swapped in Firebase successfully.");
        }).catch(error => {
            console.error("Error updating swapped layout to Firebase:", error);
        });
    }
}

// 返回分組 (離線模式)
function goBackToGroup() {
    window.history.back();
}

// 禁用所有按鍵
function disableScoringButtons() {
    document.querySelectorAll('.scoring-btn-grid button').forEach(button => {
        button.disabled = true;
    });
}

// 啟用所有按鍵
function enableScoringButtons() {
    document.querySelectorAll('.scoring-btn-grid button').forEach(button => {
        button.disabled = false;
    });
}

// === 離線模式專用：渲染歷程與匯出 Excel ===
function updateMatchDetailsOffline() {
    const matchDetails = document.getElementById('match-details');
    matchDetails.innerHTML = ''; 

    matches.forEach((match, index) => {
        matchDetails.innerHTML += `<h4>對戰 ${index + 1}:</h4>`;
        match.roundDetails.forEach(round => {
            matchDetails.innerHTML += `<p>${round.round}: ${round.scorer} 得到 ${round.points} 分 (${round.method})</p>`;
        });
        matchDetails.innerHTML += `<hr>`;
    });
}

function exportToExcel() {
    if (matches.length === 0) {
        alert("尚無完賽紀錄可匯出！");
        return;
    }
    
    let wb = XLSX.utils.book_new();
    let ws_data = [["對戰場次", "左側選手", "右側選手", "得分方式"]];

    matches.forEach((match, index) => {
        ws_data.push([
            `對戰 ${index + 1}`,
            match.player1.name,
            match.player2.name,
            ''
        ]);

        match.roundDetails.forEach(round => {
            ws_data.push([
                `第 ${round.round} 場`,
                round.scorer === match.player1.name ? round.points : '',
                round.scorer === match.player2.name ? round.points : '',
                round.method
            ]);
        });

        ws_data.push([
            "總分",
            match.player1.score,
            match.player2.score,
            ""
        ]);

        ws_data.push([]);
    });

    let ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, "賽事結果");
    XLSX.writeFile(wb, "BeybladeX_Match_Results.xlsx");
}

// === 大會模式：裁判自行輸入對戰台登入 ===
function loginToStadium() {
    const stadiumIdInput = document.getElementById('login-stadium-id');
    const stadiumId = parseInt(stadiumIdInput.value, 10);
    if (isNaN(stadiumId) || stadiumId <= 0) {
        alert("請輸入有效的對戰台編號！");
        return;
    }
    
    // 跳轉到對應 URL 參數頁面
    window.location.href = `html.html?stadium=${stadiumId}`;
}

// === 大會模式：動態產生對戰台 QR Code ===
function generateStadiumQR() {
    const stadiumIdInput = document.getElementById('login-stadium-id');
    const stadiumId = parseInt(stadiumIdInput.value, 10);
    if (isNaN(stadiumId) || stadiumId <= 0) {
        alert("請輸入有效的對戰台編號！");
        return;
    }

    const qrDisplayArea = document.getElementById('qr-display-area');
    const qrImage = document.getElementById('stadium-qr-image');
    const qrUrlText = document.getElementById('stadium-qr-url');

    // 生成手機載入的絕對 URL。不論在 localhost、區網 IP、還是 GitHub Pages 都能完美取得！
    const absoluteUrl = window.location.origin + window.location.pathname + `?stadium=${stadiumId}`;
    
    // 使用開源免費的 QR 碼 API (QRServer)
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(absoluteUrl)}`;

    // 更新圖片和連結，並將顯示區域展開
    qrImage.src = qrApiUrl;
    qrUrlText.innerText = absoluteUrl;
    qrDisplayArea.style.display = 'block';
    
    // 平滑滾動到 QR Code 區域
    qrDisplayArea.scrollIntoView({ behavior: 'smooth' });
}