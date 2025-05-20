// 4목 게임 AI (Connect Four AI) 웹 워커

// 상수 정의
const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const PLAYER = 1; // 사람 플레이어 (HUM)
const AI = 2; // 컴퓨터 AI

// 난이도별 설정 (난이도 상향 및 5단계 성능 최적화)
const DIFFICULTY_SETTINGS = {
  1: {
    // 쉬움
    maxDepth: 2,
    randomFactor: 0.35,
    evaluationLevel: "basic",
    lookAhead: 1,
  },
  2: {
    // 보통
    maxDepth: 3,
    randomFactor: 0.2,
    evaluationLevel: "basic",
    lookAhead: 2,
  },
  3: {
    // 어려움 (20% 상향)
    maxDepth: 5,
    randomFactor: 0.08,
    evaluationLevel: "advanced",
    lookAhead: 3,
  },
  4: {
    // 전문가 (30% 상향)
    maxDepth: 6,
    randomFactor: 0.03,
    evaluationLevel: "advanced",
    trapWeight: 1.3,
    lookAhead: 4,
  },
  5: {
    // 마스터 (50% 상향, 성능 최적화)
    maxDepth: 6, // 7에서 6으로 감소하여 성능 향상
    randomFactor: 0,
    evaluationLevel: "full",
    trapWeight: 1.5,
    lookAhead: 5, // 6에서 5로 감소
    timeLimit: 600, // 시간 제한 추가 (600ms)
  },
};

// 트랜스포지션 테이블 (캐싱)
const transpositionTable = new Map();
const MAX_TABLE_SIZE = 15000; // 메모리 사용 증가

// 전략적 패턴 인식 (고급 난이도용)
const PATTERNS = {
  // 함정 패턴: 두 위치에서 동시에 승리할 수 있는 상황 만들기
  FORK: {
    score: 500,
    check: (board, col, row, player) => {
      // 포크 패턴 확인 로직
      return countWinningMoves(board, player) >= 2;
    },
  },
  // 대각선 패턴: 대각선 연결은 방어하기 어려움
  DIAGONAL: {
    score: 150,
    check: (board, col, row, player) => {
      // 대각선 확인 로직
      const diag1 =
        countInDirection(board, col, row, 1, 1, player) +
        countInDirection(board, col, row, -1, -1, player) -
        1;
      const diag2 =
        countInDirection(board, col, row, 1, -1, player) +
        countInDirection(board, col, row, -1, 1, player) -
        1;
      return Math.max(diag1, diag2) >= 3;
    },
  },
  // 중앙 지배: 중앙 열 확보 전략
  CENTER_CONTROL: {
    score: 70,
    check: (board, col, row, player) => {
      const centerCol = Math.floor(COLS / 2);
      return col === centerCol && row <= 3;
    },
  },
};

// 웹 워커 메시지 핸들러
self.onmessage = function (e) {
  const { type, board, difficulty } = e.data;

  switch (type) {
    case "GET_MOVE":
      // 최적의 이동 계산 (인위적인 딜레이 없이 바로 계산 시작)
      const bestMove = findBestMove(board, difficulty);

      // 결과 전송 (UI에서 2초 딜레이 처리)
      self.postMessage({
        column: bestMove,
      });
      break;

    case "RESET":
      // 트랜스포지션 테이블 초기화
      transpositionTable.clear();
      break;
  }
};

/**
 * 방향별 연속된 돌 개수 세기
 */
function countInDirection(board, col, row, dCol, dRow, player) {
  let count = 1; // 시작 위치 포함
  let currentCol = col + dCol;
  let currentRow = row + dRow;

  // 한쪽 방향 확인
  while (
    currentCol >= 0 &&
    currentCol < COLS &&
    currentRow >= 0 &&
    currentRow < ROWS &&
    board[currentCol][currentRow] === player
  ) {
    count++;
    currentCol += dCol;
    currentRow += dRow;
  }

  return count;
}

/**
 * 가능한 승리 위치 개수 세기 (포크 패턴용)
 */
