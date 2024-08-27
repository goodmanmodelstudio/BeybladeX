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
        alert(`組數不應超過人數的一半，否則無法形成有效對戰組別。`);
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

    // 計算每組對戰
    groups.forEach((group, i) => {
        const matches = [];
        for (let j = 0; j < group.length; j += 2) {
            if (group[j + 1] !== undefined) {
                matches.push(`${group[j]} vs ${group[j + 1]}`);
            }
        }
        result.innerHTML += `<h5>第 ${i + 1} 組:</h5> ${matches.join(',<br> ')} <hr>`;
    });

    // 顯示種子選手
    if (seedPlayers.length > 0) {
        result.innerHTML += `<p>種子選手: ${seedPlayers.join(', ')}</p>`;
    }
});