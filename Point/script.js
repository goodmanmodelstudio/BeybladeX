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

// 高速相機錄影與回放專用變數
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let replayUrl = null;
let isRecording = false;
let roundReplays = {};       // 儲存每一回合的影片快取 { blob, url }
let currentModalRound = 1;   // 當前 Modal 中播放的場次
let isScrubbing = false;     // 進度條拖拉狀態
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

    // 🏆 UX 核心極速操作：一鍵計分時，自動關閉慢動回放與全螢幕彈出面板、重置並恢復實時相機預覽，省去裁判手動點選關閉！
    closeReplay();
    closeModalReplay();

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
                    <th>判定回放</th>
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

        const roundNum = index + 1;
        const hasReplay = roundReplays[roundNum] ? true : false;
        const replayBtn = hasReplay 
            ? `<button class="btn btn-sm btn-neon btn-neon-cyan py-0 px-2" style="font-size:10px; font-weight:800; text-shadow: 0 0 5px rgba(0,242,254,0.5);" onclick="openModalReplay(${roundNum})" title="重播此回合判定影片">🎥 重播</button>` 
            : `<span style="font-size:10px; color:var(--text-muted);">無錄影</span>`;

        matchTable += `
            <tr>
                <td>第 ${roundNum} 場</td>
                <td class="${player1Score ? 'text-glow-cyan font-weight-bold' : ''}">${player1Score}</td>
                <td class="${player2Score ? 'text-glow-magenta font-weight-bold' : ''}">${player2Score}</td>
                <td style="font-size:13px;">${round.method}</td>
                <td>${replayBtn}</td>
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

    // 釋放所有快取的影片 Blob URL，確保沒有記憶體洩漏
    if (roundReplays) {
        for (const key in roundReplays) {
            if (roundReplays[key] && roundReplays[key].url) {
                URL.revokeObjectURL(roundReplays[key].url);
            }
        }
        roundReplays = {};
    }

    if (replayUrl) {
        URL.revokeObjectURL(replayUrl);
        replayUrl = null;
    }

    document.getElementById('score1').innerText = 0;
    document.getElementById('score2').innerText = 0;
    document.getElementById('match-details').innerHTML = '<div style="text-align:center; color:var(--text-muted);">尚無對戰數據</div>';
    document.getElementById('winner-display').innerText = '';
    document.getElementById('btn-submit').style.display = 'none';
    
    // 隱藏重播按鈕
    document.getElementById('btn-replay-last').style.display = 'none';

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

// 復原上一次得分判定 (Undo)
function undoLastScore() {
    if (rounds.length === 0) {
        alert("目前尚無計分紀錄可以復原！");
        return;
    }

    if (confirm("是否要取消並復原上一次的得分判定？")) {
        const lastEvent = rounds.pop();
        roundCount--;

        let player1Name = document.getElementById('player1-name-input').value;
        let player2Name = document.getElementById('player2-name-input').value;

        // 判定扣除哪位選手的分數
        let targetPlayerKey = null;
        if (lastEvent.scorer === player1Name) {
            targetPlayerKey = 'player1';
            scores.player1 -= lastEvent.points;
            if (scores.player1 < 0) scores.player1 = 0;
            document.getElementById('score1').innerText = scores.player1;
        } else if (lastEvent.scorer === player2Name) {
            targetPlayerKey = 'player2';
            scores.player2 -= lastEvent.points;
            if (scores.player2 < 0) scores.player2 = 0;
            document.getElementById('score2').innerText = scores.player2;
        }

        // 扣除統計詳細次數
        if (targetPlayerKey) {
            details[targetPlayerKey][lastEvent.method] -= 1;
            if (details[targetPlayerKey][lastEvent.method] < 0) {
                details[targetPlayerKey][lastEvent.method] = 0;
            }
        }

        // 如果之前比賽已結束，現在因為復原分數而重新開啟
        if (gameEnded) {
            gameEnded = false;
            enableScoringButtons();
            
            // 隱藏送出按鈕與清除勝利顯示
            document.getElementById('btn-submit').style.display = 'none';
            document.getElementById('winner-display').innerText = '';
        }

        // 重新渲染歷程表格
        renderMatchDetailsList();

        // === 大會模式：即時同步復原後的比分與局明細至 Firebase ===
        if (isDistributedMode && FirebaseService.isConfigured()) {
            const db = FirebaseService.getDb();
            db.ref(`tournament/matches/${currentMatchId}`).update({
                score1: scores.player1,
                score2: scores.player2,
                rounds: rounds,
                status: "playing", // 恢復為進行中
                winner: null       // 清空勝者
            }).then(() => {
                console.log("Match score reverted and synced in Firebase successfully.");
            }).catch(error => {
                console.error("Error reverting match score in Firebase:", error);
            });
        } else if (!isDistributedMode) {
            // 離線模式：更新離線歷程顯示
            updateMatchDetailsOffline();
        }
        
        // UX 親切提示：復原後自動關閉影片，回到相機預覽
        closeReplay();
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

// === 🎥 高速相機與慢動作回放的核心機制 ===

// 1. 初始化並啟動手機相機預覽
function initCamera() {
    if (mediaStream) return; // 已啟動則略過
    
    const btnToggle = document.getElementById('btn-camera-toggle');
    const btnRecord = document.getElementById('btn-record-action');
    
    btnToggle.disabled = true;
    btnToggle.innerText = "正在啟動鏡頭...";
    
    // 調用手機背面高畫質主相機 (facingMode: environment)，不錄音以維持檔案超小且避免權限繁瑣
    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "environment",
            width: { ideal: 640 },
            height: { ideal: 480 }
        },
        audio: false
    }).then(stream => {
        mediaStream = stream;
        const preview = document.getElementById('camera-preview');
        preview.srcObject = stream;
        
        // 初始化 MediaRecorder
        // 讓瀏覽器自主決定最安全且支援的預設相容格式（iOS Safari 與 Android Chrome 各自不同），這在行動端上最為保險與相容！
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
            recordedChunks = [];
            
            const currentUrl = URL.createObjectURL(blob);
            
            // 記錄至多回合影片快取中！(下一場的場次為 roundCount + 1)
            const nextRoundNum = roundCount + 1;
            roundReplays[nextRoundNum] = {
                blob: blob,
                url: currentUrl
            };
            
            replayUrl = currentUrl;
            
            // 顯示「重播本回合影片」按鈕，讓裁判隨時可以點選
            document.getElementById('btn-replay-last').style.display = 'block';
            
            // 直接彈出全新的全螢幕慢動作判定面板！
            openModalReplay(nextRoundNum);
        };
        
        btnToggle.innerText = "⚡ 高速鏡頭已啟用";
        btnRecord.disabled = false;
        console.log("High-speed arena camera initialized successfully.");
    }).catch(err => {
        console.error("Camera access error:", err);
        btnToggle.disabled = false;
        btnToggle.innerText = "📷 啟動高速鏡頭";
        alert("無法啟動相機！請確認已允許相機存取權限，且網頁是在 HTTPS 安全網址下開啟。");
    });
}

// 2. 開始/停止錄影切換
function toggleRecording() {
    if (!mediaRecorder) return;
    
    const btn = document.getElementById('btn-record-action');
    
    if (!isRecording) {
        // 開始錄影
        recordedChunks = [];
        
        // 自動關閉上一局的回放
        closeReplay();
        
        mediaRecorder.start();
        isRecording = true;
        
        btn.innerHTML = "⏹ 停止錄影 Stop";
        btn.className = "btn btn-neon btn-neon-magenta w-100 py-2";
    } else {
        // 停止錄影
        mediaRecorder.stop();
        isRecording = false;
        
        btn.innerHTML = "🔴 開始錄影 Record";
        btn.className = "btn btn-neon btn-neon-cyan w-100 py-2";
    }
}

// 3. 調整回放速度 (0.25x / 0.5x / 1.0x)
function changeReplaySpeed(speed) {
    const viewer = document.getElementById('replay-viewer');
    if (viewer) {
        viewer.playbackRate = speed;
    }
}

// 4. 關閉回放視訊，恢復實時預覽
function closeReplay() {
    const viewer = document.getElementById('replay-viewer');
    const preview = document.getElementById('camera-preview');
    const speedControls = document.getElementById('replay-speed-controls');
    
    if (viewer && viewer.style.display !== 'none') {
        viewer.pause();
        viewer.style.display = 'none';
        preview.style.display = 'block';
        speedControls.style.display = 'none';
    }
}

// 5. 下載錄影結果，支援 iOS/Android 原生 Web Share API 橋接 (一鍵儲存影片至相簿)
function downloadRecordedVideo(roundNum) {
    const videoData = roundReplays[roundNum] || { blob: null, url: replayUrl };
    const url = videoData.url;
    const blob = videoData.blob;

    if (!url) {
        alert("目前尚無可供下載的錄影存檔！");
        return;
    }
    
    // 優先嘗試：使用 HTML5 原生 Web Share API 橋接至手機系統原生分享/媒體儲存面板
    if (blob && navigator.canShare && navigator.share) {
        const stadiumName = isDistributedMode ? `Stadium_${currentStadiumId}` : "Offline";
        const fileName = `BeybladeX_${stadiumName}_Round_${roundNum}.mp4`;
        const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });
        
        if (navigator.canShare({ files: [file] })) {
            navigator.share({
                files: [file],
                title: `第 ${roundNum} 場對戰影片`,
                text: `好男人陀螺實驗室 - 第 ${roundNum} 場慢動作判定影片`
            }).then(() => {
                console.log("Successfully shared file natively!");
            }).catch(err => {
                console.warn("Native share error or cancelled:", err);
                if (err.name !== 'AbortError') {
                    fallbackDownload(url, roundNum);
                }
            });
            return; // 成功喚起原生分享面板，結束
        }
    }
    
    // 降級方案：使用傳統瀏覽器下載任務
    fallbackDownload(url, roundNum);
}

// 降級下載輔助函式
function fallbackDownload(url, roundNum) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    if (isIOS || isSafari) {
        alert("【下載說明】\n影片將在新分頁打開。請長按影片畫面或點選瀏覽器的「分享」按鈕，選擇「儲存影片」即可直接存入手機相簿。");
        window.open(url, '_blank');
    } else {
        const a = document.createElement('a');
        a.href = url;
        const stadiumName = isDistributedMode ? `Stadium_${currentStadiumId}` : "Offline";
        a.download = `BeybladeX_${stadiumName}_Round_${roundNum}_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
        }, 150);
    }
}