function countWinningMoves(board, player) {
  let winCount = 0;

  for (let col = 0; col < COLS; col++) {
    const row = getNextEmptyRow(board, col);
    if (row === -1) continue;

    // 이동 시뮬레이션
    const boardCopy = copyBoard(board);
    boardCopy[col][row] = player;

    // 이 수로 승리 가능한지 확인
    if (checkWin(boardCopy, col, row, player)) {
      winCount++;
    }
  }

  return winCount;
}

/**
 * 난이도에 따라 최적의 이동 찾기
 */
function findBestMove(board, difficulty) {
  // 난이도 설정 가져오기 (기본값: 난이도 3)
  const settings = DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS[3];

  // 1. 즉시 승리 확인 (항상 우선적으로 선택)
  const winningMove = findWinningMove(board, AI);
  if (winningMove !== -1) {
    return winningMove;
  }

  // 2. 즉시 패배 방지 (방어)
  const blockingMove = findWinningMove(board, PLAYER);
  if (blockingMove !== -1) {
    // 낮은 난이도에서는 일정 확률로 방어 실패
    if (difficulty <= 2 && Math.random() < settings.randomFactor) {
      // 의도적으로 방어하지 않음
    } else {
      return blockingMove;
    }
  }

  // 3. 함정 설치 (난이도 4-5 전용)
  if (difficulty >= 4 && settings.trapWeight) {
    const trapMove = findTrapMove(board, settings.trapWeight);
    if (trapMove !== -1 && Math.random() > settings.randomFactor) {
      return trapMove;
    }
  }

  // 4. 수평 연속 위협 특별 처리 (핵심 개선 부분)
  const horizontalThreat = findHorizontalThreat(board);
  if (horizontalThreat !== -1) {
    // 모든 난이도에서 가로 위협은 높은 확률로 방어
    if (Math.random() < 0.95 - settings.randomFactor) {
      return horizontalThreat;
    }
  }

  // 5. N수 앞 위협 탐색 (lookahead - 난이도에 따라 증가)
  if (settings.lookAhead > 1) {
    const futureWin = findFutureWin(board, settings.lookAhead);
    if (futureWin !== -1 && Math.random() > settings.randomFactor) {
      return futureWin;
    }
  }

  // 6. 유효한 이동 목록 확인
  const validMoves = getValidMoves(board);
  if (validMoves.length === 0) {
    return -1; // 유효한 이동이 없음
  }

  // 7. 미니맥스 알고리즘을 사용하여 최적의 이동 탐색
  const maxDepth = settings.maxDepth;
  // 중앙 컬럼 우선 탐색을 위한 이동 순서 최적화
  const orderedMoves = orderMoves(validMoves);

  // 시간 제한 설정 (난이도 5는 빠른 응답 위해 특별 처리)
  const TIME_LIMIT =
    difficulty === 5
      ? settings.timeLimit || 600 // 난이도 5는 특별 시간 제한
      : 800 + difficulty * 100; // 다른 난이도

  const startTime = Date.now();

  // 알파-베타 가지치기를 적용한 미니맥스 탐색
  let bestCol = orderedMoves[0];
  let bestValue = -Infinity;

  for (const col of orderedMoves) {
    // 시간 초과 확인
    if (Date.now() - startTime > TIME_LIMIT) {
      break;
    }

    // 이동 시뮬레이션
    const row = getNextEmptyRow(board, col);
    if (row === -1) continue;

    // 가상으로 이동 적용
    const boardCopy = copyBoard(board);
    boardCopy[col][row] = AI;

    // 미니맥스 알고리즘으로 이동 평가
    const moveValue = minimax(
      boardCopy,
      maxDepth,
      -Infinity,
      Infinity,
      false,
      startTime,
      TIME_LIMIT
    );

    // 최선의 이동 업데이트
    if (moveValue > bestValue) {
      bestValue = moveValue;
      bestCol = col;
    }
  }

  // 8. 난이도에 따른 무작위성 적용 (완벽하지 않은 AI)
  if (settings.randomFactor > 0 && Math.random() < settings.randomFactor) {
    // 낮은 난이도에서 가끔 차선책 선택
    const goodMoves = validMoves.filter((col) => {
      const row = getNextEmptyRow(board, col);
      return row !== -1 && !isBadMove(board, col, row);
    });

    if (goodMoves.length > 0) {
      return goodMoves[Math.floor(Math.random() * goodMoves.length)];
    } else {
      return validMoves[Math.floor(Math.random() * validMoves.length)];
    }
  }

  return bestCol;
}

