import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

/* =========================================================
   Firebase
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyDfLVi-Pn-txPql4-jq5SeyCSNZoB5i5d4",
  authDomain: "bonenkai-quiz.firebaseapp.com",
  databaseURL: "https://bonenkai-quiz-default-rtdb.firebaseio.com",
  projectId: "bonenkai-quiz",
  storageBucket: "bonenkai-quiz.firebasestorage.app",
  messagingSenderId: "1098766456590",
  appId: "1:1098766456590:web:6dd79790d75584c17c695f",
  measurementId: "G-JG20V7J6CB",
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

/* =========================================================
   ゲーム設定
========================================================= */

const ROOM_NAME = "bonenkai";

// 1問の制限時間（秒）
const TIME_LIMIT_SECONDS = 10;

// 選択肢に表示するアルファベット
const CHOICE_LETTERS = ["A", "B", "C", "D"];

/* =========================================================
   Firebaseの部屋
========================================================= */

const roomReference = ref(database, `rooms/${ROOM_NAME}`);

/* =========================================================
   HTML要素
========================================================= */

const elements = {
  participantCount: document.getElementById("participantCount"),
  participantList: document.getElementById("participantList"),

  questionNumber: document.getElementById("questionNumber"),
  questionText: document.getElementById("questionText"),
  currentChoices: document.getElementById("currentChoices"),
  answeredCount: document.getElementById("answeredCount"),
  timer: document.getElementById("timer"),

  startButton: document.getElementById("startBtn"),
  nextButton: document.getElementById("nextBtn"),
  finalButton: document.getElementById("finalBtn"),
  resetButton: document.getElementById("resetBtn"),

  finalPanel: document.getElementById("finalPanel"),
  finalResults: document.getElementById("finalResults"),
};

/* =========================================================
   現在の状態
========================================================= */

let roomData = null;
let questionTimer = null;

/* =========================================================
   問題データ
========================================================= */

const QUIZ_DATA = [
  {
    question: "日本で一番高い山は？",
    choices: ["富士山", "北岳", "奥穂高岳", "槍ヶ岳"],
    answer: 0,
  },
  {
    question: "1年は通常何日？",
    choices: ["360日", "365日", "366日", "364日"],
    answer: 1,
  },
  {
    question: "ビールの原料として使われるものは？",
    choices: ["ホップ", "わさび", "海苔", "こんにゃく"],
    answer: 0,
  },
  {
    question: "「乾杯」の英語として最も一般的なのは？",
    choices: ["Cheers!", "Hello!", "Thanks!", "Good luck!"],
    answer: 0,
  },
];

/* =========================================================
   共通処理
========================================================= */

/**
 * HTMLに表示する文字を安全な形に変換する
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const escapedCharacters = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return escapedCharacters[character];
  });
}

/**
 * Firebaseに保存されている参加者を配列として取得する
 */
function getParticipants() {
  const participantData = roomData?.participants || {};

  return Object.entries(participantData).map(
    ([participantId, participant]) => ({
      id: participantId,
      ...participant,
    }),
  );
}

/**
 * 指定した要素を表示する
 */
function showElement(element) {
  element.classList.remove("hidden");
}

/**
 * 指定した要素を非表示にする
 */
function hideElement(element) {
  element.classList.add("hidden");
}

/* =========================================================
   参加者表示
========================================================= */

/**
 * 参加者一覧を画面に表示する
 */
function renderParticipants() {
  const participants = getParticipants();

  elements.participantCount.textContent = participants.length;

  // 参加者がいない場合
  if (participants.length === 0) {
    elements.participantList.className = "participant-list empty";

    elements.participantList.textContent = "参加者を待っています…";

    return;
  }

  // 参加者がいる場合
  elements.participantList.className = "participant-list";

  elements.participantList.innerHTML = participants
    .map((participant) => {
      return `
        <span class="participant-chip">
          👤 ${escapeHtml(participant.name)}
        </span>
      `;
    })
    .join("");
}

/* =========================================================
   問題表示
========================================================= */

/**
 * 現在の問題を取得する
 */
function getCurrentQuestion() {
  const questionIndex = roomData?.currentQuestion;

  if (questionIndex == null || questionIndex < 0) {
    return null;
  }

  return roomData?.questions?.[questionIndex] || null;
}

