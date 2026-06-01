// Conexão WebSocket com o servidor (conecta ao host local atual)
const socket = io();

// ESTADO GLOBAL DO CLIENTE
let myId = null;
let roomCode = null;
let isMyTurn = false;
let gameStarted = false;
let turnExpiresAt = null;
let timerInterval = null;

// Tabuleiro e Suporte locais (matrizes)
const BOARD_ROWS = 12;
const BOARD_COLS = 25;
const RACK_ROWS = 2;
const RACK_COLS = 20;

let boardState = Array(BOARD_ROWS).fill(null).map(() => Array(BOARD_COLS).fill(null));
let rackState = Array(RACK_ROWS).fill(null).map(() => Array(RACK_COLS).fill(null));

// Rastreamento de arrasto
let draggedTile = null; // Guarda a peça sendo arrastada { tile, source, row, col }

// ELEMENTOS DO DOM
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const toastContainer = document.getElementById('toast-container');

// Inputs e Botões Auth/Lobby
const usernameInput = document.getElementById('username-input');
const roomCodeInput = document.getElementById('room-code-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const startBtn = document.getElementById('start-game-btn');
const addBotBtn = document.getElementById('add-bot-btn');
const roomCodeVal = document.getElementById('room-code-value');
const lobbyCount = document.getElementById('lobby-count');
const playersList = document.getElementById('players-list');
const shareLinkContainer = document.getElementById('share-link-container');
const shareLinkValue = document.getElementById('share-link-value');
const copyLinkBtn = document.getElementById('copy-link-btn');

// Elementos Jogo
const poolCountVal = document.getElementById('pool-count-val');
const gameRoomCode = document.getElementById('game-room-code');
const scoreboardList = document.getElementById('scoreboard-list');
const gameLogs = document.getElementById('game-logs');
const gameBoard = document.getElementById('game-board');
const playerRack = document.getElementById('player-rack');

// Botões de Ação do Jogo
const btnDraw = document.getElementById('btn-draw');
const btnUndo = document.getElementById('btn-undo');
const btnSortValue = document.getElementById('btn-sort-value');
const btnSortColor = document.getElementById('btn-sort-color');
const btnEndTurn = document.getElementById('btn-end-turn');

// Overlay Fim de Jogo
const gameOverOverlay = document.getElementById('game-over-overlay');
const winnerTitle = document.getElementById('winner-title');
const winnerAnnouncement = document.getElementById('winner-announcement');
const btnRestartLobby = document.getElementById('btn-restart-lobby');

// Temporizador e Lobby
const gameTimerPill = document.getElementById('game-timer-pill');
const gameTimerVal = document.getElementById('game-timer-val');
const btnLobbyExit = document.getElementById('btn-lobby-exit');

// Salva o ID do socket assim que conectar
socket.on('connect', () => {
  myId = socket.id;
  console.log(`Conectado ao servidor. Meu ID: ${myId}`);
});

/* ==========================================================================
   SISTEMA DE NOTIFICAÇÕES (TOASTS)
   ========================================================================== */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <span style="cursor:pointer; font-weight:bold; margin-left:10px;" onclick="this.parentElement.remove()">✕</span>
  `;
  toastContainer.appendChild(toast);

  // Remove automaticamente após 4 segundos
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}

socket.on('errorMsg', (msg) => showToast(msg, 'error'));
socket.on('infoMsg', (msg) => {
  showToast(msg, 'info');
  addLog(msg, 'system');
});

/* ==========================================================================
   EVENTOS DO FLUXO DO LOBBY E CONEXÃO
   ========================================================================== */

// Configurar Eventos de Clique
createRoomBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (!name) {
    showToast('Por favor, digite seu nome.', 'warning');
    return;
  }
  socket.emit('createRoom', { playerName: name });
});

joinRoomBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!name) {
    showToast('Por favor, digite seu nome.', 'warning');
    return;
  }
  if (!code || code.length !== 4) {
    showToast('Por favor, digite um código de sala válido (4 letras).', 'warning');
    return;
  }
  socket.emit('joinRoom', { roomCode: code, playerName: name });
});

startBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

addBotBtn.addEventListener('click', () => {
  socket.emit('addBot');
});

btnRestartLobby.addEventListener('click', () => {
  gameOverOverlay.classList.remove('active');
  // Se o jogo acabou, o servidor reseta o status da sala e envia atualização. 
  // O cliente apenas volta à tela do lobby.
  switchScreen(lobbyScreen);
});

// Evento de Sair do Jogo / Voltar para o Lobby
btnLobbyExit.addEventListener('click', () => {
  const isHost = btnLobbyExit.textContent.includes('Lobby');
  if (isHost) {
    if (confirm('Deseja encerrar a partida atual e voltar para a sala de espera? Todos os jogadores retornarão ao lobby.')) {
      socket.emit('backToLobby');
    }
  } else {
    if (confirm('Deseja realmente sair da partida? Você será desconectado da sala.')) {
      socket.disconnect();
      window.location.reload();
    }
  }
});

function startLocalCountdown(expiresAt) {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  turnExpiresAt = expiresAt;

  function updateDisplay() {
    if (!turnExpiresAt) {
      gameTimerVal.textContent = '--';
      gameTimerPill.className = 'info-pill timer-pill';
      return;
    }

    const timeLeft = Math.max(0, Math.round((turnExpiresAt - Date.now()) / 1000));
    gameTimerVal.textContent = `${timeLeft}s`;

    // Atualiza classes do visualizador do timer
    if (timeLeft <= 15) {
      gameTimerPill.className = 'info-pill timer-pill critical-timer';
    } else if (timeLeft <= 35) {
      gameTimerPill.className = 'info-pill timer-pill warning-timer';
    } else {
      gameTimerPill.className = 'info-pill timer-pill';
    }
  }

  updateDisplay();
  timerInterval = setInterval(updateDisplay, 1000);
}

// Evento de Copiar Link do Lobby
copyLinkBtn.addEventListener('click', () => {
  const url = shareLinkValue.value;
  // Só copia se for um link real
  if (url && url.startsWith('http')) {
    navigator.clipboard.writeText(url)
      .then(() => {
        showToast('Link de convite copiado!', 'success');
        copyLinkBtn.textContent = 'Copiado!';
        copyLinkBtn.style.background = 'var(--btn-success)';
        copyLinkBtn.style.borderColor = 'var(--btn-success)';
        copyLinkBtn.style.color = 'white';
        
        setTimeout(() => {
          copyLinkBtn.textContent = 'Copiar Link';
          copyLinkBtn.style.background = '';
          copyLinkBtn.style.borderColor = '';
          copyLinkBtn.style.color = '';
        }, 2000);
      })
      .catch(err => {
        showToast('Falha ao copiar automaticamente.', 'error');
        console.error(err);
      });
  }
});

// Enviar atualizações de configurações do lobby (Apenas Host)
document.querySelectorAll('.select-setting').forEach(select => {
  select.addEventListener('change', () => {
    const settings = {
      minMeldPoints: parseInt(document.getElementById('setting-meld').value),
      allowDuplicateSets: document.getElementById('setting-duplicates').value === 'true',
      turnDuration: parseInt(document.getElementById('setting-timer').value),
      maxJokersPerSet: parseInt(document.getElementById('setting-jokers').value)
    };
    socket.emit('updateSettings', { settings });
  });
});

// Transição de Telas
function switchScreen(targetScreen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  targetScreen.classList.add('active');
}

/* ==========================================================================
   ATUALIZAÇÕES DA SALA VINDAS DO SERVIDOR
   ========================================================================== */
socket.on('roomUpdate', (room) => {
  roomCode = room.roomCode;
  gameStarted = room.gameStarted;
  
  // Atualiza códigos exibidos
  roomCodeVal.textContent = roomCode;
  gameRoomCode.textContent = roomCode;
  poolCountVal.textContent = room.poolCount;

  // 1. Atualiza Tela de Lobby
  if (!gameStarted) {
    // Para contagens regressivas se voltar ao lobby
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    switchScreen(lobbyScreen);
    lobbyCount.textContent = room.players.length;
    playersList.innerHTML = '';
    
    // Atualiza campo de link público do localtunnel
    if (room.tunnelUrl) {
      shareLinkValue.value = room.tunnelUrl;
    } else {
      shareLinkValue.value = 'Gerando link público temporário no servidor...';
    }
    
    const me = room.players.find(p => p.id === myId);
    const isHost = me && me.host;
    
    // Habilita/Desabilita selects de configuração dependendo de se somos o Host
    document.querySelectorAll('.select-setting').forEach(select => {
      select.disabled = !isHost;
    });

    // Sincroniza os valores de configurações vindos do servidor
    if (room.settings) {
      document.getElementById('setting-meld').value = room.settings.minMeldPoints;
      document.getElementById('setting-duplicates').value = room.settings.allowDuplicateSets.toString();
      document.getElementById('setting-timer').value = room.settings.turnDuration;
      document.getElementById('setting-jokers').value = room.settings.maxJokersPerSet;
    }
    
    // Mostra/oculta botão de adicionar Bot
    if (addBotBtn) {
      addBotBtn.style.display = isHost ? 'inline-flex' : 'none';
    }
    
    room.players.forEach(p => {
      const li = document.createElement('li');
      const botBadge = p.isBot ? ' <span class="badge bot-badge">IA</span>' : '';
      const removeButton = (isHost && p.isBot) ? `<button class="btn-remove-bot" onclick="socket.emit('removeBot', { botId: '${p.id}' })">Remover</button>` : '';

      li.innerHTML = `
        <div class="player-info">
          <div class="player-avatar"></div>
          <span>${p.name} ${p.id === myId ? '(Você)' : ''}${botBadge}</span>
        </div>
        ${p.host ? '<span class="badge">Host</span>' : ''}
        ${removeButton}
      `;
      playersList.appendChild(li);
    });

    // Habilita botão de iniciar se for Host
    if (isHost) {
      startBtn.disabled = room.players.length < 2;
      startBtn.textContent = room.players.length < 2 ? 'Aguardando Jogadores...' : 'Iniciar Jogo';
    } else {
      startBtn.disabled = true;
      startBtn.textContent = 'Aguardando o Host iniciar...';
    }
  } 
  
  // 2. Jogo em Andamento
  else {
    switchScreen(gameScreen);
    
    // Ajusta visualização do botão Sair/Voltar com base em se somos o host
    const me = room.players.find(p => p.id === myId);
    const isHost = me && me.host;
    if (isHost) {
      btnLobbyExit.textContent = 'Voltar para o Lobby';
      btnLobbyExit.className = 'btn danger font-bold';
    } else {
      btnLobbyExit.textContent = 'Sair da Partida';
      btnLobbyExit.className = 'btn secondary font-bold';
    }

    // Iniciar contagem regressiva local baseada no timestamp do servidor
    if (room.turnExpiresAt) {
      startLocalCountdown(room.turnExpiresAt);
    }

    // Determinar se é meu turno
    const activePlayer = room.players.find(p => p.isActive);
    isMyTurn = activePlayer && activePlayer.id === myId;
    
    // Configurar botões com base no turno
    btnDraw.disabled = !isMyTurn;
    btnUndo.disabled = !isMyTurn;
    btnEndTurn.disabled = !isMyTurn;

    // Atualizar placar de jogadores
    scoreboardList.innerHTML = '';
    room.players.forEach(p => {
      const li = document.createElement('li');
      if (p.isActive) li.className = 'active';
      
      const botBadge = p.isBot ? ' <span class="badge bot-badge" style="margin-left: 5px; font-size: 0.65rem; padding: 2px 4px;">IA</span>' : '';
      
      li.innerHTML = `
        <div class="sb-player-top">
          <span class="sb-name">${p.name} ${p.id === myId ? '(Você)' : ''}${botBadge}</span>
          <span class="sb-tiles">${p.tileCount} peças</span>
        </div>
        <div class="sb-status">
          <span>${p.isActive ? '👉 Jogando...' : 'Aguardando'}</span>
          <span class="meld-badge ${p.meldCompleted ? '' : 'meld-pending'}">
            ${p.meldCompleted ? 'Meld OK (30+)' : 'Pendente Meld'}
          </span>
        </div>
      `;
      scoreboardList.appendChild(li);
    });

    // Se mudou o turno, avisa por log
    const activeName = activePlayer ? (activePlayer.id === myId ? 'Seu turno!' : `Turno de ${activePlayer.name}`) : '';
    if (isMyTurn) {
      showToast('É o seu turno!', 'success');
    }

    // Sincroniza a mesa comum
    boardState = room.board;
    renderBoard();

    // Sincroniza o rack privado
    // O servidor nos envia o rack atualizado de forma confidencial.
    // Para não resetar a organização manual do suporte que o jogador fez, 
    // nós só preenchemos o rackState localmente com peças novas, ou atualizamos as posições.
    syncRackState(room.myRack);
    renderRack();
  }

});

// Atualização rápida de mesa de outros jogadores (enquanto eles jogam)
socket.on('boardUpdated', ({ board }) => {
  if (!isMyTurn) {
    boardState = board;
    renderBoard();
  }
});

// Evento de Fim de Jogo
socket.on('gameOver', ({ winnerName }) => {
  winnerTitle.textContent = 'Temos um Vencedor!';
  winnerAnnouncement.innerHTML = `O jogador <strong>${winnerName}</strong> jogou todas as peças e venceu o Rummikub!`;
  gameOverOverlay.classList.add('active');
  addLog(`Fim de jogo! ${winnerName} venceu a partida!`, 'success');
});

// Logs do Jogo
function addLog(message, type = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}] ${message}`;
  gameLogs.appendChild(entry);
  gameLogs.scrollTop = gameLogs.scrollHeight;
}