/**
 * 나쁜 수인지 확인 (낮은 난이도에서 사용)
 */
function isBadMove(board, col, row) {
  // 상대방에게 즉시 승리 기회를 주는 수 확인
  const boardCopy = copyBoard(board);
  boardCopy[col][row] = AI;

  // 이 수를 둔 후 다음 수에 상대가 승리할 수 있는지 확인
  for (let c = 0; c < COLS; c++) {
    const r = getNextEmptyRow(boardCopy, c);
    if (r === -1) continue;

    boardCopy[c][r] = PLAYER;
    if (checkWin(boardCopy, c, r, PLAYER)) {
      return true; // 나쁜 수
    }
    boardCopy[c][r] = EMPTY;
  }

  return false;
}

/**
 * 함정 수 찾기 (고급 난이도용)
 */
function findTrapMove(board, trapWeight) {
  let bestTrapMove = -1;
  let bestTrapScore = -Infinity;

  // 모든 열에 대해 확인
  for (let col = 0; col < COLS; col++) {
    const row = getNextEmptyRow(board, col);
    if (row === -1) continue;

    // 이동 시뮬레이션
    const boardCopy = copyBoard(board);
    boardCopy[col][row] = AI;

    // 이 수를 둔 후 다음 턴에 상대가 어디에 두더라도
    // 그 다음 턴에 AI가 이길 수 있는 경우 찾기
    let trapScore = 0;
    let trapPossible = true;

    // 상대방의 모든 가능한 대응 확인
    for (let oppCol = 0; oppCol < COLS; oppCol++) {
      const oppRow = getNextEmptyRow(boardCopy, oppCol);
      if (oppRow === -1) continue;

      // 상대방 대응 시뮬레이션
      const boardCopy2 = copyBoard(boardCopy);
      boardCopy2[oppCol][oppRow] = PLAYER;

      // 상대방이 이길 수 있는지 확인
      if (checkWin(boardCopy2, oppCol, oppRow, PLAYER)) {
        trapPossible = false;
        break;
      }

      // 함정 수 확인: AI의 다음 수에 이길 수 있는 자리가 여러 곳인 경우
      const winningMoves = [];
      for (let aiCol = 0; aiCol < COLS; aiCol++) {
        const aiRow = getNextEmptyRow(boardCopy2, aiCol);
        if (aiRow === -1) continue;

        boardCopy2[aiCol][aiRow] = AI;
        if (checkWin(boardCopy2, aiCol, aiRow, AI)) {
          winningMoves.push(aiCol);
        }
        boardCopy2[aiCol][aiRow] = EMPTY;
      }

      // 승리할 수 있는 방법이 여러 개면 함정 점수 증가
      if (winningMoves.length >= 2) {
        trapScore += winningMoves.length * 100 * trapWeight;
      } else if (winningMoves.length === 0) {
        // 승리할 방법이 없으면 함정 불가능
        trapPossible = false;
        break;
      }
    }

    // 최상의 함정 수 업데이트
    if (trapPossible && trapScore > bestTrapScore) {
      bestTrapScore = trapScore;
      bestTrapMove = col;
    }
  }

  // 함정 점수가 특정 임계값 이상일 때만 사용
  return bestTrapScore > 200 * trapWeight ? bestTrapMove : -1;
}

/**
 * 미래 승리 가능성 찾기 (N수 앞 확인)
 */
