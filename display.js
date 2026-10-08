import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

/* =========================================================
   Firebase
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyDfLVi-Pn-txPql-4jq5SeyCSNZoB5i5d4",
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

const ROOM_NAME = "bonenkai";

const roomReference = ref(
  database,
  `rooms/${ROOM_NAME}`,
);

/* =========================================================
   定数
========================================================= */

const CHOICE_LETTERS = ["A", "B", "C", "D"];

const SCREEN_IDS = {
  lobby: "displayLobby",
  question: "displayQuestion",
  result: "displayResult",
  final: "displayFinal",
};

/* =========================================================
   画面上のHTML要素
========================================================= */

const elements = {
  // 各画面
  lobby: document.getElementById("displayLobby"),
  question: document.getElementById("displayQuestion"),
  result: document.getElementById("displayResult"),
  final: document.getElementById("displayFinal"),

  // 問題画面
  questionNumber: document.getElementById(
    "displayQuestionNo",
  ),
  questionText: document.getElementById(
    "displayQuestionText",
  ),
  choices: document.getElementById(
    "displayChoices",
  ),
  answerCount: document.getElementById(
    "displayAnswerCount",
  ),
  questionStatus: document.getElementById(
    "displayQuestionStatus",
  ),

  // 結果画面
  resultQuestion: document.getElementById(
    "displayResultQuestion",
  ),
  correctAnswer: document.getElementById(
    "displayCorrectAnswer",
  ),
  resultStats: document.getElementById(
    "displayResultStats",
  ),

  // 最終結果画面
  winner: document.getElementById(
    "displayWinner",
  ),
  ranking: document.getElementById(
    "displayRanking",
  ),
};

/* =========================================================
   現在のゲームデータ
========================================================= */

let roomData = null;

/* =========================================================
   共通処理
========================================================= */

/**
 * HTMLに表示する文字列を安全な形に変換する
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
 * Firebaseに保存されている参加者を配列として取得する
 */
function getParticipants() {
  const participantData =
    roomData?.participants || {};

  return Object.entries(participantData).map(
    ([participantId, participant]) => ({
      id: participantId,
      ...participant,
    }),
  );
}

/**
 * 指定した画面だけを表示する
 */
function showScreen(screenIdToShow) {
  Object.values(SCREEN_IDS).forEach(
    (screenId) => {
      document
        .getElementById(screenId)
        .classList.add("hidden");
    },
  );

  document
    .getElementById(screenIdToShow)
    .classList.remove("hidden");
}

/* =========================================================
   待機画面
========================================================= */

function renderLobbyScreen() {
  showScreen(SCREEN_IDS.lobby);
}

/* =========================================================
   問題画面
========================================================= */

/**
 * 現在の問題を取得する
 */
function getCurrentQuestion() {
  const questionIndex =
    roomData.currentQuestion;

  return roomData.questions?.[questionIndex];
}

/**
 * 選択肢のHTMLを作る
 */
function createChoicesHtml(choices) {
  return choices
    .map((choice, index) => {
      const choiceLetter =
        CHOICE_LETTERS[index];

      return `
        <div class="display-choice">
          <span>${choiceLetter}</span>
          <strong>
            ${escapeHtml(choice)}
          </strong>
        </div>
      `;
    })
    .join("");
}

/**
 * 現在の問題画面を表示する
 */
function renderQuestionScreen() {
  const questionIndex =
    roomData.currentQuestion;

  const question =
    getCurrentQuestion();

  if (!question) {
    renderLobbyScreen();
    return;
  }

  showScreen(SCREEN_IDS.question);

  /* -----------------------------------------
     問題番号
  ----------------------------------------- */

  elements.questionNumber.textContent =
    `QUESTION ${questionIndex + 1} / ${roomData.questions.length}`;

  /* -----------------------------------------
     問題文
  ----------------------------------------- */

  elements.questionText.textContent =
    question.question;

  /* -----------------------------------------
     選択肢
  ----------------------------------------- */

  elements.choices.innerHTML =
    createChoicesHtml(question.choices);

  /* -----------------------------------------
     回答者数
  ----------------------------------------- */

  const participants =
    getParticipants();

  const answeredCount =
    participants.filter(
      (participant) =>
        participant.answers?.[
          questionIndex
        ],
    ).length;

  elements.answerCount.textContent =
    `${answeredCount} / ${participants.length}人 回答済み`;

  /* -----------------------------------------
     回答受付状況
  ----------------------------------------- */

  if (roomData.status === "question") {
    elements.questionStatus.textContent =
      "回答受付中";
  } else {
    elements.questionStatus.textContent =
      "回答受付終了";
  }
}