/* ==========================================================================
   SINCRONIZAÇÃO E ORGANIZAÇÃO DO SUPORTE (RACK)
   ========================================================================== */

// Sincroniza as peças enviadas pelo servidor com a nossa grade privada
function syncRackState(serverRack) {
  // Coleta os IDs de todas as peças colocadas na mesa neste turno
  const playedTileIds = new Set();
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const tile = boardState[r][c];
      if (tile && tile.newPlay) {
        playedTileIds.add(tile.id);
      }
    }
  }

  // Cria um mapa das peças recebidas que não foram jogadas na mesa
  const serverTilesMap = new Map();
  serverRack.forEach(t => {
    if (!playedTileIds.has(t.id)) {
      serverTilesMap.set(t.id, t);
    }
  });

  // Remove peças da nossa grade que não estão mais no rack do servidor (que foram jogadas na mesa)
  for (let r = 0; r < RACK_ROWS; r++) {
    for (let c = 0; c < RACK_COLS; c++) {
      const localTile = rackState[r][c];
      if (localTile) {
        if (serverTilesMap.has(localTile.id)) {
          // Mantém a peça onde está, e remove do mapa para sabermos quais são novas
          serverTilesMap.delete(localTile.id);
        } else {
          // Remove da grade local
          rackState[r][c] = null;
        }
      }
    }
  }

  // Peças novas que foram compradas do monte
  const newTiles = Array.from(serverTilesMap.values());
  
  // Coloca as peças novas nos primeiros espaços vazios da grade
  newTiles.forEach(tile => {
    let placed = false;
    for (let r = 0; r < RACK_ROWS; r++) {
      for (let c = 0; c < RACK_COLS; c++) {
        if (rackState[r][c] === null) {
          rackState[r][c] = tile;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  });
}

// Ordenar por Número (1 a 13 e agrupa cores semelhantes)
btnSortValue.addEventListener('click', () => {
  // Junta todas as peças atuais do suporte
  const tiles = [];
  for (let r = 0; r < RACK_ROWS; r++) {
    for (let c = 0; c < RACK_COLS; c++) {
      if (rackState[r][c]) tiles.push(rackState[r][c]);
    }
  }

  // Ordena: primeiro por número (crescente), depois por cor
  tiles.sort((a, b) => {
    if (a.isJoker) return 1; // Coringas vão pro final
    if (b.isJoker) return -1;
    if (a.value !== b.value) {
      return a.value - b.value;
    }
    return a.color.localeCompare(b.color);
  });

  // Limpa grade e reposiciona
  rackState = Array(RACK_ROWS).fill(null).map(() => Array(RACK_COLS).fill(null));
  let idx = 0;
  for (let r = 0; r < RACK_ROWS; r++) {
    for (let c = 0; c < RACK_COLS; c++) {
      if (idx < tiles.length) {
        rackState[r][c] = tiles[idx++];
      }
    }
  }
  renderRack();
});

// Ordenar por Cor (Junta as cores e depois as ordena numericamente)
btnSortColor.addEventListener('click', () => {
  const tiles = [];
  for (let r = 0; r < RACK_ROWS; r++) {
    for (let c = 0; c < RACK_COLS; c++) {
      if (rackState[r][c]) tiles.push(rackState[r][c]);
    }
  }

  // Ordena: primeiro por cor, depois por valor numérico
  tiles.sort((a, b) => {
    if (a.isJoker) return 1;
    if (b.isJoker) return -1;
    if (a.color !== b.color) {
      return a.color.localeCompare(b.color);
    }
    return a.value - b.value;
  });

  // Limpa grade e reposiciona
  rackState = Array(RACK_ROWS).fill(null).map(() => Array(RACK_COLS).fill(null));
  let idx = 0;
  for (let r = 0; r < RACK_ROWS; r++) {
    for (let c = 0; c < RACK_COLS; c++) {
      if (idx < tiles.length) {
        rackState[r][c] = tiles[idx++];
      }
    }
  }
  renderRack();
});

/* ==========================================================================
   RENDERIZAÇÃO DO TABULEIRO (BOARD) E SUPORTE (RACK)
   ========================================================================== */

// Gera uma peça HTML
function createTileElement(tile, source, r, c) {
  const el = document.createElement('div');
  el.className = `tile ${tile.color}`;
  if (tile.isJoker) el.classList.add('joker');
  
  el.draggable = isMyTurn; // Só arrasta se for meu turno
  el.dataset.id = tile.id;
  el.dataset.source = source;
  el.dataset.row = r;
  el.dataset.col = c;

  el.innerHTML = `
    <span class="tile-value">${tile.isJoker ? '☺' : tile.value}</span>
    <div class="tile-dot"></div>
  `;

  // Ouvintes de arrasto para o tile
  el.addEventListener('dragstart', handleDragStart);
  el.addEventListener('dragend', handleDragEnd);

  return el;
}

// Renderiza a mesa de jogo
function renderBoard() {
  gameBoard.innerHTML = '';
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.type = 'board';
      cell.dataset.row = r;
      cell.dataset.col = c;

      // Eventos de Dropzone
      cell.addEventListener('dragover', handleDragOver);
      cell.addEventListener('dragleave', handleDragLeave);
      cell.addEventListener('drop', handleDrop);

      const tile = boardState[r][c];
      if (tile) {
        cell.appendChild(createTileElement(tile, 'board', r, c));
      }

      gameBoard.appendChild(cell);
    }
  }
}

