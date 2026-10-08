import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
  push,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

/* =========================================================
   Firebase
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyDfLVi-Pn-txPql-jq5SeyCSNZoB5i5d4",
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

const roomReference = ref(
  database,
  `rooms/${ROOM_NAME}`,
);

/* =========================================================
   HTML要素
========================================================= */

const elements = {
  // 参加画面
  joinScreen: document.getElementById("joinScreen"),
  nickname: document.getElementById("nickname"),
  joinButton: document.getElementById("joinBtn"),
  joinError: document.getElementById("joinError"),

  // 待機画面
  waitingScreen: document.getElementById("waitingScreen"),
  playerName: document.getElementById("playerName"),

  // 問題画面
  questionScreen: document.getElementById("questionScreen"),
  questionNumber: document.getElementById("questionNo"),
  question: document.getElementById("question"),
  choices: document.getElementById("choices"),
  answerState: document.getElementById("answerState"),
  timer: document.getElementById("timer"),

  // 結果画面
  resultScreen: document.getElementById("resultScreen"),
  resultIcon: document.getElementById("resultIcon"),
  resultTitle: document.getElementById("resultTitle"),
  resultDetail: document.getElementById("resultDetail"),

  // 最終結果画面
  finalScreen: document.getElementById("finalScreen"),
  finalDetail: document.getElementById("finalDetail"),
};

/* =========================================================
   現在の状態
========================================================= */

let roomData = null;

// 自分の参加者ID
let playerId =
  localStorage.getItem("bonenkai_player_id");

// 自分の名前
let playerName =
  localStorage.getItem("bonenkai_player_name");

// 現在の問題が表示された時刻
let questionStartedAtLocal = 0;

// 現在表示している問題番号
let currentQuestionIndex = -1;

// 問題タイマー
let questionTimer = null;

/* =========================================================
   共通処理
========================================================= */

/**
 * HTMLに表示する文字を安全な形に変換する
 */
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => {
      const escapedCharacters = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };

      return escapedCharacters[character];
    },
  );
}

/**
 * 指定した画面だけを表示する
 */
function showScreen(screenToShow) {
  const screens = [
    elements.joinScreen,
    elements.waitingScreen,
    elements.questionScreen,
    elements.resultScreen,
    elements.finalScreen,
  ];

  screens.forEach((screen) => {
    screen.classList.add("hidden");
  });

  screenToShow.classList.remove("hidden");
}

/**
 * 現在の参加者データを取得する
 */
function getMyParticipant() {
  return roomData?.participants?.[playerId];
}

/**
 * 現在の問題を取得する
 */
function getCurrentQuestion() {
  const questionIndex =
    roomData?.currentQuestion;

  if (
    questionIndex == null ||
    questionIndex < 0
  ) {
    return null;
  }

  return roomData?.questions?.[questionIndex] || null;
}

/* =========================================================
   参加処理
========================================================= */

/**
 * ニックネームを使ってゲームに参加する
 */
async function joinGame() {
  const name =
    elements.nickname.value.trim();

  // ニックネーム未入力
  if (!name) {
    elements.joinError.textContent =
      "ニックネームを入力してください。";

    return;
  }

  // ゲームが存在するか確認
  const snapshot = await get(roomReference);

  if (!snapshot.exists()) {
    elements.joinError.textContent =
      "ゲームが見つかりません。";

    return;
  }

  roomData = snapshot.val();

  // 以前参加したことがある場合
  const existingParticipant =
    playerId &&
    roomData.participants?.[playerId];

  if (existingParticipant) {
    await update(
      ref(
        database,
        `rooms/${ROOM_NAME}/participants/${playerId}`,
      ),
      {
        name,
      },
    );
  }

  // 初めて参加する場合
  else {
    const participantReference = push(
      ref(
        database,
        `rooms/${ROOM_NAME}/participants`,
      ),
    );

    playerId = participantReference.key;

    await set(participantReference, {
      name,
      joinedAt: serverTimestamp(),
      answers: {},
    });

    localStorage.setItem(
      "bonenkai_player_id",
      playerId,
    );
  }

  // 名前を保存
  playerName = name;

  localStorage.setItem(
    "bonenkai_player_name",
    playerName,
  );

  elements.playerName.textContent =
    playerName;

  elements.joinError.textContent = "";
}