/* =========================================================
   結果発表待ち画面
========================================================= */

/**
 * 回答受付終了後、
 * 結果発表まで表示する内容
 *
 * 正解・最速・最遅などはまだ表示しない。
 */
function renderResultWaitingScreen() {
  const questionIndex =
    roomData.currentQuestion;

  const question =
    getCurrentQuestion();

  if (!question) {
    renderLobbyScreen();
    return;
  }

  showScreen(SCREEN_IDS.question);

  /* -----------------------------------------
     問題番号
  ----------------------------------------- */

  elements.questionNumber.textContent =
    `QUESTION ${questionIndex + 1} / ${roomData.questions.length}`;

  /* -----------------------------------------
     問題文
  ----------------------------------------- */

  elements.questionText.textContent =
    question.question;

  /* -----------------------------------------
     選択肢
  ----------------------------------------- */

  elements.choices.innerHTML =
    createChoicesHtml(question.choices);

  /* -----------------------------------------
     回答者数
  ----------------------------------------- */

  const participants =
    getParticipants();

  const answeredCount =
    participants.filter(
      (participant) =>
        participant.answers?.[
          questionIndex
        ],
    ).length;

  elements.answerCount.textContent =
    `${answeredCount} / ${participants.length}人 回答済み`;

  /* -----------------------------------------
     状態表示
  ----------------------------------------- */

  elements.questionStatus.textContent =
    "回答受付終了・結果発表待ち";
}

/* =========================================================
   1問の結果
========================================================= */

/**
 * 直前の問題の結果データを取得する
 */
function getPreviousQuestionResult() {
  const previousAnswers =
    roomData?.previousAnswers;

  if (
    !previousAnswers ||
    previousAnswers.questionIndex == null
  ) {
    return null;
  }

  const questionIndex =
    previousAnswers.questionIndex;

  const question =
    roomData.questions?.[questionIndex];

  if (!question) {
    return null;
  }

  const answers =
    Object.values(
      previousAnswers.answers || {},
    );

  const totalParticipants =
    getParticipants().length;

  /* -----------------------------------------
     誰も回答していない場合
  ----------------------------------------- */

  if (answers.length === 0) {
    return {
      questionIndex,
      correctAnswer:
        question.choices[question.answer],
      correctCount: 0,
      totalCount: totalParticipants,
      fastestParticipants: [],
      slowestParticipants: [],
      fastestTime: null,
      slowestTime: null,
    };
  }

  /* -----------------------------------------
     最速・最遅の時間
  ----------------------------------------- */

  const fastestTime =
    Math.min(
      ...answers.map(
        (answer) =>
          answer.elapsedMs ?? Infinity,
      ),
    );

  const slowestTime =
    Math.max(
      ...answers.map(
        (answer) =>
          answer.elapsedMs ?? -Infinity,
      ),
    );

  /* -----------------------------------------
     最速・最遅の参加者
  ----------------------------------------- */

  const fastestParticipants =
    answers.filter(
      (answer) =>
        answer.elapsedMs === fastestTime,
    );

  const slowestParticipants =
    answers.filter(
      (answer) =>
        answer.elapsedMs === slowestTime,
    );

  /* -----------------------------------------
     正解者数
  ----------------------------------------- */

  const correctCount =
    answers.filter(
      (answer) => answer.correct,
    ).length;

  return {
    questionIndex,
    correctAnswer:
      question.choices[question.answer],
    correctCount,
    totalCount: totalParticipants,
    fastestParticipants,
    slowestParticipants,
    fastestTime,
    slowestTime,
  };
}

