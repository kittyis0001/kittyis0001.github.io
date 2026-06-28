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
  let editorMode     = null   // 'filter'|'text'|'sticker'|'draw'|'adjust'|'crop'|null
  let sourceImage    = null   // original Image object (for re-render)
  let isVideoMode    = false

  // ── Phase 3: Crop / Zoom / Rotation state (image-only) ────
  let cropState = {
    zoom: 1,            // pinch-zoom scale applied to the preview image
    panX: 0, panY: 0,   // pan offset in px (translate), within preview box
    rotation: 0,        // 0 / 90 / 180 / 270 — quick-rotate steps
    fineRotation: 0,    // -45..45 fine rotation slider (degrees)
    aspect: 'free',     // 'free' | '1:1' | '9:16' | '4:5'
    cropRectPct: { x: 5, y: 5, w: 90, h: 90 }  // crop rectangle as % of preview box
  }
  let cropOverlayEl   = null   // the draggable crop-rectangle DOM element
  let cropHandlesBound = false

  // Pinch/pan gesture tracking for the image preview itself
  let pinchState = {
    active: false,
    startDist: 0,
    startZoom: 1,
    startPanX: 0, startPanY: 0,
    startMidX: 0, startMidY: 0
  }

  // Pinch/rotate gesture tracking for individual text/sticker overlay items
  // (separate from the whole-image pinch above)
  let itemGestureState = new Map()  // el -> { startDist, startAngle, startScale, startRotate }

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
        <button class="se-tool-btn" data-mode="crop">
          <span>⛶</span><span>Crop</span>
        </button>
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

      <!-- CROP panel (Phase 3 — image only) -->
      <div class="se-panel" id="sePanelCrop">
        <div class="se-row" id="seCropAspectRow">
          <button class="se-aspect-btn active" data-aspect="free">Free</button>
          <button class="se-aspect-btn" data-aspect="1:1">1:1</button>
          <button class="se-aspect-btn" data-aspect="9:16">9:16</button>
          <button class="se-aspect-btn" data-aspect="4:5">4:5</button>
        </div>
        <div class="se-row">
          <button class="se-rotate-btn" id="seRotateLeft" title="Rotate left">↺ 90°</button>
          <button class="se-rotate-btn" id="seRotateRight" title="Rotate right">↻ 90°</button>
          <button class="se-rotate-btn" id="seCropReset" title="Reset">Reset</button>
        </div>
        <div class="se-adjust-row">
          <label>↔ Fine Rotate</label>
          <input type="range" id="seFineRotate" min="-45" max="45" value="0">
          <span id="seFineRotateVal">0°</span>
        </div>
        <div class="se-crop-hint">Pinch to zoom · Drag to pan · Drag corners to crop</div>
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
  overflow: hidden;
  border-radius: 16px;
}

/* ══════════════════════════════════════════════
   PHASE 3 — CROP / ZOOM / ROTATE (premium styling)
   ══════════════════════════════════════════════ */

/* Disabled state for the Crop tool when in video mode */
.se-tool-btn.se-tool-disabled {
  opacity: 0.3;
  pointer-events: none;
}

/* Aspect ratio chips */
#seCropAspectRow { gap: 8px; }
.se-aspect-btn {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.7);
  border-radius: 18px;
  padding: 7px 16px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: background 0.18s, border-color 0.18s, color 0.18s, transform 0.12s;
  -webkit-tap-highlight-color: transparent;
}
.se-aspect-btn.active {
  background: linear-gradient(135deg, #ffffff, #e8e8f0);
  color: #111;
  border-color: transparent;
  box-shadow: 0 2px 10px rgba(255,255,255,0.25);
}
.se-aspect-btn:active { transform: scale(0.94); }

/* Rotate buttons */
.se-rotate-btn {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  color: white;
  border-radius: 10px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  flex: 1;
  transition: background 0.18s, transform 0.12s;
  -webkit-tap-highlight-color: transparent;
}
.se-rotate-btn:active { transform: scale(0.94); background: rgba(255,255,255,0.16); }

.se-crop-hint {
  text-align: center;
  font-size: 10.5px;
  color: rgba(255,255,255,0.38);
  letter-spacing: 0.3px;
  margin-top: 4px;
}

/* ── Image transform host — wraps the actual <img> so zoom/pan/
   rotation can be applied without disturbing overlays. Sizing
   (width/height/position/overflow) is set inline by
   setupImageTransformHost() to exactly match the original
   .story-upload-preview box — only the transform-related
   properties live here. ── */
#seImageTransformHost {
  transform-origin: center center;
  will-change: transform;
  touch-action: none;
}

/* ── Crop rectangle overlay — premium look, like Instagram/native
   gallery crop tools: dimmed outside area, bright grid inside,
   glowing corner + edge handles ── */
#seCropOverlay {
  position: absolute;
  z-index: 30;
  box-shadow: 0 0 0 9999px rgba(0,0,0,0.55);   /* dim everything outside the rect */
  border: 1.5px solid rgba(255,255,255,0.95);
  touch-action: none;
  cursor: move;
}

/* Rule-of-thirds grid inside the crop rect */
#seCropOverlay::before,
#seCropOverlay::after {
  content: '';
  position: absolute;
  background: rgba(255,255,255,0.32);
}
#seCropOverlay::before {
  left: 33.333%; right: 33.333%; top: 0; bottom: 0;
  border-left: 1px solid rgba(255,255,255,0.32);
  border-right: 1px solid rgba(255,255,255,0.32);
  background: transparent;
}
#seCropOverlay::after {
  top: 33.333%; bottom: 33.333%; left: 0; right: 0;
  border-top: 1px solid rgba(255,255,255,0.32);
  border-bottom: 1px solid rgba(255,255,255,0.32);
  background: transparent;
}