function findFutureWin(board, lookAhead) {
  // 미니맥스의 축소 버전으로 몇 수 앞 승리 가능성 확인
  const validMoves = getValidMoves(board);
  let bestMove = -1;
  let bestScore = -Infinity;

  for (const col of validMoves) {
    const row = getNextEmptyRow(board, col);
    if (row === -1) continue;

    const boardCopy = copyBoard(board);
    boardCopy[col][row] = AI;

    // N수 앞 승리 가능성 탐색
    const score = evaluateFuture(boardCopy, lookAhead - 1, false);

    if (score > bestScore) {
      bestScore = score;
      bestMove = col;
    }
  }

  // 점수가 승리에 가까울 때만 반환
  return bestScore > 800 ? bestMove : -1;
}

/**
 * 미래 상태 평가 (N수 앞 확인용 보조 함수)
 */
function evaluateFuture(board, depth, isAITurn) {
  // 종료 조건
  if (depth === 0) {
    return evaluateBoard(board) * 0.8; // 미래는 불확실하므로 가중치 감소
  }

  // 게임 종료 확인
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (board[col][row] === AI && checkWin(board, col, row, AI)) {
        return 1000 * depth; // 빠른 승리일수록 높은 점수
      }
      if (board[col][row] === PLAYER && checkWin(board, col, row, PLAYER)) {
        return -1000 * depth; // 빠른 패배일수록 낮은 점수
      }
    }
  }

  const validMoves = getValidMoves(board);
  if (validMoves.length === 0) {
    return 0; // 무승부
  }

  // 계산 효율을 위해 최대 3개 열만 탐색
  const limitedMoves = validMoves
    .sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b))
    .slice(0, 3);

  if (isAITurn) {
    let maxScore = -Infinity;
    for (const col of limitedMoves) {
      const row = getNextEmptyRow(board, col);
      if (row === -1) continue;

      const boardCopy = copyBoard(board);
      boardCopy[col][row] = AI;

      const score = evaluateFuture(boardCopy, depth - 1, false);
      maxScore = Math.max(maxScore, score);
    }
    return maxScore;
  } else {
    let minScore = Infinity;
    for (const col of limitedMoves) {
      const row = getNextEmptyRow(board, col);
      if (row === -1) continue;

      const boardCopy = copyBoard(board);
      boardCopy[col][row] = PLAYER;

      const score = evaluateFuture(boardCopy, depth - 1, true);
      minScore = Math.min(minScore, score);
    }
    return minScore;
  }
}

/**
 * 미니맥스 알고리즘 (알파-베타 가지치기 적용)
 */
function minimax(
  board,
  depth,
  alpha,
  beta,
  isMaximizingPlayer,
  startTime,
  timeLimit
) {
  // 시간 초과 확인
  if (Date.now() - startTime > timeLimit) {
    return isMaximizingPlayer ? -1000000 : 1000000;
  }

  // 주기적으로 트랜스포지션 테이블 관리
  if (transpositionTable.size > MAX_TABLE_SIZE) {
    manageTranspositionTable();
  }

  // 보드 상태 캐싱 키
  const boardKey =
    boardToString(board) + depth + (isMaximizingPlayer ? "1" : "0");

  // 캐시된 값이 있으면 사용
  if (transpositionTable.has(boardKey)) {
    return transpositionTable.get(boardKey);
  }

  // 종료 조건: 게임 종료 또는 최대 깊이 도달
  if (depth === 0 || isGameOver(board)) {
    const score = evaluateBoard(board);
    transpositionTable.set(boardKey, score);
    return score;
  }

  // 유효한 이동 목록
  const validMoves = getValidMoves(board);
  if (validMoves.length === 0) {
    const score = 0; // 무승부
    transpositionTable.set(boardKey, score);
    return score;
  }

  // 이동 순서 최적화
  const orderedMoves = orderMoves(validMoves);

  if (isMaximizingPlayer) {
    let maxEval = -Infinity;

    for (const col of orderedMoves) {
      // 시간 초과 확인
      if (Date.now() - startTime > timeLimit) {
        return maxEval;
      }

      const row = getNextEmptyRow(board, col);
      if (row === -1) continue;

      // 이동 시뮬레이션
      const boardCopy = copyBoard(board);
      boardCopy[col][row] = AI;

      // 재귀적 미니맥스 호출
      const evaluation = minimax(
        boardCopy,
        depth - 1,
        alpha,
        beta,
        false,
        startTime,
        timeLimit
      );
      maxEval = Math.max(maxEval, evaluation);

      // 알파-베타 가지치기
      alpha = Math.max(alpha, maxEval);
      if (beta <= alpha) {
        break;
      }
    }

    // 결과 캐싱
    transpositionTable.set(boardKey, maxEval);
    return maxEval;
  } else {
    let minEval = Infinity;

    for (const col of orderedMoves) {
      // 시간 초과 확인
      if (Date.now() - startTime > timeLimit) {
        return minEval;
      }

      const row = getNextEmptyRow(board, col);
      if (row === -1) continue;

      // 이동 시뮬레이션
      const boardCopy = copyBoard(board);
      boardCopy[col][row] = PLAYER;

      // 재귀적 미니맥스 호출
      const evaluation = minimax(
        boardCopy,
        depth - 1,
        alpha,
        beta,
        true,
        startTime,
        timeLimit
      );
      minEval = Math.min(minEval, evaluation);

      // 알파-베타 가지치기
      beta = Math.min(beta, minEval);
      if (beta <= alpha) {
        break;
      }
    }

    // 결과 캐싱
    transpositionTable.set(boardKey, minEval);
    return minEval;
  }
}

