// Rummikub 6-Players - Deploy Render ativo
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Estado Global
const rooms = new Map();

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIpAddress();
let tunnelUrl = `http://${localIp}:3000`;

// Cores do jogo de 6 jogadores
const COLORS = ['red', 'blue', 'black', 'yellow', 'green', 'purple'];
const BOARD_ROWS = 12;
const BOARD_COLS = 25;

// Personalidades e Nomes de Bots (IAs) baseados na Dificuldade
const BOT_NAMES = {
  easy: ["Robo Estreante", "Silicio Lento", "Calculadora 8-bits", "Bot Novato", "IA Devagar", "Chip Calmo"],
  medium: ["DeepBlue Jr", "Turing-Bot", "Algoritmo Amigo", "Calculador", "IA Padrao", "CodeRunner"],
  hard: ["Ada Lovelace", "DeepMind Bot", "Antigravity AI", "Alan Turing", "Stockfish Rummy", "WOPR"]
};

function getBotName(difficulty, index) {
  const names = BOT_NAMES[difficulty] || BOT_NAMES.medium;
  return names[index % names.length];
}

function generatePool() {
  const pool = [];
  let tileId = 1;

  // 2 cópias de cada número (1 a 13) para cada uma das 6 cores
  for (const color of COLORS) {
    for (let value = 1; value <= 13; value++) {
      pool.push({ id: tileId++, value, color, isJoker: false });
      pool.push({ id: tileId++, value, color, isJoker: false });
    }
  }

  // 4 Coringas
  for (let i = 0; i < 4; i++) {
    pool.push({ id: tileId++, value: 0, color: 'joker', isJoker: true });
  }

  // Embaralhar (Fisher-Yates)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool;
}

function generateEmptyBoard() {
  const board = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    const row = [];
    for (let c = 0; c < BOARD_COLS; c++) {
      row.push(null);
    }
    board.push(row);
  }
  return board;
}

// Analisa a mesa e extrai os segmentos contíguos de peças na horizontal
function getBoardSegments(board) {
  const segments = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    let currentSegment = [];
    for (let c = 0; c < BOARD_COLS; c++) {
      const tile = board[r][c];
      if (tile !== null) {
        currentSegment.push({ tile, r, c });
      } else {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
        }
      }
    }
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }
  }
  return segments;
}

// Verifica se um segmento de peças é um grupo válido
function checkGroup(segment) {
  const nonJokers = segment.filter(item => !item.tile.isJoker);
  if (nonJokers.length === 0) return true; // Apenas coringas (raro)

  // Num grupo, todas as peças que não são coringas devem ter o mesmo número
  const targetValue = nonJokers[0].tile.value;
  const sameValue = nonJokers.every(item => item.tile.value === targetValue);
  if (!sameValue) return false;

  // Num grupo de Rummikub, não pode haver repetição de cores
  const colors = nonJokers.map(item => item.tile.color);
  const uniqueColors = new Set(colors);
  if (uniqueColors.size !== colors.length) return false;

  // O tamanho máximo do grupo é o total de cores disponíveis (6)
  if (segment.length > COLORS.length) return false;

  return true;
}

// Verifica se um segmento de peças é uma sequência (run) válida
function checkRun(segment) {
  const nonJokers = segment.filter(item => !item.tile.isJoker);
  if (nonJokers.length === 0) return true;

  // Numa sequência, todas as peças devem ser da mesma cor
  const targetColor = nonJokers[0].tile.color;
  const sameColor = nonJokers.every(item => item.tile.color === targetColor);
  if (!sameColor) return false;

  if (segment.length > 13) return false;

  // Achar o primeiro item não coringa para determinar a base numérica
  const firstNonJokerIdx = segment.findIndex(item => !item.tile.isJoker);
  const baseValue = nonJokers[0].tile.value;

  for (let i = 0; i < segment.length; i++) {
    const expectedValue = baseValue - firstNonJokerIdx + i;
    // Os valores numéricos de Rummikub vão de 1 a 13 apenas
    if (expectedValue < 1 || expectedValue > 13) return false;

    const currentItem = segment[i];
    if (!currentItem.tile.isJoker) {
      if (currentItem.tile.value !== expectedValue) return false;
    }
  }

  return true;
}

// Retorna o valor real de uma peça em seu conjunto (calculando o valor do coringa)
function getTilePoints(item, segment, isRun) {
  if (!item.tile.isJoker) return item.tile.value;

  // Se for coringa, descobre o valor que ele está substituindo
  if (isRun) {
    const firstNonJokerIdx = segment.findIndex(x => !x.tile.isJoker);
    if (firstNonJokerIdx === -1) return 0; // Segmento só de coringas
    const baseValue = segment[firstNonJokerIdx].tile.value;
    const itemIndex = segment.indexOf(item);
    return baseValue - firstNonJokerIdx + itemIndex;
  } else {
    // Num grupo, o coringa tem o mesmo valor das outras peças
    const nonJoker = segment.find(x => !x.tile.isJoker);
    return nonJoker ? nonJoker.tile.value : 0;
  }
}

function serializeSegment(segment) {
  const nonJokers = segment.filter(item => !item.tile.isJoker);
  if (nonJokers.length === 0) return 'jokers-' + segment.length;
  
  const isR = checkRun(segment);
  if (isR) {
    const firstNonJokerIdx = segment.findIndex(item => !item.tile.isJoker);
    const baseValue = nonJokers[0].tile.value;
    const startVal = baseValue - firstNonJokerIdx;
    return `run-${nonJokers[0].tile.color}-${startVal}-${startVal + segment.length - 1}`;
  } else {
    const val = nonJokers[0].tile.value;
    const colors = segment.map(item => item.tile.color).sort().join(',');
    return `group-${val}-${colors}`;
  }
}

