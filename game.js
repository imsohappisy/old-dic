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
        game: document.getElementById('game-screen'),
        support: document.getElementById('support-screen'),
        alert: document.getElementById('alert-modal'),
        search: document.getElementById('search-screen')
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
        backMain: document.getElementById('btn-back-main'),
        coffee: document.getElementById('btn-coffee'),
        supportBack: document.getElementById('btn-support-back'),
        alertClose: document.getElementById('btn-alert-close'),
        search: document.getElementById('btn-search'),
        searchBack: document.getElementById('btn-search-back'),
        searchClear: document.getElementById('btn-search-clear')
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
        },
        alertMessage: document.getElementById('alert-message'),
        search: {
            input: document.getElementById('dictionary-input'),
            results: document.getElementById('search-results'),
            info: document.getElementById('search-info'),
            loader: document.getElementById('search-loader'),
            container: document.querySelector('.search-results-container')
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
        buttons.alertClose.addEventListener('click', () => {
            screens.alert.classList.add('hidden');
        });

        // Support Screen Listeners
        buttons.coffee.addEventListener('click', (e) => {
            e.preventDefault();
            showSupportScreen();
        });
        buttons.supportBack.addEventListener('click', showMenu);

        // Search Screen Listeners
        buttons.search.addEventListener('click', showSearchScreen);
        buttons.searchBack.addEventListener('click', showMenu);
        buttons.searchClear.addEventListener('click', () => {
            display.search.input.value = '';
            performSearch();
        });

        let searchTimeout;
        display.search.input.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 300);
        });

        display.search.container.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = display.search.container;
            if (scrollTop + clientHeight >= scrollHeight - 20) {
                loadMoreResults();
            }
        });

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
        screens.support.classList.remove('active');
        screens.support.classList.add('hidden');
        screens.search.classList.remove('active');
        screens.search.classList.add('hidden');
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
        buttons.copyId.disabled = true;
        display.online.status.style.color = 'var(--text-muted)';
    }

    function showSupportScreen() {
        screens.menu.classList.remove('active');
        screens.menu.classList.add('hidden');
        screens.support.classList.remove('hidden');
        screens.support.classList.add('active');
    }

    function showSearchScreen() {
        screens.menu.classList.remove('active');
        screens.menu.classList.add('hidden');
        screens.search.classList.remove('hidden');
        screens.search.classList.add('active');
        display.search.input.focus();
        performSearch(); // Initial state
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
        screens.alert.classList.add('hidden');

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
        turn = 'player1';
        display.online.status.style.color = 'var(--text-muted)';

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

        // For local PvP/PvC
        const loser = turn; // The one who clicked give up
        processGiveUp(loser === 'player1' ? 'me' : 'opponent');
    }

    function processGiveUp(who) {
        let winner = '';

        if (gameMode === 'online') {
            if (who === 'me') {
                winner = '상대방'; // I gave up
            } else {
                winner = '나'; // Opponent gave up
            }
        } else {
            // 'who' in local mode is 'me' (player1 gave up) or 'opponent' (player2 gave up)
            if (who === 'me') winner = '플레이어 2';
            else winner = '플레이어 1';
        }

        turn = 'finished';

        display.turnIndicator.textContent = `${winner} 승리! (${who === 'me' ? '기권함' : '상대방 기권'})`;
        display.turnIndicator.style.color = "var(--primary-color)";
        display.input.disabled = true;
        buttons.submit.disabled = true;
        buttons.giveUp.disabled = true;
    }

    function handleUserSubmit() {
        if (turn === 'finished') return;

        // PVC Guard
        if (gameMode === 'pvc' && turn !== 'player1') return;

        // Online Guard
        if (gameMode === 'online') {
            const myTurnSymbol = isHost ? 'player1' : 'player2';
            if (turn !== myTurnSymbol) return;
        }

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

        // Correct coloring for Online vs PvP/PvC
        if (gameMode === 'online') {
            const me = isHost ? 'player1' : 'player2';
            if (player === me) className += 'user-word';
            else className += 'opponent-word';
        } else {
            if (player === 'player1') className += 'user-word';
            else if (player === 'computer') className += 'computer-word';
            else className += 'opponent-word'; // player2 in PvP
        }

        chip.className = className;
        chip.textContent = word;

        display.history.appendChild(chip);

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
                display.input.disabled = false;
                buttons.submit.disabled = false;
                display.input.focus();
            } else {
                display.turnIndicator.textContent = "컴퓨터가 생각 중...";
                display.turnIndicator.style.color = "var(--accent-color)";
                display.input.disabled = true;
                buttons.submit.disabled = true;
            }
        } else if (gameMode === 'online') {
            const myTurnSymbol = isHost ? 'player1' : 'player2';
            if (turn === myTurnSymbol) {
                display.turnIndicator.textContent = "당신의 차례입니다";
                display.turnIndicator.style.color = "var(--primary-color)";
                display.input.disabled = false;
                buttons.submit.disabled = false;
                display.input.focus();
            } else {
                display.turnIndicator.textContent = "상대방의 차례입니다";
                display.turnIndicator.style.color = "var(--accent-color)";
                display.input.disabled = true;
                buttons.submit.disabled = true;
            }
        } else {
            // PvP
            display.input.disabled = false;
            buttons.submit.disabled = false;
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
            buttons.copyId.disabled = false;
        });

        peer.on('connection', (c) => {
            conn = c;
            setupConnection();
        });

        peer.on('error', (err) => {
            console.error('Peer Error:', err.type);
            let msg = '오류가 발생했습니다.';
            if (err.type === 'unavailable-id') msg = 'ID를 사용할 수 없습니다. 다시 시도해주세요.';
            else msg = `네트워크 오류: ${err.type}`;

            display.online.status.textContent = msg;
            display.online.status.style.color = 'var(--accent-color)';
            buttons.createRoom.disabled = false;
        });
    }

    function initGuest() {
        const targetId = display.online.targetId.value.trim();
        if (!targetId) {
            showCustomAlert('상대방 ID를 입력해주세요.');
            return;
        }

        if (targetId === myId && myId !== '') {
            showCustomAlert('본인이 만든 방에는 참여할 수 없습니다.');
            display.online.status.textContent = '';
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
            console.error('Peer Error (Guest):', err.type);
            let msg = '';
            if (err.type === 'peer-unavailable') msg = '존재하지 않는 방 ID입니다.';
            else if (err.type === 'invalid-id') msg = '방 ID 형식이 잘못되었습니다.';
            else if (err.type === 'network') msg = '네트워크 연결이 불안정합니다.';
            else msg = `연결 오류: ${err.type}`;

            display.online.status.textContent = msg;
            display.online.status.style.color = 'var(--accent-color)';
            buttons.joinRoom.disabled = false;

            if (peer) {
                peer.destroy();
                peer = null;
            }
        });
    }

    function setupConnection() {
        conn.on('open', () => {
            display.online.status.textContent = '연결되었습니다! 게임을 시작합니다.';
            if (isHost) {
                startGame('online');
                conn.send({ type: 'start' });
            }
        });

        conn.on('data', (data) => {
            if (data.type === 'start') {
                startGame('online');
            } else if (data.type === 'move') {
                processTurn(data.word);
            } else if (data.type === 'giveup') {
                processGiveUp('opponent');
            }
        });

        conn.on('close', () => {
            showCustomAlert('상대방과의 연결이 끊어졌습니다.');
            showMenu();
        });
    }

    function copyRoomId() {
        const id = display.online.myId.textContent.trim();
        if (!id) return;

        navigator.clipboard.writeText(id).then(() => {
            const originalText = buttons.copyId.textContent;
            buttons.copyId.textContent = '복사됨!';
            buttons.copyId.classList.add('success');
            setTimeout(() => {
                buttons.copyId.textContent = originalText;
                buttons.copyId.classList.remove('success');
            }, 1500);
        });
    }

    function showCustomAlert(msg) {
        display.alertMessage.textContent = msg;
        screens.alert.classList.remove('hidden');
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

    // --- Search Logic ---
    let currentSearchResults = [];
    let displayedCount = 0;
    const PAGE_SIZE = 50;

    function performSearch() {
        const query = display.search.input.value.trim();
        display.search.results.innerHTML = '';
        displayedCount = 0;

        if (query.length === 0) {
            display.search.info.textContent = '단어를 입력하면 실시간으로 검색됩니다.';
            currentSearchResults = [];
            return;
        }

        display.search.loader.classList.remove('hidden');

        // Use setTimeout to avoid UI freeze during filter
        setTimeout(() => {
            currentSearchResults = wordList.filter(word =>
                word.startsWith(query) || word.endsWith(query)
            );

            // Priority Sort: StartsWith first, then by length
            currentSearchResults.sort((a, b) => {
                const aStarts = a.startsWith(query);
                const bStarts = b.startsWith(query);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
                return a.length - b.length;
            });

            display.search.info.textContent = `검색 결과: ${currentSearchResults.length.toLocaleString()}개`;
            display.search.loader.classList.add('hidden');
            loadMoreResults();
        }, 10);
    }

    function loadMoreResults() {
        if (displayedCount >= currentSearchResults.length) return;

        const nextBatch = currentSearchResults.slice(displayedCount, displayedCount + PAGE_SIZE);
        const fragment = document.createDocumentFragment();

        nextBatch.forEach(word => {
            const card = document.createElement('div');
            card.className = 'word-card';

            const startChar = word[0];
            const lastChar = word[word.length - 1];

            card.innerHTML = `
                <span class="word-text">${word}</span>
                <div class="word-meta">
                    <span class="meta-tag start">${startChar}</span>
                    <span class="meta-tag">→</span>
                    <span class="meta-tag end">${lastChar}</span>
                </div>
            `;
            fragment.appendChild(card);
        });

        display.search.results.appendChild(fragment);
        displayedCount += nextBatch.length;
    }
});