/* =========================================================
   問題画面
========================================================= */

/**
 * 選択肢のHTMLを作る
 */
function createChoicesHtml(
  question,
  alreadyAnswered,
) {
  return question.choices
    .map((choice, index) => {
      const letter =
        CHOICE_LETTERS[index];

      const disabledAttribute =
        alreadyAnswered
          ? "disabled"
          : "";

      return `
        <button
          class="player-choice"
          data-choice-index="${index}"
          ${disabledAttribute}
        >
          <span class="choice-letter">
            ${letter}
          </span>

          <span>
            ${escapeHtml(choice)}
          </span>
        </button>
      `;
    })
    .join("");
}

/**
 * 選択肢ボタンにクリックイベントを設定する
 */
function setupChoiceButtons() {
  const choiceButtons =
    document.querySelectorAll(
      ".player-choice",
    );

  choiceButtons.forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const choiceIndex =
          Number(
            button.dataset.choiceIndex,
          );

        submitAnswer(choiceIndex);
      },
    );
  });
}

/**
 * すべての選択肢ボタンを無効にする
 */
function disableChoiceButtons() {
  const choiceButtons =
    document.querySelectorAll(
      ".player-choice",
    );

  choiceButtons.forEach((button) => {
    button.disabled = true;
  });
}

/**
 * 現在の問題を画面に表示する
 */
function renderQuestionScreen() {
  const questionIndex =
    roomData.currentQuestion;

  const question =
    getCurrentQuestion();

  if (!question) {
    return;
  }

  const myAnswer =
    getMyParticipant()?.answers?.[
      questionIndex
    ];

  const alreadyAnswered =
    Boolean(myAnswer);

  // 問題番号
  elements.questionNumber.textContent =
    `Q${questionIndex + 1} / ${roomData.questions.length}`;

  // 問題文
  elements.question.textContent =
    question.question;

  // 選択肢
  elements.choices.innerHTML =
    createChoicesHtml(
      question,
      alreadyAnswered,
    );

  // ボタンのイベント設定
  setupChoiceButtons();

  // 新しい問題になった場合だけタイマー開始時刻を記録
  if (
    !alreadyAnswered &&
    currentQuestionIndex !== questionIndex
  ) {
    questionStartedAtLocal =
      Date.now();

    currentQuestionIndex =
      questionIndex;
  }

  // 回答状況
  if (alreadyAnswered) {
    elements.answerState.textContent =
      "回答済みです";
  } else {
    elements.answerState.textContent =
      "答えをタップしてください";
  }

  // タイマー
  startQuestionTimer(alreadyAnswered);
}

/* =========================================================
   問題タイマー
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
function startQuestionTimer(alreadyAnswered) {
  stopQuestionTimer();

  // すでに回答している場合
  if (alreadyAnswered) {
    elements.timer.textContent =
      "回答済み";

    return;
  }

  // 問題が終了している場合
  if (
    roomData.status !== "question"
  ) {
    elements.timer.textContent =
      "回答受付終了";

    return;
  }

  questionTimer = setInterval(() => {
    const elapsedSeconds =
      (Date.now() - questionStartedAtLocal) /
      1000;

    const remainingSeconds = Math.max(
      0,
      TIME_LIMIT_SECONDS - elapsedSeconds,
    );

    elements.timer.textContent =
      `${remainingSeconds.toFixed(1)}s`;

    // 時間切れ
    if (remainingSeconds <= 0) {
      stopQuestionTimer();

      disableChoiceButtons();

      elements.answerState.textContent =
        "時間切れ";

      elements.timer.textContent =
        "回答受付終了";
    }
  }, 100);
}

/* =========================================================
   回答処理
========================================================= */