/**
 * 다음 빈 행 찾기
 */
function getNextEmptyRow(board, col) {
  for (let row = 0; row < ROWS; row++) {
    if (board[col][row] === EMPTY) {
      return row;
    }
  }
  return -1; // 열이 가득 참
}

/**
 * 유효한 이동 목록 가져오기
 */
function getValidMoves(board) {
  const validMoves = [];
  for (let col = 0; col < COLS; col++) {
    if (getNextEmptyRow(board, col) !== -1) {
      validMoves.push(col);
    }
  }
  return validMoves;
}

/**
 * 이동 순서 최적화 (중앙에서 시작하여 바깥쪽으로)
 */
function orderMoves(moves) {
  // 중앙 열과 그 근처를 더 일찍 탐색하도록 정렬
  return [...moves].sort((a, b) => {
    const scoreA = Math.abs(3 - a); // 중앙(3)에서 열까지의 거리
    const scoreB = Math.abs(3 - b);
    return scoreA - scoreB;
  });
}

/**
 * 즉시 승리하는 이동 찾기
 */
function findWinningMove(board, player) {
  for (let col = 0; col < COLS; col++) {
    const row = getNextEmptyRow(board, col);
    if (row === -1) continue;

    // 임시로 돌 놓기
    const boardCopy = copyBoard(board);
    boardCopy[col][row] = player;

    // 승리 확인
    if (checkWin(boardCopy, col, row, player)) {
      return col;
    }
  }

  return -1; // 즉시 승리하는 이동 없음
}

/**
 * 수평 위협 감지 (3개 연속된 돌)
 */
function findHorizontalThreat(board) {
  // 가로 방향으로 3개 연속 돌 감지
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS - 3; col++) {
      // 3개 연속 수평 체크
      let playerCount = 0;
      let emptyPos = -1;

      for (let i = 0; i < 4; i++) {
        if (board[col + i][row] === PLAYER) {
          playerCount++;
        } else if (board[col + i][row] === EMPTY) {
          emptyPos = col + i;
        }
      }

      // 플레이어 돌이 3개이고 빈 칸이 1개인 경우
      if (playerCount === 3 && emptyPos !== -1) {
        // 빈 칸에 놓을 수 있는지 확인 (바닥이거나 아래 행에 돌이 있어야 함)
        if (row === 0 || (row > 0 && board[emptyPos][row - 1] !== EMPTY)) {
          return emptyPos;
        }
      }
    }
  }

  // 양 끝에서 3개 연속 수평 체크 (ex: X_XXX 또는 XXX_X 패턴)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS - 4; col++) {
      // X_XXX 패턴
      if (
        board[col][row] === PLAYER &&
        board[col + 1][row] === EMPTY &&
        board[col + 2][row] === PLAYER &&
        board[col + 3][row] === PLAYER &&
        board[col + 4][row] === PLAYER
      ) {
        // 빈 칸(col+1)에 놓을 수 있는지 확인
        if (row === 0 || (row > 0 && board[col + 1][row - 1] !== EMPTY)) {
          return col + 1;
        }
      }

      // XXX_X 패턴
      if (
        board[col][row] === PLAYER &&
        board[col + 1][row] === PLAYER &&
        board[col + 2][row] === PLAYER &&
        board[col + 3][row] === EMPTY &&
        board[col + 4][row] === PLAYER
      ) {
        // 빈 칸(col+3)에 놓을 수 있는지 확인
        if (row === 0 || (row > 0 && board[col + 3][row - 1] !== EMPTY)) {
          return col + 3;
        }
      }
    }
  }

  return -1; // 수평 위협 없음
}

