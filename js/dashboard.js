/**
 * 好男人陀螺實驗室 - 即時大螢幕總覽邏輯 js/dashboard.js
 */

document.addEventListener('DOMContentLoaded', () => {
    const stadiumsContainer = document.getElementById('stadiums-container');
    const bracketRoot = document.getElementById('bracket-root');
    let dbListenerRef = null;

    // 1. 主要渲染入口
    function updateDashboard(state) {
        if (!state) {
            stadiumsContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px 0; color: var(--text-muted);">
                    目前沒有進行中的賽事。請前往「賽事管理」頁面初始化賽事！
                </div>
            `;
            bracketRoot.innerHTML = `
                <div style="text-align: center; width: 100%; padding: 40px 0; color: var(--text-muted);">
                    尚未初始化賽事樹狀圖。
                </div>
            `;
            return;
        }

        renderStadiums(state);
        renderBracket(state);
    }

    // 2. 渲染對戰台卡片
    function renderStadiums(state) {
        stadiumsContainer.innerHTML = '';
        
        state.stadiums.forEach(stadium => {
            const card = document.createElement('div');
            
            if (stadium.status === 'playing' && stadium.currentMatchId) {
                const match = state.matches[stadium.currentMatchId];
                card.className = 'glass-panel stadium-card playing';
                
                // 獲取最新局的計分記錄，取最近的 3 次展示
                const rounds = match.rounds || [];
                let logHtml = '';
                if (rounds.length > 0) {
                    const recentLogs = rounds.slice(-2).reverse();
                    recentLogs.forEach(log => {
                        logHtml += `
                            <div class="log-item">
                                <span>第 ${log.round} 場: ${log.scorer}</span>
                                <span class="text-glow-gold">+${log.points} (${log.method})</span>
                            </div>
                        `;
                    });
                } else {
                    logHtml = '<div style="text-align:center; color:var(--text-muted);">對戰剛開始，尚無計分</div>';
                }

                card.innerHTML = `
                    <div class="stadium-header">
                        <span class="stadium-title active">⚡ ${stadium.name}</span>
                        <span class="stadium-badge active">對戰中 BATTLE</span>
                    </div>
                    <div class="battle-arena">
                        <div class="fighter left">
                            <span class="fighter-name text-glow-cyan">${match.player1}</span>
                        </div>
                        <div class="score-board">
                            <span class="score-digital score-num text-glow-cyan">${match.score1}</span>
                            <span class="score-divider">:</span>
                            <span class="score-digital score-num text-glow-magenta">${match.score2}</span>
                        </div>
                        <div class="fighter right">
                            <span class="fighter-name text-glow-magenta">${match.player2}</span>
                        </div>
                    </div>
                    <div class="round-log">
                        ${logHtml}
                    </div>
                `;
            } else {
                // 閒置狀態對戰台
                card.className = 'glass-panel stadium-card';
                card.innerHTML = `
                    <div class="stadium-header">
                        <span class="stadium-title">${stadium.name}</span>
                        <span class="stadium-badge">閒置 IDLE</span>
                    </div>
                    <div class="battle-arena" style="justify-content: center; height: 100px; flex-direction: column; gap: 8px;">
                        <span style="color: var(--text-muted); font-size: 15px;">⏳ 等待系統分派對戰中</span>
                        <span style="font-size: 11px; color: rgba(255,255,255,0.15); font-family: 'Orbitron', sans-serif;">STANDBY</span>
                    </div>
                `;
            }
            stadiumsContainer.appendChild(card);
        });
    }

    // 3. 渲染賽事淘汰賽樹狀圖
    function renderBracket(state) {
        bracketRoot.innerHTML = '';
        const matchesArray = Object.values(state.matches);
        
        // 獲取最大輪數 (Round)
        const totalRounds = Math.max(...matchesArray.map(m => m.round));

        // 依輪次建立欄位
        for (let r = 1; r <= totalRounds; r++) {
            const roundColumn = document.createElement('div');
            roundColumn.className = 'bracket-round';
            
            // 建立輪標題
            let roundName = `複賽 Round ${r}`;
            if (r === 1) roundName = "32強 / 16強 首輪";
            if (r === totalRounds) {
                roundName = "冠軍爭霸賽 FINAL";
            } else if (r === totalRounds - 1) {
                roundName = "準決賽 SEMI-FINAL";
            } else if (r === totalRounds - 2) {
                roundName = "8強半準決賽 QUARTERS";
            }

            const header = document.createElement('div');
            header.className = 'round-header-label';
            header.innerText = roundName;
            roundColumn.appendChild(header);

            // 過濾並排序當前輪次的所有比賽
            const roundMatches = matchesArray
                .filter(m => m.round === r)
                .sort((a, b) => a.matchNum - b.matchNum);

            roundMatches.forEach(match => {
                const matchCard = document.createElement('div');
                matchCard.className = `bracket-match ${match.status === 'playing' ? 'playing' : ''}`;
                
                // 設定對戰台提示標籤
                let arenaTagHtml = '';
                if (match.status === 'playing' && match.stadiumId) {
                    arenaTagHtml = `<div class="match-info-tag text-glow-cyan">台 ${match.stadiumId}</div>`;
                } else if (match.status === 'completed') {
                    arenaTagHtml = `<div class="match-info-tag" style="color: var(--neon-gold); border-color: rgba(245,175,25,0.2)">✓ 完賽</div>`;
                }

                // 處理輪空 display 名稱
                const p1Display = match.player1 || "待定 (TBD)";
                const p2Display = match.player2 || "待定 (TBD)";
                
                // 判斷獲勝者高亮
                const isP1Winner = match.status === 'completed' && match.winner === match.player1;
                const isP2Winner = match.status === 'completed' && match.winner === match.player2;

                matchCard.innerHTML = `
                    ${arenaTagHtml}
                    <div class="match-row ${isP1Winner ? 'winner' : ''}">
                        <span class="name ${match.player1 === 'BYE' ? 'text-muted' : ''}">${p1Display}</span>
                        <span class="score">${match.status === 'pending' && !match.player1 ? '-' : match.score1}</span>
                    </div>
                    <div style="border-top: 1px solid rgba(255,255,255,0.03); margin: 2px 0;"></div>
                    <div class="match-row ${isP2Winner ? 'winner' : ''}">
                        <span class="name ${match.player2 === 'BYE' ? 'text-muted' : ''}">${p2Display}</span>
                        <span class="score">${match.status === 'pending' && !match.player2 ? '-' : match.score2}</span>
                    </div>
                `;
                roundColumn.appendChild(matchCard);
            });

            bracketRoot.appendChild(roundColumn);
        }
    }

    // 4. 啟動實時監聽
    dbListenerRef = FirebaseService.listenToTournament(updateDashboard);

    // LocalStorage 測試替代監聽
    window.addEventListener('mock-db-update', (e) => {
        updateDashboard(e.detail);
    });
});
