// 保存分組信息到 JSON 文件
function saveGroupsToJson(groups) {
    fetch('path/to/your/save_groups.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(groups)
    })
    .then(response => response.json())
    .then(data => {
        console.log('Group data saved:', data);
    })
    .catch(error => {
        console.error('Error saving group data:', error);
    });
}

// 在頁面加載時從 JSON 文件讀取分組信息
window.onload = function() {
    fetch('path/to/your/group_data.json')
        .then(response => response.json())
        .then(savedGroups => {
            if (savedGroups) {
                generateGroupList(savedGroups);
            }
        })
        .catch(error => console.error('Error loading group data:', error));
}

document.getElementById('clear-storage').addEventListener('click', function() {
    if (confirm('你確定要清除所有比賽紀錄嗎？這個動作無法復原。')) {
        // 清除保存的 JSON 文件内容 (這需要在伺服器端處理)
        fetch('path/to/your/clear_groups.php', {
            method: 'POST'
        })
        .then(() => {
            // 重置頁面上的相關顯示
            document.getElementById('result').innerHTML = '';
            alert('所有紀錄已清除。');
        })
        .catch(error => console.error('Error clearing group data:', error));
    }
});

function generateGroupList(groups) {
    const result = document.getElementById('result');
    result.innerHTML = '';

    groups.forEach((group, i) => {
        const matches = [];
        for (let j = 0; j < group.length; j += 2) {
            if (group[j + 1] !== undefined) {
                // 使用超連結將對戰編號傳遞給計分工具
                matches.push(`<a href="../Point/html.html?player1=Player${group[j]}&player2=Player${group[j + 1]}" class="match-link">Player ${group[j]} vs Player ${group[j + 1]}</a>`);
            }
        }
        result.innerHTML += `<h5>第 ${i + 1} 組:</h5> ${matches.join(',<br> ')} <hr>`;
    });

    // 顯示種子選手
    const seedPlayers = groups.seedPlayers || [];
    if (seedPlayers.length > 0) {
        result.innerHTML += `<p>種子選手: ${seedPlayers.join(', ')}</p>`;
    }
}

document.getElementById('match-form').addEventListener('submit', function(event) {
    event.preventDefault();

    const numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
    const numGroups = parseInt(document.getElementById('numGroups').value, 10);

    if (numPlayers <= 0 || numGroups <= 0) {
        alert('人數和分組數都必須大於零');
        return;
    }

    // 檢查組數是否超過玩家的一半
    if (numGroups > Math.floor(numPlayers / 2)) {
        alert('組數不應超過人數的一半，否則無法形成有效對戰組別。');
        return;
    }

    const result = document.getElementById('result');
    result.innerHTML = '';

    const players = Array.from({ length: numPlayers }, (_, i) => i + 1);

    // 隨機打亂人員編號
    for (let i = players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [players[i], players[j]] = [players[j], players[i]];
    }

    const playersPerGroup = Math.floor(numPlayers / numGroups);
    const leftover = numPlayers % numGroups;
    const seedPlayers = [];
    const availablePlayers = [...players];

    // 如果有剩餘玩家，將其安排為種子選手
    if (leftover > 0) {
        seedPlayers.push(...availablePlayers.splice(-leftover));
    }

    const groups = Array.from({ length: numGroups }, () => []);

    // 分配人員到各組
    for (let i = 0; i < availablePlayers.length; i++) {
        groups[i % numGroups].push(availablePlayers[i]);
    }

    // 確保每組有有效的對戰組別
    groups.forEach(group => {
        while (group.length % 2 !== 0) {
            const seed = group.pop();
            seedPlayers.push(seed);
        }
    });

    // 將種子選手保存在分組中
    groups.seedPlayers = seedPlayers;

    // 計算每組對戰
    generateGroupList(groups);

    // 保存分組信息到 JSON 文件
    saveGroupsToJson(groups);
});