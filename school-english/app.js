(() => {
  'use strict';

  const STORAGE_KEY = 'jojo_school_english_v1';
  const CORE_COUNT = 6;
  const TOTAL_COUNT = 8;
  const DEFAULT_TRIAL_URL = 'https://me.jojoreading.com.tw/marketing?channel=TW_jojoweb_jojoweb_NONE-EnglishPage-Hero&linkId=6777897';
  const params = new URLSearchParams(location.search);
  const trialUrl = safeTrialUrl(params.get('trial_url')) || DEFAULT_TRIAL_URL;

  const app = document.querySelector('#app');
  const backButton = document.querySelector('#headerBack');
  const soundButton = document.querySelector('#soundToggle');
  const toast = document.querySelector('#toast');
  const confetti = document.querySelector('#confetti');

  const defaultState = () => ({
    started: false,
    profile: 'new',
    current: 0,
    completed: [],
    attempts: {},
    scores: { letters: 0, writing: 0, sounds: 0, words: 0 },
    sound: true,
    startedAt: null
  });

  let state = loadState();
  let screen = state.started && state.completed.length ? (state.completed.includes(5) ? 'results' : 'quiz') : 'intro';
  let toastTimer;

  const steps = [
    { title: 'ABC 開學擊掌', instruction: 'Match each uppercase letter to its lowercase letter.', skill: '字母辨認' },
    { title: '寫下開學第一筆', instruction: '', skill: '字母書寫' },
    { title: '教室聲音偵探', instruction: 'Circle the picture that starts with /b/.', skill: '首音感知' },
    { title: '整理我的新書包', instruction: 'Listen to each word. Match it to the picture.', skill: '圖詞辨認' },
    { title: '補上第一個聲音', instruction: 'Look at the picture. Write the first letter.', skill: '首音拼寫' },
    { title: '書包裡的單詞寶藏', instruction: 'Find and circle each word in the grid.', skill: '短詞辨認' },
    { title: '拼讀能量階梯', instruction: 'Change the first letter to make new words.', skill: '自然拼讀', bonus: true },
    { title: '我的開學第一句', instruction: 'Use the words to make a sentence.', skill: '句子啟蒙', bonus: true }
  ];

  function safeTrialUrl(value) {
    if (!value) return '';
    try {
      const parsed = new URL(value);
      return /^https?:$/.test(parsed.protocol) ? parsed.href : '';
    } catch (_) {
      return '';
    }
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return { ...defaultState(), ...saved, scores: { ...defaultState().scores, ...(saved?.scores || {}) } };
    } catch (_) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function track(event, data = {}) {
    const payload = {
      event,
      campaign_id: 'back_to_school_english_starter_2026',
      unit_id: screen === 'quiz' ? `school_start_${String(state.current + 1).padStart(2, '0')}` : null,
      page_no: screen === 'quiz' ? state.current + 1 : null,
      ...data
    };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
    window.dispatchEvent(new CustomEvent('jojo-analytics', { detail: payload }));
  }

  function render() {
    backButton.classList.toggle('is-hidden', screen === 'intro');
    updateSoundButton();

    if (screen === 'intro') renderIntro();
    if (screen === 'quiz') renderQuiz();
    if (screen === 'results') renderResults();
    requestAnimationFrame(() => app.focus({ preventScroll: true }));
  }

  function renderIntro() {
    const hasProgress = state.completed.length > 0 && !state.completed.includes(5);
    app.innerHTML = `
      <section class="intro">
        <span class="limit-pill">開學季限定・免費領取</span>
        <div class="hero-visual" aria-hidden="true">
          <span class="sun"></span>
          <span class="star-mini star-one">★</span><span class="star-mini star-two">★</span>
          <span class="float-card book">📘</span>
          <span class="school-card"><i class="door"></i><i class="window window-a"></i><i class="window window-b"></i></span>
          <span class="float-card pencil">✏️</span>
        </div>
        <div class="intro-copy">
          <h1>我的第一本<br><em>Back to School</em> 練習冊</h1>
          <p class="intro-lead">從 ABC、首音到第一個英文句子，陪孩子輕鬆銜接開學。</p>
        </div>
        <ul class="benefits" aria-label="活動特色">
          <li><b>6</b>趣味任務</li><li><b>8<span style="font-size:11px">分鐘</span></b>輕鬆完成</li><li><b>2</b>彩蛋挑戰</li>
        </ul>
        <div class="profile-box">
          <p>孩子現在比較像哪一種？</p>
          <div class="profile-options">
            <button class="profile-option ${state.profile === 'new' ? 'active' : ''}" data-profile="new" type="button">剛接觸 ABC</button>
            <button class="profile-option ${state.profile === 'some' ? 'active' : ''}" data-profile="some" type="button">認識部分字母</button>
          </div>
        </div>
        <button class="primary-button" id="startButton" type="button">
          ${hasProgress ? '繼續上次進度' : '開始開學英語熱身'}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <p class="resume-note">完成後可獲得孩子的英語啟蒙起點摘要</p>
      </section>`;

    app.querySelectorAll('[data-profile]').forEach(button => {
      button.addEventListener('click', () => {
        state.profile = button.dataset.profile;
        saveState();
        app.querySelectorAll('[data-profile]').forEach(item => item.classList.toggle('active', item === button));
      });
    });
    app.querySelector('#startButton').addEventListener('click', () => {
      state.started = true;
      state.startedAt ||= Date.now();
      if (state.completed.includes(5)) state.current = 0;
      saveState();
      screen = 'quiz';
      track('school_workbook_start', { abc_self_report: state.profile, resumed: hasProgress });
      render();
    });
    track('school_workbook_view');
  }

  function progressHtml() {
    const segments = Array.from({ length: CORE_COUNT }, (_, index) => {
      const cls = state.completed.includes(index) ? 'done' : state.current === index ? 'current' : '';
      return `<span class="progress-segment ${cls}"><span></span></span>`;
    }).join('');
    const bonus = [6, 7].map(index => `<span class="bonus-dot ${state.completed.includes(index) ? 'done' : state.current === index ? 'current' : ''}">★</span>`).join('');
    const label = state.current < CORE_COUNT ? `任務 ${state.current + 1} / ${CORE_COUNT}` : `彩蛋 ${state.current - 5} / 2`;
    return `<div class="progress-wrap"><div class="progress-meta"><span>${label}</span><strong>${steps[state.current].skill}</strong></div><div class="progress-track">${segments}${bonus}</div></div>`;
  }

  function renderQuiz() {
    const step = steps[state.current];
    app.innerHTML = `<section class="quiz-page">${progressHtml()}<div class="task-head">
      <div class="task-kicker"><span class="num">${step.bonus ? '★' : state.current + 1}</span>${step.bonus ? 'BONUS CHALLENGE' : 'BACK TO SCHOOL'}</div>
      <h1>${step.title}</h1>
      ${step.instruction ? `<div class="instruction"><button class="speak-button" type="button" data-speak="${escapeAttr(step.instruction)}" aria-label="播放英文題目">${speakerSvg()}</button><span>${step.instruction}</span></div>` : '<div class="instruction"><span>沿著淡色字母，寫出 B 和 b</span></div>'}
    </div><div id="exercise"></div></section>`;

    app.querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', () => speak(button.dataset.speak)));
    renderExercise(state.current);
    track('school_workbook_page_view', { topic_type: topicTypeFor(state.current) });
  }

  function renderExercise(index) {
    if (index === 0) renderMatchCase();
    if (index === 1) renderTrace();
    if (index === 2) renderCircleSound();
    if (index === 3) renderPictureMatch();
    if (index === 4) renderInitialSounds();
    if (index === 5) renderFindWords();
    if (index === 6) renderLadders();
    if (index === 7) renderSentences();
  }

  function cardShell(content, helper = '') {
    document.querySelector('#exercise').innerHTML = `<div class="exercise-card">${helper ? `<p class="helper">${helper}</p>` : ''}${content}</div>`;
  }

  function renderMatchCase() {
    renderMatching({
      helper: '先點一個大寫字母，再點它的小寫夥伴',
      left: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'P', label: 'P' }, { id: 'S', label: 'S' }],
      right: [{ id: 's', label: 's' }, { id: 'a', label: 'a' }, { id: 'p', label: 'p' }, { id: 'b', label: 'b' }],
      pairs: { A: 'a', B: 'b', P: 'p', S: 's' },
      onDone: () => finishStep({ letters: 100 }, '四組大小寫都配對成功！')
    });
  }

  function renderPictureMatch() {
    renderMatching({
      helper: '先點英文單詞，再點正確的圖片',
      left: [{ id: 'bag', label: 'bag', cls: 'word' }, { id: 'book', label: 'book', cls: 'word' }, { id: 'pen', label: 'pen', cls: 'word' }, { id: 'desk', label: 'desk', cls: 'word' }],
      right: [{ id: 'pen-img', label: '🖊️', cls: 'picture' }, { id: 'desk-img', label: '🪑', cls: 'picture' }, { id: 'bag-img', label: '🎒', cls: 'picture' }, { id: 'book-img', label: '📘', cls: 'picture' }],
      pairs: { bag: 'bag-img', book: 'book-img', pen: 'pen-img', desk: 'desk-img' },
      onDone: () => finishStep({ words: 50 }, '書包用品全都找到夥伴了！'),
      speakLeft: true
    });
  }

  function renderMatching({ helper, left, right, pairs, onDone, speakLeft = false }) {
    cardShell(`<div class="match-board"><div class="match-column left-column">${left.map(item => `<button class="match-item ${item.cls || ''}" type="button" data-side="left" data-id="${item.id}">${item.label}</button>`).join('')}</div><div class="match-divider">•••</div><div class="match-column right-column">${right.map(item => `<button class="match-item ${item.cls || ''}" type="button" data-side="right" data-id="${item.id}">${item.label}</button>`).join('')}</div></div>`, helper);
    let selected = null;
    const matched = new Set();
    const board = document.querySelector('.match-board');
    board.addEventListener('click', event => {
      const button = event.target.closest('.match-item');
      if (!button || button.classList.contains('matched')) return;
      if (button.dataset.side === 'left') {
        board.querySelectorAll('[data-side="left"]').forEach(item => item.classList.remove('active'));
        selected = button.dataset.id;
        button.classList.add('active');
        if (speakLeft) speak(selected);
        return;
      }
      if (!selected) return showToast('先選左邊的一個單詞吧！');
      const leftButton = board.querySelector(`[data-side="left"][data-id="${CSS.escape(selected)}"]`);
      if (pairs[selected] === button.dataset.id) {
        leftButton.classList.remove('active');
        leftButton.classList.add('matched');
        button.classList.add('matched');
        matched.add(selected);
        selected = null;
        if (matched.size === left.length) onDone();
      } else {
        noteAttempt();
        button.classList.add('wrong');
        setTimeout(() => button.classList.remove('wrong'), 320);
        showToast('再看一看，它們還不是一對喔');
      }
    });
  }

  function renderTrace() {
    cardShell(`<div class="trace-wrap"><div class="trace-glyph" aria-hidden="true">Bb</div><canvas id="traceCanvas" aria-label="B 和 b 手寫區"></canvas></div><div class="trace-actions"><button class="ghost-button" id="clearTrace" type="button">清除重寫</button><button class="secondary-button" id="doneTrace" type="button">我寫好了 ✓</button></div>`, '用手指或滑鼠沿著淡色字母寫一寫');
    const canvas = document.querySelector('#traceCanvas');
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let last = null;
    let distance = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#315fdd';
    }
    resize();

    const point = event => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    canvas.addEventListener('pointerdown', event => {
      drawing = true;
      last = point(event);
      canvas.setPointerCapture(event.pointerId);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
    });
    canvas.addEventListener('pointermove', event => {
      if (!drawing) return;
      const next = point(event);
      distance += Math.hypot(next.x - last.x, next.y - last.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
      last = next;
    });
    const stop = () => { drawing = false; last = null; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    document.querySelector('#clearTrace').addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); distance = 0; });
    document.querySelector('#doneTrace').addEventListener('click', () => {
      if (distance < 130) { noteAttempt(); return showToast('再多寫幾筆，就完成囉！'); }
      finishStep({ writing: 100 }, '你完成了開學第一筆！');
    });
  }

  function renderCircleSound() {
    const options = [
      { word: 'Book', emoji: '📘', correct: true },
      { word: 'Pen', emoji: '🖊️' },
      { word: 'Sun', emoji: '☀️' }
    ];
    cardShell(`<div class="picture-options">${options.map(item => `<button class="picture-card" type="button" data-word="${item.word}" data-correct="${item.correct || false}"><span class="emoji">${item.emoji}</span><span class="word">${item.word}</span></button>`).join('')}</div>`, '哪一張圖片的英文是 /b/ 開頭？點一下聽單詞');
    document.querySelector('.picture-options').addEventListener('click', event => {
      const card = event.target.closest('.picture-card');
      if (!card) return;
      speak(card.dataset.word);
      if (card.dataset.correct === 'true') {
        card.classList.add('correct');
        setTimeout(() => finishStep({ sounds: 35 }, 'Book 的第一個聲音是 /b/！'), 260);
      } else {
        noteAttempt();
        card.classList.add('wrong');
        setTimeout(() => card.classList.remove('wrong'), 360);
        showToast(`聽聽 ${card.dataset.word}，再試一次`);
      }
    });
  }

  function renderInitialSounds() {
    const items = [
      { word: 'bag', suffix: 'ag', answer: 'b', emoji: '🎒' },
      { word: 'pen', suffix: 'en', answer: 'p', emoji: '🖊️' },
      { word: 'map', suffix: 'ap', answer: 'm', emoji: '🗺️' },
      { word: 'sun', suffix: 'un', answer: 's', emoji: '☀️' }
    ];
    cardShell(`<div class="initial-grid">${items.map((item, index) => `<div class="initial-card ${index === 0 ? 'active' : ''}" data-index="${index}"><button class="initial-emoji" type="button" data-speak="${item.word}" aria-label="播放 ${item.word}">${item.emoji}</button><div class="initial-word"><button class="initial-blank" type="button" aria-label="填入 ${item.word} 的首字母">_</button>${item.suffix}</div></div>`).join('')}</div><div class="letter-bank" aria-label="字母選項">${['b','p','m','s'].map(letter => `<button class="letter-chip" type="button" data-letter="${letter}">${letter}</button>`).join('')}</div>`, '點圖片可以聽單詞，再把正確字母放進空格');
    let active = 0;
    const done = new Set();
    const cards = [...document.querySelectorAll('.initial-card')];
    const setActive = index => {
      if (done.has(index)) return;
      active = index;
      cards.forEach((card, i) => card.classList.toggle('active', i === active));
    };
    cards.forEach((card, index) => {
      card.querySelector('.initial-emoji').addEventListener('click', () => speak(items[index].word));
      card.querySelector('.initial-blank').addEventListener('click', () => setActive(index));
    });
    document.querySelector('.letter-bank').addEventListener('click', event => {
      const button = event.target.closest('[data-letter]');
      if (!button || done.has(active)) return;
      const letter = button.dataset.letter;
      if (letter === items[active].answer) {
        cards[active].querySelector('.initial-blank').textContent = letter;
        cards[active].classList.remove('active');
        cards[active].classList.add('done');
        done.add(active);
        if (done.size === items.length) return setTimeout(() => finishStep({ sounds: 65 }, '四個首音全部補好了！'), 250);
        const next = cards.findIndex((_, index) => !done.has(index));
        setActive(next);
      } else {
        noteAttempt();
        cards[active].classList.add('wrong');
        setTimeout(() => cards[active]?.classList.remove('wrong'), 320);
        showToast('再聽一次，找找第一個聲音');
      }
    });
  }

  function renderFindWords() {
    const letters = ['P','E','N','B','A','G','M','A','P'];
    const targets = ['pen','bag','map'];
    cardShell(`<div class="target-list">${targets.map(word => `<span class="target-word" data-target="${word}">${word}</span>`).join('')}</div><div class="word-grid">${letters.map((letter,index) => `<button class="grid-letter" type="button" data-index="${index}">${letter}</button>`).join('')}</div><div class="selection-preview" aria-live="polite"></div>`, '依順序點 3 個字母，把單詞找出來');
    let selected = [];
    const found = new Set();
    const preview = document.querySelector('.selection-preview');
    const grid = document.querySelector('.word-grid');
    const update = () => {
      preview.textContent = selected.map(index => letters[index]).join('');
      grid.querySelectorAll('.grid-letter').forEach(button => button.classList.toggle('selected', selected.includes(Number(button.dataset.index))));
    };
    grid.addEventListener('click', event => {
      const button = event.target.closest('.grid-letter');
      if (!button || button.classList.contains('found')) return;
      const index = Number(button.dataset.index);
      if (selected.includes(index)) return;
      selected.push(index);
      update();
      if (selected.length < 3) return;
      const word = selected.map(i => letters[i]).join('').toLowerCase();
      if (targets.includes(word) && !found.has(word)) {
        found.add(word);
        selected.forEach(i => grid.querySelector(`[data-index="${i}"]`).classList.add('found'));
        document.querySelector(`[data-target="${word}"]`).classList.add('found');
        selected = [];
        update();
        speak(word);
        if (found.size === targets.length) setTimeout(() => finishStep({ words: 50 }, '三個單詞寶藏都找到了！'), 320);
      } else {
        noteAttempt();
        selected = [];
        update();
        showToast('這三個字母還不是目標單詞，再試試');
      }
    });
  }

  function renderLadders() {
    const groups = [
      { rime: 'at', items: [{ word:'bat', answer:'b', emoji:'🦇' }, { word:'cat', answer:'c', emoji:'🐱' }, { word:'hat', answer:'h', emoji:'🎩' }] },
      { rime: 'en', items: [{ word:'hen', answer:'h', emoji:'🐔' }, { word:'men', answer:'m', emoji:'👨' }, { word:'pen', answer:'p', emoji:'🖊️' }] }
    ];
    const flat = groups.flatMap(group => group.items.map(item => ({ ...item, rime: group.rime })));
    cardShell(`<div class="ladder-grid">${groups.map((group, groupIndex) => `<div class="ladder"><div class="ladder-title">-${group.rime} WORD FAMILY</div>${group.items.map((item,itemIndex) => { const index = groupIndex * 3 + itemIndex; return `<div class="rung ${index === 0 ? 'active' : ''}" data-index="${index}"><button class="emoji" type="button" data-speak="${item.word}" aria-label="播放 ${item.word}">${item.emoji}</button><div class="rung-word"><button class="rung-blank" type="button">_</button>${group.rime}</div></div>`; }).join('')}</div>`).join('')}</div><div class="letter-bank">${['b','c','h','m','p'].map(letter => `<button class="letter-chip" type="button" data-letter="${letter}">${letter}</button>`).join('')}</div>`, '看圖片，換掉第一個字母，爬上單詞階梯');
    let active = 0;
    const done = new Set();
    const rungs = [...document.querySelectorAll('.rung')];
    const setActive = index => {
      if (done.has(index)) return;
      active = index;
      rungs.forEach((rung, i) => rung.classList.toggle('active', i === index));
    };
    rungs.forEach((rung, index) => {
      rung.querySelector('.emoji').addEventListener('click', () => speak(flat[index].word));
      rung.querySelector('.rung-blank').addEventListener('click', () => setActive(index));
    });
    document.querySelector('.letter-bank').addEventListener('click', event => {
      const button = event.target.closest('[data-letter]');
      if (!button) return;
      if (button.dataset.letter === flat[active].answer) {
        rungs[active].querySelector('.rung-blank').textContent = button.dataset.letter;
        rungs[active].classList.add('done');
        done.add(active);
        speak(flat[active].word);
        if (done.size === flat.length) return setTimeout(() => finishStep({ words: 10 }, '兩座拼讀階梯都登頂了！'), 280);
        setActive(rungs.findIndex((_, index) => !done.has(index)));
      } else {
        noteAttempt();
        showToast('看看圖片，再換一個開頭字母');
      }
    });
  }

  function renderSentences() {
    const tasks = [
      { emoji:'🎒', title:'我的新書包', hint:'I have…', words:['school','a','bag','i','have'], expected:'i have a school bag' },
      { emoji:'👧📘', title:'在學校讀書', hint:'She reads…', words:['school','book','a','reads','at','she'], expected:'she reads a book at school' }
    ];
    cardShell(tasks.map((task,index) => `<div class="sentence-task" data-index="${index}"><div class="sentence-head"><span class="emoji">${task.emoji}</span><span><strong>${task.title}</strong><small>${task.hint}</small></span></div><div class="sentence-zone" aria-label="句子排列區"></div><div class="word-bank">${task.words.map((word,i) => `<button class="word-chip" type="button" data-chip="${i}" data-word="${word}">${word}</button>`).join('')}</div><button class="mini-check" type="button">檢查句子</button></div>`).join(''), '依序點單詞，排出完整句子；點上方單詞可放回');
    const complete = new Set();
    document.querySelectorAll('.sentence-task').forEach((taskEl, index) => {
      const selected = [];
      const zone = taskEl.querySelector('.sentence-zone');
      const bank = taskEl.querySelector('.word-bank');
      bank.addEventListener('click', event => {
        const chip = event.target.closest('.word-chip');
        if (!chip || complete.has(index)) return;
        selected.push({ id: chip.dataset.chip, word: chip.dataset.word });
        chip.classList.add('used');
        renderZone();
      });
      zone.addEventListener('click', event => {
        const chip = event.target.closest('.word-chip');
        if (!chip || complete.has(index)) return;
        const at = selected.findIndex(item => item.id === chip.dataset.id);
        if (at >= 0) {
          bank.querySelector(`[data-chip="${selected[at].id}"]`).classList.remove('used');
          selected.splice(at, 1);
          renderZone();
        }
      });
      taskEl.querySelector('.mini-check').addEventListener('click', () => {
        const sentence = selected.map(item => item.word).join(' ');
        if (sentence === tasks[index].expected) {
          complete.add(index);
          zone.classList.add('done');
          taskEl.querySelector('.mini-check').textContent = '完成 ✓';
          speak(index === 0 ? 'I have a school bag.' : 'She reads a book at school.');
          if (complete.size === tasks.length) setTimeout(() => finishStep({ words: 10 }, '你完成了兩個英文句子！'), 320);
        } else {
          noteAttempt();
          showToast('單詞順序還差一點，看看開頭提示');
        }
      });
      function renderZone() {
        zone.innerHTML = selected.map(item => `<button class="word-chip" type="button" data-id="${item.id}">${item.word}</button>`).join('');
      }
    });
  }

  function finishStep(contribution, message) {
    const index = state.current;
    if (!state.completed.includes(index)) {
      state.completed.push(index);
      const multiplier = (state.attempts[index] || 0) === 0 ? 1 : .82;
      Object.entries(contribution).forEach(([skill, value]) => {
        state.scores[skill] = Math.min(100, state.scores[skill] + Math.round(value * multiplier));
      });
      saveState();
      track('school_workbook_page_submit', { topic_type: topicTypeFor(index), is_correct: true, attempt_count: state.attempts[index] || 0 });
    }
    const isCoreEnd = index === 5;
    const isAllEnd = index === 7;
    showSuccess(isCoreEnd ? '主線任務完成！' : isAllEnd ? '彩蛋全收集！' : '太棒了！', message, () => {
      if (isCoreEnd || isAllEnd) {
        screen = 'results';
        if (isCoreEnd) track('school_workbook_core_complete', { duration_ms: Date.now() - state.startedAt });
        if (isAllEnd) track('school_workbook_bonus_complete');
      } else {
        state.current = index + 1;
        saveState();
      }
      render();
    });
  }

  function renderResults() {
    const bonusDone = state.completed.includes(7);
    const profileText = state.profile === 'new' ? '字母感知起步型' : '字母音探索型';
    const skillRows = [
      ['字母辨認', state.scores.letters],
      ['字母書寫', state.scores.writing],
      ['首音感知', state.scores.sounds],
      ['短詞辨認', state.scores.words]
    ];
    const level = score => score >= 90 ? '很穩定' : score >= 72 ? '已上手' : '起步中';
    app.innerHTML = `<section class="results">
      <div class="result-badge" aria-label="完成徽章">🏅</div>
      <span class="eyebrow">${bonusDone ? '8 關全部完成' : '6 關主線完成'}</span>
      <h1>開學英語熱身<br>完成啦！</h1>
      <p class="result-lead">孩子已經跨出很棒的第一步。這份摘要不是考試分數，而是下一步學習的起點。</p>
      <div class="report-card">
        <h2>孩子的啟蒙起點：${profileText}</h2>
        <p>根據本次互動表現整理</p>
        ${skillRows.map(([name,score]) => `<div class="skill-row"><span>${name}</span><span class="skill-track"><span style="width:${Math.max(18, score)}%"></span></span><span class="skill-level">${level(score)}</span></div>`).join('')}
      </div>
      <div class="next-step"><strong>老師建議的下一步</strong><span>${state.profile === 'new' ? '從字母音、圖像詞彙開始，讓孩子在生活情境裡自然開口。' : '接著練習 CVC 拼讀與主題句型，把認得的字母變成說得出的英文。'}</span></div>
      <div class="result-actions">
        <a class="primary-button" id="trialCta" href="${escapeAttr(trialUrl)}" target="_blank" rel="noopener noreferrer">領取免費英語體驗課 <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></a>
        ${bonusDone ? '' : '<button class="secondary-button" id="bonusButton" type="button">挑戰 2 顆彩蛋星 ★</button>'}
        <div class="button-row"><button class="ghost-button" id="shareButton" type="button">分享成果</button><button class="ghost-button" id="restartButton" type="button">重新玩一次</button></div>
      </div>
      <p class="tiny-note">適合 4–7 歲英語零基礎至初階孩子・結果僅供學習方向參考</p>
    </section>`;
    burstConfetti();
    app.querySelector('#trialCta').addEventListener('click', () => track('school_workbook_trial_cta_click', { abc_self_report: state.profile, bonus_complete: bonusDone }));
    app.querySelector('#bonusButton')?.addEventListener('click', () => {
      state.current = 6;
      saveState();
      screen = 'quiz';
      track('school_workbook_bonus_start');
      render();
    });
    app.querySelector('#shareButton').addEventListener('click', shareResult);
    app.querySelector('#restartButton').addEventListener('click', () => {
      const sound = state.sound;
      state = defaultState();
      state.sound = sound;
      saveState();
      screen = 'intro';
      render();
    });
    track('school_workbook_result_view', { abc_self_report: state.profile, bonus_complete: bonusDone });
  }

  function shareResult() {
    const data = { title: '我的開學英語熱身完成啦！', text: '我完成了 JOJO 開學英語啟蒙練習冊，一起來挑戰吧！', url: location.href.split('?')[0] };
    if (navigator.share) {
      navigator.share(data).then(() => track('school_workbook_share')).catch(() => {});
    } else {
      navigator.clipboard?.writeText(`${data.text} ${data.url}`).then(() => showToast('分享文字已複製'));
    }
  }

  function showSuccess(title, message, callback) {
    const backdrop = document.createElement('div');
    backdrop.className = 'feedback-backdrop';
    backdrop.innerHTML = `<div class="feedback-sheet" role="dialog" aria-modal="true"><div class="feedback-icon">⭐</div><h2>${title}</h2><p>${message}</p><button class="primary-button" type="button">${state.current === 5 || state.current === 7 ? '看看我的成果' : '前往下一關'}</button></div>`;
    document.body.appendChild(backdrop);
    burstConfetti(22);
    backdrop.querySelector('button').addEventListener('click', () => { backdrop.remove(); callback(); });
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
  }

  function noteAttempt() {
    state.attempts[state.current] = (state.attempts[state.current] || 0) + 1;
    saveState();
  }

  function speak(text) {
    if (!state.sound || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = .78;
    utterance.pitch = 1.05;
    speechSynthesis.speak(utterance);
  }

  function burstConfetti(count = 42) {
    const colors = ['#315fdd','#ffce47','#ff765f','#43b97f','#8d6be8'];
    confetti.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement('i');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * .55}s`;
      piece.style.setProperty('--drift', `${(Math.random() - .5) * 170}px`);
      confetti.appendChild(piece);
    }
    setTimeout(() => { confetti.innerHTML = ''; }, 3500);
  }

  function topicTypeFor(index) {
    return ['english_matching','english_shadow_writing','english_circle_picture','english_matching','english_initial_sound_spelling','english_find_word','english_ladder','english_sentence_word_bank'][index];
  }

  function speakerSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a4 4 0 0 1 0 6"/></svg>';
  }

  function escapeAttr(value) {
    return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  backButton.addEventListener('click', () => {
    if (screen === 'quiz' && state.completed.includes(5)) screen = 'results';
    else screen = 'intro';
    render();
  });

  soundButton.addEventListener('click', () => {
    state.sound = !state.sound;
    if (!state.sound && 'speechSynthesis' in window) speechSynthesis.cancel();
    saveState();
    updateSoundButton();
  });

  function updateSoundButton() {
    soundButton.setAttribute('aria-pressed', String(state.sound));
    soundButton.setAttribute('aria-label', state.sound ? '關閉聲音' : '開啟聲音');
  }

  render();
})();
