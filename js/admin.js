/**
 * 好男人陀螺實驗室 - 賽事管理頁面邏輯 js/admin.js
 */

document.addEventListener('DOMContentLoaded', () => {
    const initForm = document.getElementById('init-form');
    const playerListInput = document.getElementById('playerList');
    const btnShuffle = document.getElementById('btn-shuffle');
    const btnReset = document.getElementById('btn-reset');
    const btnViewDashboard = document.getElementById('btn-view-dashboard');
    
    const noActiveTournament = document.getElementById('no-active-tournament');
    const activeTournamentDetails = document.getElementById('active-tournament-details');
    
    // 賽事詳情文字節點
    const statPlayers = document.getElementById('stat-players');
    const statStadiums = document.getElementById('stat-stadiums');
    const statTarget = document.getElementById('stat-target');
    const statCompleted = document.getElementById('stat-completed');
    const stadiumPillsContainer = document.getElementById('stadium-pills');

    let dbListenerRef = null;

    // 1. 隨機打亂選手名單
    btnShuffle.addEventListener('click', () => {
        const text = playerListInput.value.trim();
        if (!text) {
            alert("請先輸入選手姓名！");
            return;
        }

        const players = text.split('\n')
                            .map(p => p.trim())
                            .filter(p => p.length > 0);

        if (players.length < 2) {
            alert("打亂名單至少需要 2 位選手！");
            return;
        }

        // Fisher-Yates 洗牌演算法
        for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]];
        }

        playerListInput.value = players.join('\n');
    });

    // 2. 表單提交：初始化賽程
    initForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const numStadiums = parseInt(document.getElementById('numStadiums').value, 10);
        const targetScore = parseInt(document.getElementById('targetScore').value, 10);
        const text = playerListInput.value.trim();

        if (!text) {
            alert("請輸入選手名單！");
            return;
        }

        const players = text.split('\n')
                            .map(p => p.trim())
                            .filter(p => p.length > 0);

        if (players.length < 2) {
            alert("參賽人數至少需要 2 人！");
            return;
        }

        if (confirm(`確定要以 ${players.length} 位選手、${numStadiums} 個對戰台初始化新賽事嗎？此操作將會覆蓋現有賽事。`)) {
            FirebaseService.initTournament(players, numStadiums, targetScore);
            alert("賽事生成成功！已自動分配合適的對戰台。");
        }
    });

    // 3. 重置賽事按鈕
    btnReset.addEventListener('click', () => {
        if (confirm("🚨 注意：此動作會完全刪除目前資料庫中所有的對戰狀態、計分詳情與對戰台分配！此操作無法復原。確定要清除嗎？")) {
            FirebaseService.resetTournament().then(() => {
                alert("所有賽事紀錄已成功清除！");
            });
        }
    });

    // 4. 前往大螢幕看板
    btnViewDashboard.addEventListener('click', () => {
        window.location.href = "dashboard.html";
    });

    // 5. 監聽賽事狀態並動態渲染 UI
    function renderTournamentStatus(state) {
        if (!state) {
            // 沒有進行中的賽事
            noActiveTournament.style.display = 'block';
            activeTournamentDetails.style.display = 'none';
            return;
        }

        noActiveTournament.style.display = 'none';
        activeTournamentDetails.style.display = 'block';

        // 填入基礎數據
        statPlayers.innerText = `${state.config.numPlayers} 人`;
        statStadiums.innerText = `${state.config.numStadiums} 台`;
        statTarget.innerText = `${state.config.targetScore} 分`;

        // 計算比賽進度
        const matchesArray = Object.values(state.matches);
        const totalMatches = matchesArray.filter(m => m.player1 !== "BYE" && m.player2 !== "BYE").length;
        const completedMatches = matchesArray.filter(m => m.status === "completed" && m.winner !== "BYE").length;
        statCompleted.innerText = `${completedMatches} / ${totalMatches} 場`;

        // 渲染對戰台藥丸
        stadiumPillsContainer.innerHTML = '';
        state.stadiums.forEach(stadium => {
            const pill = document.createElement('div');
            pill.className = `stadium-pill ${stadium.status === 'playing' ? 'playing' : ''}`;
            pill.style.cursor = 'pointer';
            pill.title = "點擊顯示此對戰台的裁判 QR Code";
            
            let statusText = "閒置中 IDLE";
            if (stadium.status === 'playing' && stadium.currentMatchId) {
                const match = state.matches[stadium.currentMatchId];
                if (match) {
                    statusText = `${match.player1} VS ${match.player2}`;
                }
            }

            pill.innerHTML = `
                <div class="name">${stadium.name} 📱</div>
                <div class="status">${statusText}</div>
            `;
            
            // 點擊對戰台藥丸彈出裁判登入 QR Code
            pill.addEventListener('click', () => {
                showStadiumQrModal(stadium.id, stadium.name);
            });
            
            stadiumPillsContainer.appendChild(pill);
        });
    }

    // 6. 裁判 QR Code 彈出燈箱控制
    const qrModal = document.getElementById('qr-modal');
    const qrModalClose = document.getElementById('qr-modal-close');
    
    qrModalClose.addEventListener('click', () => {
        qrModal.style.display = 'none';
    });
    
    qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) {
            qrModal.style.display = 'none';
        }
    });

    function showStadiumQrModal(stadiumId, stadiumName) {
        const modalTitle = document.getElementById('qr-modal-title');
        const modalImage = document.getElementById('qr-modal-image');
        const modalUrl = document.getElementById('qr-modal-url');

        // 生成絕對 URL，指向 Point/html.html
        const absoluteUrl = window.location.origin + window.location.pathname.replace('admin.html', '') + `Point/html.html?stadium=${stadiumId}`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(absoluteUrl)}`;

        modalTitle.innerText = `${stadiumName} 📱 裁判計分端`;
        modalImage.src = qrApiUrl;
        modalUrl.innerText = absoluteUrl;
        
        qrModal.style.display = 'flex';
    }

    // 啟動實時監聽
    dbListenerRef = FirebaseService.listenToTournament(renderTournamentStatus);

    // 針對 LocalStorage 測試模式的事件監聽（當 firebaseConfig 還是預設值時）
    window.addEventListener('mock-db-update', (e) => {
        renderTournamentStatus(e.detail);
    });
});