.se-crop-handle {
  position: absolute;
  width: 22px; height: 22px;
  z-index: 31;
  touch-action: none;
}
.se-crop-handle::before {
  content: '';
  position: absolute;
  background: #ffffff;
  box-shadow: 0 0 6px rgba(0,0,0,0.4);
  border-radius: 1.5px;
}
/* Corner handles — small L-shaped marks, like Instagram's crop tool */
.se-crop-handle.se-handle-tl,
.se-crop-handle.se-handle-tr,
.se-crop-handle.se-handle-bl,
.se-crop-handle.se-handle-br {
  width: 26px; height: 26px;
}
.se-crop-handle.se-handle-tl { top: -3px;  left: -3px;  cursor: nwse-resize; }
.se-crop-handle.se-handle-tr { top: -3px;  right: -3px; cursor: nesw-resize; }
.se-crop-handle.se-handle-bl { bottom: -3px; left: -3px;  cursor: nesw-resize; }
.se-crop-handle.se-handle-br { bottom: -3px; right: -3px; cursor: nwse-resize; }

.se-crop-handle.se-handle-tl::before { top: 3px; left: 3px; width: 18px; height: 3px; }
.se-crop-handle.se-handle-tr::before { top: 3px; right: 3px; width: 18px; height: 3px; }
.se-crop-handle.se-handle-bl::before { bottom: 3px; left: 3px; width: 18px; height: 3px; }
.se-crop-handle.se-handle-br::before { bottom: 3px; right: 3px; width: 18px; height: 3px; }

/* Edge midpoint handles for free-form resize on all 4 sides */
.se-crop-handle.se-handle-t,
.se-crop-handle.se-handle-b {
  left: 50%; width: 30px; height: 14px;
  margin-left: -15px; cursor: ns-resize;
}
.se-crop-handle.se-handle-l,
.se-crop-handle.se-handle-r {
  top: 50%; width: 14px; height: 30px;
  margin-top: -15px; cursor: ew-resize;
}
.se-crop-handle.se-handle-t { top: -7px; }
.se-crop-handle.se-handle-b { bottom: -7px; }
.se-crop-handle.se-handle-l { left: -7px; }
.se-crop-handle.se-handle-r { right: -7px; }

.se-crop-handle.se-handle-t::before,
.se-crop-handle.se-handle-b::before { left: 50%; top: 50%; width: 22px; height: 3px; transform: translate(-50%,-50%); }
.se-crop-handle.se-handle-l::before,
.se-crop-handle.se-handle-r::before { left: 50%; top: 50%; width: 3px; height: 22px; transform: translate(-50%,-50%); }

/* Pinch/rotate handle that appears on a selected text/sticker item —
   drag this corner handle to resize+rotate with one finger, or use
   two-finger pinch directly on the item itself */