/**
 * 回答をFirebaseへ送信する
 */
async function submitAnswer(choiceIndex) {
  // 回答受付中ではない場合は回答できない
  if (roomData.status !== "question") {
    return;
  }

  const questionIndex =
    roomData.currentQuestion;

  // すでに回答済みか確認
  const existingAnswer =
    getMyParticipant()?.answers?.[
      questionIndex
    ];

  if (existingAnswer) {
    return;
  }

  // 回答にかかった時間を計算
  const elapsedMilliseconds =
    Math.round(
      Date.now() - questionStartedAtLocal,
    );

  // 二重回答を防ぐため、先にボタンを無効化
  disableChoiceButtons();

  stopQuestionTimer();

  elements.answerState.textContent =
    "回答を送信しました！";

  elements.timer.textContent =
    `${(
      elapsedMilliseconds / 1000
    ).toFixed(2)}s`;

  // Firebaseへ保存
  await update(
    ref(
      database,
      `rooms/${ROOM_NAME}/participants/${playerId}/answers/${questionIndex}`,
    ),
    {
      choice: choiceIndex,
      elapsedMs: elapsedMilliseconds,
      answeredAt: serverTimestamp(),
    },
  );
}

/* =========================================================
   結果待ち画面
========================================================= */

/**
 * 結果発表を待っている画面を表示する
 *
 * 10秒経過後はここに来る。
 * 管理者が「結果を表示」を押すまで、
 * 正解や自分の結果は表示しない。
 */
function renderResultWaitingScreen() {
  stopQuestionTimer();

  const questionIndex =
    roomData.currentQuestion;

  const question =
    getCurrentQuestion();

  if (!question) {
    return;
  }

  const myAnswer =
    getMyParticipant()?.answers?.[
      questionIndex
    ];

  elements.resultIcon.textContent =
    "⏳";

  elements.resultTitle.textContent =
    "結果発表待ち";

  if (myAnswer) {
    elements.resultDetail.innerHTML = `
      <p>
        回答を受け付けました！
      </p>

      <p>
        司会者が結果を発表するまで
        お待ちください。
      </p>

      <div class="big-time">
        回答時間
        ${(myAnswer.elapsedMs / 1000).toFixed(2)}秒
      </div>
    `;
  } else {
    elements.resultDetail.innerHTML = `
      <p>
        回答受付が終了しました。
      </p>

      <p>
        司会者が結果を発表するまで
        お待ちください。
      </p>
    `;
  }
}

/* =========================================================
   1問の結果
========================================================= */

/**
 * 結果画面を表示する
 */
function renderResultScreen() {
  stopQuestionTimer();

  const questionIndex =
    roomData.currentQuestion;

  const question =
    getCurrentQuestion();

  const myAnswer =
    getMyParticipant()?.answers?.[
      questionIndex
    ];

  if (!question) {
    return;
  }

  // 回答していない場合
  if (!myAnswer) {
    renderTimeUpResult(question);
    return;
  }

  // 回答している場合
  renderAnsweredResult(
    question,
    myAnswer,
  );
}

/**
 * 時間切れの結果を表示する
 */
function renderTimeUpResult(question) {
  elements.resultIcon.textContent =
    "⏰";

  elements.resultTitle.textContent =
    "時間切れ";

  elements.resultDetail.innerHTML = `
    <p>
      今回は回答できませんでした。
    </p>

    <p>
      正解：
      <strong>
        ${escapeHtml(
          question.choices[
            question.answer
          ],
        )}
      </strong>
    </p>
  `;
}

/**
 * 回答した場合の結果を表示する
 */
function renderAnsweredResult(
  question,
  answer,
) {
  const isCorrect =
    answer.choice === question.answer;

  const myChoice =
    question.choices[answer.choice];

  const correctChoice =
    question.choices[question.answer];

  elements.resultIcon.textContent =
    isCorrect ? "🎉" : "😵";

  elements.resultTitle.textContent =
    isCorrect
      ? "正解！"
      : "残念…";

  elements.resultDetail.innerHTML = `
    <p>
      あなたの回答：
      ${escapeHtml(myChoice)}
    </p>

    <p>
      正解：
      <strong>
        ${escapeHtml(correctChoice)}
      </strong>
    </p>

    <div class="big-time">
      ${(answer.elapsedMs / 1000).toFixed(2)}秒
    </div>
  `;
}