// Verifica se a mesa inteira é válida
function validateBoardState(board, settings) {
  const segments = getBoardSegments(board);
  const seenSegments = new Set();
  
  for (const segment of segments) {
    if (segment.length < 3) {
      return { valid: false, error: 'Todos os conjuntos na mesa devem ter pelo menos 3 peças.' };
    }
    const isG = checkGroup(segment);
    const isR = checkRun(segment);
    if (!isG && !isR) {
      return { valid: false, error: 'A mesa contém grupos ou sequências inválidas.' };
    }

    // Validação de quantidade de coringas por conjunto
    if (settings && settings.maxJokersPerSet > 0) {
      const jokerCount = segment.filter(item => item.tile.isJoker).length;
      if (jokerCount > settings.maxJokersPerSet) {
        return { valid: false, error: `Cada conjunto na mesa pode ter no máximo ${settings.maxJokersPerSet} Coringa(s).` };
      }
    }

    // Validação de conjuntos duplicados/idênticos
    if (settings && !settings.allowDuplicateSets) {
      const key = serializeSegment(segment);
      if (seenSegments.has(key)) {
        return { valid: false, error: 'A regra de "Não permitir conjuntos idênticos" está ativa, e a mesa contém conjuntos duplicados.' };
      }
      seenSegments.add(key);
    }
  }
  return { valid: true };
}

// Cria um código de sala aleatório de 4 letras maiúsculas
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Envia atualizações filtradas da sala para todos os jogadores (oculta os racks dos adversários)
function broadcastRoomUpdate(room) {
  room.players.forEach(player => {
    // Formata o estado da sala para este jogador específico
    const payload = {
      roomCode: room.id,
      gameStarted: room.gameStarted,
      board: room.board,
      currentTurnIndex: room.currentTurnIndex,
      poolCount: room.pool.length,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        host: p.host,
        tileCount: p.rack.length,
        meldCompleted: room.meldStatus.get(p.id) || false,
        isActive: room.players[room.currentTurnIndex]?.id === p.id,
        isBot: p.isBot || false
      })),
      myRack: player.rack, // Apenas as suas próprias peças!
      tunnelUrl: tunnelUrl,
      turnExpiresAt: room.turnExpiresAt,
      settings: room.settings
    };
    io.to(player.socketId).emit('roomUpdate', payload);
  });
}

function startTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }

  const durationMs = (room.settings ? room.settings.turnDuration : 90) * 1000;
  
  if (durationMs === 0) {
    room.turnExpiresAt = null;
    const activePlayer = room.players[room.currentTurnIndex];
    if (activePlayer && activePlayer.isBot) {
      const delay = activePlayer.difficulty === 'easy' ? 2500 : (activePlayer.difficulty === 'hard' ? 800 : 1500);
      room.turnTimer = setTimeout(() => {
        runBotTurn(room);
      }, delay);
    }
    return;
  }

  room.turnExpiresAt = Date.now() + durationMs;

  const activePlayer = room.players[room.currentTurnIndex];
  if (activePlayer && activePlayer.isBot) {
    room.turnExpiresAt = null;
    const delay = activePlayer.difficulty === 'easy' ? 2500 : (activePlayer.difficulty === 'hard' ? 800 : 1500);
    room.turnTimer = setTimeout(() => {
      runBotTurn(room);
    }, delay);
    return;
  }

  room.turnTimer = setTimeout(() => {
    const activePlayer = room.players[room.currentTurnIndex];
    if (activePlayer) {
      console.log(`[Timer] Tempo esgotado para: ${activePlayer.name}`);

      // Desfazer jogadas do turno dele
      if (room.initialBoardState) {
        room.board = JSON.parse(room.initialBoardState);
        const originalRackStr = room.initialRacks.get(activePlayer.id);
        if (originalRackStr) {
          activePlayer.rack = JSON.parse(originalRackStr);
        }
      }

      // Compra peça de penalidade
      let extraTileMsg = '';
      if (room.pool.length > 0) {
        const newTile = room.pool.pop();
        activePlayer.rack.push(newTile);
        extraTileMsg = ` O tempo expirou e você comprou uma peça de penalidade.`;
      } else {
        extraTileMsg = ` O tempo expirou, mas o monte está vazio.`;
      }

      io.to(activePlayer.socketId).emit('infoMsg', extraTileMsg);

      // Passar o turno
      room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;

      // Salva novos estados iniciais
      room.initialBoardState = JSON.stringify(room.board);
      room.initialRacks = new Map();
      room.players.forEach(p => {
        room.initialRacks.set(p.id, JSON.stringify(p.rack));
      });

      io.to(room.id).emit('infoMsg', `Tempo esgotado! Turno de ${room.players[room.currentTurnIndex].name}.`);

      startTurnTimer(room);
      broadcastRoomUpdate(room);
    }
  }, durationMs);
}

// ==========================================================================
// MOTOR DE INTELIGÊNCIA ARTIFICIAL (IA / BOTS)
// ==========================================================================

function findGroupWithKJokers(rack, k) {
  const jokers = rack.filter(t => t.isJoker);
  if (jokers.length < k) return null;

  const normalTiles = rack.filter(t => !t.isJoker);

  const byValue = new Map();
  normalTiles.forEach(t => {
    if (!byValue.has(t.value)) byValue.set(t.value, []);
    byValue.get(t.value).push(t);
  });

  for (const [val, list] of byValue.entries()) {
    const uniqueColorMap = new Map();
    list.forEach(t => uniqueColorMap.set(t.color, t));
    const uniqueColorTiles = Array.from(uniqueColorMap.values());

    const minNormalNeeded = Math.max(1, 3 - k);
    if (uniqueColorTiles.length >= minNormalNeeded) {
      const groupSize = uniqueColorTiles.length + k;
      if (groupSize >= 3 && groupSize <= COLORS.length) {
        return [...uniqueColorTiles, ...jokers.slice(0, k)];
      }
    }
  }

  return null;
}

