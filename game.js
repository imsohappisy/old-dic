document.addEventListener('DOMContentLoaded', () => {
    // --- Data & State ---
    let wordList = []; // Will be referenced from global WORD_LIST if available
    let usedWords = new Set();
    let currentWord = '';
    let score = 0;
    let turn = 'player1'; // 'player1', 'player2' (human/computer), 'finished'
    let gameMode = 'pvc'; // 'pvc', 'pvp', 'online'

    // Online State
    let peer = null;
    let conn = null;
    let myId = '';
    let isHost = false;

    // --- DOM Elements ---
    const screens = {
        menu: document.getElementById('main-menu'),
        lobby: document.getElementById('lobby-screen'),
        game: document.getElementById('game-screen')
    };

    const buttons = {
        pvc: document.getElementById('btn-pvc'),
        pvp: document.getElementById('btn-pvp'),
        online: document.getElementById('btn-online'),
        home: document.getElementById('btn-home'),
        submit: document.getElementById('submit-btn'),
        giveUp: document.getElementById('give-up-btn'),
        createRoom: document.getElementById('btn-create-room'),
        joinRoom: document.getElementById('btn-join-room'),
        copyId: document.getElementById('btn-copy-id'),
        backMain: document.getElementById('btn-back-main')
    };

    const display = {
        history: document.getElementById('word-history'),
        nextSyllables: document.getElementById('next-syllables'),
        score: document.getElementById('score'),
        turnIndicator: document.getElementById('turn-indicator'),
        input: document.getElementById('user-input'),
        error: document.getElementById('error-message'),
        online: {
            myId: document.getElementById('my-peer-id'),
            targetId: document.getElementById('target-peer-id'),
            status: document.getElementById('connection-status'),
            roomDisplay: document.getElementById('room-id-display')
        }
    };

    // --- Initialization ---
    init();

    function init() {
        // Load Word List
        if (typeof WORD_LIST !== 'undefined') {
            wordList = WORD_LIST;
            console.log('Word list loaded from JS:', wordList.length, 'words');
        } else {
            console.error('WORD_LIST is not defined.');
        }

        // Event Listeners
        buttons.pvc.addEventListener('click', () => startGame('pvc'));
        buttons.pvp.addEventListener('click', () => startGame('pvp'));
        buttons.online.addEventListener('click', showLobby);
        buttons.home.addEventListener('click', () => {
            if (peer) { peer.destroy(); peer = null; }
            showMenu();
        });

        buttons.createRoom.addEventListener('click', initHost);
        buttons.joinRoom.addEventListener('click', initGuest);
        buttons.copyId.addEventListener('click', copyRoomId);
        buttons.backMain.addEventListener('click', showMenu);

        display.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserSubmit();
        });
        buttons.submit.addEventListener('click', handleUserSubmit);
        buttons.giveUp.addEventListener('click', handleGiveUp);

        // Initial State
        showMenu();
    }

    // --- Navigation & Setup ---

    function showMenu() {
        screens.menu.classList.remove('hidden');
        screens.menu.classList.add('active');
        screens.game.classList.remove('active');
        screens.game.classList.add('hidden');
        screens.lobby.classList.remove('active');
        screens.lobby.classList.add('hidden');
    }

    function showLobby() {
        screens.menu.classList.remove('active');
        screens.menu.classList.add('hidden');
        screens.lobby.classList.remove('hidden');
        screens.lobby.classList.add('active');

        // Reset Lobby UI
        display.online.status.textContent = '';
        display.online.targetId.value = '';
        display.online.roomDisplay.classList.add('hidden');
        buttons.createRoom.disabled = false;
        buttons.joinRoom.disabled = false;
    }

    function startGame(mode) {
        gameMode = mode;
        resetGame();

        screens.menu.classList.remove('active');
        screens.menu.classList.add('hidden');
        screens.game.classList.remove('hidden');
        screens.game.classList.add('active');
        screens.lobby.classList.remove('active');
        screens.lobby.classList.add('hidden');

        // Toggle Give Up Button
        if (gameMode === 'pvp' || gameMode === 'online') {
            buttons.giveUp.classList.remove('hidden');
        } else {
            buttons.giveUp.classList.add('hidden');
        }

        // Allow UI to settle before focusing, or just focus immediately
        setTimeout(() => display.input.focus(), 100);
    }

    function resetGame() {
        usedWords.clear();
        currentWord = '';
        score = 0;
        turn = 'player1'; // In PvP, Player 1 starts. In PvC, User starts.

        if (gameMode === 'online') {
            turn = isHost ? 'player1' : 'player2'; // Host is always Player 1
        }

        // Clear History
        display.history.innerHTML = '<div class="word-chip start-marker">시작</div>';

        updateUI();
    }

    // --- Core Logic ---

    // Algorithmic Dueumbeopchik Logic
    function getDueumChars(char) {
        // Check if character is a Hangul Syllable
        const code = char.charCodeAt(0);
        if (code < 0xAC00 || code > 0xD7A3) {
            return [char];
        }

        const base = code - 0xAC00;
        const initial = Math.floor(base / 588);
        const medial = Math.floor((base % 588) / 28);
        const final = base % 28;

        // Initial Consonants (Chosung)
        // 0:ㄱ, 1:ㄲ, 2:ㄴ, 3:ㄷ, 4:ㄸ, 5:ㄹ, 6:ㅁ, 7:ㅂ, 8:ㅃ, 9:ㅅ, 10:ㅆ, 11:ㅇ, 12:ㅈ, 13:ㅉ, 14:ㅊ, 15:ㅋ, 16:ㅌ, 17:ㅍ, 18:ㅎ

        // Medial Vowels (Jungsung)
        // 0:ㅏ, 1:ㅐ, 2:ㅑ, 3:ㅒ, 4:ㅓ, 5:ㅔ, 6:ㅕ, 7:ㅖ, 8:ㅗ, 9:ㅘ, 10:ㅙ, 11:ㅚ, 12: ㅛ, 13:ㅜ, 14:ㅝ, 15:ㅞ, 16:ㅟ, 17:ㅠ, 18:ㅡ, 19:ㅢ, 20:ㅣ

        let newInitial = initial;

        // Rule 1: 'ㄴ' (2) -> 'ㅇ' (11)
        // Condition: Medial is ㅕ(6), ㅛ(12), ㅠ(17), ㅣ(20), ㅖ(7)
        if (initial === 2) {
            if ([6, 12, 17, 20, 7].includes(medial)) {
                newInitial = 11;
            }
        }

        // Rule 2: 'ㄹ' (5) -> 'ㄴ' (2) or 'ㅇ' (11)
        else if (initial === 5) {
            // Condition for 'ㄹ' -> 'ㅇ' (11)
            // Medial is ㅑ(2), ㅕ(6), ㅛ(12), ㅠ(17), ㅣ(20), ㅒ(3), ㅖ(7)
            if ([2, 6, 12, 17, 20, 3, 7].includes(medial)) {
                newInitial = 11;
            }
            // Condition for 'ㄹ' -> 'ㄴ' (2)
            // All other medials
            else {
                newInitial = 2;
            }
        }

        if (newInitial !== initial) {
            const newCode = 0xAC00 + (newInitial * 588) + (medial * 28) + final;
            return [char, String.fromCharCode(newCode)];
        }

        return [char];
    }

    function checkValid(prevWord, newWord) {
        if (!newWord || newWord.trim().length === 0) return { valid: false, msg: "단어를 입력해주세요." };
        if (newWord.length < 2) return { valid: false, msg: "두 글자 이상 입력해주세요." };
        if (usedWords.has(newWord)) return { valid: false, msg: "이미 사용한 단어입니다." };

        if (wordList.length > 0 && !wordList.includes(newWord)) {
            return { valid: false, msg: "사전에 없는 단어입니다." };
        }

        if (!prevWord) return { valid: true }; // First word is always valid

        const lastChar = prevWord[prevWord.length - 1];
        const firstChar = newWord[0];

        const allowedStartChars = getDueumChars(lastChar);
        if (!allowedStartChars.includes(firstChar)) {
            const allowedStr = allowedStartChars.map(c => `'${c}'`).join(' 또는 ');
            return { valid: false, msg: `${allowedStr}(으)로 시작해야 합니다.` };
        }

        return { valid: true };
    }

    // --- Turn Processing ---

    function handleGiveUp() {
        if (turn === 'finished') return;

        if (gameMode === 'online') {
            if (conn && conn.open) {
                conn.send({ type: 'giveup' });
            }
            processGiveUp('me'); // I gave up
            return;
        }

        turn = 'finished';
        let winner = '';
        if (turn === 'player1') {
            winner = '플레이어 2';
        } else {
            winner = '플레이어 1';
        }

        display.turnIndicator.textContent = `${winner} 승리! (상대방 기권)`;
        display.turnIndicator.style.color = "var(--primary-color)";
        display.input.disabled = true;
        buttons.submit.disabled = true;
        buttons.giveUp.disabled = true;
    }

    function processGiveUp(who) {
        turn = 'finished';
        let winner = '';

        if (gameMode === 'online') {
            if (who === 'me') {
                winner = '상대방'; // I gave up
            } else {
                winner = '나'; // Opponent gave up
            }
        } else {
            if (turn === 'player1') winner = '플레이어 2';
            else winner = '플레이어 1';
        }

        display.turnIndicator.textContent = `${winner} 승리! (${who === 'me' ? '기권함' : '상대방 기권'})`;
        display.turnIndicator.style.color = "var(--primary-color)";
        display.input.disabled = true;
        buttons.submit.disabled = true;
        buttons.giveUp.disabled = true;
    }

    function handleUserSubmit() {
        if (gameMode === 'pvc' && turn !== 'player1') return; // It's computer's turn
        if (turn === 'finished') return;

        const inputWord = display.input.value.trim();
        const validation = checkValid(currentWord, inputWord);

        if (!validation.valid) {
            showError(validation.msg);
            return;
        }

        // Success
        clearError();

        if (gameMode === 'online') {
            // Validate locally first, then send
            processTurn(inputWord);
            if (conn && conn.open) {
                conn.send({ type: 'move', word: inputWord });
            }
        } else {
            processTurn(inputWord);
        }
    }

    function processTurn(word) {
        usedWords.add(word);
        currentWord = word;

        // Add to history UI
        addWordChip(word, turn);

        // Update Score (only for Player 1 in PvC, or generally for words played)
        if (gameMode === 'pvc' && turn === 'player1') {
            score += word.length * 10;
        }

        display.input.value = '';

        // Switch Turn
        if (gameMode === 'pvc') {
            if (turn === 'player1') {
                turn = 'computer';
                updateUI();
                setTimeout(computerTurn, 800);
            } else {
                turn = 'player1';
                updateUI();
            }
        } else {
            // PvP & Online
            turn = (turn === 'player1') ? 'player2' : 'player1';
            updateUI();
        }
    }

    function computerTurn() {
        if (turn !== 'computer') return;

        const lastChar = currentWord[currentWord.length - 1];
        const allowedStartChars = getDueumChars(lastChar);

        // Simple AI: Filter candidates
        const candidates = wordList.filter(word => {
            if (usedWords.has(word)) return false;
            return allowedStartChars.includes(word[0]);
        });

        if (candidates.length > 0) {
            const nextWord = candidates[Math.floor(Math.random() * candidates.length)];
            processTurn(nextWord);
        } else {
            // Computer loses
            turn = 'finished';
            display.turnIndicator.textContent = "컴퓨터가 단어를 찾지 못했습니다. 승리!";
            display.turnIndicator.style.color = "var(--primary-color)";
            display.input.disabled = true;
            display.input.placeholder = "게임이 종료되었습니다.";
        }
    }

    // --- UI Updates ---

    function addWordChip(word, player) {
        const chip = document.createElement('div');

        let className = 'word-chip ';
        if (player === 'player1') className += 'user-word';
        else if (player === 'computer') className += 'computer-word';
        else className += 'opponent-word'; // player2 in PvP

        chip.className = className;
        chip.textContent = word;

        display.history.appendChild(chip);

        // Scroll to bottom
        // display.history.parentElement.scrollTop = display.history.parentElement.scrollHeight;
        // Actually, flex-wrap flow, auto scroll container
        const container = display.history.parentElement;
        container.scrollTop = container.scrollHeight;
    }

    function updateUI() {
        display.score.textContent = score;

        // Next Syllable Display
        if (currentWord) {
            const lastChar = currentWord[currentWord.length - 1];
            const allowed = getDueumChars(lastChar);

            display.nextSyllables.innerHTML = '';
            allowed.forEach(char => {
                const s = document.createElement('span');
                s.className = 'syllable';
                s.textContent = char;
                display.nextSyllables.appendChild(s);
            });
        } else {
            display.nextSyllables.innerHTML = '<span class="syllable empty">-</span>';
        }

        // Turn Indicator & Input State
        if (turn === 'finished') return;

        display.input.disabled = false;
        buttons.submit.disabled = false;
        buttons.giveUp.disabled = false;

        if (gameMode === 'pvc') {
            if (turn === 'player1') {
                display.turnIndicator.textContent = "당신의 차례입니다";
                display.turnIndicator.style.color = "var(--primary-color)";
                display.input.focus();
            } else {
                display.turnIndicator.textContent = "컴퓨터가 생각 중...";
                display.turnIndicator.style.color = "var(--accent-color)";
                display.input.disabled = true;
                buttons.submit.disabled = true;
            }
        } else {
            // PvP
            if (turn === 'player1') {
                display.turnIndicator.textContent = "플레이어 1 차례";
                display.turnIndicator.style.color = "var(--primary-color)";
                display.input.focus();
            } else {
                display.turnIndicator.textContent = "플레이어 2 차례";
                display.turnIndicator.style.color = "var(--accent-color)";
                display.input.focus();
            }
        }
    }


    // --- Online Logic (PeerJS) ---

    function initHost() {
        buttons.createRoom.disabled = true;
        display.online.status.textContent = ' ';

        peer = new Peer();

        peer.on('open', (id) => {
            myId = id;
            isHost = true;
            display.online.myId.textContent = id;
            display.online.roomDisplay.classList.remove('hidden');
            display.online.status.textContent = '상대방을 기다리는 중...';
        });

        peer.on('connection', (c) => {
            conn = c;
            setupConnection();
        });

        peer.on('error', (err) => {
            console.error(err);
            display.online.status.textContent = '오류 발생: ' + err.type;
            buttons.createRoom.disabled = false;
        });
    }

    function initGuest() {
        const targetId = display.online.targetId.value.trim();
        if (!targetId) {
            alert('상대방 ID를 입력해주세요.');
            return;
        }

        buttons.joinRoom.disabled = true;
        display.online.status.textContent = '';

        peer = new Peer();

        peer.on('open', (id) => {
            myId = id;
            isHost = false;
            conn = peer.connect(targetId);
            setupConnection();
        });

        peer.on('error', (err) => {
            console.error(err);
            display.online.status.textContent = '오류 발생: ' + err.type;
            buttons.joinRoom.disabled = false;
        });
    }

    function setupConnection() {
        conn.on('open', () => {
            display.online.status.textContent = '연결되었습니다! 게임을 시작합니다.';
            setTimeout(() => {
                startGame('online');
            }, 1000);
        });

        conn.on('data', (data) => {
            if (data.type === 'move') {
                processTurn(data.word);
            } else if (data.type === 'giveup') {
                processGiveUp('opponent');
            }
        });

        conn.on('close', () => {
            alert('상대방과의 연결이 끊어졌습니다.');
            showMenu();
        });
    }

    function copyRoomId() {
        const id = display.online.myId.textContent;
        navigator.clipboard.writeText(id).then(() => {
            const originalText = buttons.copyId.textContent;
            buttons.copyId.textContent = '복사됨!';
            setTimeout(() => buttons.copyId.textContent = originalText, 1500);
        });
    }

    function showError(msg) {
        display.error.textContent = msg;
        display.error.style.animation = 'none';
        display.error.offsetHeight;
        display.error.style.animation = 'fadeIn 0.2s';
    }

    function clearError() {
        display.error.textContent = '';
    }
});