// 6. 重播本回合最新對戰影片
function reopenLastReplay() {
    const targetRound = roundCount + 1; // 本回合 (計分前或計分後回看最後一回合)
    openModalReplay(targetRound);
}

// === 🎥 全螢幕慢動作判定面板的控制邏輯 ===

// 打開慢動作判定彈出面板
function openModalReplay(roundNum) {
    const videoData = roundReplays[roundNum];
    const url = videoData ? videoData.url : replayUrl;
    if (!url) {
        alert("尚無本回合的錄影存檔！");
        return;
    }

    currentModalRound = roundNum;

    const modal = document.getElementById('replay-modal');
    const viewer = document.getElementById('modal-replay-viewer');
    const scrubber = document.getElementById('modal-replay-scrubber');
    const title = document.getElementById('replay-modal-title');
    const playPauseBtn = document.getElementById('btn-modal-play-pause');

    title.innerText = `⚡ 第 ${roundNum} 場 慢動作裁判判定`;
    
    // 設定影片來源
    viewer.src = url;
    viewer.loop = true;
    viewer.playbackRate = 0.25; // 預設 4 倍慢動作
    
    // 重設播放/暫停按鈕
    playPauseBtn.innerHTML = "⏸ 暫停";
    playPauseBtn.className = "btn btn-neon btn-neon-cyan btn-replay-control py-2 px-4";

    // 顯示 Modal Overlay
    modal.style.display = 'flex';

    // 綁定影片載入事件
    viewer.onloadedmetadata = function() {
        scrubber.max = viewer.duration;
        document.getElementById('modal-replay-time-total').innerText = viewer.duration.toFixed(2) + "s";
    };

    // 監聽時間更新以同步進度條
    viewer.ontimeupdate = function() {
        if (!isScrubbing) {
            scrubber.value = viewer.currentTime;
            document.getElementById('modal-replay-time-current').innerText = viewer.currentTime.toFixed(2) + "s";
        }
    };

    // 進度條拖拉事件
    scrubber.oninput = function() {
        isScrubbing = true;
        viewer.pause(); // 拖拉時暫停播放以防抖動
        viewer.currentTime = scrubber.value;
        document.getElementById('modal-replay-time-current').innerText = parseFloat(scrubber.value).toFixed(2) + "s";
        
        playPauseBtn.innerHTML = "▶ 播放";
        playPauseBtn.className = "btn btn-neon btn-neon-dark btn-replay-control py-2 px-4";
    };

    scrubber.onchange = function() {
        isScrubbing = false;
        // 放開後維持暫停，方便裁判逐格微調，若想繼續播放裁判可點擊播放按鈕
    };

    // 預設高亮 0.25x 速度按鈕
    highlightSpeedButton(0.25);
    
    // 開始播放
    viewer.play().catch(e => console.warn("Auto-play blocked, requiring interaction:", e));
}