/**
 * 選択肢のHTMLを作る
 */
function createChoicesHtml(question) {
  return question.choices
    .map((choice, index) => {
      const letter = CHOICE_LETTERS[index];

      // 正解を表示する状態なら、正解の選択肢にクラスを付ける
      const isCorrectChoice = roomData.revealed && index === question.answer;

      const correctClass = isCorrectChoice ? "correct-choice" : "";

      return `
        <div class="host-choice ${correctClass}">
          <span class="choice-letter">${letter}</span>
          <span>${escapeHtml(choice)}</span>
        </div>
      `;
    })
    .join("");
}

/**
 * 現在の問題に何人回答したかを取得する
 */
function getAnsweredParticipants(questionIndex) {
  return getParticipants().filter(
    (participant) => participant.answers?.[questionIndex],
  );
}

/**
 * 現在の問題画面を表示する
 */
function renderQuestionScreen() {
  const questionIndex = roomData.currentQuestion;
  const question = getCurrentQuestion();

  // 問題が存在しない場合
  if (!question) {
    renderLobbyScreen();
    return;
  }

  elements.questionNumber.textContent = `QUESTION ${questionIndex + 1} / ${roomData.questions.length}`;

  elements.questionText.textContent = question.question;

  elements.currentChoices.innerHTML = createChoicesHtml(question);

  const answeredParticipants = getAnsweredParticipants(questionIndex);

  const totalParticipants = getParticipants().length;

  elements.answeredCount.textContent = `${answeredParticipants.length} / ${totalParticipants}`;

  // ボタンの状態を更新
  updateQuestionButtons(questionIndex, answeredParticipants.length);
}

/**
 * 問題画面のボタン状態を更新する
 */
function updateQuestionButtons(questionIndex, answeredCount) {
  const questionIsFinished = roomData.revealed;

  // ゲーム開始ボタン
  hideElement(elements.startButton);

  // 次の問題ボタン
  const isLastQuestion = questionIndex >= roomData.questions.length - 1;

  const canGoToNextQuestion = questionIsFinished && !isLastQuestion;

  if (canGoToNextQuestion) {
    showElement(elements.nextButton);
  } else {
    hideElement(elements.nextButton);
  }

  // 最終結果ボタン
  const canShowFinalResult = questionIsFinished && isLastQuestion;

  if (canShowFinalResult) {
    showElement(elements.finalButton);
  } else {
    hideElement(elements.finalButton);
  }
}

/* =========================================================
   待機画面
========================================================= */

function renderLobbyScreen() {
  elements.questionNumber.textContent = "LOBBY";

  elements.questionText.textContent = "ゲーム開始待ち";

  elements.currentChoices.innerHTML = "";

  elements.answeredCount.textContent = `0 / ${getParticipants().length}`;

  showElement(elements.startButton);

  hideElement(elements.nextButton);
  hideElement(elements.finalButton);
}

/* =========================================================
   ゲーム終了画面
========================================================= */

function renderFinishedScreen() {
  stopQuestionTimer();

  elements.questionNumber.textContent = "FINISH";

  elements.questionText.textContent = "全問終了！";

  elements.currentChoices.innerHTML = "";

  elements.answeredCount.textContent = "";

  hideElement(elements.startButton);
  hideElement(elements.nextButton);
  hideElement(elements.finalButton);
}

/* =========================================================
   タイマー
========================================================= */

/**
 * 問題タイマーを停止する
 */
function stopQuestionTimer() {
  if (questionTimer) {
    clearInterval(questionTimer);
    questionTimer = null;
  }
}

/**
 * 問題タイマーを開始する
 */
function startQuestionTimer() {
  stopQuestionTimer();

  // タイマーを開始できる状態か確認
  const canStartTimer =
    roomData &&
    roomData.status === "question" &&
    !roomData.revealed &&
    roomData.questionStartedAt;

  if (!canStartTimer) {
    return;
  }

  const questionStartedAt = roomData.questionStartedAt;

  questionTimer = setInterval(() => {
    const elapsedSeconds = (Date.now() - questionStartedAt) / 1000;

    const remainingSeconds = Math.max(0, TIME_LIMIT_SECONDS - elapsedSeconds);

    elements.timer.textContent = `${remainingSeconds.toFixed(1)}s`;

    if (elapsedSeconds >= TIME_LIMIT_SECONDS) {
      stopQuestionTimer();
      closeCurrentQuestion();
      elements.timer.textContent = '';
    }
  }, 100);
}