function findRunWithKJokers(rack, k) {
  const jokers = rack.filter(t => t.isJoker);
  if (jokers.length < k) return null;

  const normalTiles = rack.filter(t => !t.isJoker);

  const byColor = new Map();
  normalTiles.forEach(t => {
    if (!byColor.has(t.color)) byColor.set(t.color, []);
    byColor.get(t.color).push(t);
  });

  for (const [color, list] of byColor.entries()) {
    const valMap = new Map();
    list.forEach(t => valMap.set(t.value, t));

    for (let start = 1; start <= 11; start++) {
      for (let L = 3; start + L - 1 <= 13; L++) {
        const end = start + L - 1;
        
        let missingCount = 0;
        for (let v = start; v <= end; v++) {
          if (!valMap.has(v)) {
            missingCount++;
          }
        }

        if (missingCount === k) {
          const runTiles = [];
          let jokerIdx = 0;
          for (let v = start; v <= end; v++) {
            if (valMap.has(v)) {
              runTiles.push(valMap.get(v));
            } else {
              runTiles.push(jokers[jokerIdx++]);
            }
          }
          return runTiles;
        }
      }
    }
  }

  return null;
}

function findOneSet(rack, maxJokersAllowed) {
  for (let k = 0; k <= maxJokersAllowed; k++) {
    const group = findGroupWithKJokers(rack, k);
    if (group) return group;

    const run = findRunWithKJokers(rack, k);
    if (run) return run;
  }
  return null;
}

function findSetsInRack(rack, settings, ignoreJokers = false) {
  let tempRack = [...rack];
  if (ignoreJokers) {
    tempRack = tempRack.filter(t => !t.isJoker);
  }
  const maxJokers = (settings && typeof settings.maxJokersPerSet === 'number') ? settings.maxJokersPerSet : 0;
  const maxJokersAllowed = ignoreJokers ? 0 : (maxJokers > 0 ? maxJokers : 4);

  const sets = [];
  while (true) {
    const foundSet = findOneSet(tempRack, maxJokersAllowed);
    if (!foundSet) break;
    sets.push(foundSet);
    const usedIds = new Set(foundSet.map(t => t.id));
    tempRack = tempRack.filter(t => !usedIds.has(t.id));
  }

  return sets;
}

function placeNewSetOnBoard(board, set) {
  for (let r = 0; r < BOARD_ROWS; r++) {
    const isRowEmpty = board[r].every(cell => cell === null);
    if (isRowEmpty) {
      // Começa da coluna 2 para melhor visualização
      for (let i = 0; i < set.length; i++) {
        board[r][i + 2] = set[i];
      }
      return true;
    }
  }
  return false;
}

function tryAcoplarPeças(bot, room, ignoreJokers = false) {
  let piecePlayed = false;
  let rackTiles = [...bot.rack];
  if (ignoreJokers) {
    rackTiles = rackTiles.filter(t => !t.isJoker);
  }
  let cardsToTry = true;

  while (cardsToTry) {
    cardsToTry = false;
    const segments = getBoardSegments(room.board);

    for (const segment of segments) {
      for (let i = 0; i < rackTiles.length; i++) {
        const tile = rackTiles[i];
        if (!tile) continue;

        // Tentar à esquerda
        const firstItem = segment[0];
        if (firstItem.c > 0) {
          const leftCell = room.board[firstItem.r][firstItem.c - 1];
          if (leftCell === null) {
            room.board[firstItem.r][firstItem.c - 1] = tile;
            const newSegment = [{ tile, r: firstItem.r, c: firstItem.c - 1 }, ...segment];
            if (checkGroup(newSegment) || checkRun(newSegment)) {
              rackTiles.splice(i, 1);
              bot.rack = bot.rack.filter(t => t.id !== tile.id);
              piecePlayed = true;
              cardsToTry = true;
              break;
            } else {
              room.board[firstItem.r][firstItem.c - 1] = null;
            }
          }
        }

        // Tentar à direita
        const lastItem = segment[segment.length - 1];
        if (lastItem.c < BOARD_COLS - 1) {
          const rightCell = room.board[lastItem.r][lastItem.c + 1];
          if (rightCell === null) {
            room.board[lastItem.r][lastItem.c + 1] = tile;
            const newSegment = [...segment, { tile, r: lastItem.r, c: lastItem.c + 1 }];
            if (checkGroup(newSegment) || checkRun(newSegment)) {
              rackTiles.splice(i, 1);
              bot.rack = bot.rack.filter(t => t.id !== tile.id);
              piecePlayed = true;
              cardsToTry = true;
              break;
            } else {
              room.board[lastItem.r][lastItem.c + 1] = null;
            }
          }
        }
      }
      if (cardsToTry) break;
    }
  }

  return piecePlayed;
}

function tryMeldInicial(bot, room) {
  const ignoreJokers = bot.difficulty === 'easy';
  const sets = findSetsInRack(bot.rack, room.settings, ignoreJokers);
  if (sets.length === 0) return false;

  let totalMeldPoints = 0;
  const setsToPlay = [];

  for (const set of sets) {
    const mockSegment = set.map((t, idx) => ({ tile: t, r: 0, c: idx }));
    const isG = checkGroup(mockSegment);
    const isR = checkRun(mockSegment);
    let setPoints = 0;
    if (isG || isR) {
      mockSegment.forEach(item => {
        setPoints += getTilePoints(item, mockSegment, isR);
      });
      totalMeldPoints += setPoints;
      setsToPlay.push(set);
    }
  }

  if (totalMeldPoints >= 30) {
    let placedAll = true;
    for (const set of setsToPlay) {
      const placed = placeNewSetOnBoard(room.board, set);
      if (placed) {
        const idsToRemove = new Set(set.map(t => t.id));
        bot.rack = bot.rack.filter(t => !idsToRemove.has(t.id));
      } else {
        placedAll = false;
      }
    }

    if (placedAll) {
      room.meldStatus.set(bot.id, true);
      io.to(room.id).emit('infoMsg', `${bot.name} baixou o Meld Inicial! (${totalMeldPoints} pontos)`);
      return true;
    }
  }

  return false;
}