/**
 * 게임에서 승리 여부 확인
 */
function checkWin(board, col, row, player) {
  // 수평 확인
  let count = 0;
  for (let c = Math.max(0, col - 3); c < Math.min(COLS, col + 4); c++) {
    if (board[c][row] === player) {
      count++;
      if (count >= 4) return true;
    } else {
      count = 0;
    }
  }

  // 수직 확인
  count = 0;
  for (let r = Math.max(0, row - 3); r < Math.min(ROWS, row + 4); r++) {
    if (board[col][r] === player) {
      count++;
      if (count >= 4) return true;
    } else {
      count = 0;
    }
  }

  // 대각선 확인 (우상향)
  count = 0;
  let startCol = col - Math.min(col, row, 3);
  let startRow = row - Math.min(col, row, 3);
  for (let i = 0; i < 7; i++) {
    const c = startCol + i;
    const r = startRow + i;
    if (c >= COLS || r >= ROWS) break;

    if (board[c][r] === player) {
      count++;
      if (count >= 4) return true;
    } else {
      count = 0;
    }
  }

  // 대각선 확인 (우하향)
  count = 0;
  startCol = col - Math.min(col, ROWS - 1 - row, 3);
  startRow = row + Math.min(col, ROWS - 1 - row, 3);
  for (let i = 0; i < 7; i++) {
    const c = startCol + i;
    const r = startRow - i;
    if (c >= COLS || r < 0) break;

    if (board[c][r] === player) {
      count++;
      if (count >= 4) return true;
    } else {
      count = 0;
    }
  }

  return false;
}

/**
 * 게임 종료 여부 확인
 */
function isGameOver(board) {
  // 승리 확인
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (board[col][row] !== EMPTY) {
        if (checkWin(board, col, row, board[col][row])) {
          return true;
        }
      }
    }
  }

  // 무승부 확인 (모든 셀이 채워짐)
  for (let col = 0; col < COLS; col++) {
    if (getNextEmptyRow(board, col) !== -1) {
      return false;
    }
  }

  return true; // 무승부
}

/**
 * 보드 평가 함수 (개선된 버전)
 */