.se-item-resize-handle {
  position: absolute;
  bottom: -14px; right: -14px;
  width: 22px; height: 22px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #111;
  cursor: grab;
  touch-action: none;
}
.se-overlay-item.selected .se-item-resize-handle { display: flex; }
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

    // ── PHASE 3: Crop tool events ──────────────────────────
    // Aspect ratio chips
    document.addEventListener('click', e => {
      const chip = e.target.closest('.se-aspect-btn')
      if (!chip) return
      document.querySelectorAll('.se-aspect-btn').forEach(b => b.classList.remove('active'))
      chip.classList.add('active')
      cropState.aspect = chip.dataset.aspect
      applyAspectToCropRect()
    })

    // Quick 90° rotate buttons
    document.addEventListener('click', e => {
      if (e.target.id === 'seRotateLeft')  quickRotate(-90)
      if (e.target.id === 'seRotateRight') quickRotate(90)
      if (e.target.id === 'seCropReset')   resetCropState()
    })

    // Fine rotation slider
    document.addEventListener('input', e => {
      if (e.target.id !== 'seFineRotate') return
      cropState.fineRotation = parseInt(e.target.value)
      document.getElementById('seFineRotateVal').textContent = cropState.fineRotation + '°'
      applyImageTransform()
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

    // 1) File selected → completely reset old editor state, THEN init fresh
    //
    // ✅ CRITICAL FIX: this must run in the CAPTURE phase (the `true`
    // below). story.js attaches its own 'change' listener on
    // storyFileInput too (onFileSelected), and the two listeners had no
    // guaranteed order — destroyEditorInstance() could fire AFTER
    // story.js had already set img.src / classList, while the <img>
    // was still sitting inside a leftover #seImageTransformHost from
    // the previous session. That race condition is exactly what broke
    // image preview/upload after the first edited story. Running in
    // the capture phase guarantees we always clean up FIRST, before
    // story.js's own bubble-phase listener ever runs.
    document.addEventListener('change', e => {
      if (e.target.id !== 'storyFileInput') return

      // ✅ BUG 1 FIX: a brand-new file (new story) must never inherit
      // text/stickers/drawings/filters/adjustments from a previous
      // editing session. Destroy everything from the old session
      // first, THEN set up the new one.
      destroyEditorInstance()

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
    }, true)  // capture phase — see comment above for why this matters

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
      closeEditorPanel()
    } else {
      openEditorPanel()
    }
  }

  // ── BUG 2 FIX: Android back button should close the editor panel
  // instead of exiting the chat/website. We push a history entry
  // whenever the panel opens, so the next Back press triggers
  // popstate (handled below) instead of leaving the page. ──
  let editorHistoryPushed = false

  function openEditorPanel() {
    const panel = document.getElementById('storyEditorPanel')
    if (!panel) return
    panel.classList.add('active')
    activateMode(editorMode || 'filter')

    if (!editorHistoryPushed) {
      history.pushState({ seEditorOpen: true }, '')
      editorHistoryPushed = true
    }
  }

  function closeEditorPanel() {
    const panel = document.getElementById('storyEditorPanel')
    if (panel) panel.classList.remove('active')

    // If we're the ones who pushed the history entry, consume it by
    // going back WITHOUT letting that back-navigation leave the page
    // (the popstate listener below checks editorHistoryPushed first).
    if (editorHistoryPushed) {
      editorHistoryPushed = false
      history.back()
    }
  }

  // Android/browser Back button → popstate fires. If the editor panel
  // is open, just close it and stay on the page. Only if the panel is
  // already closed do we let normal back-navigation continue.
  window.addEventListener('popstate', () => {
    const panel = document.getElementById('storyEditorPanel')
    if (panel && panel.classList.contains('active')) {
      panel.classList.remove('active')
      editorHistoryPushed = false
      // Re-push so the page itself doesn't navigate away — this keeps
      // the user on the same chat/story screen after the back press
      // only closed the editor.
      history.pushState({ seEditorClosedByBack: true }, '')
    }
  })

  // ══════════════════════════════════════════════════════════
  // MODE MANAGEMENT
  // ══════════════════════════════════════════════════════════
  function activateMode(mode) {
    // Video stories can't crop (no FFmpeg bake), so silently fall back
    // to filter mode if something tries to force crop while in video mode.
    if (mode === 'crop' && isVideoMode) mode = 'filter'

    editorMode = mode

    // Update tool buttons
    document.querySelectorAll('.se-tool-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode)
    })

    // Show/hide sub-panels
    const panels = { crop:'sePanelCrop', filter:'sePanelFilter', text:'sePanelText', sticker:'sePanelSticker', draw:'sePanelDraw', adjust:'sePanelAdjust' }
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

    // Crop mode setup — show/hide the crop rectangle + enable pinch/pan
    if (mode === 'crop') {
      showCropOverlay()
    } else {
      hideCropOverlay()
    }
  }

  function showEditor() {
    // ✅ FIX: do NOT auto-open the panel here.
    // Panel only opens when user taps the ✏️ edit button (see toggleEditorPanel).
    // This function now just makes sure the toolbar/edit button exists.
    addEditorBtnToToolbar()
    positionEditor()

    // Phase 3: Crop/zoom/rotate is image-only (no FFmpeg to bake a real
    // crop into a video file). Visually disable the Crop tool for videos
    // rather than hiding it, so the UI stays consistent either way.
    const cropBtn = document.querySelector('.se-tool-btn[data-mode="crop"]')
    if (cropBtn) cropBtn.classList.toggle('se-tool-disabled', isVideoMode)

    // Set up the pinch/pan transform host around the active preview element
    setupImageTransformHost()
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

    // If a history entry was pushed for the editor (Bug 2 fix) and the
    // overlay is being closed via Cancel/Publish rather than the Back
    // button, consume that entry too so the back-stack doesn't grow
    // with stale "editor open" states the user never asked for.
    if (editorHistoryPushed) {
      editorHistoryPushed = false
      history.back()
    }
  }

  // ══════════════════════════════════════════════════════════
  // BUG 1 FIX — FULL EDITOR DESTRUCTION
  // ══════════════════════════════════════════════════════════
  // resetEditor() (below) clears state/UI for the cancel/publish path,
  // but it does NOT tear down the draw canvas or its listeners, and it
  // does NOT remove the window-level drag listeners created for every
  // text/sticker item. That's fine for "close this session" but NOT
  // fine for "a brand new story file was just selected" — in that case
  // we need a completely fresh instance with zero leftover listeners,
  // zero leftover canvas, zero leftover state.
  function destroyEditorInstance() {
    // 1) All in-memory state
    currentFilter   = 'none'
    currentAdj      = { brightness: 100, contrast: 100, blur: 0 }
    textItems       = []
    stickerItems    = []
    draggingItem    = null
    drawStrokes     = []
    currentStroke   = null
    isDrawing       = false
    sourceImage     = null
    editorMode      = null

    // 2) Remove every text/sticker overlay DOM node
    document.querySelectorAll('.se-overlay-item').forEach(el => el.remove())

    // 3) Remove every window-level drag listener created by makeDraggable()
    activeDragListeners.forEach(({ onMove, onEnd }) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onEnd)
    })
    activeDragListeners = []

    // 4) Destroy the draw canvas completely (with its resize listener)
    if (drawCanvasResizeHandler) {
      window.removeEventListener('resize', drawCanvasResizeHandler)
      drawCanvasResizeHandler = null
    }
    if (drawCanvas && drawCanvas.parentNode) {
      drawCanvas.parentNode.removeChild(drawCanvas)
    }
    drawCanvas = null
    drawCtx    = null

    // 5) Reset every editor UI control back to defaults
    const textInput = document.getElementById('seTextInput')
    if (textInput) textInput.value = ''

    document.querySelectorAll('.se-color-dot.active').forEach(d => d.classList.remove('active'))
    document.querySelectorAll('#seTextBgColors .se-color-dot[data-bg="none"]').forEach(d => d.classList.add('active'))

    const b  = document.getElementById('seAdjBrightness')
    const c  = document.getElementById('seAdjContrast')
    const bl = document.getElementById('seAdjBlur')
    if (b)  { b.value = 100;  document.getElementById('seAdjBrightnessVal').textContent = '100' }
    if (c)  { c.value = 100;  document.getElementById('seAdjContrastVal').textContent   = '100' }
    if (bl) { bl.value = 0;   document.getElementById('seAdjBlurVal').textContent       = '0'   }

    document.querySelectorAll('.se-filter-item').forEach(el => el.classList.remove('active'))
    const firstFilter = document.querySelector('.se-filter-item[data-filter="none"]')
    if (firstFilter) firstFilter.classList.add('active')

    // 6b) Phase 3: tear down crop overlay, transform host, and reset
    // zoom/pan/rotation/aspect — otherwise the next story would open
    // with the previous story's crop rectangle and zoom level intact.
    destroyCropInstance()

    // 6) Close the editor panel — the next session starts fresh & closed
    const panel = document.getElementById('storyEditorPanel')
    if (panel) panel.classList.remove('active')

    // Also consume any pending "editor open" history entry (Bug 2),
    // so a brand-new story session never inherits a stale back-stack
    // state from the previous one.
    if (editorHistoryPushed) {
      editorHistoryPushed = false
      history.back()
    }

    applyPreviewFilter()
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
  // PHASE 3 — CROP / ZOOM / ROTATION (image-only)
  // ══════════════════════════════════════════════════════════

  // Wraps the active preview element (<img> or <video>) in a host div
  // so pinch-zoom/pan/rotation can be applied as a single CSS transform
  // without disturbing the filter (which lives on the element itself)
  // or the text/sticker overlays (which live in storyEditorWrap, on top).
  // Wraps the active preview element (<img> or <video>) in a host div
  // so pinch-zoom/pan/rotation can be applied as a single CSS transform
  // without disturbing the filter (which lives on the element itself)
  // or the text/sticker overlays (which live in storyEditorWrap, on top).
  //
  // IMPORTANT: #storyEditorWrap is `display:inline-block`, sized by its
  // content. The <img> normally provides that size via its fixed
  // 180×280 box (.story-upload-preview). If the host were
  // position:absolute, it would take itself out of layout flow and
  // storyEditorWrap would collapse to 0×0 — which is exactly what was
  // breaking image preview/upload. So the host must be a normal block
  // element that explicitly takes over the same fixed size instead.
  function setupImageTransformHost() {
    const wrap = document.getElementById('storyEditorWrap')
    if (!wrap) return

    // Video stories don't get pinch/crop — only images do.
    if (isVideoMode) return

    const img = document.getElementById('storyUploadPreview')
    if (!img) return

    let host = document.getElementById('seImageTransformHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'seImageTransformHost'
      host.style.cssText = `
        position: relative;
        width: 180px; height: 280px;
        border-radius: 16px;
        overflow: hidden;
        display: block;
      `
      // Move the <img> inside the host so the transform applies to it
      img.parentNode.insertBefore(host, img)
      host.appendChild(img)
      img.style.width    = '100%'
      img.style.height   = '100%'
      img.style.objectFit = 'cover'
      img.style.display  = 'block'
      img.style.borderRadius = '0'   // host already rounds the corners
      img.style.border   = 'none'    // host keeps the original border instead
    }

    bindImagePinchPan(host)
  }

  // Builds the combined CSS transform string from zoom/pan/rotation
  // and applies it to the transform host.
  function applyImageTransform() {
    const host = document.getElementById('seImageTransformHost')
    if (!host) return
    const totalRotation = cropState.rotation + cropState.fineRotation
    host.style.transform =
      `translate(${cropState.panX}px, ${cropState.panY}px) ` +
      `rotate(${totalRotation}deg) ` +
      `scale(${cropState.zoom})`
  }

  // ── Pinch-to-zoom + drag-to-pan on the image itself ──────
  function bindImagePinchPan(host) {
    if (host.dataset.pinchBound) return
    host.dataset.pinchBound = 'true'

    function dist(t0, t1) {
      return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
    }
    function mid(t0, t1) {
      return { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 }
    }

    let singleTouchStart = null  // for one-finger pan when zoomed in

    host.addEventListener('touchstart', e => {
      // Only the Crop tool (or zoomed-in state) should consume pan/zoom
      // gestures here — otherwise it would fight with text/sticker drag.
      if (editorMode !== 'crop') return

      if (e.touches.length === 2) {
        e.preventDefault()
        const [t0, t1] = e.touches
        pinchState.active   = true
        pinchState.startDist = dist(t0, t1)
        pinchState.startZoom = cropState.zoom
        pinchState.startPanX = cropState.panX
        pinchState.startPanY = cropState.panY
        const m = mid(t0, t1)
        pinchState.startMidX = m.x
        pinchState.startMidY = m.y
        singleTouchStart = null
      } else if (e.touches.length === 1) {
        singleTouchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: cropState.panX, panY: cropState.panY }
      }
    }, { passive: false })

    host.addEventListener('touchmove', e => {
      if (editorMode !== 'crop') return

      if (e.touches.length === 2 && pinchState.active) {
        e.preventDefault()
        const [t0, t1] = e.touches
        const newDist = dist(t0, t1)
        const scaleDelta = newDist / (pinchState.startDist || 1)
        cropState.zoom = Math.max(1, Math.min(4, pinchState.startZoom * scaleDelta))

        const m = mid(t0, t1)
        cropState.panX = pinchState.startPanX + (m.x - pinchState.startMidX)
        cropState.panY = pinchState.startPanY + (m.y - pinchState.startMidY)

        applyImageTransform()
      } else if (e.touches.length === 1 && singleTouchStart && cropState.zoom > 1) {
        e.preventDefault()
        const dx = e.touches[0].clientX - singleTouchStart.x
        const dy = e.touches[0].clientY - singleTouchStart.y
        cropState.panX = singleTouchStart.panX + dx
        cropState.panY = singleTouchStart.panY + dy
        applyImageTransform()
      }
    }, { passive: false })

    host.addEventListener('touchend', () => {
      pinchState.active = false
      singleTouchStart = null
    }, { passive: true })

    // Mouse wheel as a desktop-testing convenience (pinch substitute)
    host.addEventListener('wheel', e => {
      if (editorMode !== 'crop') return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.08 : 0.08
      cropState.zoom = Math.max(1, Math.min(4, cropState.zoom + delta))
      applyImageTransform()
    }, { passive: false })
  }

  // ── Crop rectangle overlay (draggable corners + edges) ──
  function showCropOverlay() {
    if (isVideoMode) return
    const wrap = document.getElementById('storyEditorWrap')
    if (!wrap) return

    if (!cropOverlayEl) {
      cropOverlayEl = document.createElement('div')
      cropOverlayEl.id = 'seCropOverlay'
      cropOverlayEl.innerHTML = `
        <div class="se-crop-handle se-handle-tl"></div>
        <div class="se-crop-handle se-handle-t"></div>
        <div class="se-crop-handle se-handle-tr"></div>
        <div class="se-crop-handle se-handle-l"></div>
        <div class="se-crop-handle se-handle-r"></div>
        <div class="se-crop-handle se-handle-bl"></div>
        <div class="se-crop-handle se-handle-b"></div>
        <div class="se-crop-handle se-handle-br"></div>
      `
      wrap.appendChild(cropOverlayEl)
      bindCropHandles()
    }

    cropOverlayEl.style.display = 'block'
    renderCropRectFromState()
  }

  function hideCropOverlay() {
    if (cropOverlayEl) cropOverlayEl.style.display = 'none'
  }

  function renderCropRectFromState() {
    if (!cropOverlayEl) return
    const r = cropState.cropRectPct
    cropOverlayEl.style.left   = r.x + '%'
    cropOverlayEl.style.top    = r.y + '%'
    cropOverlayEl.style.width  = r.w + '%'
    cropOverlayEl.style.height = r.h + '%'
  }

  function bindCropHandles() {
    if (cropHandlesBound || !cropOverlayEl) return
    cropHandlesBound = true

    const wrap = document.getElementById('storyEditorWrap')

    // Dragging the whole rect around (move, not resize)
    let moveStart = null
    cropOverlayEl.addEventListener('touchstart', e => {
      if (e.target.classList.contains('se-crop-handle')) return  // handles do their own thing
      const t = e.touches[0]
      moveStart = { x: t.clientX, y: t.clientY, rect: { ...cropState.cropRectPct } }
    }, { passive: true })
    cropOverlayEl.addEventListener('touchmove', e => {
      if (!moveStart) return
      e.preventDefault()
      const wrapRect = wrap.getBoundingClientRect()
      const t = e.touches[0]
      const dxPct = ((t.clientX - moveStart.x) / wrapRect.width)  * 100
      const dyPct = ((t.clientY - moveStart.y) / wrapRect.height) * 100
      let { x, y, w, h } = moveStart.rect
      x = Math.max(0, Math.min(100 - w, x + dxPct))
      y = Math.max(0, Math.min(100 - h, y + dyPct))
      cropState.cropRectPct = { x, y, w, h }
      renderCropRectFromState()
    }, { passive: false })
    cropOverlayEl.addEventListener('touchend', () => { moveStart = null }, { passive: true })

    // Each handle resizes the rect from its corresponding edge/corner
    const handleConfigs = {
      'se-handle-tl': { x: true,  y: true,  w: -1, h: -1 },
      'se-handle-tr': { x: false, y: true,  w:  1, h: -1 },
      'se-handle-bl': { x: true,  y: false, w: -1, h:  1 },
      'se-handle-br': { x: false, y: false, w:  1, h:  1 },
      'se-handle-t':  { x: false, y: true,  w:  0, h: -1 },
      'se-handle-b':  { x: false, y: false, w:  0, h:  1 },
      'se-handle-l':  { x: true,  y: false, w: -1, h:  0 },
      'se-handle-r':  { x: false, y: false, w:  1, h:  0 }
    }

    cropOverlayEl.querySelectorAll('.se-crop-handle').forEach(handle => {
      const cls = [...handle.classList].find(c => handleConfigs[c])
      const cfg = handleConfigs[cls]
      if (!cfg) return

      let start = null

      handle.addEventListener('touchstart', e => {
        e.stopPropagation()
        const t = e.touches[0]
        start = { x: t.clientX, y: t.clientY, rect: { ...cropState.cropRectPct } }
      }, { passive: true })

      handle.addEventListener('touchmove', e => {
        if (!start) return
        e.preventDefault()
        e.stopPropagation()
        const wrapRect = wrap.getBoundingClientRect()
        const t = e.touches[0]
        const dxPct = ((t.clientX - start.x) / wrapRect.width)  * 100
        const dyPct = ((t.clientY - start.y) / wrapRect.height) * 100

        let { x, y, w, h } = start.rect

        if (cfg.w === -1) { // dragging left edge
          const newX = Math.max(0, Math.min(x + w - 10, x + dxPct))
          w = w + (x - newX)
          x = newX
        } else if (cfg.w === 1) { // dragging right edge
          w = Math.max(10, Math.min(100 - x, w + dxPct))
        }

        if (cfg.h === -1) { // dragging top edge
          const newY = Math.max(0, Math.min(y + h - 10, y + dyPct))
          h = h + (y - newY)
          y = newY
        } else if (cfg.h === 1) { // dragging bottom edge
          h = Math.max(10, Math.min(100 - y, h + dyPct))
        }

        // Respect a locked aspect ratio if one is selected
        if (cropState.aspect !== 'free') {
          const ratio = aspectRatioValue(cropState.aspect)
          // Keep width as the driver, derive height (works well enough
          // for a touch-friendly crop tool without extra complexity)
          h = w / ratio
          if (y + h > 100) h = 100 - y
        }

        cropState.cropRectPct = { x, y, w, h }
        renderCropRectFromState()
      }, { passive: false })

      handle.addEventListener('touchend', () => { start = null }, { passive: true })
    })
  }

  function aspectRatioValue(aspect) {
    if (aspect === '1:1')  return 1
    if (aspect === '9:16') return 9 / 16
    if (aspect === '4:5')  return 4 / 5
    return null
  }

  function applyAspectToCropRect() {
    const ratio = aspectRatioValue(cropState.aspect)
    if (!ratio) { renderCropRectFromState(); return }  // 'free' — leave as-is

    // Re-center a rect of the right ratio within the current bounds
    let { x, y, w, h } = cropState.cropRectPct
    h = w / ratio
    if (h > 100) { h = 100; w = h * ratio }
    x = Math.max(0, Math.min(100 - w, x))
    y = Math.max(0, Math.min(100 - h, y))
    cropState.cropRectPct = { x, y, w, h }
    renderCropRectFromState()
  }

  function quickRotate(deg) {
    cropState.rotation = (cropState.rotation + deg + 360) % 360
    applyImageTransform()
  }

  function resetCropState() {
    cropState = {
      zoom: 1, panX: 0, panY: 0,
      rotation: 0, fineRotation: 0,
      aspect: 'free',
      cropRectPct: { x: 5, y: 5, w: 90, h: 90 }
    }
    const fine = document.getElementById('seFineRotate')
    if (fine) { fine.value = 0; document.getElementById('seFineRotateVal').textContent = '0°' }
    document.querySelectorAll('.se-aspect-btn').forEach(b => b.classList.remove('active'))
    const freeBtn = document.querySelector('.se-aspect-btn[data-aspect="free"]')
    if (freeBtn) freeBtn.classList.add('active')
    applyImageTransform()
    renderCropRectFromState()
  }

  // Tears down everything Phase 3 added — called from destroyEditorInstance()
  function destroyCropInstance() {
    if (cropOverlayEl && cropOverlayEl.parentNode) {
      cropOverlayEl.parentNode.removeChild(cropOverlayEl)
    }
    cropOverlayEl = null
    cropHandlesBound = false

    const host = document.getElementById('seImageTransformHost')
    if (host) {
      // Move the <img> back out before removing the host, so story.js's
      // own references to #storyUploadPreview keep working untouched.
      const img = document.getElementById('storyUploadPreview')
      if (img && host.parentNode) {
        host.parentNode.insertBefore(img, host)
        img.style.width = ''; img.style.height = ''; img.style.objectFit = ''
        img.style.display = ''
        img.style.transform = ''
        img.style.borderRadius = ''
        img.style.border = ''
      }
      host.parentNode && host.parentNode.removeChild(host)
    }

    resetCropState()
  }

  // ══════════════════════════════════════════════════════════
  // DRAW TOOL
  // ══════════════════════════════════════════════════════════
  let drawStrokes = []   // [{points:[{x,y}], color, size}]
  let currentStroke = null

  // Tracks the active draw-canvas resize listener so destroyEditorInstance()
  // can remove it before the next session creates a new one.
  let drawCanvasResizeHandler = null

  // Tracks every window-level mousemove/mouseup pair created by
  // makeDraggable() for text/sticker items, so they can all be torn
  // down in one go when the editor is destroyed (otherwise dragging
  // 5 stories' worth of text/stickers leaves 10 stale window listeners).
  let activeDragListeners = []

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
    drawCanvasResizeHandler = resizeDrawCanvas
    window.addEventListener('resize', drawCanvasResizeHandler)

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
      position: absolute;
    `
    if (anim !== 'none') item.classList.add(`se-anim-${anim}`)

    const textNode = document.createElement('span')
    textNode.textContent = text

    const delBtn = document.createElement('div')
    delBtn.className = 'se-delete-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', e => { e.stopPropagation(); item.remove() })

    // Phase 3: one-finger resize+rotate handle (only visible when selected)
    const resizeHandle = document.createElement('div')
    resizeHandle.className = 'se-item-resize-handle'
    resizeHandle.textContent = '↻'

    item.appendChild(textNode)
    item.appendChild(delBtn)
    item.appendChild(resizeHandle)

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
      position: absolute;
    `

    const emojiSpan = document.createElement('span')
    emojiSpan.textContent = emoji

    const delBtn = document.createElement('div')
    delBtn.className = 'se-delete-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', e => { e.stopPropagation(); item.remove() })

    // Phase 3: one-finger resize+rotate handle (only visible when selected)
    const resizeHandle = document.createElement('div')
    resizeHandle.className = 'se-item-resize-handle'
    resizeHandle.textContent = '↻'

    item.appendChild(emojiSpan)
    item.appendChild(delBtn)
    item.appendChild(resizeHandle)

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

    // ── Phase 3: per-item scale + rotation, applied on top of the
    // existing translate(-50%,-50%) positioning. These persist across
    // drags so pinch-resize/rotate "sticks" between gestures. ──
    let itemScale    = 1
    let itemRotation = 0

    function applyItemTransform() {
      el.style.transform = `translate(-50%, -50%) rotate(${itemRotation}deg) scale(${itemScale})`
    }

    function getPos(e) {
      const src = e.touches ? e.touches[0] : e
      return { x: src.clientX, y: src.clientY }
    }

    function onStart(e) {
      if (e.target.classList.contains('se-delete-btn')) return
      if (e.target.classList.contains('se-item-resize-handle')) return  // handled separately below

      // Two fingers on the item itself → pinch-resize + rotate, not drag
      if (e.touches && e.touches.length === 2) {
        beginItemPinch(e)
        return
      }

      e.stopPropagation()
      isDragging = true
      const pos  = getPos(e)
      startX = pos.x; startY = pos.y
      // Parse current position
      origLeft = parseFloat(el.style.left)  || 50
      origTop  = parseFloat(el.style.top)   || 50
    }

    function onMove(e) {
      if (e.touches && e.touches.length === 2) {
        continueItemPinch(e)
        return
      }
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

    function onEnd(e) {
      isDragging = false
      if (!e.touches || e.touches.length < 2) endItemPinch()
    }

    // ── Two-finger pinch directly on a selected text/sticker:
    // pinch apart = bigger, twist = rotate. Premium, Instagram-like. ──
    function beginItemPinch(e) {
      const [t0, t1] = e.touches
      const dist  = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
      const angle = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX) * (180 / Math.PI)
      itemGestureState.set(el, { startDist: dist, startAngle: angle, startScale: itemScale, startRotate: itemRotation })
    }
    function continueItemPinch(e) {
      const state = itemGestureState.get(el)
      if (!state) return
      e.preventDefault()
      const [t0, t1] = e.touches
      const dist  = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
      const angle = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX) * (180 / Math.PI)

      itemScale    = Math.max(0.4, Math.min(3.5, state.startScale * (dist / (state.startDist || 1))))
      itemRotation = state.startRotate + (angle - state.startAngle)
      applyItemTransform()
    }
    function endItemPinch() { itemGestureState.delete(el) }

    // ── One-finger drag on the corner resize handle: drag away from
    // the item's center to scale it up, drag toward center to shrink,
    // and the angle from center sets rotation — a single-finger
    // alternative to the two-finger pinch above, handy for one-hand use. ──
    function bindResizeHandle() {
      const handle = el.querySelector('.se-item-resize-handle')
      if (!handle) return
      let dragging = false
      let startState = null

      function getCenter() {
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }

      function onHandleStart(e) {
        e.stopPropagation()
        dragging = true
        const pos = getPos(e)
        const c   = getCenter()
        startState = {
          startDist:  Math.hypot(pos.x - c.x, pos.y - c.y),
          startAngle: Math.atan2(pos.y - c.y, pos.x - c.x) * (180 / Math.PI),
          startScale: itemScale,
          startRotate: itemRotation
        }
      }
      function onHandleMove(e) {
        if (!dragging || !startState) return
        e.preventDefault()
        const pos = getPos(e)
        const c   = getCenter()
        const dist  = Math.hypot(pos.x - c.x, pos.y - c.y)
        const angle = Math.atan2(pos.y - c.y, pos.x - c.x) * (180 / Math.PI)
        itemScale    = Math.max(0.4, Math.min(3.5, startState.startScale * (dist / (startState.startDist || 1))))
        itemRotation = startState.startRotate + (angle - startState.startAngle)
        applyItemTransform()
      }
      function onHandleEnd() { dragging = false; startState = null }

      handle.addEventListener('touchstart', onHandleStart, { passive: true })
      handle.addEventListener('touchmove',  onHandleMove,  { passive: false })
      handle.addEventListener('touchend',   onHandleEnd,   { passive: true })
      handle.addEventListener('mousedown',  onHandleStart)
      window.addEventListener('mousemove', onHandleMove)
      window.addEventListener('mouseup',   onHandleEnd)
      activeDragListeners.push({ onMove: onHandleMove, onEnd: onHandleEnd })
    }
    bindResizeHandle()

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: false })
    el.addEventListener('touchend',   onEnd,   { passive: true })
    el.addEventListener('mousedown',  onStart)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onEnd)

    // ✅ track so destroyEditorInstance() can remove these window
    // listeners — otherwise every text/sticker ever added across every
    // editing session leaves two permanent listeners on window.
    activeDragListeners.push({ onMove, onEnd })

    // Expose final scale/rotation for export (image baking) to read.
    el.getItemTransform = () => ({ scale: itemScale, rotation: itemRotation })
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
    // Phase 3: a non-default crop rect, zoom, pan, or rotation also
    // counts as an edit that needs to be baked into the exported image.
    const r = cropState.cropRectPct
    const hasCrop = (
      cropState.zoom !== 1 || cropState.panX !== 0 || cropState.panY !== 0 ||
      cropState.rotation !== 0 || cropState.fineRotation !== 0 ||
      Math.abs(r.x - 5) > 0.5 || Math.abs(r.y - 5) > 0.5 ||
      Math.abs(r.w - 90) > 0.5 || Math.abs(r.h - 90) > 0.5
    )
    return hasOverlay || hasDraw || hasFilter || hasAdjust || hasCrop
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
          const srcW = img.naturalWidth  || img.width
          const srcH = img.naturalHeight || img.height

          // ── PHASE 3: figure out exactly what the user sees on-screen
          // (after pan/zoom/rotation), then bake the SAME framing into
          // a full-resolution output canvas. The preview box and the
          // crop rectangle are both expressed in % of the preview's
          // displayed size, so this works at any output resolution. ──
          const previewBox = previewImg.parentNode  // #seImageTransformHost or the img's old parent
          const boxRect = (previewBox && previewBox.getBoundingClientRect)
            ? previewBox.getBoundingClientRect()
            : previewImg.getBoundingClientRect()
          const boxW = boxRect.width  || srcW
          const boxH = boxRect.height || srcH

          const totalRotation = (cropState.rotation + cropState.fineRotation) * Math.PI / 180
          const zoom = cropState.zoom || 1
          const panX = cropState.panX || 0
          const panY = cropState.panY || 0

          // object-fit:cover scale — how the source image fills the box
          // before any user zoom/pan is applied (matches the CSS we set
          // on the preview <img> in setupImageTransformHost()).
          const coverScale = Math.max(boxW / srcW, boxH / srcH)
          const fittedW = srcW * coverScale
          const fittedH = srcH * coverScale

          // The crop rectangle, in px relative to the preview box
          const cropPx = {
            x: (cropState.cropRectPct.x / 100) * boxW,
            y: (cropState.cropRectPct.y / 100) * boxH,
            w: (cropState.cropRectPct.w / 100) * boxW,
            h: (cropState.cropRectPct.h / 100) * boxH
          }

          // Output canvas matches the crop rectangle's aspect ratio at
          // full resolution (scaled up from the on-screen crop size to
          // the image's native resolution for a sharp result).
          const outputScale = Math.max(srcW / boxW, srcH / boxH, 1)
          const canvas = document.createElement('canvas')
          canvas.width  = Math.max(1, Math.round(cropPx.w * outputScale))
          canvas.height = Math.max(1, Math.round(cropPx.h * outputScale))
          const ctx = canvas.getContext('2d')

          // 1) Draw the base image with filter baked in, positioned/scaled/
          // rotated exactly as it appears in the live preview, then offset
          // so the crop rectangle's top-left lands at canvas (0,0).
          const filterObj = FILTERS.find(f => f.id === currentFilter) || FILTERS[0]
          const cssFilter = [
            filterObj.css,
            `brightness(${currentAdj.brightness}%)`,
            `contrast(${currentAdj.contrast}%)`,
            currentAdj.blur > 0 ? `blur(${currentAdj.blur}px)` : ''
          ].filter(Boolean).join(' ')
          ctx.filter = cssFilter || 'none'

          ctx.save()
          // Move origin so that (cropPx.x, cropPx.y) in box-space becomes (0,0)
          ctx.translate(-cropPx.x * outputScale, -cropPx.y * outputScale)
          // Re-create the same transform order CSS uses: translate → rotate → scale,
          // pivoting around the box center (since transform-origin is center center)
          const centerX = (boxW / 2) * outputScale
          const centerY = (boxH / 2) * outputScale
          ctx.translate(centerX, centerY)
          ctx.translate(panX * outputScale, panY * outputScale)
          ctx.rotate(totalRotation)
          ctx.scale(zoom, zoom)
          ctx.drawImage(
            img,
            -(fittedW / 2) * outputScale,
            -(fittedH / 2) * outputScale,
            fittedW * outputScale,
            fittedH * outputScale
          )
          ctx.restore()
          ctx.filter = 'none'

          // 2) Draw strokes — they were drawn on a canvas sized to match
          // the (unrotated, unzoomed) preview box, so map them the same
          // way: box-space → minus crop offset → × outputScale.
          if (drawCanvas && drawStrokes.length) {
            const dcScaleX = boxW / drawCanvas.width
            const dcScaleY = boxH / drawCanvas.height
            drawStrokes.forEach(stroke => {
              if (!stroke.points.length) return
              ctx.beginPath()
              ctx.strokeStyle = stroke.color
              ctx.lineWidth   = stroke.size * Math.max(dcScaleX, dcScaleY) * outputScale
              ctx.lineCap     = 'round'
              ctx.lineJoin    = 'round'
              const toCanvasPx = p => ({
                x: (p.x * dcScaleX - cropPx.x) * outputScale,
                y: (p.y * dcScaleY - cropPx.y) * outputScale
              })
              const p0 = toCanvasPx(stroke.points[0])
              ctx.moveTo(p0.x, p0.y)
              stroke.points.slice(1).forEach(p => {
                const pt = toCanvasPx(p)
                ctx.lineTo(pt.x, pt.y)
              })
              ctx.stroke()
            })
          }

          // 3) Draw text + sticker overlays. Positions are stored as %
          // of the preview box; each item also carries its own
          // Phase-3 scale + rotation (read live from the DOM element).
          const wrap = document.getElementById('storyEditorWrap')
          const overlayEls = wrap ? [...wrap.querySelectorAll('.se-overlay-item')] : []

          function findOverlayElFor(xPct, yPct, isTextItem) {
            // Match back to the DOM element that produced this state
            // entry, so we can read its live scale/rotation.
            return overlayEls.find(el => {
              const left = parseFloat(el.style.left) || 0
              const top  = parseFloat(el.style.top)  || 0
              const hasFontFamily = !!el.style.fontFamily
              return Math.abs(left - xPct) < 0.01 && Math.abs(top - yPct) < 0.01 && hasFontFamily === isTextItem
            })
          }

          const { texts, stickers } = collectOverlayState()

          texts.forEach(t => {
            const xBox = (t.xPct / 100) * boxW
            const yBox = (t.yPct / 100) * boxH
            const x = (xBox - cropPx.x) * outputScale
            const y = (yBox - cropPx.y) * outputScale

            const matchedEl = findOverlayElFor(t.xPct, t.yPct, true)
            const itemT = (matchedEl && matchedEl.getItemTransform) ? matchedEl.getItemTransform() : { scale: 1, rotation: 0 }

            const fontSizePx = t.size * (boxW / (previewImg.clientWidth || boxW)) * outputScale * itemT.scale

            ctx.save()
            ctx.translate(x, y)
            ctx.rotate(itemT.rotation * Math.PI / 180)
            ctx.font = `${fontSizePx}px ${t.font}`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'

            if (t.bg && t.bg !== 'transparent' && t.bg !== 'none') {
              const metrics = ctx.measureText(t.text)
              const padX = 10 * (boxW / (previewImg.clientWidth || boxW)) * outputScale * itemT.scale
              const padY = 6  * (boxW / (previewImg.clientWidth || boxW)) * outputScale * itemT.scale
              ctx.fillStyle = t.bg
              ctx.fillRect(
                -metrics.width / 2 - padX,
                -fontSizePx / 2 - padY,
                metrics.width + padX * 2,
                fontSizePx + padY * 2
              )
            }

            ctx.shadowColor = 'rgba(0,0,0,0.5)'
            ctx.shadowBlur   = 4
            ctx.shadowOffsetY = 1
            ctx.fillStyle = t.color
            ctx.fillText(t.text, 0, 0)
            ctx.shadowColor = 'transparent'
            ctx.restore()
          })

          stickers.forEach(s => {
            const xBox = (s.xPct / 100) * boxW
            const yBox = (s.yPct / 100) * boxH
            const x = (xBox - cropPx.x) * outputScale
            const y = (yBox - cropPx.y) * outputScale

            const matchedEl = findOverlayElFor(s.xPct, s.yPct, false)
            const itemT = (matchedEl && matchedEl.getItemTransform) ? matchedEl.getItemTransform() : { scale: 1, rotation: 0 }

            const fontSizePx = s.size * (boxW / (previewImg.clientWidth || boxW)) * outputScale * itemT.scale

            ctx.save()
            ctx.translate(x, y)
            ctx.rotate(itemT.rotation * Math.PI / 180)
            ctx.font = `${fontSizePx}px Arial`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(s.emoji, 0, 0)
            ctx.restore()
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