/* =========================================================
   最終結果
========================================================= */

/**
 * 自分の最終成績を計算する
 */
function calculateMyFinalResult() {
  const questions =
    roomData.questions || [];

  const participant =
    getMyParticipant();

  let correctCount = 0;
  let totalAnswerTime = 0;

  questions.forEach(
    (question, questionIndex) => {
      const answer =
        participant.answers?.[
          questionIndex
        ];

      // 回答していない問題
      if (!answer) {
        return;
      }

      totalAnswerTime +=
        Number(answer.elapsedMs || 0);

      if (
        answer.choice === question.answer
      ) {
        correctCount++;
      }
    },
  );

  const accuracy =
    questions.length > 0
      ? correctCount / questions.length
      : 0;

  return {
    correctCount,
    totalAnswerTime,
    accuracy,
  };
}

/**
 * 最終結果画面を表示する
 */
function renderFinalScreen() {
  stopQuestionTimer();

  const participant =
    getMyParticipant();

  // 自分の参加者データがない場合
  if (!participant) {
    showScreen(elements.joinScreen);
    return;
  }

  const result =
    calculateMyFinalResult();

  const totalQuestions =
    roomData.questions.length;

  const accuracyPercent =
    (result.accuracy * 100).toFixed(0);

  const totalAnswerSeconds =
    (result.totalAnswerTime / 1000).toFixed(2);

  elements.finalDetail.innerHTML = `
    <p>
      <strong>
        ${escapeHtml(participant.name)}
      </strong>
      さん
    </p>

    <p>
      正答率：
      <strong>
        ${accuracyPercent}%
      </strong>
    </p>

    <p>
      正解：
      ${result.correctCount} / ${totalQuestions}
    </p>

    <div class="big-time">
      総回答時間
      ${totalAnswerSeconds}秒
    </div>

    <p class="muted">
      おつかれさまでした！
    </p>
  `;
}

/* =========================================================
   Firebaseの状態に応じた画面表示
========================================================= */

function renderPlayerScreen() {
  if (!roomData) {
    return;
  }

  const participant =
    getMyParticipant();

  // 参加者として登録されていない場合
  if (!participant) {
    stopQuestionTimer();
    showScreen(elements.joinScreen);
    return;
  }

  elements.playerName.textContent =
    participant.name;

  switch (roomData.status) {
    case "lobby":
      stopQuestionTimer();
      showScreen(elements.waitingScreen);
      break;

    case "question":
      showScreen(elements.questionScreen);
      renderQuestionScreen();
      break;

    // 10秒終了後。
    // まだ結果は公開されていない。
    case "result_ready":
      showScreen(elements.resultScreen);
      renderResultWaitingScreen();
      break;

    // 管理者が「結果を表示」を押した後。
    case "result":
      showScreen(elements.resultScreen);
      renderResultScreen();
      break;

    case "final":
      showScreen(elements.finalScreen);
      renderFinalScreen();
      break;

    default:
      stopQuestionTimer();
      showScreen(elements.joinScreen);
      break;
  }
}

/* =========================================================
   ボタン操作
========================================================= */

elements.joinButton.addEventListener(
  "click",
  joinGame,
);

elements.nickname.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter") {
      joinGame();
    }
  },
);

/* =========================================================
   保存されている名前を復元
========================================================= */

if (playerName) {
  elements.nickname.value =
    playerName;
}

/* =========================================================
   Firebaseのリアルタイム監視
========================================================= */

onValue(roomReference, (snapshot) => {
  roomData = snapshot.val();

  if (!roomData) {
    return;
  }

  renderPlayerScreen();
});