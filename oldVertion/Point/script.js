let scores = {
    player1: 0,
    player2: 0
};

let details = {
    player1: { "轉停": 0, "擊飛": 0, "爆裂": 0, "極限": 0 },
    player2: { "轉停": 0, "擊飛": 0, "爆裂": 0, "極限": 0 }
};

let gameEnded = false;
let matches = []; // 存儲所有局的記錄
let rounds = [];  // 存儲當前局每一場比賽的記錄
let roundCount = 0; // 場次計算器

function addScore(player, points, method) {
    if (gameEnded) return;

    roundCount++; // 增加場次計算

    // 獲取當前選手名稱
    let player1Name = document.getElementById('player1-name-input').value;
    let player2Name = document.getElementById('player2-name-input').value;

    // 記錄當前的得分和方式，並保存當前選手名稱
    let scoringEvent = {
        round: roundCount,
        scorer: document.getElementById(`${player}-name-input`).value,
        method: method,
        points: points,
        player1Name: player1Name, // 保存當前玩家 1 名稱
        player2Name: player2Name  // 保存當前玩家 2 名稱
    };

    rounds.push(scoringEvent);

    // 更新分數
    scores[player] += points;
    document.getElementById(`score${player.slice(-1)}`).innerText = scores[player];

    details[player][method] += 1;

    checkWinner(player);
}

function checkWinner(player) {
    if (scores[player] >= 4) {
        let player1Name = document.getElementById('player1-name-input').value;
        let player2Name = document.getElementById('player2-name-input').value;

        // 將該局的比賽記錄推入matches數組中，包含當時的選手名稱
        matches.push({
            player1: {
                name: player1Name,  // 使用當時的玩家 1 名稱
                score: scores.player1,
                details: { ...details.player1 }
            },
            player2: {
                name: player2Name,  // 使用當時的玩家 2 名稱
                score: scores.player2,
                details: { ...details.player2 }
            },
            roundDetails: [...rounds] // 將該局的所有比賽得分記錄存儲
        });

        gameEnded = true;
        disableButtons();
        showDetails();  // 顯示比賽詳細信息
        rounds = [];  // 清空當前局比賽的得分記錄
    }
}

function swapPlayers() {
    let player1Name = document.getElementById('player1-name-input').value;
    let player2Name = document.getElementById('player2-name-input').value;

    document.getElementById('player1-name-input').value = player2Name;
    document.getElementById('player2-name-input').value = player1Name;

    let player1Score = scores.player1;
    scores.player1 = scores.player2;
    scores.player2 = player1Score;

    document.getElementById('score1').innerText = scores.player1;
    document.getElementById('score2').innerText = scores.player2;

    let player1Details = details.player1;
    details.player1 = details.player2;
    details.player2 = player1Details;

    // 不調用 showDetails，因為交換位置不應觸發結算表格顯示
}

function resetGame() {
    scores = {
        player1: 0,
        player2: 0
    };

    details = {
        player1: { "轉停": 0, "擊飛": 0, "爆裂": 0, "極限": 0 },
        player2: { "轉停": 0, "擊飛": 0, "爆裂": 0, "極限": 0 }
    };

    gameEnded = false;
    rounds = []; // 重置回合記錄
    roundCount = 0; // 重置場次計算

    document.getElementById('score1').innerText = 0;
    document.getElementById('score2').innerText = 0;

    document.getElementById('match-details').innerHTML = ''; // 清空比賽詳細結果
    document.getElementById('winner-display').innerText = ''; // 清空勝利者顯示

    enableButtons();
}

function showDetails() {
    let player1Name = document.getElementById('player1-name-input').value;
    let player2Name = document.getElementById('player2-name-input').value;

    let player1TotalScore = 0;
    let player2TotalScore = 0;

    let matchTable = `<table class="table table-bordered text-center">
                        <thead>
                            <tr>
                                <th>場次</th>
                                <th>${player1Name}</th>
                                <th>${player2Name}</th>
                                <th>得分方式</th>
                            </tr>
                        </thead>
                        <tbody>`;

    // 每場比賽的結果顯示在表格中
    rounds.forEach((round, index) => {
        let player1Score = round.scorer === player1Name ? round.points : '';
        let player2Score = round.scorer === player2Name ? round.points : '';
        let method = round.method;

        if (player1Score) player1TotalScore += round.points;
        if (player2Score) player2TotalScore += round.points;

        matchTable += `<tr>
                          <td>第 ${index + 1} 場</td>
                          <td>${player1Score}</td>
                          <td>${player2Score}</td>
                          <td>${method}</td>
                       </tr>`;
    });

    matchTable += `</tbody>
                   <tfoot>
                       <tr>
                           <th>總分</th>
                           <th>${player1TotalScore}</th>
                           <th>${player2TotalScore}</th>
                           <th></th>
                       </tr>
                   </tfoot>
                   </table>`;

    document.getElementById('match-details').innerHTML = matchTable;
}

function disableButtons() {
    document.querySelectorAll('button').forEach(button => {
        if (button.innerText !== '重新開始' && button.innerText !== '匯出結果' && button.innerText !== '交換位置') {
            button.disabled = true;
        }
    });
}

function enableButtons() {
    document.querySelectorAll('button').forEach(button => {
        button.disabled = false;
    });
}

function exportToExcel() {
    let wb = XLSX.utils.book_new(); // 創建一個新的工作簿
    let ws_data = [["場次", "左側選手", "右側選手", "得分方式"]]; // 初始化工作表的表頭

    // 遍歷所有比賽
    matches.forEach((match, index) => {
        // 在每場比賽的開始前插入當時的選手名稱
        ws_data.push([
            `${index + 1}`,
            match.player1.name,  // 當時的玩家 1 名稱
            match.player2.name,  // 當時的玩家 2 名稱
            ''
        ]);

        // 遍歷每場比賽的細節
        match.roundDetails.forEach(round => {
            // 為每一場比賽插入行，使用保存的選手名稱來確定得分
            ws_data.push([
                `第 ${round.round} 場`,
                round.scorer === match.player1.name ? round.points : '',
                round.scorer === match.player2.name ? round.points : '',
                round.method
            ]);
        });

        // 在匯出資料中插入每局比賽結束後的總分
        ws_data.push([
            "總分",
            match.player1.score,
            match.player2.score,
            ""
        ]);

        // 每組比賽之間添加空行作為視覺分隔
        ws_data.push([]);
    });

    // 將數據轉換為工作表
    let ws = XLSX.utils.aoa_to_sheet(ws_data);
    // 將工作表添加到工作簿
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    // 寫入 Excel 文件
    XLSX.writeFile(wb, "match_results.xlsx");
}