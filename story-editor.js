// ═══════════════════════════════════════════════════════════
// STORY EDITOR — Phase 1 (FIXED — robust toolbar injection)
// Filters · Text · Sticker · Draw · Adjustments
// ═══════════════════════════════════════════════════════════

;(function () {
  'use strict'

  // ── Editor state ─────────────────────────────────────────
  let drawCanvas     = null
  let drawCtx        = null
  let isDrawing      = false
  let currentFilter  = 'none'
  let currentAdj     = { brightness: 100, contrast: 100, blur: 0 }
  let textItems      = []
  let stickerItems   = []
  let drawColor      = '#ff3b30'
  let drawSize       = 4
  let editorMode     = null
  let sourceImage    = null
  let isVideoMode    = false

  const FILTERS = [
    { id:'none',      label:'Normal',   css:'' },
    { id:'clarendon', label:'Clarendon',css:'brightness(1.1) contrast(1.2) saturate(1.35)' },
    { id:'gingham',   label:'Gingham',  css:'brightness(1.05) hue-rotate(-10deg) sepia(0.08)' },
    { id:'moon',      label:'Moon',     css:'grayscale(1) brightness(1.1) contrast(1.1)' },
    { id:'lark',      label:'Lark',     css:'brightness(1.08) contrast(0.92) saturate(1.1) sepia(0.05)' },
    { id:'reyes',     label:'Reyes',    css:'brightness(1.1) contrast(0.9) saturate(0.8) sepia(0.22)' },
    { id:'juno',      label:'Juno',     css:'brightness(1.08) contrast(1.1) saturate(1.3) hue-rotate(5deg)' },
    { id:'slumber',   label:'Slumber',  css:'brightness(0.95) saturate(0.85) sepia(0.2)' },
    { id:'crema',     label:'Crema',    css:'brightness(1.05) contrast(0.95) saturate(0.9) sepia(0.15)' },
    { id:'ludwig',    label:'Ludwig',   css:'brightness(1.05) contrast(1.08) saturate(1.1)' },
    { id:'aden',      label:'Aden',     css:'brightness(1.05) hue-rotate(-20deg) saturate(0.9) sepia(0.15)' },
    { id:'perpetua',  label:'Perpetua', css:'brightness(1.05) contrast(1.1) saturate(0.8) sepia(0.1)' },
  ]

  const STICKERS = [
    '😍','🔥','💖','✨','😂','🎉','💯','👑',
    '🌙','⭐','🌈','💫','🖤','💜','💙','❤️',
    '🌸','🍒','🦋','🐼','🎵','🎶','💎','🤍',
    '😈','👻','🫶','💪','🙈','🌹','🥰','😎'
  ]

  const FONTS = [
    { id:'Arial',     label:'Classic' },
    { id:'Georgia',   label:'Serif' },
    { id:'"Courier New"', label:'Mono' },
    { id:'Impact',    label:'Bold' },
    { id:'"Trebuchet MS"', label:'Modern' },
  ]

  const TEXT_ANIMS = [
    { id:'none',  label:'None' },
    { id:'fade',  label:'Fade' },
    { id:'slide', label:'Slide' },
    { id:'zoom',  label:'Zoom' },
  ]

  // ── Init ─────────────────────────────────────────────────
  function init() {
    injectEditorHTML()
    injectEditorCSS()
    bindEditorEvents()
    hookIntoStoryUpload()
    startToolbarPolling()
    console.log('[StoryEditor] initialised')
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    setTimeout(init, 300)
  }

  // ══════════════════════════════════════════════════════════
  // INJECT EDITOR HTML
  // ══════════════════════════════════════════════════════════
  function injectEditorHTML() {
    if (document.getElementById('storyEditorPanel')) return

    const panel = document.createElement('div')
    panel.id = 'storyEditorPanel'
    panel.innerHTML = `
      <div id="sePanelTools">
        <button class="se-tool-btn active" data-mode="filter"><span>🎨</span><span>Filter</span></button>
        <button class="se-tool-btn" data-mode="text"><span>🔤</span><span>Text</span></button>
        <button class="se-tool-btn" data-mode="sticker"><span>😊</span><span>Sticker</span></button>
        <button class="se-tool-btn" data-mode="draw"><span>✏️</span><span>Draw</span></button>
        <button class="se-tool-btn" data-mode="adjust"><span>⚡</span><span>Adjust</span></button>
      </div>
      <div class="se-panel" id="sePanelFilter"><div id="seFilterList"></div></div>
      <div class="se-panel" id="sePanelText">
        <div class="se-row">
          <input id="seTextInput" type="text" placeholder="Type here..." maxlength="60">
          <button id="seTextAdd">Add</button>
        </div>
        <div class="se-row">
          <label>Font</label>
          <select id="seTextFont">${FONTS.map(f=>`<option value="${f.id}">${f.label}</option>`).join('')}</select>
          <label>Size</label>
          <input id="seTextSize" type="range" min="14" max="60" value="24">
        </div>
        <div class="se-row">
          <label>Color</label>
          <div id="seTextColors">
            ${['#ffffff','#000000','#ff3b30','#ff9500','#ffcc00','#34c759','#00c7be','#007aff','#af52de','#ff2d55'].map(col=>
              `<div class="se-color-dot" data-col="${col}" style="background:${col};"></div>`).join('')}
          </div>
        </div>
        <div class="se-row">
          <label>BG</label>
          <div id="seTextBgColors">
            <div class="se-color-dot se-color-active" data-bg="none" style="background:transparent;border:1px dashed rgba(255,255,255,0.4);">∅</div>
            ${['rgba(0,0,0,0.5)','rgba(255,255,255,0.5)','rgba(255,59,48,0.6)','rgba(52,199,89,0.6)','rgba(0,122,255,0.6)'].map(col=>
              `<div class="se-color-dot" data-bg="${col}" style="background:${col};"></div>`).join('')}
          </div>
          <label>Anim</label>
          <select id="seTextAnim">${TEXT_ANIMS.map(a=>`<option value="${a.id}">${a.label}</option>`).join('')}</select>
        </div>
      </div>
      <div class="se-panel" id="sePanelSticker">
        <div id="seStickerGrid">${STICKERS.map(e=>`<div class="se-sticker-item">${e}</div>`).join('')}</div>
      </div>
      <div class="se-panel" id="sePanelDraw">
        <div class="se-row">
          <label>Color</label>
          <div id="seDrawColors">
            ${['#ff3b30','#ff9500','#ffcc00','#34c759','#007aff','#ffffff','#000000','#af52de'].map(col=>
              `<div class="se-color-dot" data-drawcol="${col}" style="background:${col};"></div>`).join('')}
          </div>
        </div>
        <div class="se-row">
          <label>Size</label>
          <input id="seDrawSize" type="range" min="2" max="24" value="4">
          <button id="seDrawClear">Clear</button>
          <button id="seDrawUndo">Undo</button>
        </div>
      </div>
      <div class="se-panel" id="sePanelAdjust">
        <div class="se-adjust-row"><label>☀️ Brightness</label><input type="range" id="seAdjBrightness" min="50" max="150" value="100"><span id="seAdjBrightnessVal">100</span></div>
        <div class="se-adjust-row"><label>◑ Contrast</label><input type="range" id="seAdjContrast" min="50" max="150" value="100"><span id="seAdjContrastVal">100</span></div>
        <div class="se-adjust-row"><label>🌫 Blur</label><input type="range" id="seAdjBlur" min="0" max="10" value="0"><span id="seAdjBlurVal">0</span></div>
      </div>
    `
    document.body.appendChild(panel)
    buildFilterList()
  }

  function buildFilterList() {
    const list = document.getElementById('seFilterList')
    if (!list) return
    list.innerHTML = FILTERS.map(f => `
      <div class="se-filter-item ${f.id==='none'?'active':''}" data-filter="${f.id}">
        <div class="se-filter-thumb" style="filter:${f.css};"><div class="se-filter-thumb-inner"></div></div>
        <span>${f.label}</span>
      </div>
    `).join('')
  }

  // ══════════════════════════════════════════════════════════
  // INJECT CSS
  // ══════════════════════════════════════════════════════════
  function injectEditorCSS() {
    if (document.getElementById('seStyles')) return
    const style = document.createElement('style')
    style.id = 'seStyles'
    style.textContent = `
#storyEditorPanel {
  display:none; position:relative; bottom:0; left:0; right:0; z-index:5;
  background:rgba(0,0,0,0.92); border-top:1px solid rgba(255,255,255,0.1);
  border-radius:16px 16px 0 0; flex-direction:column;
  padding-bottom:env(safe-area-inset-bottom,0px);
}
#storyEditorPanel.active { display:flex; }

#sePanelTools { display:flex; justify-content:space-around; padding:10px 6px 6px; border-bottom:1px solid rgba(255,255,255,0.06); }
.se-tool-btn {
  display:flex; flex-direction:column; align-items:center; gap:3px;
  background:none; border:none; color:rgba(255,255,255,0.5);
  font-size:20px; cursor:pointer; padding:6px 10px; border-radius:10px;
  transition:color 0.2s,background 0.2s; -webkit-tap-highlight-color:transparent; min-width:52px;
}
.se-tool-btn span:last-child { font-size:9px; letter-spacing:0.5px; }
.se-tool-btn.active { color:white; background:rgba(255,255,255,0.1); }
.se-tool-btn:active { transform:scale(0.92); }

.se-panel { display:none; padding:10px 12px 12px; max-height:180px; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; }
.se-panel.active { display:block; }
.se-panel::-webkit-scrollbar { display:none; }

.se-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
.se-row label { font-size:11px; color:rgba(255,255,255,0.5); letter-spacing:0.5px; flex-shrink:0; }

#seFilterList { display:flex; gap:10px; overflow-x:auto; padding:4px 2px 8px; -webkit-overflow-scrolling:touch; }
#seFilterList::-webkit-scrollbar { display:none; }
.se-filter-item { display:flex; flex-direction:column; align-items:center; gap:5px; cursor:pointer; flex-shrink:0; -webkit-tap-highlight-color:transparent; }
.se-filter-item span { font-size:10px; color:rgba(255,255,255,0.55); letter-spacing:0.3px; }
.se-filter-item.active span { color:white; }
.se-filter-item.active .se-filter-thumb { outline:2px solid white; outline-offset:2px; }
.se-filter-thumb { width:56px; height:72px; border-radius:8px; overflow:hidden; background:#222; transition:outline 0.15s; }
.se-filter-thumb-inner { width:100%; height:100%; background:linear-gradient(135deg,#c8d8f8 0%,#d4c8f0 50%,#e8c0e0 100%); }

#seTextInput { flex:1; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:8px 10px; color:white; font-size:14px; outline:none; }
#seTextInput::placeholder { color:rgba(255,255,255,0.3); }
#seTextAdd { background:white; color:black; border:none; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }
#seTextSize { flex:1; max-width:80px; accent-color:white; }

#seTextColors, #seTextBgColors, #seDrawColors { display:flex; gap:6px; flex-wrap:wrap; }
.se-color-dot { width:22px; height:22px; border-radius:50%; cursor:pointer; border:2px solid transparent; display:flex; align-items:center; justify-content:center; font-size:11px; color:rgba(255,255,255,0.6); transition:border-color 0.15s,transform 0.12s; flex-shrink:0; }
.se-color-dot.active { border-color:white; transform:scale(1.2); }
.se-color-dot:active { transform:scale(0.9); }

select#seTextFont, select#seTextAnim { background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:6px; color:white; padding:5px 8px; font-size:12px; outline:none; }
select#seTextFont option, select#seTextAnim option { background:#111; }

#seStickerGrid { display:grid; grid-template-columns:repeat(8,1fr); gap:8px; padding:4px; }
.se-sticker-item { font-size:28px; text-align:center; cursor:pointer; padding:4px; border-radius:8px; transition:background 0.15s,transform 0.12s; -webkit-tap-highlight-color:transparent; }
.se-sticker-item:active { background:rgba(255,255,255,0.1); transform:scale(1.2); }

#seDrawSize { flex:1; max-width:100px; accent-color:white; }
#seDrawClear, #seDrawUndo { background:rgba(255,255,255,0.12); border:none; border-radius:8px; padding:7px 12px; color:white; font-size:12px; cursor:pointer; }

.se-adjust-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.se-adjust-row label { font-size:12px; color:rgba(255,255,255,0.6); width:110px; flex-shrink:0; }
.se-adjust-row input[type=range] { flex:1; accent-color:white; }
.se-adjust-row span { font-size:11px; color:rgba(255,255,255,0.5); width:28px; text-align:right; }

#seDrawCanvas { position:absolute; inset:0; border-radius:16px; touch-action:none; }

.se-overlay-item { position:absolute; cursor:move; user-select:none; touch-action:none; -webkit-tap-highlight-color:transparent; transform-origin:center center; }
.se-overlay-item .se-delete-btn { position:absolute; top:-10px; right:-10px; width:20px; height:20px; background:rgba(255,59,48,0.9); border-radius:50%; display:none; align-items:center; justify-content:center; font-size:12px; color:white; cursor:pointer; line-height:1; }
.se-overlay-item.selected .se-delete-btn { display:flex; }
.se-overlay-item.selected { outline:1px dashed rgba(255,255,255,0.5); outline-offset:4px; }

@keyframes seTextFade { 0%,100%{opacity:0.3;} 50%{opacity:1;} }
@keyframes seTextSlide { 0%{transform:translateX(-8px);opacity:0.5;} 100%{transform:translateX(0);opacity:1;} }
@keyframes seTextZoom { 0%,100%{transform:scale(0.88);} 50%{transform:scale(1);} }
.se-anim-fade  { animation:seTextFade 2s ease-in-out infinite; }
.se-anim-slide { animation:seTextSlide 0.6s ease forwards; }
.se-anim-zoom  { animation:seTextZoom 1.8s ease-in-out infinite; }

#storyEditorWrap { position:relative; }
#storyUploadOverlay { padding-bottom:0 !important; }

/* ── Editor toolbar button — inline style এর সাথে কাজ করবে ── */
.se-toolbar-btn {
  width:44px; height:44px; border-radius:50%;
  background:rgba(255,255,255,0.12);
  border:1px solid rgba(255,255,255,0.18);
  display:flex !important; align-items:center; justify-content:center;
  cursor:pointer; margin:0 auto 12px; padding:0;
  -webkit-tap-highlight-color:transparent;
  transition:background 0.18s,transform 0.12s,border-color 0.18s,box-shadow 0.18s;
  position:relative; flex-shrink:0;
  visibility:visible !important; opacity:1 !important;
}
.se-toolbar-btn:active { transform:scale(0.9); }
.se-toolbar-btn.active {
  background:linear-gradient(135deg,#ff8a3d,#ff3b6b) !important;
  border-color:rgba(255,255,255,0.4) !important;
  box-shadow:0 4px 14px rgba(255,59,107,0.35);
}
.se-toolbar-btn svg { display:block; pointer-events:none; }
    `
    document.head.appendChild(style)
  }

  // ══════════════════════════════════════════════════════════
  // BIND EVENTS
  // ══════════════════════════════════════════════════════════
  function bindEditorEvents() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.se-tool-btn')
      if (!btn) return
      activateMode(btn.dataset.mode)
    })

    document.addEventListener('click', e => {
      const item = e.target.closest('.se-filter-item')
      if (!item) return
      document.querySelectorAll('.se-filter-item').forEach(el => el.classList.remove('active'))
      item.classList.add('active')
      currentFilter = item.dataset.filter
      applyPreviewFilter()
    })

    document.addEventListener('click', e => { if (e.target.id === 'seTextAdd') addTextOverlay() })
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' && document.activeElement?.id === 'seTextInput') addTextOverlay()
    })

    document.addEventListener('click', e => {
      const dot = e.target.closest('#seTextColors .se-color-dot')
      if (!dot) return
      document.querySelectorAll('#seTextColors .se-color-dot').forEach(d => d.classList.remove('active'))
      dot.classList.add('active')
    })

    document.addEventListener('click', e => {
      const dot = e.target.closest('#seTextBgColors .se-color-dot')
      if (!dot) return
      document.querySelectorAll('#seTextBgColors .se-color-dot').forEach(d => d.classList.remove('active'))
      dot.classList.add('active')
    })

    document.addEventListener('click', e => {
      const dot = e.target.closest('#seDrawColors .se-color-dot')
      if (!dot) return
      document.querySelectorAll('#seDrawColors .se-color-dot').forEach(d => d.classList.remove('active'))
      dot.classList.add('active')
      drawColor = dot.dataset.drawcol
    })

    document.addEventListener('input', e => {
      if (e.target.id === 'seDrawSize') drawSize = parseInt(e.target.value)
    })

    document.addEventListener('click', e => {
      if (e.target.id === 'seDrawClear') { clearDrawCanvas(); drawStrokes = [] }
    })

    document.addEventListener('click', e => { if (e.target.id === 'seDrawUndo') undoDraw() })

    document.addEventListener('input', e => {
      if (e.target.id === 'seAdjBrightness') {
        currentAdj.brightness = parseInt(e.target.value)
        document.getElementById('seAdjBrightnessVal').textContent = currentAdj.brightness
        applyPreviewFilter()
      }
      if (e.target.id === 'seAdjContrast') {
        currentAdj.contrast = parseInt(e.target.value)
        document.getElementById('seAdjContrastVal').textContent = currentAdj.contrast
        applyPreviewFilter()
      }
      if (e.target.id === 'seAdjBlur') {
        currentAdj.blur = parseInt(e.target.value)
        document.getElementById('seAdjBlurVal').textContent = currentAdj.blur
        applyPreviewFilter()
      }
    })

    document.addEventListener('click', e => {
      const si = e.target.closest('.se-sticker-item')
      if (!si) return
      addStickerOverlay(si.textContent)
    })

    document.addEventListener('click', e => {
      if (e.target.id === 'storyEditorWrap' || e.target.id === 'storyUploadPreview') {
        document.querySelectorAll('.se-overlay-item').forEach(el => el.classList.remove('selected'))
      }
    })
  }

  // ══════════════════════════════════════════════════════════
  // ★★★ ROBUST TOOLBAR FINDER + INJECTION ★★★
  // ══════════════════════════════════════════════════════════
  function findStoryToolbar() {
    // 1) Known ID
    let tb = document.getElementById('storyRightToolbar')
    if (tb) return tb

    // 2) Common class/id patterns
    const candidates = [
      '.story-right-toolbar', '#storyRightToolbar',
      '.story-toolbar',       '#storyToolbar',
      '[id*="storyToolbar"]', '[id*="storyRight"]',
      '[class*="story-right"]', '[class*="story-toolbar"]',
      '[class*="right-toolbar"]', '[class*="toolbar-right"]'
    ]
    for (const sel of candidates) {
      const el = document.querySelector(sel)
      if (el) return el
    }

    // 3) Find music icon (♪ / 🎵) → climb up to find toolbar-like container
    const musicCandidates = document.querySelectorAll('*')
    for (const el of musicCandidates) {
      const txt = (el.textContent || '').trim()
      if (txt === '♪' || txt === '🎵' || txt === '♫') {
        let p = el
        for (let i = 0; i < 6; i++) {
          if (!p) break
          p = p.parentElement
          if (!p) break
          const cs = window.getComputedStyle(p)
          // toolbar-like = vertical flex container
          if ((cs.display === 'flex' || cs.display === 'inline-flex') &&
              (cs.flexDirection === 'column' || cs.flexDirection === 'column-reverse')) {
            return p
          }
        }
      }
    }

    // 4) Last resort — any visible flex-column container near upload overlay
    const overlay = document.getElementById('storyUploadOverlay')
    if (overlay) {
      const flexCols = overlay.querySelectorAll('*')
      for (const el of flexCols) {
        const cs = window.getComputedStyle(el)
        if (cs.display === 'flex' && cs.flexDirection.includes('column') && el.offsetWidth < 80) {
          return el
        }
      }
    }
    return null
  }

  function addEditorBtnToToolbar() {
    if (document.getElementById('seToolbarBtn')) {
      // Already added — but verify it's in DOM and visible
      const existing = document.getElementById('seToolbarBtn')
      if (existing.isConnected) return true
      else existing.remove() // orphan — recreate
    }

    const toolbar = findStoryToolbar()
    if (!toolbar) {
      console.warn('[StoryEditor] toolbar not found yet')
      return false
    }

    const btn = document.createElement('button')
    btn.id = 'seToolbarBtn'
    btn.type = 'button'
    btn.title = 'Edit story'
    btn.setAttribute('aria-label', 'Edit story')
    // ★ INLINE STYLES — CSS fail হলেও visible থাকবে
    btn.style.cssText = `
      width:44px; height:44px; border-radius:50%;
      background:rgba(255,255,255,0.12);
      border:1px solid rgba(255,255,255,0.18);
      display:flex !important; align-items:center; justify-content:center;
      cursor:pointer; margin:8px auto; padding:0;
      visibility:visible !important; opacity:1 !important;
      position:relative; flex-shrink:0; z-index:99999;
      -webkit-tap-highlight-color:transparent;
      transition:background 0.18s,transform 0.12s,border-color 0.18s,box-shadow 0.18s;
    `
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="white" aria-hidden="true" style="display:block;pointer-events:none;">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
    `

    btn.addEventListener('click', e => {
      e.stopPropagation()
      e.preventDefault()
      const panel = document.getElementById('storyEditorPanel')
      if (!panel) return
      const willOpen = !panel.classList.contains('active')
      if (willOpen) {
        showEditor()
        btn.style.background = 'linear-gradient(135deg,#ff8a3d,#ff3b6b)'
        btn.style.borderColor = 'rgba(255,255,255,0.4)'
        btn.style.boxShadow = '0 4px 14px rgba(255,59,107,0.35)'
        btn.classList.add('active')
      } else {
        hideEditor()
        btn.style.background = 'rgba(255,255,255,0.12)'
        btn.style.borderColor = 'rgba(255,255,255,0.18)'
        btn.style.boxShadow = 'none'
        btn.classList.remove('active')
      }
    })

    toolbar.appendChild(btn)
    console.log('[StoryEditor] ✏️ button injected into', toolbar.id || toolbar.className)
    return true
  }

  // ★ Periodic polling — toolbar late create হলেও button inject হবে
  function startToolbarPolling() {
    let attempts = 0
    const iv = setInterval(() => {
      attempts++
      if (document.getElementById('seToolbarBtn')) { clearInterval(iv); return }
      if (addEditorBtnToToolbar()) { clearInterval(iv); return }
      if (attempts > 120) clearInterval(iv) // 60s timeout
    }, 500)
  }

  // ══════════════════════════════════════════════════════════
  // HOOK INTO STORY UPLOAD
  // ══════════════════════════════════════════════════════════
  function hookIntoStoryUpload() {
    // Watch DOM — toolbar তৈরি/দৃশ্যমান হলে button inject
    const observer = new MutationObserver(() => {
      if (!document.getElementById('seToolbarBtn')) addEditorBtnToToolbar()

      // upload overlay বন্ধ হলে reset
      const overlay = document.getElementById('storyUploadOverlay')
      if (overlay && !overlay.classList.contains('active')) {
        hideEditor()
        resetEditor()
        const b = document.getElementById('seToolbarBtn')
        if (b) {
          b.style.background = 'rgba(255,255,255,0.12)'
          b.style.borderColor = 'rgba(255,255,255,0.18)'
          b.style.boxShadow = 'none'
          b.classList.remove('active')
        }
      }
    })
    observer.observe(document.body, { subtree:true, childList:true, attributes:true, attributeFilter:['style','class'] })

    // File select → draw canvas init + button ensure
    document.addEventListener('change', e => {
      if (e.target.id !== 'storyFileInput') return
      setTimeout(() => {
        initDrawCanvas()
        const img = document.getElementById('storyUploadPreview')
        if (img && img.classList.contains('active')) {
          sourceImage = new Image()
          sourceImage.src = img.src
          isVideoMode = false
        } else {
          isVideoMode = true
        }
        addEditorBtnToToolbar()
      }, 300)
    })
  }

  // ══════════════════════════════════════════════════════════
  // MODE / SHOW / HIDE / RESET
  // ══════════════════════════════════════════════════════════
  function activateMode(mode) {
    editorMode = mode
    document.querySelectorAll('.se-tool-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode)
    })
    const panels = { filter:'sePanelFilter', text:'sePanelText', sticker:'sePanelSticker', draw:'sePanelDraw', adjust:'sePanelAdjust' }
    Object.entries(panels).forEach(([key, id]) => {
      const el = document.getElementById(id)
      if (el) el.classList.toggle('active', key === mode)
    })
    const drawCv = document.getElementById('seDrawCanvas')
    if (drawCv) {
      drawCv.style.pointerEvents = mode === 'draw' ? 'auto' : 'none'
      drawCv.style.cursor = mode === 'draw' ? 'crosshair' : 'default'
    }
  }

  function showEditor() {
    const panel = document.getElementById('storyEditorPanel')
    if (!panel) return
    const overlay = document.getElementById('storyUploadOverlay')
    if (overlay && panel.parentElement !== overlay) {
      const buttons = overlay.querySelector('.story-upload-actions') ||
                      overlay.querySelector('#storyUploadActions')
      if (buttons && buttons.parentElement === overlay) overlay.insertBefore(panel, buttons)
      else overlay.appendChild(panel)
    }
    panel.classList.add('active')
    activateMode('filter')
  }

  function hideEditor() {
    const panel = document.getElementById('storyEditorPanel')
    if (panel) panel.classList.remove('active')
  }

  function resetEditor() {
    currentFilter = 'none'
    currentAdj    = { brightness:100, contrast:100, blur:0 }
    textItems     = []
    stickerItems  = []
    drawStrokes   = []
    document.querySelectorAll('.se-overlay-item').forEach(el => el.remove())
    const b = document.getElementById('seAdjBrightness')
    const c = document.getElementById('seAdjContrast')
    const bl = document.getElementById('seAdjBlur')
    if (b) b.value = 100
    if (c) c.value = 100
    if (bl) bl.value = 0
    document.querySelectorAll('.se-filter-item').forEach(el => el.classList.remove('active'))
    const first = document.querySelector('.se-filter-item[data-filter="none"]')
    if (first) first.classList.add('active')
    applyPreviewFilter()
    clearDrawCanvas()
  }

  // ══════════════════════════════════════════════════════════
  // FILTER
  // ══════════════════════════════════════════════════════════
  function applyPreviewFilter() {
    const img = document.getElementById('storyUploadPreview')
    const vid = document.getElementById('storyUploadVideoPreview')
    const f = FILTERS.find(x => x.id === currentFilter) || FILTERS[0]
    const css = [f.css, `brightness(${currentAdj.brightness}%)`, `contrast(${currentAdj.contrast}%)`, currentAdj.blur > 0 ? `blur(${currentAdj.blur}px)` : ''].filter(Boolean).join(' ')
    if (img) img.style.filter = css
    if (vid) vid.style.filter = css
  }

  // ══════════════════════════════════════════════════════════
  // DRAW
  // ══════════════════════════════════════════════════════════
  let drawStrokes = []
  let currentStroke = null

  function initDrawCanvas() {
    const wrap = document.getElementById('storyEditorWrap')
    if (!wrap) return
    if (document.getElementById('seDrawCanvas')) {
      drawCanvas = document.getElementById('seDrawCanvas')
      drawCtx = drawCanvas.getContext('2d')
      return
    }
    drawCanvas = document.createElement('canvas')
    drawCanvas.id = 'seDrawCanvas'
    drawCanvas.style.cssText = 'position:absolute;inset:0;border-radius:16px;touch-action:none;pointer-events:none;z-index:5;'
    wrap.appendChild(drawCanvas)
    drawCtx = drawCanvas.getContext('2d')

    const resize = () => {
      const preview = document.getElementById('storyUploadPreview')
      const vid = document.getElementById('storyUploadVideoPreview')
      const el = (vid && vid.classList.contains('active')) ? vid : preview
      if (!el) return
      const r = el.getBoundingClientRect()
      drawCanvas.width = r.width || 180
      drawCanvas.height = r.height || 280
      drawCanvas.style.width = (r.width || 180) + 'px'
      drawCanvas.style.height = (r.height || 280) + 'px'
      redrawStrokes()
    }
    setTimeout(resize, 100)
    window.addEventListener('resize', resize)

    drawCanvas.addEventListener('touchstart', onDrawStart, { passive:false })
    drawCanvas.addEventListener('touchmove', onDrawMove, { passive:false })
    drawCanvas.addEventListener('touchend', onDrawEnd, { passive:true })
    drawCanvas.addEventListener('mousedown', onDrawStart)
    drawCanvas.addEventListener('mousemove', onDrawMove)
    drawCanvas.addEventListener('mouseup', onDrawEnd)
  }

  function getDrawPos(e) {
    const rect = drawCanvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x:(src.clientX-rect.left)*(drawCanvas.width/rect.width), y:(src.clientY-rect.top)*(drawCanvas.height/rect.height) }
  }

  function onDrawStart(e) {
    if (editorMode !== 'draw') return
    e.preventDefault()
    isDrawing = true
    const pos = getDrawPos(e)
    currentStroke = { points:[pos], color:drawColor, size:drawSize }
    drawCtx.beginPath()
    drawCtx.moveTo(pos.x, pos.y)
  }

  function onDrawMove(e) {
    if (!isDrawing || editorMode !== 'draw') return
    e.preventDefault()
    const pos = getDrawPos(e)
    currentStroke.points.push(pos)
    drawCtx.strokeStyle = currentStroke.color
    drawCtx.lineWidth = currentStroke.size
    drawCtx.lineCap = 'round'
    drawCtx.lineJoin = 'round'
    drawCtx.lineTo(pos.x, pos.y)
    drawCtx.stroke()
  }

  function onDrawEnd() {
    if (!isDrawing) return
    isDrawing = false
    if (currentStroke && currentStroke.points.length > 1) drawStrokes.push(currentStroke)
    currentStroke = null
  }

  function redrawStrokes() {
    if (!drawCtx) return
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height)
    drawStrokes.forEach(s => {
      if (!s.points.length) return
      drawCtx.beginPath()
      drawCtx.strokeStyle = s.color
      drawCtx.lineWidth = s.size
      drawCtx.lineCap = 'round'
      drawCtx.lineJoin = 'round'
      drawCtx.moveTo(s.points[0].x, s.points[0].y)
      s.points.slice(1).forEach(p => drawCtx.lineTo(p.x, p.y))
      drawCtx.stroke()
    })
  }

  function clearDrawCanvas() {
    drawStrokes = []
    if (drawCtx && drawCanvas) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height)
  }

  function undoDraw() { drawStrokes.pop(); redrawStrokes() }

  // ══════════════════════════════════════════════════════════
  // TEXT / STICKER
  // ══════════════════════════════════════════════════════════
  let textIdCounter = 0
  let stickerIdCounter = 0

  function addTextOverlay() {
    const input = document.getElementById('seTextInput')
    const text = input?.value?.trim()
    if (!text) return
    const font = document.getElementById('seTextFont')?.value || 'Arial'
    const size = document.getElementById('seTextSize')?.value || '24'
    const anim = document.getElementById('seTextAnim')?.value || 'none'
    const colDot = document.querySelector('#seTextColors .se-color-dot.active')
    const bgDot = document.querySelector('#seTextBgColors .se-color-dot.active')
    const color = colDot?.dataset?.col || '#ffffff'
    const bg = bgDot?.dataset?.bg || 'none'
    const wrap = document.getElementById('storyEditorWrap')
    if (!wrap) return

    const id = ++textIdCounter
    const item = document.createElement('div')
    item.className = 'se-overlay-item'
    item.dataset.id = id
    item.style.cssText = `left:50%;top:40%;transform:translate(-50%,-50%);font-family:${font};font-size:${size}px;color:${color};background:${bg==='none'?'transparent':bg};padding:${bg==='none'?'0':'4px 10px'};border-radius:6px;white-space:nowrap;z-index:10;text-shadow:0 1px 4px rgba(0,0,0,0.5);`
    if (anim !== 'none') item.classList.add(`se-anim-${anim}`)

    const textNode = document.createElement('span')
    textNode.textContent = text
    const delBtn = document.createElement('div')
    delBtn.className = 'se-delete-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', e => { e.stopPropagation(); item.remove() })

    item.appendChild(textNode)
    item.appendChild(delBtn)
    makeDraggable(item, wrap)
    item.addEventListener('click', e => {
      e.stopPropagation()
      document.querySelectorAll('.se-overlay-item').forEach(el => el.classList.remove('selected'))
      item.classList.add('selected')
    })
    wrap.appendChild(item)
    textItems.push({ id, text, font, size, color, bg, anim })
    input.value = ''
  }

  function addStickerOverlay(emoji) {
    const wrap = document.getElementById('storyEditorWrap')
    if (!wrap) return
    const id = ++stickerIdCounter
    const item = document.createElement('div')
    item.className = 'se-overlay-item'
    item.dataset.id = `s${id}`
    item.style.cssText = `left:50%;top:50%;transform:translate(-50%,-50%);font-size:48px;line-height:1;z-index:11;`
    const emojiSpan = document.createElement('span')
    emojiSpan.textContent = emoji
    const delBtn = document.createElement('div')
    delBtn.className = 'se-delete-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', e => { e.stopPropagation(); item.remove() })
    item.appendChild(emojiSpan)
    item.appendChild(delBtn)
    makeDraggable(item, wrap)
    item.addEventListener('click', e => {
      e.stopPropagation()
      document.querySelectorAll('.se-overlay-item').forEach(el => el.classList.remove('selected'))
      item.classList.add('selected')
    })
    wrap.appendChild(item)
    stickerItems.push({ id, emoji })
  }

  function makeDraggable(el, container) {
    let startX, startY, origLeft, origTop, isDragging = false
    function getPos(e) { const src = e.touches ? e.touches[0] : e; return { x:src.clientX, y:src.clientY } }
    function onStart(e) {
      if (e.target.classList.contains('se-delete-btn')) return
      e.stopPropagation(); isDragging = true
      const pos = getPos(e); startX = pos.x; startY = pos.y
      origLeft = parseFloat(el.style.left) || 50
      origTop = parseFloat(el.style.top) || 50
      el.style.transform = 'translate(-50%,-50%)'
    }
    function onMove(e) {
      if (!isDragging) return
      e.preventDefault()
      const pos = getPos(e)
      const rect = container.getBoundingClientRect()
      const dx = pos.x - startX, dy = pos.y - startY
      el.style.left = Math.max(5, Math.min(95, origLeft + (dx/rect.width)*100)) + '%'
      el.style.top = Math.max(5, Math.min(95, origTop + (dy/rect.height)*100)) + '%'
    }
    function onEnd() { isDragging = false }
    el.addEventListener('touchstart', onStart, { passive:true })
    el.addEventListener('touchmove', onMove, { passive:false })
    el.addEventListener('touchend', onEnd, { passive:true })
    el.addEventListener('mousedown', onStart)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
  }

})()
