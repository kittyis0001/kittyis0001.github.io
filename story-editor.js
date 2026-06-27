// ═══════════════════════════════════════════════════════════
// STORY EDITOR — Phase 1
// Filters · Text · Sticker · Draw · Adjustments
// Injected into story upload flow — no existing logic changed
// ═══════════════════════════════════════════════════════════

;(function () {
  'use strict'

  // ── Editor state ─────────────────────────────────────────
  let editorCanvas   = null   // main canvas (draws filters + overlays)
  let editorCtx      = null
  let drawCanvas     = null   // separate draw layer
  let drawCtx        = null
  let isDrawing      = false
  let drawLastX      = 0, drawLastY = 0
  let currentFilter  = 'none'
  let currentAdj     = { brightness: 100, contrast: 100, blur: 0 }
  let textItems      = []     // [{text, x, y, font, size, color, bg, anim, id}]
  let stickerItems   = []     // [{emoji, x, y, size, id}]
  let draggingItem   = null   // {type:'text'|'sticker', id, offX, offY}
  let drawColor      = '#ff3b30'
  let drawSize       = 4
  let editorMode     = null   // 'filter'|'text'|'sticker'|'draw'|'adjust'|null
  let sourceImage    = null   // original Image object (for re-render)
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

  // ── Init: inject editor UI after story.js loads ──────────
  function init() {
    injectEditorHTML()
    injectEditorCSS()
    bindEditorEvents()
    hookIntoStoryUpload()
  }

  // Wait for story.js DOM to be ready
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
      <!-- Bottom tool bar -->
      <div id="sePanelTools">
        <button class="se-tool-btn active" data-mode="filter">
          <span>🎨</span><span>Filter</span>
        </button>
        <button class="se-tool-btn" data-mode="text">
          <span>🔤</span><span>Text</span>
        </button>
        <button class="se-tool-btn" data-mode="sticker">
          <span>😊</span><span>Sticker</span>
        </button>
        <button class="se-tool-btn" data-mode="draw">
          <span>✏️</span><span>Draw</span>
        </button>
        <button class="se-tool-btn" data-mode="adjust">
          <span>⚡</span><span>Adjust</span>
        </button>
      </div>

      <!-- FILTER panel -->
      <div class="se-panel" id="sePanelFilter">
        <div id="seFilterList"></div>
      </div>

      <!-- TEXT panel -->
      <div class="se-panel" id="sePanelText">
        <div class="se-row">
          <input id="seTextInput" type="text" placeholder="Type here..." maxlength="60">
          <button id="seTextAdd">Add</button>
        </div>
        <div class="se-row">
          <label>Font</label>
          <select id="seTextFont">
            ${FONTS.map(f=>`<option value="${f.id}">${f.label}</option>`).join('')}
          </select>
          <label>Size</label>
          <input id="seTextSize" type="range" min="14" max="60" value="24">
        </div>
        <div class="se-row">
          <label>Color</label>
          <div id="seTextColors">
            ${['#ffffff','#000000','#ff3b30','#ff9500','#ffcc00','#34c759','#00c7be','#007aff','#af52de','#ff2d55'].map(col=>
              `<div class="se-color-dot" data-col="${col}" style="background:${col};"></div>`
            ).join('')}
          </div>
        </div>
        <div class="se-row">
          <label>BG</label>
          <div id="seTextBgColors">
            <div class="se-color-dot se-color-active" data-bg="none" style="background:transparent;border:1px dashed rgba(255,255,255,0.4);">∅</div>
            ${['rgba(0,0,0,0.5)','rgba(255,255,255,0.5)','rgba(255,59,48,0.6)','rgba(52,199,89,0.6)','rgba(0,122,255,0.6)'].map(col=>
              `<div class="se-color-dot" data-bg="${col}" style="background:${col};"></div>`
            ).join('')}
          </div>
          <label>Anim</label>
          <select id="seTextAnim">
            ${TEXT_ANIMS.map(a=>`<option value="${a.id}">${a.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- STICKER panel -->
      <div class="se-panel" id="sePanelSticker">
        <div id="seStickerGrid">
          ${STICKERS.map(e=>`<div class="se-sticker-item">${e}</div>`).join('')}
        </div>
      </div>

      <!-- DRAW panel -->
      <div class="se-panel" id="sePanelDraw">
        <div class="se-row">
          <label>Color</label>
          <div id="seDrawColors">
            ${['#ff3b30','#ff9500','#ffcc00','#34c759','#007aff','#ffffff','#000000','#af52de'].map(col=>
              `<div class="se-color-dot" data-drawcol="${col}" style="background:${col};"></div>`
            ).join('')}
          </div>
        </div>
        <div class="se-row">
          <label>Size</label>
          <input id="seDrawSize" type="range" min="2" max="24" value="4">
          <button id="seDrawClear">Clear</button>
          <button id="seDrawUndo">Undo</button>
        </div>
      </div>

      <!-- ADJUST panel -->
      <div class="se-panel" id="sePanelAdjust">
        <div class="se-adjust-row">
          <label>☀️ Brightness</label>
          <input type="range" id="seAdjBrightness" min="50" max="150" value="100">
          <span id="seAdjBrightnessVal">100</span>
        </div>
        <div class="se-adjust-row">
          <label>◑ Contrast</label>
          <input type="range" id="seAdjContrast" min="50" max="150" value="100">
          <span id="seAdjContrastVal">100</span>
        </div>
        <div class="se-adjust-row">
          <label>🌫 Blur</label>
          <input type="range" id="seAdjBlur" min="0" max="10" value="0">
          <span id="seAdjBlurVal">0</span>
        </div>
      </div>
    `
    document.body.appendChild(panel)

    // Build filter thumbnails
    buildFilterList()
  }

  function buildFilterList() {
    const list = document.getElementById('seFilterList')
    if (!list) return
    list.innerHTML = FILTERS.map(f => `
      <div class="se-filter-item ${f.id==='none'?'active':''}" data-filter="${f.id}">
        <div class="se-filter-thumb" style="filter:${f.css};">
          <div class="se-filter-thumb-inner"></div>
        </div>
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
/* ── Editor panel container ── */
#storyEditorPanel {
  display: none;
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 21000;
  background: rgba(0,0,0,0.92);
  border-top: 1px solid rgba(255,255,255,0.1);
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
#storyEditorPanel.active { display: flex; }

/* ── Tool buttons row ── */
#sePanelTools {
  display: flex;
  justify-content: space-around;
  padding: 10px 6px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.se-tool-btn {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  background: none; border: none; color: rgba(255,255,255,0.5);
  font-size: 20px; cursor: pointer; padding: 6px 10px;
  border-radius: 10px; transition: color 0.2s, background 0.2s;
  -webkit-tap-highlight-color: transparent;
  min-width: 52px;
}
.se-tool-btn span:last-child { font-size: 9px; letter-spacing: 0.5px; }
.se-tool-btn.active { color: white; background: rgba(255,255,255,0.1); }
.se-tool-btn:active { transform: scale(0.92); }

/* ── Sub-panels ── */
.se-panel {
  display: none;
  padding: 10px 12px 12px;
  max-height: 180px;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}
.se-panel.active { display: block; }
.se-panel::-webkit-scrollbar { display: none; }

/* ── Shared row ── */
.se-row {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 8px; margin-bottom: 8px;
}
.se-row label {
  font-size: 11px; color: rgba(255,255,255,0.5);
  letter-spacing: 0.5px; flex-shrink: 0;
}

/* ── Filter list ── */
#seFilterList {
  display: flex; gap: 10px; overflow-x: auto;
  padding: 4px 2px 8px; -webkit-overflow-scrolling: touch;
}
#seFilterList::-webkit-scrollbar { display: none; }
.se-filter-item {
  display: flex; flex-direction: column; align-items: center;
  gap: 5px; cursor: pointer; flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.se-filter-item span {
  font-size: 10px; color: rgba(255,255,255,0.55); letter-spacing: 0.3px;
}
.se-filter-item.active span { color: white; }
.se-filter-item.active .se-filter-thumb {
  outline: 2px solid white; outline-offset: 2px;
}
.se-filter-thumb {
  width: 56px; height: 72px; border-radius: 8px;
  overflow: hidden; background: #222;
  transition: outline 0.15s;
}
.se-filter-thumb-inner {
  width: 100%; height: 100%;
  background: linear-gradient(135deg, #c8d8f8 0%, #d4c8f0 50%, #e8c0e0 100%);
}

/* ── Text panel ── */
#seTextInput {
  flex: 1; background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2); border-radius: 8px;
  padding: 8px 10px; color: white; font-size: 14px; outline: none;
}
#seTextInput::placeholder { color: rgba(255,255,255,0.3); }
#seTextAdd {
  background: white; color: black; border: none;
  border-radius: 8px; padding: 8px 14px; font-size: 13px;
  font-weight: 600; cursor: pointer; white-space: nowrap;
}
#seTextSize { flex: 1; max-width: 80px; accent-color: white; }

/* ── Color dots ── */
#seTextColors, #seTextBgColors, #seDrawColors {
  display: flex; gap: 6px; flex-wrap: wrap;
}
.se-color-dot {
  width: 22px; height: 22px; border-radius: 50%;
  cursor: pointer; border: 2px solid transparent;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: rgba(255,255,255,0.6);
  transition: border-color 0.15s, transform 0.12s;
  flex-shrink: 0;
}
.se-color-dot.active { border-color: white; transform: scale(1.2); }
.se-color-dot:active { transform: scale(0.9); }

select#seTextFont, select#seTextAnim {
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px; color: white; padding: 5px 8px; font-size: 12px; outline: none;
}
select#seTextFont option, select#seTextAnim option { background: #111; }

/* ── Sticker grid ── */
#seStickerGrid {
  display: grid; grid-template-columns: repeat(8, 1fr);
  gap: 8px; padding: 4px;
}
.se-sticker-item {
  font-size: 28px; text-align: center; cursor: pointer;
  padding: 4px; border-radius: 8px; transition: background 0.15s, transform 0.12s;
  -webkit-tap-highlight-color: transparent;
}
.se-sticker-item:active { background: rgba(255,255,255,0.1); transform: scale(1.2); }

/* ── Draw panel ── */
#seDrawSize { flex: 1; max-width: 100px; accent-color: white; }
#seDrawClear, #seDrawUndo {
  background: rgba(255,255,255,0.12); border: none;
  border-radius: 8px; padding: 7px 12px; color: white;
  font-size: 12px; cursor: pointer;
}

/* ── Adjust panel ── */
.se-adjust-row {
  display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
}
.se-adjust-row label {
  font-size: 12px; color: rgba(255,255,255,0.6); width: 110px; flex-shrink: 0;
}
.se-adjust-row input[type=range] {
  flex: 1; accent-color: white;
}
.se-adjust-row span {
  font-size: 11px; color: rgba(255,255,255,0.5);
  width: 28px; text-align: right;
}

/* ── Canvas overlay on preview ── */
#seDrawCanvas {
  position: absolute; inset: 0;
  border-radius: 16px; touch-action: none;
}

/* ── Overlay items (text/sticker) ── */
.se-overlay-item {
  position: absolute; cursor: move;
  user-select: none; touch-action: none;
  -webkit-tap-highlight-color: transparent;
  transform-origin: center center;
}
.se-overlay-item .se-delete-btn {
  position: absolute; top: -10px; right: -10px;
  width: 20px; height: 20px; background: rgba(255,59,48,0.9);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: white; cursor: pointer; line-height: 1;
  display: none;
}
.se-overlay-item.selected .se-delete-btn { display: flex; }
.se-overlay-item.selected { outline: 1px dashed rgba(255,255,255,0.5); outline-offset: 4px; }

/* Text animations */
@keyframes seTextFade { 0%,100%{opacity:0.3;} 50%{opacity:1;} }
@keyframes seTextSlide { 0%{transform:translateX(-8px);opacity:0.5;} 100%{transform:translateX(0);opacity:1;} }
@keyframes seTextZoom { 0%,100%{transform:scale(0.88);} 50%{transform:scale(1);} }

.se-anim-fade  { animation: seTextFade 2s ease-in-out infinite; }
.se-anim-slide { animation: seTextSlide 0.6s ease forwards; }
.se-anim-zoom  { animation: seTextZoom 1.8s ease-in-out infinite; }

/* ── Editor wrap position fix ── */
#storyEditorWrap {
  position: relative;
}
    `
    document.head.appendChild(style)
  }

  // ══════════════════════════════════════════════════════════
  // BIND EVENTS
  // ══════════════════════════════════════════════════════════
  function bindEditorEvents() {
    // Tool buttons
    document.addEventListener('click', e => {
      const btn = e.target.closest('.se-tool-btn')
      if (!btn) return
      const mode = btn.dataset.mode
      if (!mode) return
      activateMode(mode)
    })

    // Filter select
    document.addEventListener('click', e => {
      const item = e.target.closest('.se-filter-item')
      if (!item) return
      document.querySelectorAll('.se-filter-item').forEach(el => el.classList.remove('active'))
      item.classList.add('active')
      currentFilter = item.dataset.filter
      applyPreviewFilter()
    })

    // Text add
    document.addEventListener('click', e => {
      if (e.target.id !== 'seTextAdd') return
      addTextOverlay()
    })
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' && document.activeElement?.id === 'seTextInput') addTextOverlay()
    })

    // Text color
    document.addEventListener('click', e => {
      const dot = e.target.closest('#seTextColors .se-color-dot')
      if (!dot) return
      document.querySelectorAll('#seTextColors .se-color-dot').forEach(d => d.classList.remove('active'))
      dot.classList.add('active')
    })

    // Text bg color
    document.addEventListener('click', e => {
      const dot = e.target.closest('#seTextBgColors .se-color-dot')
      if (!dot) return
      document.querySelectorAll('#seTextBgColors .se-color-dot').forEach(d => d.classList.remove('active'))
      dot.classList.add('active')
    })

    // Draw colors
    document.addEventListener('click', e => {
      const dot = e.target.closest('#seDrawColors .se-color-dot')
      if (!dot) return
      document.querySelectorAll('#seDrawColors .se-color-dot').forEach(d => d.classList.remove('active'))
      dot.classList.add('active')
      drawColor = dot.dataset.drawcol
    })

    // Draw size
    document.addEventListener('input', e => {
      if (e.target.id === 'seDrawSize') drawSize = parseInt(e.target.value)
    })

    // Draw clear
    document.addEventListener('click', e => {
      if (e.target.id === 'seDrawClear') { clearDrawCanvas(); drawStrokes = [] }
    })

    // Draw undo
    document.addEventListener('click', e => {
      if (e.target.id === 'seDrawUndo') undoDraw()
    })

    // Adjustments
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

    // Stickers
    document.addEventListener('click', e => {
      const si = e.target.closest('.se-sticker-item')
      if (!si) return
      addStickerOverlay(si.textContent)
    })

    // Deselect overlay items on wrap click
    document.addEventListener('click', e => {
      if (e.target.id === 'storyEditorWrap' || e.target.id === 'storyUploadPreview') {
        document.querySelectorAll('.se-overlay-item').forEach(el => el.classList.remove('selected'))
      }
    })
  }

  // ══════════════════════════════════════════════════════════
  // HOOK INTO STORY UPLOAD
  // ══════════════════════════════════════════════════════════
  function hookIntoStoryUpload() {
    // ✅ FIX: removed the document.body-wide MutationObserver.
    // It fired on every class/style change across the whole chat app
    // (typing indicator, story rings, message updates, etc.) and each
    // fire mutated the DOM again (appendChild), causing a runaway
    // observer→mutation→observer loop that crashed the page.
    //
    // We only need to react to two specific, well-defined events:
    // 1) storyFileInput change  → show editor button + init canvas
    // 2) storyUploadCancelBtn / storySubmitBtn click → hide + reset editor

    // 1) File selected → init editor
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
        showEditor()
      }, 200)
    })

    // 2) Upload overlay closed (Cancel or after successful Share) → reset
    document.addEventListener('click', e => {
      if (e.target.id === 'storyUploadCancelBtn') {
        hideEditor()
        resetEditor()
      }
    })

    // storySubmitBtn success path closes the overlay via story.js's own
    // closeUploadOverlay(); we piggyback by watching the overlay's
    // "active" class removal with a lightweight one-off check instead
    // of a persistent whole-document observer.
    document.addEventListener('click', e => {
      if (e.target.id !== 'storySubmitBtn') return
      const overlay = document.getElementById('storyUploadOverlay')
      if (!overlay) return
      // Poll briefly only while the overlay is in the process of closing
      let tries = 0
      const check = setInterval(() => {
        tries++
        if (!overlay.classList.contains('active')) {
          hideEditor()
          resetEditor()
          clearInterval(check)
        }
        if (tries > 40) clearInterval(check)  // ~8s safety cutoff
      }, 200)
    })
  }

  function addEditorBtnToToolbar() {
    if (document.getElementById('seToolbarBtn')) return
    const toolbar = document.getElementById('storyRightToolbar')
    if (!toolbar) return

    const btn = document.createElement('button')
    btn.id = 'seToolbarBtn'
    btn.title = 'Edit'
    btn.innerHTML = '✏️'
    btn.style.cssText = `
      width: 42px; height: 42px;
      background: rgba(255,255,255,0.15);
      border: 1.5px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      color: white; font-size: 20px;
      cursor: pointer; display: flex;
      align-items: center; justify-content: center;
      backdrop-filter: blur(8px);
      -webkit-tap-highlight-color: transparent;
    `
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleEditorPanel()
    })

    // Insert right after music button (below it)
    toolbar.appendChild(btn)
  }

  function toggleEditorPanel() {
    const panel = document.getElementById('storyEditorPanel')
    if (!panel) return
    if (panel.classList.contains('active')) {
      panel.classList.remove('active')
    } else {
      panel.classList.add('active')
      activateMode(editorMode || 'filter')
    }
  }

  // ══════════════════════════════════════════════════════════
  // MODE MANAGEMENT
  // ══════════════════════════════════════════════════════════
  function activateMode(mode) {
    editorMode = mode

    // Update tool buttons
    document.querySelectorAll('.se-tool-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode)
    })

    // Show/hide sub-panels
    const panels = { filter:'sePanelFilter', text:'sePanelText', sticker:'sePanelSticker', draw:'sePanelDraw', adjust:'sePanelAdjust' }
    Object.entries(panels).forEach(([key, id]) => {
      const el = document.getElementById(id)
      if (el) el.classList.toggle('active', key === mode)
    })

    // Draw mode setup
    const drawCv = document.getElementById('seDrawCanvas')
    if (drawCv) {
      drawCv.style.pointerEvents = mode === 'draw' ? 'auto' : 'none'
      drawCv.style.cursor = mode === 'draw' ? 'crosshair' : 'default'
    }
  }

  function showEditor() {
    // ✅ FIX: do NOT auto-open the panel here.
    // Panel only opens when user taps the ✏️ edit button (see toggleEditorPanel).
    // This function now just makes sure the toolbar/edit button exists.
    addEditorBtnToToolbar()
    positionEditor()
  }

  function positionEditor() {
    const panel = document.getElementById('storyEditorPanel')
    if (!panel) return
    // Reorder upload overlay: editor sits between preview and action buttons
    const overlay = document.getElementById('storyUploadOverlay')
    if (!overlay) return
    // Move editor panel into overlay flow — as last visual element before buttons
    overlay.style.paddingBottom = '0'
  }

  function hideEditor() {
    const panel = document.getElementById('storyEditorPanel')
    if (panel) panel.classList.remove('active')
  }

  function resetEditor() {
    currentFilter = 'none'
    currentAdj    = { brightness: 100, contrast: 100, blur: 0 }
    textItems     = []
    stickerItems  = []
    draggingItem  = null
    drawStrokes   = []

    // Remove overlay items
    document.querySelectorAll('.se-overlay-item').forEach(el => el.remove())

    // Reset sliders
    const b = document.getElementById('seAdjBrightness')
    const c = document.getElementById('seAdjContrast')
    const bl = document.getElementById('seAdjBlur')
    if (b) b.value = 100
    if (c) c.value = 100
    if (bl) bl.value = 0

    // Reset filter
    document.querySelectorAll('.se-filter-item').forEach(el => el.classList.remove('active'))
    const first = document.querySelector('.se-filter-item[data-filter="none"]')
    if (first) first.classList.add('active')

    applyPreviewFilter()
    clearDrawCanvas()
  }

  // ══════════════════════════════════════════════════════════
  // FILTER APPLICATION
  // ══════════════════════════════════════════════════════════
  function applyPreviewFilter() {
    const img = document.getElementById('storyUploadPreview')
    const vid = document.getElementById('storyUploadVideoPreview')
    const filterObj = FILTERS.find(f => f.id === currentFilter) || FILTERS[0]

    const cssFilter = [
      filterObj.css,
      `brightness(${currentAdj.brightness}%)`,
      `contrast(${currentAdj.contrast}%)`,
      currentAdj.blur > 0 ? `blur(${currentAdj.blur}px)` : ''
    ].filter(Boolean).join(' ')

    if (img) img.style.filter = cssFilter
    if (vid) vid.style.filter = cssFilter
  }

  // ══════════════════════════════════════════════════════════
  // DRAW TOOL
  // ══════════════════════════════════════════════════════════
  let drawStrokes = []   // [{points:[{x,y}], color, size}]
  let currentStroke = null

  function initDrawCanvas() {
    const wrap = document.getElementById('storyEditorWrap')
    if (!wrap) return
    if (document.getElementById('seDrawCanvas')) {
      drawCanvas = document.getElementById('seDrawCanvas')
      drawCtx    = drawCanvas.getContext('2d')
      return
    }

    drawCanvas = document.createElement('canvas')
    drawCanvas.id = 'seDrawCanvas'
    drawCanvas.style.cssText = 'position:absolute;inset:0;border-radius:16px;touch-action:none;pointer-events:none;z-index:5;'
    wrap.appendChild(drawCanvas)
    drawCtx = drawCanvas.getContext('2d')

    // Resize canvas to match preview
    const resizeDrawCanvas = () => {
      const preview = document.getElementById('storyUploadPreview')
      const vid     = document.getElementById('storyUploadVideoPreview')
      const el = (vid && vid.classList.contains('active')) ? vid : preview
      if (!el) return
      const r = el.getBoundingClientRect()
      drawCanvas.width  = r.width  || 180
      drawCanvas.height = r.height || 280
      drawCanvas.style.width  = (r.width  || 180) + 'px'
      drawCanvas.style.height = (r.height || 280) + 'px'
      redrawStrokes()
    }

    setTimeout(resizeDrawCanvas, 100)
    window.addEventListener('resize', resizeDrawCanvas)

    // Touch events
    drawCanvas.addEventListener('touchstart', onDrawStart, { passive: false })
    drawCanvas.addEventListener('touchmove',  onDrawMove,  { passive: false })
    drawCanvas.addEventListener('touchend',   onDrawEnd,   { passive: true })
    // Mouse events
    drawCanvas.addEventListener('mousedown', onDrawStart)
    drawCanvas.addEventListener('mousemove', onDrawMove)
    drawCanvas.addEventListener('mouseup',   onDrawEnd)
  }

  function getDrawPos(e) {
    const rect = drawCanvas.getBoundingClientRect()
    const src  = e.touches ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * (drawCanvas.width  / rect.width),
      y: (src.clientY - rect.top)  * (drawCanvas.height / rect.height)
    }
  }

  function onDrawStart(e) {
    if (editorMode !== 'draw') return
    e.preventDefault()
    isDrawing = true
    const pos = getDrawPos(e)
    currentStroke = { points: [pos], color: drawColor, size: drawSize }
    drawCtx.beginPath()
    drawCtx.moveTo(pos.x, pos.y)
  }

  function onDrawMove(e) {
    if (!isDrawing || editorMode !== 'draw') return
    e.preventDefault()
    const pos = getDrawPos(e)
    currentStroke.points.push(pos)
    drawCtx.strokeStyle = currentStroke.color
    drawCtx.lineWidth   = currentStroke.size
    drawCtx.lineCap     = 'round'
    drawCtx.lineJoin    = 'round'
    drawCtx.lineTo(pos.x, pos.y)
    drawCtx.stroke()
  }

  function onDrawEnd() {
    if (!isDrawing) return
    isDrawing = false
    if (currentStroke && currentStroke.points.length > 1) {
      drawStrokes.push(currentStroke)
    }
    currentStroke = null
  }

  function redrawStrokes() {
    if (!drawCtx) return
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height)
    drawStrokes.forEach(stroke => {
      if (!stroke.points.length) return
      drawCtx.beginPath()
      drawCtx.strokeStyle = stroke.color
      drawCtx.lineWidth   = stroke.size
      drawCtx.lineCap     = 'round'
      drawCtx.lineJoin    = 'round'
      drawCtx.moveTo(stroke.points[0].x, stroke.points[0].y)
      stroke.points.slice(1).forEach(p => drawCtx.lineTo(p.x, p.y))
      drawCtx.stroke()
    })
  }

  function clearDrawCanvas() {
    drawStrokes = []
    if (drawCtx && drawCanvas) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height)
  }

  function undoDraw() {
    drawStrokes.pop()
    redrawStrokes()
  }

  // ══════════════════════════════════════════════════════════
  // TEXT OVERLAY
  // ══════════════════════════════════════════════════════════
  let textIdCounter = 0

  function addTextOverlay() {
    const input  = document.getElementById('seTextInput')
    const text   = input?.value?.trim()
    if (!text) return

    const font    = document.getElementById('seTextFont')?.value   || 'Arial'
    const size    = document.getElementById('seTextSize')?.value   || '24'
    const anim    = document.getElementById('seTextAnim')?.value   || 'none'
    const colDot  = document.querySelector('#seTextColors .se-color-dot.active')
    const bgDot   = document.querySelector('#seTextBgColors .se-color-dot.active')
    const color   = colDot?.dataset?.col || '#ffffff'
    const bg      = bgDot?.dataset?.bg   || 'none'

    const wrap = document.getElementById('storyEditorWrap')
    if (!wrap) return

    const id   = ++textIdCounter
    const item = document.createElement('div')
    item.className = 'se-overlay-item'
    item.dataset.id = id
    item.style.cssText = `
      left: 50%; top: 40%;
      transform: translate(-50%, -50%);
      font-family: ${font};
      font-size: ${size}px;
      color: ${color};
      background: ${bg === 'none' ? 'transparent' : bg};
      padding: ${bg === 'none' ? '0' : '4px 10px'};
      border-radius: 6px;
      white-space: nowrap;
      z-index: 10;
      text-shadow: 0 1px 4px rgba(0,0,0,0.5);
    `
    if (anim !== 'none') item.classList.add(`se-anim-${anim}`)

    const textNode = document.createElement('span')
    textNode.textContent = text

    const delBtn = document.createElement('div')
    delBtn.className = 'se-delete-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', e => { e.stopPropagation(); item.remove() })

    item.appendChild(textNode)
    item.appendChild(delBtn)

    // Make draggable
    makeDraggable(item, wrap)

    // Select on tap
    item.addEventListener('click', e => {
      e.stopPropagation()
      document.querySelectorAll('.se-overlay-item').forEach(el => el.classList.remove('selected'))
      item.classList.add('selected')
    })

    wrap.appendChild(item)
    textItems.push({ id, text, font, size, color, bg, anim })
    input.value = ''
  }

  // ══════════════════════════════════════════════════════════
  // STICKER OVERLAY
  // ══════════════════════════════════════════════════════════
  let stickerIdCounter = 0

  function addStickerOverlay(emoji) {
    const wrap = document.getElementById('storyEditorWrap')
    if (!wrap) return

    const id   = ++stickerIdCounter
    const item = document.createElement('div')
    item.className = 'se-overlay-item'
    item.dataset.id = `s${id}`
    item.style.cssText = `
      left: 50%; top: 50%;
      transform: translate(-50%, -50%);
      font-size: 48px;
      line-height: 1;
      z-index: 11;
    `

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

  // ══════════════════════════════════════════════════════════
  // DRAG HELPER
  // ══════════════════════════════════════════════════════════
  function makeDraggable(el, container) {
    let startX, startY, origLeft, origTop, isDragging = false

    function getPos(e) {
      const src = e.touches ? e.touches[0] : e
      return { x: src.clientX, y: src.clientY }
    }

    function onStart(e) {
      if (e.target.classList.contains('se-delete-btn')) return
      e.stopPropagation()
      isDragging = true
      const pos  = getPos(e)
      startX = pos.x; startY = pos.y
      // Parse current position
      origLeft = parseFloat(el.style.left)  || 50
      origTop  = parseFloat(el.style.top)   || 50
      el.style.transform = 'translate(-50%, -50%)'
    }

    function onMove(e) {
      if (!isDragging) return
      e.preventDefault()
      const pos    = getPos(e)
      const rect   = container.getBoundingClientRect()
      const dx     = pos.x - startX
      const dy     = pos.y - startY
      const newLeft = origLeft + (dx / rect.width)  * 100
      const newTop  = origTop  + (dy / rect.height) * 100
      el.style.left = Math.max(5, Math.min(95, newLeft)) + '%'
      el.style.top  = Math.max(5, Math.min(95, newTop))  + '%'
    }

    function onEnd() { isDragging = false }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: false })
    el.addEventListener('touchend',   onEnd,   { passive: true })
    el.addEventListener('mousedown',  onStart)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onEnd)
  }

  // ══════════════════════════════════════════════════════════
  // READ CURRENT OVERLAY POSITIONS FROM DOM
  // (drag updates style.left/top directly, not the arrays —
  //  so we read the live DOM state here, which is always correct)
  // ══════════════════════════════════════════════════════════
  function collectOverlayState() {
    const wrap = document.getElementById('storyEditorWrap')
    const texts = []
    const stickers = []
    if (!wrap) return { texts, stickers }

    wrap.querySelectorAll('.se-overlay-item').forEach(el => {
      const left = parseFloat(el.style.left) || 50
      const top  = parseFloat(el.style.top)  || 50
      const span = el.querySelector('span')

      // Text items always have font-family set in addTextOverlay();
      // sticker items never set it in addStickerOverlay(). This is
      // the reliable way to tell them apart (not emoji regex, which
      // is inconsistent across browsers).
      if (el.style.fontFamily) {
        // text item
        texts.push({
          text:  span ? span.textContent : '',
          xPct:  left, yPct: top,
          font:  el.style.fontFamily,
          size:  parseFloat(el.style.fontSize) || 24,
          color: el.style.color || '#ffffff',
          bg:    el.style.background || 'transparent',
          anim:  [...el.classList].find(c => c.startsWith('se-anim-'))?.replace('se-anim-','') || 'none'
        })
      } else {
        // sticker item (large emoji-only span)
        stickers.push({
          emoji: span ? span.textContent : '',
          xPct:  left, yPct: top,
          size:  parseFloat(el.style.fontSize) || 48
        })
      }
    })

    return { texts, stickers }
  }

  // ══════════════════════════════════════════════════════════
  // PUBLIC API — used by story.js submitStory()
  // ══════════════════════════════════════════════════════════

  // Returns true if user actually changed anything (so story.js
  // can skip baking when there's nothing to bake).
  window.storyEditorHasEdits = function () {
    const wrap = document.getElementById('storyEditorWrap')
    const hasOverlay = wrap ? wrap.querySelectorAll('.se-overlay-item').length > 0 : false
    const hasDraw     = drawStrokes.length > 0
    const hasFilter   = currentFilter !== 'none'
    const hasAdjust   = currentAdj.brightness !== 100 || currentAdj.contrast !== 100 || currentAdj.blur !== 0
    return hasOverlay || hasDraw || hasFilter || hasAdjust
  }

  // For IMAGE stories: bake filter + adjustments + draw + text + sticker
  // into a brand new image and return it as a Blob (ready to upload).
  window.storyEditorExportImage = function () {
    return new Promise((resolve, reject) => {
      const previewImg = document.getElementById('storyUploadPreview')
      if (!previewImg || !previewImg.src) { reject(new Error('No image to export')); return }

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width  = img.naturalWidth  || img.width
          canvas.height = img.naturalHeight || img.height
          const ctx = canvas.getContext('2d')

          // 1) Draw base image with CSS-equivalent filter baked in
          const filterObj = FILTERS.find(f => f.id === currentFilter) || FILTERS[0]
          const cssFilter = [
            filterObj.css,
            `brightness(${currentAdj.brightness}%)`,
            `contrast(${currentAdj.contrast}%)`,
            currentAdj.blur > 0 ? `blur(${currentAdj.blur}px)` : ''
          ].filter(Boolean).join(' ')
          ctx.filter = cssFilter || 'none'
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          ctx.filter = 'none'

          // 2) Draw strokes (scaled from preview canvas size to full image size)
          if (drawCanvas && drawStrokes.length) {
            const scaleX = canvas.width  / drawCanvas.width
            const scaleY = canvas.height / drawCanvas.height
            drawStrokes.forEach(stroke => {
              if (!stroke.points.length) return
              ctx.beginPath()
              ctx.strokeStyle = stroke.color
              ctx.lineWidth   = stroke.size * Math.max(scaleX, scaleY)
              ctx.lineCap     = 'round'
              ctx.lineJoin    = 'round'
              ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY)
              stroke.points.slice(1).forEach(p => ctx.lineTo(p.x * scaleX, p.y * scaleY))
              ctx.stroke()
            })
          }

          // 3) Draw text + sticker overlays (positions are % of preview box)
          const { texts, stickers } = collectOverlayState()

          texts.forEach(t => {
            const x = (t.xPct / 100) * canvas.width
            const y = (t.yPct / 100) * canvas.height
            const fontSizePx = t.size * (canvas.width / (previewImg.clientWidth || canvas.width))
            ctx.font = `${fontSizePx}px ${t.font}`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'

            if (t.bg && t.bg !== 'transparent' && t.bg !== 'none') {
              const metrics = ctx.measureText(t.text)
              const padX = 10 * (canvas.width / (previewImg.clientWidth || canvas.width))
              const padY = 6  * (canvas.width / (previewImg.clientWidth || canvas.width))
              ctx.fillStyle = t.bg
              ctx.fillRect(
                x - metrics.width / 2 - padX,
                y - fontSizePx / 2 - padY,
                metrics.width + padX * 2,
                fontSizePx + padY * 2
              )
            }

            ctx.shadowColor = 'rgba(0,0,0,0.5)'
            ctx.shadowBlur   = 4
            ctx.shadowOffsetY = 1
            ctx.fillStyle = t.color
            ctx.fillText(t.text, x, y)
            ctx.shadowColor = 'transparent'
          })

          stickers.forEach(s => {
            const x = (s.xPct / 100) * canvas.width
            const y = (s.yPct / 100) * canvas.height
            const fontSizePx = s.size * (canvas.width / (previewImg.clientWidth || canvas.width))
            ctx.font = `${fontSizePx}px Arial`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(s.emoji, x, y)
          })

          // 4) Export as JPEG blob
          canvas.toBlob(blob => {
            if (blob) resolve(blob)
            else reject(new Error('Canvas export failed'))
          }, 'image/jpeg', 0.92)

        } catch (err) {
          reject(err)
        }
      }
      img.onerror = () => reject(new Error('Failed to load source image for export'))
      img.src = previewImg.src
    })
  }

  // For VIDEO stories: we cannot bake effects into the video file in
  // the browser. Instead we export a lightweight JSON description of
  // every edit so the story viewer can re-render the SAME overlays on
  // top of the playing video (filter via CSS, text/sticker positioned
  // by %, draw strokes redrawn on a canvas layer).
  window.storyEditorExportEditData = function () {
    const { texts, stickers } = collectOverlayState()
    return {
      filter: currentFilter,
      adjust: { ...currentAdj },
      texts,
      stickers,
      drawStrokes: drawStrokes.map(s => ({
        color: s.color,
        size:  s.size,
        // store points as % of the draw canvas so the viewer can
        // rescale them to whatever size the video renders at
        points: drawCanvas
          ? s.points.map(p => ({
              xPct: (p.x / drawCanvas.width)  * 100,
              yPct: (p.y / drawCanvas.height) * 100
            }))
          : []
      }))
    }
  }

})()