function calculateGameOverScores(room, winnerId) {
  const roundScores = new Map();
  let totalNegativePoints = 0;

  // 1. Calcula pontos de cada perdedor
  room.players.forEach(player => {
    if (player.id !== winnerId) {
      let points = 0;
      player.rack.forEach(tile => {
        if (tile.isJoker) {
          points += 30; // Coringa vale -30
        } else {
          points += tile.value; // Peças normais valem seu valor
        }
      });
      // Pontos para o perdedor são negativos
      roundScores.set(player.id, -points);
      totalNegativePoints += points;
    }
  });

  // 2. O vencedor ganha a soma de todos os pontos perdidos (em valor absoluto)
  roundScores.set(winnerId, totalNegativePoints);

  // 3. Atualiza o acumulado e monta o array de resultado
  const scoresPayload = room.players.map(player => {
    const pointsThisRound = roundScores.get(player.id) || 0;
    
    // Atualiza acumulado
    let currentAccumulated = room.scores.get(player.id) || 0;
    currentAccumulated += pointsThisRound;
    room.scores.set(player.id, currentAccumulated);

    return {
      playerId: player.id,
      name: player.name,
      pointsThisRound: pointsThisRound,
      pointsAccumulated: currentAccumulated,
      isWinner: player.id === winnerId
    };
  });

  // Ordena por pontuação acumulada decrescente
  scoresPayload.sort((a, b) => b.pointsAccumulated - a.pointsAccumulated);

  return scoresPayload;
}

function runBotTurn(room) {
  const bot = room.players[room.currentTurnIndex];
  if (!bot || !bot.isBot) return;

  console.log(`[IA] Iniciando turno do bot: ${bot.name} (Dificuldade: ${bot.difficulty || 'medium'})`);

  // IA Fácil: 40% de chance de apenas comprar carta e passar a vez
  if (bot.difficulty === 'easy' && Math.random() < 0.4) {
    console.log(`[IA Fácil] Escolheu comprar e passar aleatoriamente.`);
    if (room.pool.length > 0) {
      const newTile = room.pool.pop();
      bot.rack.push(newTile);
    }
    io.to(room.id).emit('infoMsg', `${bot.name} comprou uma peça.`);
    
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
    room.initialBoardState = JSON.stringify(room.board);
    room.initialRacks = new Map();
    room.players.forEach(p => {
      room.initialRacks.set(p.id, JSON.stringify(p.rack));
    });
    startTurnTimer(room);
    broadcastRoomUpdate(room);
    return;
  }

  let piecePlayed = false;
  const ignoreJokers = bot.difficulty === 'easy';

  const hasMeld = room.meldStatus.get(bot.id);
  if (!hasMeld) {
    piecePlayed = tryMeldInicial(bot, room);
  } else {
    // Jogada regular:
    const acoplou = tryAcoplarPeças(bot, room, ignoreJokers);
    
    // B. Tenta baixar novos conjuntos inteiros do rack
    const sets = findSetsInRack(bot.rack, room.settings, ignoreJokers);
    let baixouNovos = false;
    for (const set of sets) {
      const placed = placeNewSetOnBoard(room.board, set);
      if (placed) {
        baixouNovos = true;
        const idsToRemove = new Set(set.map(t => t.id));
        bot.rack = bot.rack.filter(t => !idsToRemove.has(t.id));
      }
    }
    
    piecePlayed = acoplou || baixouNovos;
  }

  if (piecePlayed) {
    io.to(room.id).emit('infoMsg', `${bot.name} fez suas jogadas.`);
    
    // Verifica se venceu
    if (bot.rack.length === 0) {
      const scores = calculateGameOverScores(room, bot.id);
      io.to(room.id).emit('gameOver', { winnerName: bot.name, scores });
      room.gameStarted = false;
      broadcastRoomUpdate(room);
      return;
    }
  } else {
    // Compra peça
    if (room.pool.length > 0) {
      const newTile = room.pool.pop();
      bot.rack.push(newTile);
    }
    io.to(room.id).emit('infoMsg', `${bot.name} comprou uma peça.`);
  }

  // Passar o turno
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;

  // Salva estados iniciais para o próximo
  room.initialBoardState = JSON.stringify(room.board);
  room.initialRacks = new Map();
  room.players.forEach(p => {
    room.initialRacks.set(p.id, JSON.stringify(p.rack));
  });

  // Inicia o timer do próximo turno
  startTurnTimer(room);

  broadcastRoomUpdate(room);
}