/* =========================================================
   最終結果
========================================================= */

/**
 * 参加者全員の最終成績を計算する
 *
 * 順位のルール：
 * ① 正答率が高い
 * ② 正答率が同じなら総回答時間が短い
 * ③ それでも同じなら正解数が多い
 */
function calculateFinalRanking() {
  const questions = roomData.questions || [];
  const participants = getParticipants();

  const ranking = participants.map((participant) => {
    let correctCount = 0;
    let totalAnswerTime = 0;

    questions.forEach((question, questionIndex) => {
      const answer = participant.answers?.[questionIndex];

      // 回答していない問題は計算しない
      if (!answer) {
        return;
      }

      totalAnswerTime += Number(answer.elapsedMs || 0);

      if (answer.choice === question.answer) {
        correctCount++;
      }
    });

    const accuracy = questions.length > 0 ? correctCount / questions.length : 0;

    return {
      ...participant,
      correctCount,
      totalAnswerTime,
      accuracy,
    };
  });

  ranking.sort((participantA, participantB) => {
    // ① 正答率が高い順
    if (participantA.accuracy !== participantB.accuracy) {
      return participantB.accuracy - participantA.accuracy;
    }

    // ② 総回答時間が短い順
    if (participantA.totalAnswerTime !== participantB.totalAnswerTime) {
      return participantA.totalAnswerTime - participantB.totalAnswerTime;
    }

    // ③ 正解数が多い順
    return participantB.correctCount - participantA.correctCount;
  });

  return ranking;
}

/**
 * 優勝者のHTMLを作る
 */
function createWinnerHtml(winner, totalQuestions) {
  const accuracyPercent = (winner.accuracy * 100).toFixed(0);

  const totalAnswerSeconds = (winner.totalAnswerTime / 1000).toFixed(2);

  return `
    <div class="winner-card">
      <div class="winner-crown">🏆</div>

      <div class="step">
        WINNER
      </div>

      <h3>
        ${escapeHtml(winner.name)} さん
      </h3>

      <div class="winner-stats">
        <span>
          正答率
          <b>${accuracyPercent}%</b>
        </span>

        <span>
          正解
          <b>${winner.correctCount}/${totalQuestions}</b>
        </span>

        <span>
          総回答時間
          <b>${totalAnswerSeconds}秒</b>
        </span>
      </div>
    </div>
  `;
}

/**
 * ランキング1行分のHTMLを作る
 */
function createRankingRowHtml(participant, rankingPosition, totalQuestions) {
  const accuracyPercent = (participant.accuracy * 100).toFixed(0);

  const totalAnswerSeconds = (participant.totalAnswerTime / 1000).toFixed(2);

  return `
    <div class="rank-row">
      <b>${rankingPosition}位</b>

      <strong>
        ${escapeHtml(participant.name)}
      </strong>

      <span>
        ${accuracyPercent}%
        （${participant.correctCount}/${totalQuestions}）
      </span>

      <span>
        ${totalAnswerSeconds}秒
      </span>
    </div>
  `;
}

/**
 * 最終結果を管理者画面に表示する
 */
function renderFinalResults() {
  const ranking = calculateFinalRanking();

  showElement(elements.finalPanel);

  // 参加者がいない場合
  if (ranking.length === 0) {
    elements.finalResults.innerHTML = "<p class='muted'>参加者はいません。</p>";

    return;
  }

  const winner = ranking[0];
  const totalQuestions = roomData.questions.length;

  // 優勝者
  const winnerHtml = createWinnerHtml(winner, totalQuestions);

  // 全員のランキング
  const rankingHtml = ranking
    .map((participant, index) => {
      const rankingPosition = index + 1;

      return createRankingRowHtml(participant, rankingPosition, totalQuestions);
    })
    .join("");

  elements.finalResults.innerHTML = `
    ${winnerHtml}

    <div class="ranking">
      ${rankingHtml}
    </div>

    <p class="result-note">
      順位は「正答率」→同率なら
      「全回答のトータル回答時間（短い順）」で決定します。
    </p>
  `;
}

/* =========================================================
   Firebaseの部屋を準備
========================================================= */

