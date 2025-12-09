// content.js (Manifest V3 / 完全版・上限トースト対応)
(() => {
  "use strict";

  /************* 設定 & 保存キー *************/
  const DEFAULTS = {
    softTagLimit: 20, // -1 で警告無効
    presets: {
      "よく使う": ["Unity", "Booth", "Utility"],
      "VRCワールド": ["VRChat", "World", "Udon", "UdonSharp"]
    }
  };
  const KEY = {
    recent: "bth:recentTags",
    item: (id) => `bth:item:${id}:tags`,
    opts: "bth:options"
  };

  /************* タグ入力欄セレクタ *************/
  const TAG_SELECTORS = [
    'input.js-item-tags-array[placeholder="タグの追加"]',
    '#item_tag input.js-item-tags-array[placeholder="タグの追加"]'
  ];

  /************* ユーティリティ *************/
  const getItemId = () =>
    (location.pathname.match(/\/items\/(\d+)\/edit/) || [])[1] || "unknown";

  const toHalf = (s) => (s || "").replace(/[，、]/g, ",").replace(/\u3000/g, " ");
  const splitTags = (raw) =>
    toHalf(raw).split(/[, \t\r\n]+/).map(t => t.trim()).filter(Boolean);
  const uniqKeep = (arr) => {
    const seen = new Set(); const out = [];
    for (const t of arr) if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    return out;
  };

  const stGet = (key, defVal) =>
    new Promise((res) => chrome.storage.local.get(key, (o) => res(o[key] ?? defVal)));
  const stSet = (obj) => new Promise((res) => chrome.storage.local.set(obj, res));
  const loadOpts = () =>
    stGet(KEY.opts, null).then((opts) => Object.assign({}, DEFAULTS, opts || {}));

  // 現在入力欄に表示されているタグを収集（再追加を避けて余計な送信を抑える）
  function collectExistingTags(input) {
    const holder = input.closest("#item_tag") || input.parentElement || document;
    const out = new Set();
    const candidates = holder.querySelectorAll(
      "[data-tag-name], .js-item-tags-array-tag, .c-tag, .tag, .tag-label"
    );
    candidates.forEach((el) => {
      const txt = (el.getAttribute("data-tag-name") || el.textContent || "").trim();
      if (txt) out.add(txt);
    });
    return out;
  }

  // タグ入力速度（入力間隔 / Enter 確定待ち）
  const INPUT_INTERVAL_MS = 20;
  const ENTER_DELAY_MS = 80;

  function press(el, key) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup",   { key, bubbles: true }));
  }

  // タグ1つを入力→Enter確定
  function addOneTag(el, tag) {
    return new Promise((resolve) => {
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      let i = 0;
      function step() {
        if (i < tag.length) {
          el.value += tag[i++];
          el.dispatchEvent(new Event("input", { bubbles: true }));
          setTimeout(step, INPUT_INTERVAL_MS);
        } else {
          press(el, "Enter");           // チップ化
          setTimeout(resolve, ENTER_DELAY_MS); // 確定待ち
        }
      }
      step();
    });
  }
  function addTags(el, tags) {
    const list = tags.filter(Boolean);
    let p = Promise.resolve();
    for (const t of list) p = p.then(() => addOneTag(el, t));
    return p;
  }

  /* ======= 画面トースト ======= */
  function showToast(message, kind = "warn", timeout = 4000){
    document.querySelectorAll(".bth-toast").forEach(n => n.remove());
    const n = document.createElement("div");
    n.className = `bth-toast ${kind}`;
    n.textContent = message;
    document.body.appendChild(n);
    if (timeout > 0){
      setTimeout(() => n.remove(), timeout);
    }
  }

  // 追加件数での上限制御（true=許可/false=ブロック）
  function checkLimitAndNotify(limit, addCount){
    if (limit < 0) return true; // 無効
    if (addCount > limit){
      showToast(`選択したタグが上限（${limit}）を超えています：${addCount} 件`, "err");
      return false; // 超過 ⇒ ブロック
    }
    return true;
  }

  /************* スタイル注入（上下矢印・余白・SB回避） *************/
  function injectStyles() {
    if (document.getElementById("__bth_style__")) return;
    const css = `
      .bth-inline-wrap{position:absolute; right:8px; top:50%; transform:translateY(-50%); z-index:2; display:inline-flex; gap:6px}
      .bth-btn{padding:6px 10px; border:1px solid #c6cbd1; border-radius:6px; cursor:pointer; background:#fff; font-size:12px}
      .bth-btn:hover{background:#f6f8fa}

      /* 画面端とパネルの余白を 24px 確保し、はみ出す場合は内部スクロール */
      .bth-panel{
        position:absolute; z-index:2001;
        min-width:320px;
        max-width: min(480px, calc(100vw - 48px));  /* 左右 24px 余白 */
        max-height: calc(100vh - 48px);             /* 上下 24px 余白 */
        overflow:auto;
        background:#fff; border:1px solid #d0d7de; border-radius:8px;
        box-shadow:0 8px 24px rgba(140,149,159,.2);
        padding:12px; visibility:hidden;
      }
      .bth-panel h4{margin:0 0 8px; font-size:14px; display:flex; align-items:center; justify-content:space-between; gap:8px}
      .bth-muted{color:#6e7781; font-size:12px}
      .bth-section{margin-bottom:10px}
      .bth-grid{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px}
      .bth-chip{display:flex; align-items:center; gap:6px; border:1px solid #d0d7de; border-radius:999px; padding:4px 8px; font-size:12px}
      .bth-chip input{accent-color:#ec407a}
      .bth-text{width:100%; min-height:46px; border:1px solid #d0d7de; border-radius:6px; padding:6px; font-size:12px}
      .bth-actions{display:flex; justify-content:flex-end; gap:8px; margin-top:8px}
      .bth-row{display:flex; gap:8px; align-items:center}
      .bth-panel.bth-show{visibility:visible}

      /* 上下の三角（枠/面の二重） */
      .bth-panel::before,.bth-panel::after{content:""; position:absolute; width:0; height:0}
      .bth-panel.bth-down::before{top:-7px; border-left:7px solid transparent; border-right:7px solid transparent; border-bottom:7px solid #d0d7de}
      .bth-panel.bth-down::after{top:-6px; border-left:6px solid transparent; border-right:6px solid transparent; border-bottom:6px solid #fff}
      .bth-panel.bth-up::before{bottom:-7px; border-left:7px solid transparent; border-right:7px solid transparent; border-top:7px solid #d0d7de}
      .bth-panel.bth-up::after{bottom:-6px; border-left:6px solid transparent; border-right:6px solid transparent; border-top:6px solid #fff}
      .bth-panel.bth-down::before,.bth-panel.bth-down::after{left:calc(100% - 46px)}
      .bth-panel.bth-up::before,.bth-panel.bth-up::after{left:calc(100% - 46px)}

      /* 設定ビュー */
      .bth-settings{display:none}
      .bth-settings.show{display:block}
      .bth-main.hide{display:none}
      .bth-field{display:grid; grid-template-columns:120px 1fr; gap:8px; align-items:center; margin:6px 0}
      .bth-input, .bth-area{width:100%; border:1px solid #d0d7de; border-radius:6px; padding:6px; font-size:12px}
      .bth-area{min-height:120px; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace}
      .bth-spacer{flex:1}

      /* toast */
      .bth-toast{
        position:fixed;
        right:16px;
        bottom:16px; /* 横スクロールバーに被らない程度の余白 */
        z-index:2147483646;
        max-width:420px;
        background:#fff;
        border:1px solid #d0d7de;
        border-radius:8px;
        box-shadow:0 8px 24px rgba(140,149,159,.2);
        padding:10px 12px;
        font-size:13px;
        line-height:1.5;
      }
      .bth-toast.warn{ border-left:4px solid #d97706; }
      .bth-toast.err{  border-left:4px solid #dc2626; }

      /* 狭幅時は1列 */
      @media (max-width: 560px){
        .bth-grid{grid-template-columns:1fr}
      }
    `.trim();
    const style = document.createElement("style");
    style.id = "__bth_style__";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /************* パネルのサイズ＆位置（上下自動・画面内に収める） *************/
  // 上下マージン 24px / アンカーとの間隔 10px。横スクロールバーを避ける。
  function positionPanel(panel, anchorEl) {
    const EDGE = 24;
    const GAP  = 10;

    // 非オーバーレイ型の横スクロールバー高さを検出
    const de = document.documentElement;
    const HSB = Math.max(0, window.innerHeight - de.clientHeight);

    const r = anchorEl.getBoundingClientRect();

    // 測定のため一時配置＆初期化
    panel.style.top = "0px";
    panel.style.left = "0px";
    panel.classList.remove("bth-up","bth-down","bth-show");
    if (!panel.isConnected) document.body.appendChild(panel);

    // パネルの実寸を取得しつつ、画面に収まる最大値を指示
    panel.style.maxHeight = `calc(100vh - ${EDGE * 2 + HSB}px)`;
    panel.style.maxWidth  = `min(480px, calc(100vw - ${EDGE * 2}px))`;
    panel.style.overflow  = "auto";

    const ph = Math.min(panel.offsetHeight || 260, window.innerHeight - (EDGE * 2 + HSB));
    const pw = Math.min(panel.offsetWidth  || 360, window.innerWidth  -  EDGE * 2);

    // 下に開くか上に開くかを決定
    const spaceBelow = window.innerHeight - r.bottom - HSB;
    const openDown = spaceBelow >= ph + GAP || r.top < ph;

    // 垂直位置（上下端の余白 + HSB を厳守）
    let top;
    if (openDown) {
      const maxTop = window.scrollY + window.innerHeight - EDGE - HSB - ph;
      top = Math.min(window.scrollY + r.bottom + GAP, maxTop);
      panel.classList.add("bth-down");
    } else {
      const minTop = window.scrollY + EDGE;
      top = Math.max(window.scrollY + r.top - ph - GAP, minTop);
      panel.classList.add("bth-up");
    }

    // 水平位置（右寄せ＋左右端の余白を厳守）
    const minLeft = window.scrollX + EDGE;
    const maxLeft = window.scrollX + window.innerWidth - EDGE - pw;
    let left = window.scrollX + (r.right - pw);
    left = Math.max(minLeft, Math.min(maxLeft, left));

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.classList.add("bth-show");
  }

  /************* パネル構築（メイン + 設定ビュー） *************/
  function makePanel({ anchorEl, opts, recent, onConfirm, onSavedOptions }) {
    const panel = document.createElement("div");
    panel.className = "bth-panel";

    // --- メインビュー ---
    const presetSections = Object.entries(opts.presets || {});
    const presetDom = presetSections.length
      ? presetSections.map(([name, list]) => {
          const items = (list||[]).map(t => `
            <label class="bth-chip">
              <input type="checkbox" data-kind="preset" value="${t}">
              <span>${t}</span>
            </label>`).join("");
          return `<div class="bth-section">
            <div class="bth-muted" style="margin-bottom:4px;">プリセット：${name}</div>
            <div class="bth-grid">${items}</div>
          </div>`;
        }).join("")
      : `<div class="bth-muted bth-section">プリセット未設定です</div>`;

    const recentDom = Array.isArray(recent) && recent.length
      ? `<div class="bth-section">
           <div class="bth-muted" style="margin-bottom:4px;">最近タグ</div>
           <div class="bth-grid">
             ${recent.map(t => `
               <label class="bth-chip"><input type="checkbox" data-kind="recent" value="${t}"><span>${t}</span></label>
             `).join("")}
           </div>
         </div>`
      : `<div class="bth-muted bth-section">最近タグは未保存です</div>`;

    panel.innerHTML = `
      <div class="bth-main">
        <h4>
          タグを選択して「確定」で一括追加
          <span class="bth-spacer"></span>
          <button class="bth-btn" data-act="open-settings" title="設定">設定</button>
        </h4>
        ${presetDom}
        ${recentDom}
        <div class="bth-section">
          <div class="bth-muted" style="margin-bottom:4px;">自由入力（カンマ/空白/改行区切り）</div>
          <textarea class="bth-text" placeholder="例）VRChat, Unity&#10;Booth ツール"></textarea>
        </div>
        <div class="bth-actions">
          <button class="bth-btn" data-act="cancel">キャンセル</button>
          <button class="bth-btn" data-act="confirm">確定</button>
        </div>
      </div>

      <div class="bth-settings">
        <h4>
          設定
          <span class="bth-spacer"></span>
          <button class="bth-btn" data-act="back">戻る</button>
        </h4>
        <div class="bth-field">
          <label>ソフト上限</label>
          <input class="bth-input" type="number" min="-1" step="1" value="${Number(opts.softTagLimit) ?? 20}" data-settings="softTagLimit">
        </div>
        <div class="bth-section">
          <div class="bth-muted" style="margin-bottom:4px;">プリセット（JSON 形式：{ "グループ名": ["タグ", ...], ... }）</div>
          <textarea class="bth-area" data-settings="presets">${JSON.stringify(opts.presets || {}, null, 2)}</textarea>
        </div>
        <div class="bth-actions">
          <button class="bth-btn" data-act="export">エクスポート</button>
          <button class="bth-btn" data-act="import">サンプル挿入</button>
          <span class="bth-spacer"></span>
          <button class="bth-btn" data-act="save-settings">保存</button>
        </div>
      </div>
    `;

    // クリックハンドラ
    panel.addEventListener("click", async (e) => {
      const btn = e.target.closest("button"); if (!btn) return;
      const act = btn.getAttribute("data-act");

      if (act === "cancel") {
        panel.remove();
      } else if (act === "confirm") {
        const checked = [...panel.querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value);
        const freeTxt = panel.querySelector(".bth-text")?.value || "";
        const selected = uniqKeep([...checked, ...splitTags(freeTxt)]);
        onConfirm(selected).finally(() => panel.remove());
      } else if (act === "open-settings") {
        panel.querySelector(".bth-main")?.classList.add("hide");
        panel.querySelector(".bth-settings")?.classList.add("show");
        positionPanel(panel, anchorEl); // 高さが変わるため再配置
      } else if (act === "back") {
        panel.querySelector(".bth-settings")?.classList.remove("show");
        panel.querySelector(".bth-main")?.classList.remove("hide");
        positionPanel(panel, anchorEl);
      } else if (act === "save-settings") {
        const soft = Number(panel.querySelector('[data-settings="softTagLimit"]').value);
        const presetText = panel.querySelector('[data-settings="presets"]').value;
        let parsed;
        try {
          parsed = JSON.parse(presetText || "{}");
          if (Object(parsed) !== parsed) throw new Error("JSON is not an object");
        } catch (err) {
          alert("プリセットJSONの形式が不正です。\n" + err.message);
          return;
        }
        const newOpts = { softTagLimit: isNaN(soft) ? 20 : soft, presets: parsed };
        await stSet({ [KEY.opts]: newOpts });
        onSavedOptions?.(newOpts);
        alert("設定を保存しました。");
        panel.remove();
      } else if (act === "export") {
        try {
          const txt = panel.querySelector('[data-settings="presets"]').value;
          await navigator.clipboard.writeText(txt);
          alert("プリセットJSONをクリップボードにコピーしました。");
        } catch {
          alert("コピーに失敗しました。手動で選択してコピーしてください。");
        }
      } else if (act === "import") {
        const sample = JSON.stringify({
          "よく使う": ["Unity","Booth","Utility"],
          "3Dモデル": ["VRChat","Avatar","World"],
          "配布規約": ["Readme","License"]
        }, null, 2);
        panel.querySelector('[data-settings="presets"]').value = sample;
      }
    });

    // DOM へ追加 & 位置確定
    document.body.appendChild(panel);
    positionPanel(panel, anchorEl);

    // 外クリックで閉じる
    setTimeout(() => {
      const onDocClick = (ev) => {
        if (!panel.contains(ev.target) && ev.target !== anchorEl) {
          panel.remove();
          document.removeEventListener("mousedown", onDocClick, true);
        }
      };
      document.addEventListener("mousedown", onDocClick, true);
    }, 0);

    return panel;
  }

  /************* ボタンを“右横”に固定設置 *************/
  function mountButtonNextTo(input) {
    if (input.dataset.bthMounted === "1") return;
    input.dataset.bthMounted = "1";

    injectStyles();

    const container = input.closest(".item-search-input__container") || input.parentElement || input;
    const pr = parseInt(getComputedStyle(input).paddingRight || "0", 10);
    input.style.paddingRight = Math.max(pr, 110) + "px";

    const anchor = document.createElement("span");
    anchor.className = "bth-inline-wrap";

    const btn = document.createElement("button");
    btn.className = "bth-btn";
    btn.textContent = "タグ自動追加";
    anchor.appendChild(btn);

    const cs = getComputedStyle(container);
    if (cs.position === "static") container.style.position = "relative";
    container.appendChild(anchor);

    // クリックで専用UI
    btn.addEventListener("click", async () => {
      const id = getItemId();
      const [opts, recent] = await Promise.all([loadOpts(), stGet(KEY.recent, [])]);
      makePanel({
        anchorEl: btn,
        opts,
        recent: Array.isArray(recent) ? recent : [],
        onConfirm: async (selectedTags) => {
          if (!selectedTags.length) return;
          const uniq = uniqKeep(selectedTags);
          const existing = collectExistingTags(input);
          const toAdd = uniq.filter((t) => !existing.has(t));

          // ここで上限チェック（ブロック）
          const ok = checkLimitAndNotify(opts.softTagLimit, toAdd.length);
          if (!ok) return;

          await addTags(input, toAdd);
          await stSet({ [KEY.item(id)]: uniq, [KEY.recent]: uniq });
        },
        onSavedOptions: () => {
          // 設定保存後に即再オープンして新内容を反映（任意）
          setTimeout(async () => {
            const [o2, r2] = await Promise.all([loadOpts(), stGet(KEY.recent, [])]);
            makePanel({
              anchorEl: btn, opts: o2, recent: r2 || [],
              onConfirm: async (tags) => {
                if (!tags.length) return;
                const uniq = uniqKeep(tags);
                const existing = collectExistingTags(input);
                const toAdd = uniq.filter((t) => !existing.has(t));

                // 再チェック
                const ok = checkLimitAndNotify(o2.softTagLimit, toAdd.length);
                if (!ok) return;

                await addTags(input, toAdd);
                await stSet({ [KEY.item(id)]: uniq, [KEY.recent]: uniq });
              }
            });
          }, 50);
        }
      });
    });

    // 画面サイズやスクロールでパネル位置・サイズを追従
    const reloc = () => {
      const p = document.querySelector(".bth-panel");
      if (p && p.isConnected && !p.hidden) positionPanel(p, btn);
    };
    window.addEventListener("resize", reloc);
    window.addEventListener("scroll", reloc, { passive: true });
  }

  /************* 初期化（SPA 対応） *************/
  function findTagInput() {
    for (const s of TAG_SELECTORS) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }
  function bootstrap() {
    const input = findTagInput();
    if (input) mountButtonNextTo(input);
  }
  const mo = new MutationObserver(() => bootstrap());
  mo.observe(document.documentElement, { childList: true, subtree: true });
  bootstrap();
})();