function evaluateBoard(board) {
  let score = 0;

  // 즉시 승리/패배 상태 확인
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (board[col][row] === AI && checkWin(board, col, row, AI)) {
        return 1000000; // AI 승리
      }
      if (board[col][row] === PLAYER && checkWin(board, col, row, PLAYER)) {
        return -1000000; // AI 패배
      }
    }
  }

  // 패턴 기반 평가 (고급 전략)
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (board[col][row] === AI) {
        // AI 패턴
        for (const [patternName, pattern] of Object.entries(PATTERNS)) {
          if (pattern.check && pattern.check(board, col, row, AI)) {
            score += pattern.score;
          }
        }
      } else if (board[col][row] === PLAYER) {
        // 플레이어 패턴
        for (const [patternName, pattern] of Object.entries(PATTERNS)) {
          if (pattern.check && pattern.check(board, col, row, PLAYER)) {
            score -= pattern.score * 1.2; // 방어는 더 중요하게
          }
        }
      }
    }
  }

  // 중앙 열 선호도 (전략적으로 중요)
  const centerCol = Math.floor(COLS / 2);
  for (let row = 0; row < ROWS; row++) {
    if (board[centerCol][row] === AI) {
      score += 6;
    } else if (board[centerCol][row] === PLAYER) {
      score -= 6;
    }
  }

  // 창문 패턴 평가 (연속된 4개 위치에서 점수 계산)
  // 수평 창문
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS - 3; col++) {
      const window = [
        board[col][row],
        board[col + 1][row],
        board[col + 2][row],
        board[col + 3][row],
      ];
      score += evaluateWindow(window);
    }
  }

  // 수직 창문
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS - 3; row++) {
      const window = [
        board[col][row],
        board[col][row + 1],
        board[col][row + 2],
        board[col][row + 3],
      ];
      score += evaluateWindow(window);
    }
  }

  // 대각선 창문 (우상향)
  for (let col = 0; col < COLS - 3; col++) {
    for (let row = 0; row < ROWS - 3; row++) {
      const window = [
        board[col][row],
        board[col + 1][row + 1],
        board[col + 2][row + 2],
        board[col + 3][row + 3],
      ];
      score += evaluateWindow(window);
    }
  }

  // 대각선 창문 (우하향)
  for (let col = 0; col < COLS - 3; col++) {
    for (let row = 3; row < ROWS; row++) {
      const window = [
        board[col][row],
        board[col + 1][row - 1],
        board[col + 2][row - 2],
        board[col + 3][row - 3],
      ];
      score += evaluateWindow(window);
    }
  }

  // 수평 위협 가중치 추가 (핵심 개선 부분)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col <= COLS - 3; col++) {
      // AI의 두 개 이상 연속된 돌
      if (
        col + 2 < COLS &&
        board[col][row] === AI &&
        board[col + 1][row] === AI &&
        board[col + 2][row] === AI
      ) {
        score += 80; // 세 개 연속 보너스
      }

      // 플레이어의 두 개 이상 연속된 돌 (높은 위협)
      if (
        col + 2 < COLS &&
        board[col][row] === PLAYER &&
        board[col + 1][row] === PLAYER &&
        board[col + 2][row] === PLAYER
      ) {
        score -= 300; // 세 개 연속 큰 페널티 (방어 중시)
      }
    }
  }

  return score;
}

/**
 * 창문 패턴 평가 (개선된 버전)
 */
function evaluateWindow(window) {
  let score = 0;
  const aiCount = window.filter((cell) => cell === AI).length;
  const playerCount = window.filter((cell) => cell === PLAYER).length;
  const emptyCount = window.filter((cell) => cell === EMPTY).length;

  // 승리 가능성이 있는 패턴만 점수 부여
  if (playerCount === 0 && aiCount > 0) {
    // AI 돌만 있는 경우 (공격)
    if (aiCount === 3 && emptyCount === 1) {
      score += 150; // 승리 임박
    } else if (aiCount === 2 && emptyCount === 2) {
      score += 20; // 양호한 위치
    } else if (aiCount === 1 && emptyCount === 3) {
      score += 1; // 기본 위치
    }
  } else if (aiCount === 0 && playerCount > 0) {
    // 플레이어 돌만 있는 경우 (방어)
    if (playerCount === 3 && emptyCount === 1) {
      score -= 120; // 패배 임박, 방어 필요
    } else if (playerCount === 2 && emptyCount === 2) {
      score -= 15; // 주의 필요
    }
  }

  return score;
}

/**
 * 보드 깊은 복사
 */
function copyBoard(board) {
  return board.map((col) => [...col]);
}

/**
 * 보드를 문자열로 직렬화 (캐싱용)
 */
function boardToString(board) {
  return board.map((col) => col.join("")).join("|");
}

/**
 * 트랜스포지션 테이블 관리
 */
function manageTranspositionTable() {
  if (transpositionTable.size > MAX_TABLE_SIZE) {
    // 테이블이 너무 크면 절반 제거
    const keys = Array.from(transpositionTable.keys());
    for (let i = 0; i < keys.length / 2; i++) {
      transpositionTable.delete(keys[i]);
    }
  }
}

// 주기적으로 트랜스포지션 테이블 정리 (메모리 관리)
setInterval(manageTranspositionTable, 30000);