// Renderiza o suporte do jogador
function renderRack() {
  playerRack.innerHTML = '';
  for (let r = 0; r < RACK_ROWS; r++) {
    for (let c = 0; c < RACK_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.type = 'rack';
      cell.dataset.row = r;
      cell.dataset.col = c;

      // Eventos de Dropzone
      cell.addEventListener('dragover', handleDragOver);
      cell.addEventListener('dragleave', handleDragLeave);
      cell.addEventListener('drop', handleDrop);

      const tile = rackState[r][c];
      if (tile) {
        cell.appendChild(createTileElement(tile, 'rack', r, c));
      }

      playerRack.appendChild(cell);
    }
  }
}

/* ==========================================================================
   LÓGICA DE ARRRASTAR E SOLTAR (DRAG AND DROP)
   ========================================================================== */

function handleDragStart(e) {
  if (!isMyTurn) return;
  
  const tileEl = e.currentTarget;
  const source = tileEl.dataset.source;
  const r = parseInt(tileEl.dataset.row);
  const c = parseInt(tileEl.dataset.col);

  // Busca o objeto tile correto baseado na origem
  let tileObj = null;
  if (source === 'board') {
    tileObj = boardState[r][c];
  } else {
    tileObj = rackState[r][c];
  }

  draggedTile = {
    tile: tileObj,
    source: source,
    row: r,
    col: c
  };

  tileEl.style.opacity = '0.4';
  
  // Efeito de feedback para o arrasto
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  e.currentTarget.style.opacity = '1';
  draggedTile = null;

  // Remove destaque visual de drag-over das células
  document.querySelectorAll('.grid-cell').forEach(cell => {
    cell.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  if (!isMyTurn || !draggedTile) return;
  e.preventDefault();
  
  // Evita dropzone se a célula de destino já tiver um tile
  if (e.currentTarget.children.length === 0) {
    e.currentTarget.classList.add('drag-over');
    e.dataTransfer.dropEffect = 'move';
  }
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  if (!isMyTurn || !draggedTile) return;

  const targetCell = e.currentTarget;
  targetCell.classList.remove('drag-over');

  // Só permite drop em célula vazia
  if (targetCell.children.length > 0) return;

  const targetType = targetCell.dataset.type; // 'board' ou 'rack'
  const targetRow = parseInt(targetCell.dataset.row);
  const targetCol = parseInt(targetCell.dataset.col);

  // Bloqueia drop no suporte de peças que vieram da mesa e não são jogadas recentes deste turno
  if (targetType === 'rack') {
    if (draggedTile.source !== 'rack' && !draggedTile.tile.newPlay) {
      showToast('Você não pode mover peças do tabuleiro para o seu suporte.', 'warning');
      return;
    }
  }

  // 1. Remove da origem no estado local
  if (draggedTile.source === 'board') {
    boardState[draggedTile.row][draggedTile.col] = null;
  } else {
    rackState[draggedTile.row][draggedTile.col] = null;
  }

  // 2. Adiciona no destino no estado local
  if (targetType === 'board') {
    const isNewPlay = draggedTile.source === 'rack' || draggedTile.tile.newPlay;
    boardState[targetRow][targetCol] = { ...draggedTile.tile, newPlay: isNewPlay };
  } else {
    // Se a peça voltou para o rack, remove o status de "nova peça jogada"
    const cleanedTile = { ...draggedTile.tile };
    delete cleanedTile.newPlay;
    rackState[targetRow][targetCol] = cleanedTile;
  }

  // 3. Atualiza DOM localmente para resposta instantânea
  renderBoard();
  renderRack();

  // 4. Se a alteração envolveu o tabuleiro comum, notifica o servidor em tempo real
  // para que outros jogadores possam assistir a edição da mesa
  if (draggedTile.source === 'board' || targetType === 'board') {
    socket.emit('updateBoard', { board: boardState });
  }
}

/* ==========================================================================
   AÇÕES DOS BOTÕES DO JOGO
   ========================================================================== */

// Comprar Peça
btnDraw.addEventListener('click', () => {
  if (!isMyTurn) return;
  socket.emit('drawTile');
});

// Desfazer jogadas do turno atual
btnUndo.addEventListener('click', () => {
  if (!isMyTurn) return;
  socket.emit('undoTurn');
});

// Finalizar Turno
btnEndTurn.addEventListener('click', () => {
  if (!isMyTurn) return;

  // Filtra as peças no rack local para enviar ao servidor
  const flatRack = [];
  for (let r = 0; r < RACK_ROWS; r++) {
    for (let c = 0; c < RACK_COLS; c++) {
      if (rackState[r][c]) {
        flatRack.push(rackState[r][c]);
      }
    }
  }

  socket.emit('endTurn', {
    board: boardState,
    rack: flatRack
  });
});
