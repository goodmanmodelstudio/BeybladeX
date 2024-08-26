let scores = {
    player1: 0,
    player2: 0
};

let details = {
    player1: { "轉停": 0, "擊飛": 0, "爆裂": 0, "極限": 0 },
    player2: { "轉停": 0, "擊飛": 0, "爆裂": 0, "極限": 0 }
};

let gameEnded = false;

function addScore(player, points, method) {
    if (gameEnded) return;

    scores[player] += points;
    document.getElementById(`score${player.slice(-1)}`).innerText = scores[player];

    // 記錄得分方式
    details[player][method] += 1;

    checkWinner(player);
}

function checkWinner(player) {
    if (scores[player] >= 4) {
        document.getElementsByClassName('winner')[0].innerText = `${player.replace('player', '玩家 ')} 獲勝！`;
        document.getElementsByClassName('winner')[1].innerText = `${player.replace('player', '玩家 ')} 獲勝！`;
        showDetails();
        disableButtons();
        gameEnded = true;

        // 記錄當前比賽結果
        matches.push({
            player1: {
                name: document.getElementById('player1-name').innerText,
                score: scores.player1,
                details: { ...details.player1 }
            },
            player2: {
                name: document.getElementById('player2-name').innerText,
                score: scores.player2,
                details: { ...details.player2 }
            }
        });
    }
}

function showDetails() {
    document.getElementById('player1-details').innerHTML = `
        <p>轉停: ${details.player1["轉停"]}</p>
        <p>擊飛: ${details.player1["擊飛"]}</p>
        <p>爆裂: ${details.player1["爆裂"]}</p>
        <p>極限: ${details.player1["極限"]}</p>
    `;
    document.getElementById('player2-details').innerHTML = `
        <p>轉停: ${details.player2["轉停"]}</p>
        <p>擊飛: ${details.player2["擊飛"]}</p>
        <p>爆裂: ${details.player2["爆裂"]}</p>
        <p>極限: ${details.player2["極限"]}</p>
    `;
}

function disableButtons() {
    const buttons = document.querySelectorAll('.player-buttons button');
    buttons.forEach(button => button.disabled = true);
}

function enableButtons() {
    const buttons = document.querySelectorAll('.player-buttons button');
    buttons.forEach(button => button.disabled = false);
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

    document.getElementById('score1').innerText = 0;
    document.getElementById('score2').innerText = 0;

    document.getElementById('player1-details').innerHTML = '';
    document.getElementById('player2-details').innerHTML = '';

    document.getElementsByClassName('winner')[0].innerText = '';
    document.getElementsByClassName('winner')[1].innerText = '';

    enableButtons();
}

function swapPlayers() {
    if (gameEnded) return;

    // 交換名稱
    let player1Name = document.getElementById('player1-name').innerText;
    let player2Name = document.getElementById('player2-name').innerText;
    document.getElementById('player1-name').innerText = player2Name;
    document.getElementById('player2-name').innerText = player1Name;

    // 交換分數
    let player1Score = document.getElementById('score1').innerText;
    let player2Score = document.getElementById('score2').innerText;
    document.getElementById('score1').innerText = player2Score;
    document.getElementById('score2').innerText = player1Score;

    // 交換細節
    let player1Details = document.getElementById('player1-details').innerHTML;
    let player2Details = document.getElementById('player2-details').innerHTML;
    document.getElementById('player1-details').innerHTML = player2Details;
    document.getElementById('player2-details').innerHTML = player1Details;

    // 交換分數和細節記錄
    let tempScore = scores.player1;
    scores.player1 = scores.player2;
    scores.player2 = tempScore;

    let tempDetails = details.player1;
    details.player1 = details.player2;
    details.player2 = tempDetails;
}

let matches = []; // 用於存儲每場比賽結果

function exportToExcel() {
    let wb = XLSX.utils.book_new();
    let ws_data = [["玩家名稱", "分數", "得分細節"]]; // 表頭

    matches.forEach(match => {
        ws_data.push([
            match.player1.name, 
            match.player1.score, 
            `轉停: ${match.player1.details["轉停"]}, 擊飛: ${match.player1.details["擊飛"]}, 爆裂: ${match.player1.details["爆裂"]}, 極限: ${match.player1.details["極限"]}`,
            match.player2.name, 
            match.player2.score, 
            `轉停: ${match.player2.details["轉停"]}, 擊飛: ${match.player2.details["擊飛"]}, 爆裂: ${match.player2.details["爆裂"]}, 極限: ${match.player2.details["極限"]}`
        ]);
    });

    let ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, "Results");

    XLSX.writeFile(wb, "match_results.xlsx");
}

// 其他JavaScript代碼