// 關閉判定彈出面板
function closeModalReplay() {
    const modal = document.getElementById('replay-modal');
    const viewer = document.getElementById('modal-replay-viewer');
    
    if (viewer) {
        viewer.pause();
        viewer.src = "";
    }
    
    modal.style.display = 'none';
}

// 播放/暫停切換
function toggleModalPlay() {
    const viewer = document.getElementById('modal-replay-viewer');
    const playPauseBtn = document.getElementById('btn-modal-play-pause');

    if (viewer.paused) {
        viewer.play();
        playPauseBtn.innerHTML = "⏸ 暫停";
        playPauseBtn.className = "btn btn-neon btn-neon-cyan btn-replay-control py-2 px-4";
    } else {
        viewer.pause();
        playPauseBtn.innerHTML = "▶ 播放";
        playPauseBtn.className = "btn btn-neon btn-neon-dark btn-replay-control py-2 px-4";
    }
}

// 影格微調 (前進/後退 delta 秒，例如 0.05 秒)
function stepReplayFrame(delta) {
    const viewer = document.getElementById('modal-replay-viewer');
    if (!viewer) return;
    
    viewer.pause();
    const playPauseBtn = document.getElementById('btn-modal-play-pause');
    playPauseBtn.innerHTML = "▶ 播放";
    playPauseBtn.className = "btn btn-neon btn-neon-dark btn-replay-control py-2 px-4";

    // 計算新時間
    let newTime = viewer.currentTime + delta;
    if (newTime < 0) newTime = 0;
    if (newTime > viewer.duration) newTime = viewer.duration;
    
    viewer.currentTime = newTime;
    document.getElementById('modal-replay-time-current').innerText = newTime.toFixed(2) + "s";
    document.getElementById('modal-replay-scrubber').value = newTime;
}