/**
 * 参加者名を
 * 「Aさん・Bさん」のような文字列にする
 */
function createParticipantNamesHtml(
  participants,
) {
  return participants
    .map((participant) =>
      escapeHtml(participant.name),
    )
    .join("・");
}

/**
 * 最速・最遅の表示HTMLを作る
 */
function createSpeedResultHtml(
  label,
  emoji,
  participants,
  timeMs,
) {
  if (
    !participants.length ||
    timeMs == null
  ) {
    return "";
  }

  const participantNames =
    createParticipantNamesHtml(
      participants,
    );

  const seconds =
    (timeMs / 1000).toFixed(2);

  return `
    <div class="display-result-stat">
      <span>${emoji} ${label}</span>

      <strong>
        ${participantNames}
        <small>${seconds}秒</small>
      </strong>
    </div>
  `;
}

/**
 * 1問の結果画面を表示する
 */
function renderResultScreen() {
  const result =
    getPreviousQuestionResult();

  if (!result) {
    renderLobbyScreen();
    return;
  }

  showScreen(SCREEN_IDS.result);

  /* -----------------------------------------
     問題番号
  ----------------------------------------- */

  elements.resultQuestion.textContent =
    `第${result.questionIndex + 1}問`;

  /* -----------------------------------------
     正解
  ----------------------------------------- */

  elements.correctAnswer.textContent =
    result.correctAnswer;

  /* -----------------------------------------
     最速
  ----------------------------------------- */

  const fastestHtml =
    createSpeedResultHtml(
      "最速",
      "⚡",
      result.fastestParticipants,
      result.fastestTime,
    );

  /* -----------------------------------------
     最遅
  ----------------------------------------- */

  const slowestHtml =
    createSpeedResultHtml(
      "最遅",
      "🐢",
      result.slowestParticipants,
      result.slowestTime,
    );

  /* -----------------------------------------
     結果全体
  ----------------------------------------- */

  elements.resultStats.innerHTML = `
    <div class="display-correct-count">
      正解者
      ${result.correctCount}
      /
      ${result.totalCount}人
    </div>

    ${fastestHtml}

    ${slowestHtml}

    <div class="display-result-note">
      ※ 最速・最遅が同率の場合は全員表示
    </div>
  `;
}

/* =========================================================
   最終結果
========================================================= */

/**
 * 全参加者の最終成績を計算する
 *
 * 順位の決め方：
 *
 * 1. 正答率が高い人が上
 * 2. 正答率が同じなら、
 *    総回答時間が短い人が上
 * 3. それでも同じなら、
 *    正解数が多い人が上
 */
function calculateFinalRanking() {
  const questions =
    roomData.questions || [];

  const participants =
    getParticipants();

  const ranking =
    participants.map(
      (participant) => {
        let correctCount = 0;
        let totalAnswerTime = 0;

        questions.forEach(
          (
            question,
            questionIndex,
          ) => {
            const answer =
              participant.answers?.[
                questionIndex
              ];

            if (!answer) {
              return;
            }

            totalAnswerTime +=
              Number(
                answer.elapsedMs || 0,
              );

            if (
              answer.choice ===
              question.answer
            ) {
              correctCount++;
            }
          },
        );

        const accuracy =
          questions.length > 0
            ? correctCount /
              questions.length
            : 0;

        return {
          ...participant,
          correctCount,
          totalAnswerTime,
          accuracy,
        };
      },
    );

  ranking.sort(
    (participantA, participantB) => {
      /* -----------------------------------
         ① 正答率が高い順
      ----------------------------------- */

      if (
        participantA.accuracy !==
        participantB.accuracy
      ) {
        return (
          participantB.accuracy -
          participantA.accuracy
        );
      }

      /* -----------------------------------
         ② 総回答時間が短い順
      ----------------------------------- */

      if (
        participantA.totalAnswerTime !==
        participantB.totalAnswerTime
      ) {
        return (
          participantA.totalAnswerTime -
          participantB.totalAnswerTime
        );
      }

      /* -----------------------------------
         ③ 正解数が多い順
      ----------------------------------- */

      return (
        participantB.correctCount -
        participantA.correctCount
      );
    },
  );

  return ranking;
}