io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // Voltar para o Lobby (Apenas Host)
  socket.on('backToLobby', () => {
    let targetRoom = null;
    for (const room of rooms.values()) {
      const hostPlayer = room.players.find(p => p.socketId === socket.id && p.host);
      if (hostPlayer) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      socket.emit('errorMsg', 'Apenas o anfitrião pode reiniciar a partida.');
      return;
    }

    // Para o timer
    if (targetRoom.turnTimer) {
      clearTimeout(targetRoom.turnTimer);
      targetRoom.turnTimer = null;
      targetRoom.turnExpiresAt = null;
    }

    targetRoom.gameStarted = false;
    targetRoom.board = generateEmptyBoard();
    targetRoom.pool = [];
    targetRoom.meldStatus.clear();
    targetRoom.players.forEach(p => {
      p.rack = [];
    });

    io.to(targetRoom.id).emit('infoMsg', 'A partida foi encerrada pelo anfitrião. Retornando ao lobby.');
    broadcastRoomUpdate(targetRoom);
  });

  // Adicionar bot (IA) à sala (Apenas Host)
  socket.on('addBot', () => {
    let targetRoom = null;
    for (const room of rooms.values()) {
      const hostPlayer = room.players.find(p => p.socketId === socket.id && p.host);
      if (hostPlayer) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      socket.emit('errorMsg', 'Apenas o anfitrião pode adicionar IAs.');
      return;
    }

    if (targetRoom.gameStarted) {
      socket.emit('errorMsg', 'Não é possível adicionar IAs com o jogo em andamento.');
      return;
    }

    if (targetRoom.players.length >= 6) {
      socket.emit('errorMsg', 'A sala já está cheia.');
      return;
    }

    const defaultDiff = 'medium';
    const botCount = targetRoom.players.filter(p => p.isBot && p.difficulty === defaultDiff).length;
    const botId = `bot_${Math.random().toString(36).substr(2, 9)}`;
    targetRoom.players.push({
      id: botId,
      name: getBotName(defaultDiff, botCount),
      socketId: null,
      rack: [],
      host: false,
      isBot: true,
      difficulty: defaultDiff
    });

    broadcastRoomUpdate(targetRoom);
  });

  // Alterar dificuldade do bot (Apenas Host)
  socket.on('changeBotDifficulty', ({ botId, difficulty }) => {
    let targetRoom = null;
    for (const room of rooms.values()) {
      const hostPlayer = room.players.find(p => p.socketId === socket.id && p.host);
      if (hostPlayer) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      socket.emit('errorMsg', 'Apenas o anfitrião pode alterar a dificuldade dos bots.');
      return;
    }

    if (targetRoom.gameStarted) {
      socket.emit('errorMsg', 'Não é possível alterar a dificuldade com o jogo em andamento.');
      return;
    }

    const bot = targetRoom.players.find(p => p.id === botId && p.isBot);
    if (bot) {
      bot.difficulty = difficulty;
      
      // Reconstrói nomes com base na dificuldade para evitar duplicatas ordinais
      let botCountMap = { easy: 0, medium: 0, hard: 0 };
      targetRoom.players.forEach(p => {
        if (p.isBot) {
          const diff = p.difficulty || 'medium';
          p.name = getBotName(diff, botCountMap[diff]++);
        }
      });

      broadcastRoomUpdate(targetRoom);
    }
  });

  // Remover bot da sala (Apenas Host)
  socket.on('removeBot', ({ botId }) => {
    let targetRoom = null;
    for (const room of rooms.values()) {
      const hostPlayer = room.players.find(p => p.socketId === socket.id && p.host);
      if (hostPlayer) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      socket.emit('errorMsg', 'Apenas o anfitrião pode remover IAs.');
      return;
    }

    if (targetRoom.gameStarted) {
      socket.emit('errorMsg', 'Não é possível remover IAs com o jogo em andamento.');
      return;
    }

    const idx = targetRoom.players.findIndex(p => p.id === botId && p.isBot);
    if (idx !== -1) {
      targetRoom.players.splice(idx, 1);
      targetRoom.scores.delete(botId); // Limpa score do bot removido
      
      // Renomeia os bots restantes de forma ordinal
      let botCountMap = { easy: 0, medium: 0, hard: 0 };
      targetRoom.players.forEach(p => {
        if (p.isBot) {
          const diff = p.difficulty || 'medium';
          p.name = getBotName(diff, botCountMap[diff]++);
        }
      });
      broadcastRoomUpdate(targetRoom);
    }
  });

  // Criar sala
  socket.on('createRoom', ({ playerName }) => {
    let roomCode = generateRoomCode();
    while (rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const playerId = socket.id; // Usando o id do socket como id único do jogador
    const room = {
      id: roomCode,
      players: [{
        id: playerId,
        name: playerName,
        socketId: socket.id,
        rack: [],
        host: true
      }],
      gameStarted: false,
      pool: [],
      board: generateEmptyBoard(),
      currentTurnIndex: 0,
      meldStatus: new Map(),
      scores: new Map(), // Para acumular as pontuações entre partidas
      initialBoardState: null, // Guarda o estado inicial do turno para desfazer
      turnTimer: null,
      turnExpiresAt: null,
      settings: {
        minMeldPoints: 30,
        allowDuplicateSets: true,
        turnDuration: 90,
        maxJokersPerSet: 0
      }
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    
    broadcastRoomUpdate(room);
  });

  // Atualizar configurações da sala (Apenas Host)
  socket.on('updateSettings', ({ settings }) => {
    let targetRoom = null;
    for (const room of rooms.values()) {
      const hostPlayer = room.players.find(p => p.socketId === socket.id && p.host);
      if (hostPlayer) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      socket.emit('errorMsg', 'Apenas o anfitrião pode alterar as configurações.');
      return;
    }

    if (targetRoom.gameStarted) {
      socket.emit('errorMsg', 'Não é possível alterar as configurações com o jogo em andamento.');
      return;
    }

    targetRoom.settings = {
      minMeldPoints: parseInt(settings.minMeldPoints),
      allowDuplicateSets: settings.allowDuplicateSets === true,
      turnDuration: parseInt(settings.turnDuration),
      maxJokersPerSet: parseInt(settings.maxJokersPerSet)
    };

    broadcastRoomUpdate(targetRoom);
  });

  // Entrar na sala
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('errorMsg', 'Sala não encontrada.');
      return;
    }

    if (room.gameStarted) {
      socket.emit('errorMsg', 'O jogo nesta sala já começou.');
      return;
    }

    if (room.players.length >= 6) {
      socket.emit('errorMsg', 'A sala já está cheia (limite de 6 jogadores).');
      return;
    }

    const playerId = socket.id;
    room.players.push({
      id: playerId,
      name: playerName,
      socketId: socket.id,
      rack: [],
      host: false
    });

    socket.join(code);
    broadcastRoomUpdate(room);
  });

  // Iniciar o jogo
  socket.on('startGame', () => {
    // Achar a sala que este jogador gerencia como host
    let targetRoom = null;
    let roomCode = null;

    for (const [code, room] of rooms.entries()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player && player.host) {
        targetRoom = room;
        roomCode = code;
        break;
      }
    }

    if (!targetRoom) {
      socket.emit('errorMsg', 'Apenas o anfitrião pode iniciar o jogo.');
      return;
    }

    if (targetRoom.players.length < 2) {
      socket.emit('errorMsg', 'É necessário pelo menos 2 jogadores para iniciar.');
      return;
    }

    // Inicializa o jogo
    targetRoom.gameStarted = true;
    targetRoom.pool = generatePool();
    targetRoom.board = generateEmptyBoard();
    targetRoom.currentTurnIndex = 0;
    targetRoom.meldStatus.clear();

    // Inicializa scores acumulados para quem ainda nao tem
    targetRoom.players.forEach(player => {
      if (!targetRoom.scores.has(player.id)) {
        targetRoom.scores.set(player.id, 0);
      }
    });

    // Distribui 14 peças para cada jogador
    targetRoom.players.forEach(player => {
      player.rack = [];
      targetRoom.meldStatus.set(player.id, false);
      for (let i = 0; i < 14; i++) {
        if (targetRoom.pool.length > 0) {
          player.rack.push(targetRoom.pool.pop());
        }
      }
    });

    // Salva o estado inicial do tabuleiro do primeiro turno
    targetRoom.initialBoardState = JSON.stringify(targetRoom.board);
    // Salva também os racks iniciais
    targetRoom.initialRacks = new Map();
    targetRoom.players.forEach(p => {
      targetRoom.initialRacks.set(p.id, JSON.stringify(p.rack));
    });

    // Inicia o temporizador do primeiro turno
    startTurnTimer(targetRoom);

    broadcastRoomUpdate(targetRoom);
  });

  // Jogador atualiza a mesa em tempo real para os outros (enquanto edita no seu turno)
  socket.on('updateBoard', ({ board }) => {
    let targetRoom = null;
    for (const room of rooms.values()) {
      const activePlayer = room.players[room.currentTurnIndex];
      if (activePlayer && activePlayer.socketId === socket.id) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) return;

    // Atualiza temporariamente e envia para todos
    targetRoom.board = board;
    
    // Broadcast para todos na sala exceto quem enviou (para não travar o drag do cliente)
    socket.to(targetRoom.id).emit('boardUpdated', { board: targetRoom.board });
  });

  // Comprar peça (se o jogador não puder ou não quiser jogar)
  socket.on('drawTile', () => {
    let targetRoom = null;
    let player = null;

    for (const room of rooms.values()) {
      const activePlayer = room.players[room.currentTurnIndex];
      if (activePlayer && activePlayer.socketId === socket.id) {
        targetRoom = room;
        player = activePlayer;
        break;
      }
    }

    if (!targetRoom || !player) {
      socket.emit('errorMsg', 'Não é o seu turno.');
      return;
    }

    // Se o jogador manipulou a mesa e tentou comprar, precisamos resetar a mesa para o estado original do início do turno
    // antes de dar a peça para ele e passar o turno.
    if (targetRoom.initialBoardState) {
      targetRoom.board = JSON.parse(targetRoom.initialBoardState);
      const originalRackStr = targetRoom.initialRacks.get(player.id);
      if (originalRackStr) {
        player.rack = JSON.parse(originalRackStr);
      }
    }

    if (targetRoom.pool.length > 0) {
      const newTile = targetRoom.pool.pop();
      player.rack.push(newTile);
      socket.emit('infoMsg', `Você comprou: ${newTile.isJoker ? 'Coringa' : newTile.value + ' ' + newTile.color}`);
    } else {
      socket.emit('infoMsg', 'O monte está vazio! Nenhuma peça comprada.');
    }

    // Parar o timer do turno antigo
    if (targetRoom.turnTimer) {
      clearTimeout(targetRoom.turnTimer);
    }

    // Passar turno
    targetRoom.currentTurnIndex = (targetRoom.currentTurnIndex + 1) % targetRoom.players.length;
    
    // Salvar novos estados para o próximo turno
    targetRoom.initialBoardState = JSON.stringify(targetRoom.board);
    targetRoom.initialRacks = new Map();
    targetRoom.players.forEach(p => {
      targetRoom.initialRacks.set(p.id, JSON.stringify(p.rack));
    });

    // Iniciar timer do novo turno
    startTurnTimer(targetRoom);

    broadcastRoomUpdate(targetRoom);
  });

  // Desfazer jogadas do turno atual
  socket.on('undoTurn', () => {
    let targetRoom = null;
    let player = null;

    for (const room of rooms.values()) {
      const activePlayer = room.players[room.currentTurnIndex];
      if (activePlayer && activePlayer.socketId === socket.id) {
        targetRoom = room;
        player = activePlayer;
        break;
      }
    }

    if (!targetRoom || !player) {
      socket.emit('errorMsg', 'Não é o seu turno.');
      return;
    }

    // Restaura a mesa e o suporte
    if (targetRoom.initialBoardState) {
      targetRoom.board = JSON.parse(targetRoom.initialBoardState);
      const originalRackStr = targetRoom.initialRacks.get(player.id);
      if (originalRackStr) {
        player.rack = JSON.parse(originalRackStr);
      }
    }

    broadcastRoomUpdate(targetRoom);
  });

  // Finalizar Turno
  socket.on('endTurn', ({ board, rack }) => {
    let targetRoom = null;
    let player = null;

    for (const room of rooms.values()) {
      const activePlayer = room.players[room.currentTurnIndex];
      if (activePlayer && activePlayer.socketId === socket.id) {
        targetRoom = room;
        player = activePlayer;
        break;
      }
    }

    if (!targetRoom || !player) {
      socket.emit('errorMsg', 'Não é o seu turno.');
      return;
    }

    // 1. Validar estrutura e conexões da mesa
    const validation = validateBoardState(board, targetRoom.settings);
    if (!validation.valid) {
      socket.emit('errorMsg', validation.error);
      return;
    }

    // 2. Verificar se o jogador jogou de fato alguma peça
    // Compara o rack original com o enviado. Deve haver MENOS peças no rack enviado.
    const originalRack = JSON.parse(targetRoom.initialRacks.get(player.id));
    
    // Contagem de ID de peças
    const origMap = new Map();
    originalRack.forEach(t => origMap.set(t.id, (origMap.get(t.id) || 0) + 1));
    const newMap = new Map();
    rack.forEach(t => newMap.set(t.id, (newMap.get(t.id) || 0) + 1));

    // Garante que o jogador não adicionou nenhuma peça que não possuía originalmente (ex: roubada da mesa)
    for (const id of newMap.keys()) {
      if (!origMap.has(id)) {
        socket.emit('errorMsg', 'Erro: Seu suporte contém peças inválidas que pertencem à mesa.');
        return;
      }
    }

    let tilesPlaced = [];
    for (const [id, count] of origMap.entries()) {
      const newCount = newMap.get(id) || 0;
      if (newCount < count) {
        // Esta peça foi colocada na mesa
        const tile = originalRack.find(t => t.id === id);
        for (let k = 0; k < (count - newCount); k++) {
          tilesPlaced.push(tile);
        }
      } else if (newCount > count) {
        // Jogador tentou adicionar ao seu suporte uma peça que não tinha!
        socket.emit('errorMsg', 'Erro: Seu suporte contém peças inválidas.');
        return;
      }
    }

    if (tilesPlaced.length === 0) {
      socket.emit('errorMsg', 'Você não jogou nenhuma peça. Compre uma peça ou desfaça suas jogadas.');
      return;
    }

    // 3. Validação do Meld Inicial (Mínimo de 30 pontos)
    const hasMeld = targetRoom.meldStatus.get(player.id);
    if (!hasMeld) {
      // Regra de Meld Inicial: o jogador deve formar um ou mais conjuntos na mesa usando APENAS suas próprias peças, 
      // e estes conjuntos devem somar pelo menos 30 pontos. Ele não pode ter manipulado outras peças da mesa.
      
      // Para validar isso:
      // A. A mesa original deve ser igual à mesa atual nas células que já continham peças.
      // Ou seja, o jogador não pode ter movido ou modificado nenhuma peça que já estava na mesa.
      const initialBoard = JSON.parse(targetRoom.initialBoardState);
      let manipulatedExisting = false;

      for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
          const initTile = initialBoard[r][c];
          const newTile = board[r][c];
          if (initTile !== null) {
            // Se havia uma peça e agora ela mudou de posição ou sumiu
            if (newTile === null || initTile.id !== newTile.id) {
              manipulatedExisting = true;
              break;
            }
          }
        }
        if (manipulatedExisting) break;
      }

      if (manipulatedExisting) {
        socket.emit('errorMsg', 'Para o Meld Inicial (primeira jogada), você não pode manipular ou usar peças que já estão na mesa.');
        return;
      }

      // B. Encontrar todos os novos segmentos contendo as novas peças jogadas e calcular sua pontuação
      const segments = getBoardSegments(board);
      let meldPoints = 0;
      let allNewSegmentsValid = true;

      for (const segment of segments) {
        // Verifica se este segmento contém alguma peça que acabou de ser jogada
        const hasNewTiles = segment.some(item => {
          const initTile = initialBoard[item.r][item.c];
          return initTile === null;
        });

        if (hasNewTiles) {
          // Se o segmento tem novas peças, no Meld Inicial, ele deve conter APENAS peças novas 
          // (visto que não pode usar peças existentes)
          const hasOldTiles = segment.some(item => {
            const initTile = initialBoard[item.r][item.c];
            return initTile !== null;
          });

          if (hasOldTiles) {
            allNewSegmentsValid = false;
            break;
          }

          // Calcular os pontos deste conjunto
          const isG = checkGroup(segment);
          const isR = checkRun(segment);
          
          let segmentPoints = 0;
          segment.forEach(item => {
            segmentPoints += getTilePoints(item, segment, isR);
          });
          meldPoints += segmentPoints;
        }
      }

      if (!allNewSegmentsValid) {
        socket.emit('errorMsg', 'Meld Inicial inválido: Você misturou suas peças com peças da mesa.');
        return;
      }

      const minMeld = targetRoom.settings ? targetRoom.settings.minMeldPoints : 30;
      if (meldPoints < minMeld) {
        socket.emit('errorMsg', `Meld Inicial insuficiente. Seus conjuntos somaram ${meldPoints} pontos, mas são necessários no mínimo ${minMeld}.`);
        return;
      }

      // Meld bem sucedido!
      targetRoom.meldStatus.set(player.id, true);
      socket.emit('infoMsg', `Meld Inicial aceito! (${meldPoints} pontos).`);
    }

    // Se passou em todas as validações:
    // Salva o novo estado
    targetRoom.board = board;
    player.rack = rack;

    // Parar o timer do turno antigo
    if (targetRoom.turnTimer) {
      clearTimeout(targetRoom.turnTimer);
      targetRoom.turnTimer = null;
      targetRoom.turnExpiresAt = null;
    }

    // Verificar se o jogador venceu
    if (player.rack.length === 0) {
      const scores = calculateGameOverScores(targetRoom, player.id);
      io.to(targetRoom.id).emit('gameOver', { winnerName: player.name, scores });
      targetRoom.gameStarted = false; // Reseta status do jogo
      broadcastRoomUpdate(targetRoom);
      return;
    }

    // Passar turno
    targetRoom.currentTurnIndex = (targetRoom.currentTurnIndex + 1) % targetRoom.players.length;

    // Salvar novos estados iniciais
    targetRoom.initialBoardState = JSON.stringify(targetRoom.board);
    targetRoom.initialRacks = new Map();
    targetRoom.players.forEach(p => {
      targetRoom.initialRacks.set(p.id, JSON.stringify(p.rack));
    });

    // Iniciar o timer do novo turno
    startTurnTimer(targetRoom);

    broadcastRoomUpdate(targetRoom);
  });

  // Chat da partida
  socket.on('sendChat', ({ msg }) => {
    let targetRoom = null;
    let senderPlayer = null;
    for (const room of rooms.values()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        targetRoom = room;
        senderPlayer = player;
        break;
      }
    }
    if (targetRoom && senderPlayer) {
      io.to(targetRoom.id).emit('chatMsg', { senderName: senderPlayer.name, msg });
    }
  });

  // Reações Rápidas
  socket.on('sendReaction', ({ emoji }) => {
    let targetRoom = null;
    let senderPlayer = null;
    for (const room of rooms.values()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        targetRoom = room;
        senderPlayer = player;
        break;
      }
    }
    if (targetRoom && senderPlayer) {
      io.to(targetRoom.id).emit('reaction', { senderName: senderPlayer.name, emoji });
    }
  });

  // Desconexão
  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);

    // Procurar salas onde o jogador estava
    for (const [code, room] of rooms.entries()) {
      const idx = room.players.findIndex(p => p.socketId === socket.id);
      if (idx !== -1) {
        const wasHost = room.players[idx].host;
        const playerName = room.players[idx].name;
        
        room.players.splice(idx, 1);
        room.meldStatus.delete(socket.id);
        room.scores.delete(socket.id);

        if (room.players.length === 0) {
          // Excluir sala se vazia
          if (room.turnTimer) {
            clearTimeout(room.turnTimer);
          }
          rooms.delete(code);
        } else {
          // Se o host saiu, repassa o host para o primeiro jogador humano da lista
          if (wasHost) {
            const firstHuman = room.players.find(p => !p.isBot);
            if (firstHuman) {
              firstHuman.host = true;
            }
          }

          // Se o jogo estava rodando e o jogador cujo turno era o atual saiu
          if (room.gameStarted) {
            // Se sobrar apenas 1 jogador, encerra o jogo por W.O.
            if (room.players.length < 2) {
              if (room.turnTimer) {
                clearTimeout(room.turnTimer);
                room.turnTimer = null;
                room.turnExpiresAt = null;
              }
              room.gameStarted = false;
              io.to(room.id).emit('infoMsg', 'Jogadores insuficientes. O jogo foi encerrado.');
            } else {
              // Limpar o timer e recalcular turno se quem saiu era o jogador atual
              const wasActivePlayerTurn = room.currentTurnIndex === idx;
              if (wasActivePlayerTurn) {
                if (room.turnTimer) {
                  clearTimeout(room.turnTimer);
                }
                
                if (room.currentTurnIndex >= room.players.length) {
                  room.currentTurnIndex = 0;
                }
                
                room.initialBoardState = JSON.stringify(room.board);
                room.initialRacks = new Map();
                room.players.forEach(p => {
                  room.initialRacks.set(p.id, JSON.stringify(p.rack));
                });
                
                startTurnTimer(room);
              } else {
                // Se saiu outro jogador, ajustamos o índice do turno caso ele seja maior que a nova quantidade
                if (room.currentTurnIndex >= room.players.length) {
                  room.currentTurnIndex = 0;
                }
              }
            }
          }

          broadcastRoomUpdate(room);
          io.to(code).emit('infoMsg', `${playerName} saiu do jogo.`);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

function startServer(port) {
  httpServer.listen(port, () => {
    console.log(`Servidor rodando localmente em: http://localhost:${port}`);
    // Atualiza a URL do IP local com a porta final obtida
    const localIp = getLocalIpAddress();
    tunnelUrl = `http://${localIp}:${port}`;
    console.log(`Compartilhamento na rede local: ${tunnelUrl}`);

    // Iniciar o túnel SSH do localhost.run apenas se não estiver em produção e fora do Render
    const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
    if (!isProduction && process.env.DISABLE_TUNNEL !== 'true') {
      startLocalhostRunTunnel(port);
    } else {
      console.log('Ambiente de produção ativo ou ambiente Render detectado. Ignorando inicialização do localhost.run.');
    }
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Porta ${port} ocupada. Tentando a porta ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Erro no servidor:', err);
    }
  });
}

startServer(PORT);

function startLocalhostRunTunnel(port) {
  console.log('Iniciando conexao SSH com localhost.run...');
  // O parametro nokey@localhost.run permite conexao anonima
  const sshProcess = exec(`ssh -o StrictHostKeyChecking=no -R 80:localhost:${port} nokey@localhost.run`);

  sshProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[localhost.run]: ${output.trim()}`);

    // Captura URLs https://*.lhr.life no output do stdout
    const match = output.match(/https:\/\/[a-zA-Z0-9.-]+\.lhr\.life/);
    if (match) {
      tunnelUrl = match[0];
      console.log(`>>> Tunnel publico (localhost.run) ativo em: ${tunnelUrl}`);

      // Atualiza os clientes conectados na hora
      for (const room of rooms.values()) {
        broadcastRoomUpdate(room);
      }
    }
  });

  sshProcess.stderr.on('data', (data) => {
    const errOutput = data.toString();
    console.warn(`[localhost.run Warning]: ${errOutput.trim()}`);
  });

  sshProcess.on('close', (code) => {
    console.log(`Conexao com localhost.run fechada (codigo: ${code}). Tentando reconectar em 10 segundos...`);
    // Retorna para o IP local
    tunnelUrl = `http://${getLocalIpAddress()}:${port}`;
    for (const room of rooms.values()) {
      broadcastRoomUpdate(room);
    }

    setTimeout(() => {
      startLocalhostRunTunnel(port);
    }, 10000);
  });
}