/**
 * Firebaseにゲーム部屋が存在するか確認する
 *
 * 初回の場合は部屋を作る。
 * すでに存在する場合は問題データだけ最新にする。
 */
async function ensureRoomExists() {
  const snapshot = await get(roomReference);

  // 初回：部屋を新しく作る
  if (!snapshot.exists()) {
    await set(roomReference, {
      status: "lobby",
      currentQuestion: -1,
      questionStartedAt: null,
      revealed: false,
      questions: QUIZ_DATA,
      participants: {},
      previousAnswers: null,
    });

    return;
  }

  // 既存の部屋：問題だけ更新する
  await update(roomReference, {
    questions: QUIZ_DATA,
  });
}

/* =========================================================
   ゲーム操作
========================================================= */

/**
 * ゲームを開始する
 */
async function startGame() {
  await update(roomReference, {
    status: "question",
    currentQuestion: 0,
    questionStartedAt: serverTimestamp(),
    revealed: false,
    previousAnswers: null,
  });
}

/**
 * 現在の問題を終了する
 */
async function closeCurrentQuestion() {
  // すでに終了している場合は何もしない
  if (!roomData || roomData.revealed || roomData.currentQuestion < 0) {
    return;
  }

  const questionIndex = roomData.currentQuestion;

  const question = roomData.questions[questionIndex];

  const answerSnapshot = {};

  getParticipants().forEach((participant) => {
    const answer = participant.answers?.[questionIndex];

    // 回答していない参加者は記録しない
    if (!answer) {
      return;
    }

    answerSnapshot[participant.id] = {
      name: participant.name,
      choice: answer.choice,
      elapsedMs: answer.elapsedMs,
      correct: answer.choice === question.answer,
    };
  });

  await update(roomReference, {
    status: "result",
    revealed: true,
    previousAnswers: {
      questionIndex,
      answers: answerSnapshot,
    },
  });
}

/**
 * 次の問題へ進む
 */
async function goToNextQuestion() {
  const currentQuestionIndex = roomData.currentQuestion;

  const nextQuestionIndex = currentQuestionIndex + 1;

  // これ以上問題がない場合
  if (nextQuestionIndex >= roomData.questions.length) {
    return;
  }

  await update(roomReference, {
    status: "question",
    currentQuestion: nextQuestionIndex,
    questionStartedAt: serverTimestamp(),
    revealed: false,
  });
}

/**
 * 最終結果を表示する
 */
async function showFinalResults() {
  await update(roomReference, {
    status: "final",
    revealed: true,
  });
}

/**
 * ゲームを最初からリセットする
 */
async function resetGame() {
  const shouldReset = confirm(
    "参加者・回答・進行状況をすべてリセットしますか？",
  );

  if (!shouldReset) {
    return;
  }

  stopQuestionTimer();

  await set(roomReference, {
    status: "lobby",
    currentQuestion: -1,
    questionStartedAt: null,
    revealed: false,
    questions: QUIZ_DATA,
    participants: {},
    previousAnswers: null,
  });
}

/* =========================================================
   ボタン操作
========================================================= */

elements.startButton.addEventListener("click", startGame);

elements.nextButton.addEventListener("click", goToNextQuestion);

elements.finalButton.addEventListener("click", showFinalResults);

elements.resetButton.addEventListener("click", resetGame);

/* =========================================================
   画面全体の更新
========================================================= */

function renderAdminScreen() {
  if (!roomData) {
    return;
  }

  renderParticipants();

  switch (roomData.status) {
    case "lobby":
      stopQuestionTimer();
      hideElement(elements.finalPanel);
      renderLobbyScreen();
      break;

    case "question":
      hideElement(elements.finalPanel);
      renderQuestionScreen();
      startQuestionTimer();
      break;

    case "result":
      stopQuestionTimer();
      hideElement(elements.finalPanel);
      renderQuestionScreen();
      break;

    case "final":
      renderFinishedScreen();
      renderFinalResults();
      break;

    default:
      stopQuestionTimer();
      hideElement(elements.finalPanel);
      renderLobbyScreen();
      break;
  }
}

/* =========================================================
   Firebaseのリアルタイム監視
========================================================= */

await ensureRoomExists();

onValue(roomReference, (snapshot) => {
  roomData = snapshot.val();

  renderAdminScreen();
});