/**
 * 優勝者カードのHTMLを作る
 */
function createWinnerHtml(
  winner,
  totalQuestions,
) {
  const accuracyPercent =
    (winner.accuracy * 100).toFixed(0);

  const totalAnswerSeconds =
    (
      winner.totalAnswerTime / 1000
    ).toFixed(2);

  return `
    <div class="display-winner-card">

      <div class="display-winner-label">
        WINNER
      </div>

      <div class="display-winner-name">
        ${escapeHtml(winner.name)} さん
      </div>

      <div class="display-winner-stats">
        正答率
        <strong>
          ${accuracyPercent}%
        </strong>

        ・

        正解
        <strong>
          ${winner.correctCount}/${totalQuestions}問
        </strong>

        ・

        総回答時間
        <strong>
          ${totalAnswerSeconds}秒
        </strong>
      </div>

    </div>
  `;
}

/**
 * 参加者1人分のランキング行を作る
 */
function createRankingRowHtml(
  participant,
  rankingPosition,
  totalQuestions,
) {
  const accuracyPercent =
    (
      participant.accuracy * 100
    ).toFixed(0);

  const totalAnswerSeconds =
    (
      participant.totalAnswerTime /
      1000
    ).toFixed(2);

  return `
    <div class="display-rank-row">

      <b>
        ${rankingPosition}位
      </b>

      <strong>
        ${escapeHtml(participant.name)}
      </strong>

      <span>
        ${accuracyPercent}%
      </span>

      <span>
        ${participant.correctCount}/${totalQuestions}問
      </span>

      <span>
        ${totalAnswerSeconds}秒
      </span>

    </div>
  `;
}

/**
 * 最終結果画面を表示する
 */
function renderFinalScreen() {
  const ranking =
    calculateFinalRanking();

  showScreen(SCREEN_IDS.final);

  /* -----------------------------------------
     参加者がいない場合
  ----------------------------------------- */

  if (ranking.length === 0) {
    elements.winner.innerHTML =
      "<p>参加者はいません。</p>";

    elements.ranking.innerHTML = "";

    return;
  }

  const winner = ranking[0];

  const totalQuestions =
    roomData.questions.length;

  /* -----------------------------------------
     優勝者
  ----------------------------------------- */

  elements.winner.innerHTML =
    createWinnerHtml(
      winner,
      totalQuestions,
    );

  /* -----------------------------------------
     全員のランキング
  ----------------------------------------- */

  elements.ranking.innerHTML =
    ranking
      .map(
        (participant, index) => {
          const rankingPosition =
            index + 1;

          return createRankingRowHtml(
            participant,
            rankingPosition,
            totalQuestions,
          );
        },
      )
      .join("");
}

/* =========================================================
   画面切り替え
========================================================= */

function renderScreen() {
  if (!roomData) {
    return;
  }

  switch (roomData.status) {
    /* ---------------------------------------
       待機中
    --------------------------------------- */

    case "lobby":
      renderLobbyScreen();
      break;

    /* ---------------------------------------
       回答受付中
    --------------------------------------- */

    case "question":
      renderQuestionScreen();
      break;

    /* ---------------------------------------
       回答終了・結果発表待ち
    --------------------------------------- */

    case "result_ready":
      renderResultWaitingScreen();
      break;

    /* ---------------------------------------
       結果発表中
    --------------------------------------- */

    case "result":
      renderResultScreen();
      break;

    /* ---------------------------------------
       最終結果
    --------------------------------------- */

    case "final":
      renderFinalScreen();
      break;

    /* ---------------------------------------
       不明な状態
    --------------------------------------- */

    default:
      renderLobbyScreen();
      break;
  }
}

/* =========================================================
   Firebaseからデータを受け取る
========================================================= */

onValue(
  roomReference,
  (snapshot) => {
    roomData = snapshot.val();

    renderScreen();
  },
);