// 改變播放速度 (0.25x / 0.5x / 1.0x)
function changeModalReplaySpeed(speed) {
    const viewer = document.getElementById('modal-replay-viewer');
    if (viewer) {
        viewer.playbackRate = speed;
        highlightSpeedButton(speed);
    }
}

// 高亮目前選擇的速度按鈕
function highlightSpeedButton(speed) {
    const btn025 = document.getElementById('btn-speed-025');
    const btn05 = document.getElementById('btn-speed-05');
    const btn10 = document.getElementById('btn-speed-10');

    // 重設所有速度按鈕為 dark 樣式
    btn025.className = "btn btn-sm btn-neon btn-neon-dark py-2 px-1";
    btn05.className = "btn btn-sm btn-neon btn-neon-dark py-2 px-1";
    btn10.className = "btn btn-sm btn-neon btn-neon-dark py-2 px-1";

    if (speed === 0.25) {
        btn025.className = "btn btn-sm btn-neon btn-neon-cyan py-2 px-1";
    } else if (speed === 0.5) {
        btn05.className = "btn btn-sm btn-neon btn-neon-cyan py-2 px-1";
    } else if (speed === 1.0) {
        btn10.className = "btn btn-sm btn-neon btn-neon-cyan py-2 px-1";
    }
}

// 全螢幕切換
function toggleFullscreenReplay() {
    const viewer = document.getElementById('modal-replay-viewer');
    if (!viewer) return;

    if (viewer.requestFullscreen) {
        viewer.requestFullscreen();
    } else if (viewer.webkitRequestFullscreen) { /* Safari / iOS */
        viewer.webkitRequestFullscreen();
    } else if (viewer.msRequestFullscreen) {
        viewer.msRequestFullscreen();
    }
}

// Modal 下載當前影片
function downloadModalRecordedVideo() {
    downloadRecordedVideo(currentModalRound);
}