// ═══════════════════════════════════════════════════════════
// STORY SYSTEM v2 — Instagram Style + Music Feature
// ═══════════════════════════════════════════════════════════

;(function () {
  'use strict'

  const STORY_DURATION = 30000  // UPDATE 2: 30 seconds for image stories
  const BACKEND_URL =
    typeof BACKEND !== 'undefined'
      ? BACKEND
      : 'https://chat-backend-myvs.onrender.com'

  function getCurrentUser() {
    return (
      localStorage.getItem('chatUser') ||
      (typeof username !== 'undefined' && username ? username : null) ||
      'unknown'
    )
  }

  function getDisplayName(u) {
    if (typeof getNick === 'function') {
      const n = getNick(u)
      if (n && n !== u) return n
    }
    if (u === 'katis1')      return 'Kat'
    if (u === 'kittyis0001') return 'Kitty'
    return u
  }

  function getAvatarSafe(userId) {
    // Try getAvatar() which reads from Firebase profilePics
    if (typeof getAvatar === 'function') {
      const pic = getAvatar(userId)
      if (pic && pic !== '' && !pic.startsWith('data:image/svg')) return pic
    }
    // Fallback to DEFAULT_PIC (SVG placeholder)
    if (typeof DEFAULT_PIC !== 'undefined') return DEFAULT_PIC
    return ''
  }

  // Retry avatar loading multiple times — Firebase may not be loaded yet
  function refreshViewerAvatar(userId) {
    const delays = [300, 800, 1500, 3000]
    delays.forEach(delay => {
      setTimeout(() => {
        const viewerAv = document.getElementById('storyViewerAvatar')
        if (!viewerAv) return
        // Only update if we have a real pic (not SVG placeholder)
        if (typeof getAvatar === 'function') {
          const pic = getAvatar(userId)
          if (pic && pic !== '' && !pic.startsWith('data:image/svg')) {
            viewerAv.src = pic
          }
        }
      }, delay)
    })
  }

  // ── State ──────────────────────────────────────────────
  let allStories     = []
  let viewerUserIdx  = 0
  let viewerStoryIdx = 0
  let progTimer      = null
  let progStart      = 0
  let isPaused       = false
  let touchStartX    = 0
  let touchStartY    = 0
  let holdTimer      = null
  let viewedStoryIds = JSON.parse(localStorage.getItem('viewedStories') || '[]')

  let uploadOverlay, viewer
  let domReady = false
  let refreshInterval = null

  // ── MUSIC STATE ─────────────────────────────────────────
  let selectedMusic   = null   // { videoId, jamendoId, title, artist, thumbnail, audioUrl, source }
  let musicPlayer     = null   // YouTube IFrame Player instance
  let jamendoAudio    = null   // <audio> for Jamendo
  let musicPickerOpen = false
  let musicTabActive  = 'foryou'  // 'foryou' | 'trending' | 'saved'
  let musicSearchTimer = null

  // ── Init ──────────────────────────────────────────────
  function init() {
    injectOverlays()
    bindEvents()
    injectYouTubeAPI()
    domReady = true
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  // ── Public API ────────────────────────────────────────
  window.showStoryBar = function () {
    if (!domReady) { setTimeout(window.showStoryBar, 100); return }
    fetchStories()
    if (!refreshInterval) refreshInterval = setInterval(fetchStories, 60000)
  }
  window.refreshStoryBar = function () { fetchStories() }

  // ══════════════════════════════════════════════════════
  // YOUTUBE IFRAME API LOADER
  // ══════════════════════════════════════════════════════
  function injectYouTubeAPI() {
    if (window.YT || document.getElementById('yt-iframe-api')) return
    const tag = document.createElement('script')
    tag.id  = 'yt-iframe-api'
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  }

  // ══════════════════════════════════════════════════════
  // INJECT OVERLAYS
  // ══════════════════════════════════════════════════════
  function injectOverlays() {
    // ── Upload Overlay (with music button) ──
    if (!document.getElementById('storyUploadOverlay')) {
      uploadOverlay = document.createElement('div')
      uploadOverlay.id = 'storyUploadOverlay'
      uploadOverlay.innerHTML = `
        <h2>Add to Your Story</h2>
        <div id="storyEditorWrap" style="position:relative;display:inline-block;">
          <img id="storyUploadPreview" class="story-upload-preview" alt="preview">
          <video id="storyUploadVideoPreview" class="story-upload-preview" muted playsinline></video>
          <!-- Right toolbar — appears after file selected -->
          <div id="storyRightToolbar">
            <button id="storyMusicBtn" title="Add Music">🎵</button>
          </div>
        </div>
        <!-- Selected music badge -->
        <div id="selectedMusicBadge" style="display:none;">
          <img id="selectedMusicThumb" src="" alt="">
          <div id="selectedMusicInfo">
            <span id="selectedMusicTitle"></span>
            <span id="selectedMusicArtist"></span>
          </div>
          <button id="removeMusicBtn">✕</button>
        </div>
        <textarea id="storyCaption" placeholder="Add a caption..." rows="2" maxlength="120"></textarea>
        <button class="story-upload-btn" id="storyPickFileBtn">📷 Choose Photo / Video</button>
        <input type="file" id="storyFileInput" accept="image/*,video/*" style="display:none">
        <div class="story-action-row">
          <button id="storyUploadCancelBtn">Cancel</button>
          <button id="storySubmitBtn">Share Story</button>
        </div>
      `
      document.body.appendChild(uploadOverlay)
    } else {
      uploadOverlay = document.getElementById('storyUploadOverlay')
    }

    // ── Story Viewer ──
    if (!document.getElementById('storyViewer')) {
      viewer = document.createElement('div')
      viewer.id = 'storyViewer'
      viewer.innerHTML = `
        <div id="storyProgressBars"></div>
        <div id="storyViewerHeader">
          <img id="storyViewerAvatar" src="" alt="">
          <span id="storyViewerName"></span>
          <span id="storyViewerTime"></span>
          <button id="storyCloseBtn">✕</button>
        </div>
        <div id="storyMediaWrap">
          <div id="storyTapLeft"></div>
          <img id="storyImg" alt="">
          <video id="storyVid" playsinline></video>
          <div id="storyCapOverlay"></div>
          <!-- Music sticker -->
          <div id="storyMusicSticker" style="display:none;">
            <span id="storyMusicNote">🎵</span>
            <div id="storyMusicStickerInfo">
              <span id="storyMusicStickerTitle"></span>
              <span id="storyMusicStickerArtist"></span>
            </div>
          </div>
          <div id="storyTapRight"></div>
        </div>
        <!-- Hidden YouTube player -->
        <div id="ytPlayerWrap" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;">
          <div id="ytPlayer"></div>
        </div>
        <!-- Hidden Jamendo audio -->
        <audio id="jamendoAudioEl" style="display:none;"></audio>
        <button id="storyDeleteBtn">🗑 Delete</button>
      `
      document.body.appendChild(viewer)
    } else {
      viewer = document.getElementById('storyViewer')
    }

    // ── Music Picker Bottom Sheet ──
    if (!document.getElementById('musicPicker')) {
      const picker = document.createElement('div')
      picker.id = 'musicPicker'
      picker.innerHTML = `
        <div id="musicPickerBackdrop"></div>
        <div id="musicPickerSheet">
          <div id="musicPickerHandle"></div>
          <div id="musicPickerHeader">
            <h3>🎵 Add Music</h3>
            <button id="musicPickerClose">✕</button>
          </div>
          <div id="musicSearchWrap">
            <input id="musicSearchInput" type="text" placeholder="Search songs, artist, mood...">
            <button id="musicSearchBtn">🔍</button>
          </div>
          <div id="musicTabs">
            <button class="music-tab active" data-tab="foryou">For You</button>
            <button class="music-tab" data-tab="trending">Trending</button>
            <button class="music-tab" data-tab="saved">Saved</button>
          </div>
          <div id="musicListWrap">
            <div id="musicList"></div>
            <div id="musicLoader" style="display:none;">
              <div class="music-spinner"></div>
            </div>
            <div id="musicEmpty" style="display:none;">No songs found</div>
          </div>
        </div>
      `
      document.body.appendChild(picker)
    }
  }

  // ══════════════════════════════════════════════════════
  // BIND EVENTS
  // ══════════════════════════════════════════════════════
  function bindEvents() {
    document.getElementById('storyPickFileBtn')
      .addEventListener('click', () => document.getElementById('storyFileInput').click())
    document.getElementById('storyFileInput').addEventListener('change', onFileSelected)
    document.getElementById('storyUploadCancelBtn').addEventListener('click', closeUploadOverlay)
    document.getElementById('storySubmitBtn').addEventListener('click', submitStory)
    document.getElementById('storyCloseBtn').addEventListener('click', closeViewer)
    document.getElementById('storyTapLeft').addEventListener('click', prevStory)
    document.getElementById('storyTapRight').addEventListener('click', nextStory)
    document.getElementById('storyDeleteBtn').addEventListener('click', deleteCurrentStory)

    // Music button
    document.getElementById('storyMusicBtn').addEventListener('click', openMusicPicker)
    document.getElementById('removeMusicBtn').addEventListener('click', clearSelectedMusic)
    document.getElementById('musicPickerClose').addEventListener('click', closeMusicPicker)
    document.getElementById('musicPickerBackdrop').addEventListener('click', closeMusicPicker)
    document.getElementById('musicSearchBtn').addEventListener('click', () => {
      const q = document.getElementById('musicSearchInput').value.trim()
      if (q) loadMusicTab('search', q)
    })
    document.getElementById('musicSearchInput').addEventListener('input', e => {
      clearTimeout(musicSearchTimer)
      const q = e.target.value.trim()
      if (q.length >= 2) musicSearchTimer = setTimeout(() => loadMusicTab('search', q), 600)
    })
    document.getElementById('musicSearchInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim()
        if (q) loadMusicTab('search', q)
      }
    })

    // Music tabs
    document.querySelectorAll('.music-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.music-tab').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        musicTabActive = btn.dataset.tab
        loadMusicTab(musicTabActive)
      })
    })

    // Story media wrap events
    const wrap = document.getElementById('storyMediaWrap')
    wrap.addEventListener('mousedown', pauseStory)
    wrap.addEventListener('mouseup', resumeStory)
    wrap.addEventListener('touchstart', e => {
      touchStartY = e.touches[0].clientY
      touchStartX = e.touches[0].clientX
      holdTimer = setTimeout(pauseStory, 150)
    }, { passive: true })
    wrap.addEventListener('touchend', e => {
      clearTimeout(holdTimer)
      const dy = e.changedTouches[0].clientY - touchStartY
      const dx = e.changedTouches[0].clientX - touchStartX
      if (dy > 80 && Math.abs(dx) < 60) { closeViewer(); return }
      resumeStory()
    }, { passive: true })
    wrap.addEventListener('touchmove', e => {
      if (e.touches[0].clientY - touchStartY > 20) clearTimeout(holdTimer)
    }, { passive: true })
  }

  // ══════════════════════════════════════════════════════
  // MUSIC PICKER
  // ══════════════════════════════════════════════════════
  function openMusicPicker() {
    const picker = document.getElementById('musicPicker')
    picker.classList.add('active')
    musicPickerOpen = true
    // Reset to For You tab
    document.querySelectorAll('.music-tab').forEach(b => b.classList.remove('active'))
    document.querySelector('.music-tab[data-tab="foryou"]').classList.add('active')
    musicTabActive = 'foryou'
    loadMusicTab('foryou')
  }

  function closeMusicPicker() {
    const picker = document.getElementById('musicPicker')
    picker.classList.remove('active')
    musicPickerOpen = false
  }

  async function loadMusicTab(tab, searchQuery = '') {
    const list   = document.getElementById('musicList')
    const loader = document.getElementById('musicLoader')
    const empty  = document.getElementById('musicEmpty')

    list.innerHTML   = ''
    loader.style.display = 'flex'
    empty.style.display  = 'none'

    try {
      let songs = []

      if (tab === 'search' && searchQuery) {
        const res  = await fetch(`${BACKEND_URL}/music/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        songs = data.songs || []

      } else if (tab === 'trending') {
        const res  = await fetch(`${BACKEND_URL}/music/trending`)
        const data = await res.json()
        songs = data.songs || []

      } else if (tab === 'saved') {
        const me  = getCurrentUser()
        const res  = await fetch(`${BACKEND_URL}/music/saved/${me}`)
        const data = await res.json()
        songs = data.songs || []

      } else if (tab === 'foryou') {
        // Get caption + image for Gemini analysis
        const caption  = document.getElementById('storyCaption')?.value?.trim() || ''
        const imgEl    = document.getElementById('storyUploadPreview')
        const imageUrl = (imgEl && imgEl.classList.contains('active')) ? imgEl.src : ''

        const res  = await fetch(`${BACKEND_URL}/music/recommend`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ caption, imageUrl })
        })
        const data = await res.json()
        songs = data.songs || []

        // Show vibe badge if available
        if (data.mood) {
          const badge = document.createElement('div')
          badge.className   = 'music-vibe-badge'
          badge.textContent = `✨ ${data.mood} · ${data.vibe || ''}`
          list.appendChild(badge)
        }
      }

      loader.style.display = 'none'

      if (!songs.length) {
        empty.style.display = 'block'
        return
      }

      songs.forEach(song => renderSongCard(song, list, tab))

    } catch (e) {
      console.error('[Music] loadMusicTab error:', e)
      loader.style.display = 'none'
      empty.style.display  = 'block'
      empty.textContent    = 'Failed to load songs'
    }
  }

  // UPDATE 5: Preview state — one song at a time
  let previewingSongId  = null   // videoId or jamendoId of currently previewing song
  let previewAudioEl    = null   // <audio> for Jamendo preview
  let previewYTPlayer   = null   // YT player for YouTube preview
  let previewContainer  = null   // hidden div for YT preview player

  function getSongId(song) {
    return song.videoId || song.jamendoId || song.title
  }

  function stopPreview() {
    // Stop Jamendo preview
    if (previewAudioEl) { previewAudioEl.pause(); previewAudioEl.src = ''; previewAudioEl = null }
    // Stop YT preview
    try { if (previewYTPlayer) { previewYTPlayer.stopVideo(); previewYTPlayer.destroy(); previewYTPlayer = null } } catch(e) {}
    if (previewContainer && previewContainer.parentNode) { previewContainer.parentNode.removeChild(previewContainer); previewContainer = null }
    // Remove active highlight from all cards
    document.querySelectorAll('.music-card.previewing').forEach(el => el.classList.remove('previewing'))
    previewingSongId = null
  }

  function previewSong(song, cardEl) {
    const id = getSongId(song)

    // Tap again = toggle pause/resume
    if (previewingSongId === id) {
      if (previewAudioEl && !previewAudioEl.paused) {
        previewAudioEl.pause()
        cardEl.classList.remove('previewing')
        return
      } else if (previewAudioEl && previewAudioEl.paused) {
        previewAudioEl.play().catch(() => {})
        cardEl.classList.add('previewing')
        return
      }
      stopPreview(); return
    }

    stopPreview()
    previewingSongId = id
    cardEl.classList.add('previewing')

    if (song.source === 'jamendo' && song.audioUrl) {
      // Jamendo: direct MP3 preview
      previewAudioEl = new Audio(song.audioUrl)
      previewAudioEl.volume = 0.7
      previewAudioEl.play().catch(() => {})
      previewAudioEl.onended = () => {
        cardEl.classList.remove('previewing')
        previewingSongId = null
      }
    } else if (song.source === 'youtube' && song.videoId) {
      // YouTube: IFrame silent preview (autoplay muted for preview)
      if (!document.getElementById('ytPreviewWrap')) {
        previewContainer = document.createElement('div')
        previewContainer.id = 'ytPreviewWrap'
        previewContainer.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-999px;'
        const inner = document.createElement('div')
        inner.id = 'ytPreviewPlayer'
        previewContainer.appendChild(inner)
        document.body.appendChild(previewContainer)
      }
      const createPreviewPlayer = () => {
        try {
          previewYTPlayer = new window.YT.Player('ytPreviewPlayer', {
            width: '1', height: '1',
            videoId: song.videoId,
            playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, playsinline: 1 },
            events: {
              onReady: (e) => { try { e.target.setVolume(70); e.target.playVideo() } catch(err) {} },
              onStateChange: (e) => {
                if (e.data === window.YT.PlayerState.ENDED) {
                  cardEl.classList.remove('previewing'); previewingSongId = null
                }
              }
            }
          })
        } catch(e) {}
      }
      if (window.YT && window.YT.Player) createPreviewPlayer()
      else { window.onYouTubeIframeAPIReady = createPreviewPlayer }
    }
  }

  // UPDATE 6+7+8: renderSongCard with separate preview/save/plus/minus actions
  function renderSongCard(song, container, tabType) {
    const card = document.createElement('div')
    card.className = 'music-card'

    const isSelected = selectedMusic &&
      (selectedMusic.videoId === song.videoId || selectedMusic.jamendoId === song.jamendoId)

    const isSaved = tabType === 'saved'

    // Right action buttons depend on tab
    let actionBtns = ''
    if (isSaved) {
      // Saved tab: Plus + Minus
      actionBtns = `
        <button class="music-card-plus" title="Add to Story">＋</button>
        <button class="music-card-minus" title="Remove from Saved">－</button>
      `
    } else {
      // For You / Trending / Search: Save + Plus
      actionBtns = `
        <button class="music-card-save" title="Save">🔖</button>
        <button class="music-card-plus ${isSelected ? 'selected' : ''}" title="Add to Story">${isSelected ? '✓' : '＋'}</button>
      `
    }

    card.innerHTML = `
      <img class="music-card-thumb" src="${song.thumbnail || ''}" alt=""
        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect width=%2248%22 height=%2248%22 fill=%22%23333%22/><text x=%2224%22 y=%2230%22 font-size=%2220%22 text-anchor=%22middle%22 fill=%22%23fff%22>🎵</text></svg>'">
      <div class="music-card-info">
        <div class="music-card-title">${escapeHtml(song.title)}</div>
        <div class="music-card-artist">${escapeHtml(song.artist || '')}</div>
        <div class="music-card-source">${song.source === 'youtube' ? '▶ YouTube' : '♫ Jamendo'}</div>
      </div>
      <div class="music-card-actions">
        ${actionBtns}
      </div>
    `

    // UPDATE 5: Row click (thumb + info area) = preview
    const infoArea = card.querySelector('.music-card-info')
    const thumb    = card.querySelector('.music-card-thumb')
    const previewClick = (e) => {
      e.stopPropagation()
      previewSong(song, card)
    }
    infoArea.addEventListener('click', previewClick)
    thumb.addEventListener('click', previewClick)

    // UPDATE 6: Plus button = add to story only
    const plusBtn = card.querySelector('.music-card-plus')
    if (plusBtn) {
      plusBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        addSongToStory(song)
        // Update all plus buttons for this song
        document.querySelectorAll('.music-card-plus').forEach(btn => {
          const parentCard = btn.closest('.music-card')
          const cardSongId = parentCard?.dataset?.songId
          if (cardSongId === getSongId(song)) {
            btn.textContent = '✓'
            btn.classList.add('selected')
          }
        })
        card.dataset.songId = getSongId(song)
      })
    }

    // UPDATE 7: Save button = save to saved list
    const saveBtn = card.querySelector('.music-card-save')
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        saveSongToList(song)
        saveBtn.textContent = '✅'
        saveBtn.style.pointerEvents = 'none'
      })
    }

    // UPDATE 8: Minus button (saved tab) = remove from saved
    const minusBtn = card.querySelector('.music-card-minus')
    if (minusBtn) {
      minusBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        removeSongFromSaved(song)
        card.style.animation = 'fadeOutCard 0.25s ease forwards'
        setTimeout(() => card.remove(), 260)
      })
    }

    card.dataset.songId = getSongId(song)
    container.appendChild(card)
  }

  // UPDATE 6: Add song to story (no auto-close picker)
  function addSongToStory(song) {
    selectedMusic = song
    const badge   = document.getElementById('selectedMusicBadge')
    const thumb   = document.getElementById('selectedMusicThumb')
    const title   = document.getElementById('selectedMusicTitle')
    const artist  = document.getElementById('selectedMusicArtist')
    if (badge && thumb && title && artist) {
      thumb.src          = song.thumbnail || ''
      title.textContent  = song.title
      artist.textContent = song.artist || ''
      badge.style.display = 'flex'
    }
    // Brief visual feedback
    const flash = document.createElement('div')
    flash.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.15);color:white;padding:8px 20px;border-radius:20px;font-size:13px;font-family:Arial;z-index:99999;pointer-events:none;animation:sv2FadeIn 0.2s ease;'
    flash.textContent = '✓ Added to story'
    document.body.appendChild(flash)
    setTimeout(() => flash.remove(), 1500)
  }

  // UPDATE 7: Save song to saved list
  function saveSongToList(song) {
    const me = getCurrentUser()
    fetch(`${BACKEND_URL}/music/saved`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: me, song })
    }).catch(() => {})
  }

  // UPDATE 8: Remove song from saved
  function removeSongFromSaved(song) {
    const me  = getCurrentUser()
    const sid = song.videoId || song.jamendoId
    if (!sid) return
    fetch(`${BACKEND_URL}/music/saved/${me}/${sid}`, { method: 'DELETE' }).catch(() => {})
  }

  function selectSong(song) { addSongToStory(song) }  // backward compat

  function clearSelectedMusic() {
    selectedMusic = null
    document.getElementById('selectedMusicBadge').style.display = 'none'
  }

  // ══════════════════════════════════════════════════════
  // FETCH STORIES
  // ══════════════════════════════════════════════════════
  async function fetchStories() {
    try {
      const res  = await fetch(BACKEND_URL + '/stories')
      const data = await res.json()
      const list = Array.isArray(data) ? data : (data.stories || [])
      const now  = Date.now()
      const active = list.filter(s => !s.expiresAt || s.expiresAt > now)
      allStories = groupByUser(active)
    } catch (e) {
      console.error('[Story v2] fetch error:', e)
      allStories = []
    }
    updateAllRings()
  }

  function groupByUser(stories) {
    const map = {}
    stories.forEach(s => {
      if (!map[s.userId]) map[s.userId] = { userId: s.userId, stories: [] }
      map[s.userId].stories.push(s)
    })
    const me = getCurrentUser()
    return Object.values(map).sort((a, b) =>
      a.userId === me ? -1 : b.userId === me ? 1 : 0
    )
  }

  function getGroupFor(userId) {
    return allStories.find(g => g.userId === userId) || null
  }

  // ══════════════════════════════════════════════════════
  // RING LOGIC (unchanged)
  // ══════════════════════════════════════════════════════
  function applyRing(el, hasStory, viewed) {
    el.classList.remove('sv2-ring-active', 'sv2-ring-viewed', 'sv2-ring-none')
    if (hasStory) el.classList.add(viewed ? 'sv2-ring-viewed' : 'sv2-ring-active')
    else el.classList.add('sv2-ring-none')
  }

  function updateAllRings() { updateHeaderRing(); updateMenuRing() }

  function updateHeaderRing() {
    const headerAv = document.getElementById('headerAvatar')
    if (!headerAv) return
    let wrapper = document.getElementById('sv2HeaderWrap')
    if (!wrapper) {
      wrapper = document.createElement('div')
      wrapper.id = 'sv2HeaderWrap'
      wrapper.className = 'sv2-avatar-wrap'
      headerAv.parentNode.insertBefore(wrapper, headerAv)
      wrapper.appendChild(headerAv)
      headerAv.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;border:none;display:block;'
    }
    const me          = getCurrentUser()
    const otherUserId = me === 'katis1' ? 'kittyis0001' : 'katis1'
    const otherGroup  = getGroupFor(otherUserId)
    const hasStory    = !!otherGroup
    const allViewed   = hasStory ? otherGroup.stories.every(s => viewedStoryIds.includes(s.id)) : false
    applyRing(wrapper, hasStory, allViewed)
    wrapper.onclick = (e) => {
      e.stopPropagation()
      if (!hasStory) return
      const idx = allStories.indexOf(otherGroup)
      if (idx !== -1) openViewer(idx)
    }
    wrapper.style.cursor = hasStory ? 'pointer' : 'default'
  }

  function updateMenuRing() {
    const avWrap = document.getElementById('sv2MenuAvatarWrap')
    if (!avWrap) return
    const me       = getCurrentUser()
    const myGroup  = getGroupFor(me)
    const hasStory = !!myGroup
    applyRing(avWrap, hasStory, false)
    const plus = document.getElementById('sv2PlusBadge')
    if (plus) plus.style.display = hasStory ? 'none' : 'flex'
    const avImg = document.getElementById('menuProfileAvatar')
    if (avImg) {
      const pic = getAvatarSafe(me)
      if (pic) avImg.src = pic
      avImg.onerror = () => { if (typeof DEFAULT_PIC !== 'undefined') avImg.src = DEFAULT_PIC }
    }
    const nameTxt = document.getElementById('menuProfileName')
    if (nameTxt) nameTxt.innerText = getDisplayName(me)
    avWrap.onclick = (e) => {
      e.stopPropagation()
      const mb = document.getElementById('menuBox')
      if (mb) mb.style.display = 'none'
      const g = getGroupFor(getCurrentUser())
      if (g) openViewer(allStories.indexOf(g))
      else openUploadOverlay()
    }
    avWrap.style.cursor = 'pointer'
  }

  function injectMenuItem() {
    const menuBox = document.getElementById('menuBox')
    if (!menuBox) { setTimeout(injectMenuItem, 200); return }
    if (document.getElementById('menuProfileRow')) { updateMenuRing(); return }

    const me  = getCurrentUser()
    const row = document.createElement('div')
    row.id = 'menuProfileRow'
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px 12px;border-bottom:1px solid #f0f0f0;-webkit-tap-highlight-color:transparent;'

    const avWrap = document.createElement('div')
    avWrap.id = 'sv2MenuAvatarWrap'
    avWrap.className = 'sv2-avatar-wrap'
    avWrap.style.cssText = 'position:relative;flex-shrink:0;flex-grow:0;cursor:pointer;'

    const avImg = document.createElement('img')
    avImg.id = 'menuProfileAvatar'
    avImg.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;'
    avImg.src = getAvatarSafe(me)
    avImg.onerror = () => { if (typeof DEFAULT_PIC !== 'undefined') avImg.src = DEFAULT_PIC }
    avWrap.appendChild(avImg)

    const plus = document.createElement('div')
    plus.id = 'sv2PlusBadge'
    plus.innerText = '+'
    plus.addEventListener('click', (e) => {
      e.stopPropagation()
      const mb = document.getElementById('menuBox')
      if (mb) mb.style.display = 'none'
      openUploadOverlay()
    })
    avWrap.appendChild(plus)

    const nameCol = document.createElement('div')
    nameCol.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;'

    const nameTxt = document.createElement('div')
    nameTxt.id = 'menuProfileName'
    nameTxt.style.cssText = 'font-weight:bold;font-size:14px;color:#111;'
    nameTxt.innerText = getDisplayName(me)

    const uploadTxt = document.createElement('div')
    uploadTxt.id = 'sv2UploadStoryTxt'
    uploadTxt.style.cssText = 'font-size:11px;color:#555;cursor:pointer;user-select:none;'
    uploadTxt.innerText = 'Upload Story'
    uploadTxt.addEventListener('click', (e) => {
      e.stopPropagation()
      const mb = document.getElementById('menuBox')
      if (mb) mb.style.display = 'none'
      openUploadOverlay()
    })

    nameCol.appendChild(nameTxt)
    nameCol.appendChild(uploadTxt)
    row.appendChild(avWrap)
    row.appendChild(nameCol)
    menuBox.insertBefore(row, menuBox.firstChild)

    const origToggle = window.toggleMenu
    window.toggleMenu = function () {
      origToggle && origToggle()
      const u   = getCurrentUser()
      const pic = getAvatarSafe(u)
      if (pic) avImg.src = pic
      nameTxt.innerText = getDisplayName(u)
      updateMenuRing()
    }
    updateMenuRing()
  }
  injectMenuItem()

  // ══════════════════════════════════════════════════════
  // UPLOAD FLOW
  // ══════════════════════════════════════════════════════
  let selectedFile = null

  function openUploadOverlay() {
    selectedFile  = null
    selectedMusic = null
    document.getElementById('storyUploadPreview').classList.remove('active')
    document.getElementById('storyUploadVideoPreview').classList.remove('active')
    document.getElementById('storyCaption').classList.remove('active')
    document.getElementById('storyCaption').value = ''
    document.getElementById('storySubmitBtn').classList.remove('active')
    document.getElementById('storyFileInput').value = ''
    document.getElementById('selectedMusicBadge').style.display = 'none'
    document.getElementById('storyRightToolbar').style.display  = 'none'
    uploadOverlay.classList.add('active')
  }

  function closeUploadOverlay() {
    uploadOverlay.classList.remove('active')
    const vid = document.getElementById('storyUploadVideoPreview')
    vid.pause(); vid.src = ''
    selectedMusic = null
    closeMusicPicker()
  }

  function onFileSelected(e) {
    const file = e.target.files[0]
    if (!file) return
    selectedFile = file
    const url   = URL.createObjectURL(file)
    const isVid = file.type.startsWith('video/')
    const ip    = document.getElementById('storyUploadPreview')
    const vp    = document.getElementById('storyUploadVideoPreview')
    if (isVid) {
      ip.classList.remove('active'); ip.src = ''
      vp.src = url; vp.classList.add('active'); vp.play().catch(() => {})
    } else {
      vp.classList.remove('active'); vp.src = ''
      ip.src = url; ip.classList.add('active')
    }
    document.getElementById('storyCaption').classList.add('active')
    document.getElementById('storySubmitBtn').classList.add('active')
    // Show right toolbar with music button
    // ✅ FIX: defensive null-check + retry. If storyRightToolbar isn't
    // found at this exact moment for any reason, don't let a silent
    // TypeError swallow the rest of this function (and confusingly
    // leave the music/edit buttons looking like they "never appeared"
    // even though everything else about file selection worked).
    const rightToolbar = document.getElementById('storyRightToolbar')
    if (rightToolbar) {
      rightToolbar.style.display = 'flex'
    } else {
      console.error('[Story] storyRightToolbar not found in DOM — retrying')
      setTimeout(() => {
        const rt = document.getElementById('storyRightToolbar')
        if (rt) rt.style.display = 'flex'
      }, 100)
    }
  }

  async function submitStory() {
    if (!selectedFile) return
    const btn = document.getElementById('storySubmitBtn')
    btn.disabled = true; btn.innerText = 'Uploading...'
    try {
      const isVid = selectedFile.type.startsWith('video/')

      // ── EDITOR INTEGRATION ──────────────────────────────────
      // If the user used the editor (filter/text/sticker/draw):
      //   • IMAGE → bake everything into a new image file before upload
      //   • VIDEO → keep the original video file, but capture the edit
      //             description as JSON so the viewer can replay the
      //             same overlays on top of the video
      let fileToUpload  = selectedFile
      let videoEditData = null

      const hasEdits = typeof window.storyEditorHasEdits === 'function'
        ? window.storyEditorHasEdits()
        : false

      if (hasEdits && !isVid && typeof window.storyEditorExportImage === 'function') {
        try {
          const blob = await window.storyEditorExportImage()
          fileToUpload = new File([blob], 'edited-story.jpg', { type: 'image/jpeg' })
        } catch (editErr) {
          console.error('[Story] image edit export failed, uploading original:', editErr)
        }
      } else if (hasEdits && isVid && typeof window.storyEditorExportEditData === 'function') {
        videoEditData = window.storyEditorExportEditData()
      }

      const fd = new FormData(); fd.append('file', fileToUpload)
      const upRes  = await fetch(BACKEND_URL + '/upload', { method: 'POST', body: fd })
      const upData = await upRes.json()
      if (!upData.url) throw new Error('Upload failed — no URL')

      const me      = getCurrentUser()
      if (me === 'unknown') throw new Error('Not logged in')
      const caption = document.getElementById('storyCaption').value.trim()

      const payload = {
        userId:  me,
        type:    isVid ? 'video' : 'image',
        media:   upData.url,
        caption,
        // ── MUSIC: save selected music with story ──
        music: selectedMusic ? {
          videoId:   selectedMusic.videoId   || null,
          jamendoId: selectedMusic.jamendoId || null,
          title:     selectedMusic.title,
          artist:    selectedMusic.artist    || '',
          thumbnail: selectedMusic.thumbnail || '',
          audioUrl:  selectedMusic.audioUrl  || null,
          source:    selectedMusic.source
        } : null,
        // ── EDIT: video overlay data (null for images — already baked in) ──
        edit: videoEditData
      }

      const stRes  = await fetch(BACKEND_URL + '/stories/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(payload)
      })
      const stData = await stRes.json()
      if (!stRes.ok || stData.success === false) throw new Error(stData.message || 'Story create failed')

      closeUploadOverlay()
      await fetchStories()
    } catch (err) {
      alert('Story upload failed ⚠️ ' + err.message)
    } finally {
      btn.disabled = false; btn.innerText = 'Share Story'
    }
  }

  // ══════════════════════════════════════════════════════
  // STORY VIEWER
  // ══════════════════════════════════════════════════════
  function openViewer(idx) {
    if (!allStories.length || idx < 0) return
    viewerUserIdx = idx; viewerStoryIdx = 0
    viewer.classList.add('active')
    loadCurrentStory()
  }

  function closeViewer() {
    viewer.classList.remove('active')
    stopProgress()
    stopStoryMusic()
    const vid = document.getElementById('storyVid')
    vid.pause(); vid.src = ''
    vid.style.filter = ''
    clearStoryEditOverlay()   // ✅ remove any rendered text/sticker/draw overlay
    updateAllRings()
  }

  function loadCurrentStory() {
    stopProgress()
    stopStoryMusic()

    const group = allStories[viewerUserIdx]
    if (!group) { closeViewer(); return }
    const story = group.stories[viewerStoryIdx]
    if (!story) { closeViewer(); return }

    if (!viewedStoryIds.includes(story.id)) {
      viewedStoryIds.push(story.id)
      localStorage.setItem('viewedStories', JSON.stringify(viewedStoryIds))
    }

    // Avatar — set immediately + retry with refreshViewerAvatar
    const viewerAv = document.getElementById('storyViewerAvatar')
    if (viewerAv) {
      // Try real avatar first
      let avSrc = ''
      if (typeof getAvatar === 'function') {
        const attempt = getAvatar(group.userId)
        if (attempt && attempt !== '' && !attempt.startsWith('data:image/svg')) {
          avSrc = attempt
        }
      }
      // Use real pic or DEFAULT_PIC as fallback
      viewerAv.src = avSrc || (typeof DEFAULT_PIC !== 'undefined' ? DEFAULT_PIC : '')
      viewerAv.onerror = function () {
        this.onerror = null
        if (typeof DEFAULT_PIC !== 'undefined') this.src = DEFAULT_PIC
      }
    }

    document.getElementById('storyViewerName').innerText = getDisplayName(group.userId)
    document.getElementById('storyViewerTime').innerText = timeAgo(story.createdAt)
    // Retry avatar at 300/800/1500/3000ms — profilePics loads async from Firebase
    refreshViewerAvatar(group.userId)

    const deleteBtn = document.getElementById('storyDeleteBtn')
    if (group.userId === getCurrentUser()) {
      deleteBtn.classList.add('active')
      deleteBtn.dataset.storyId = story.id
    } else {
      deleteBtn.classList.remove('active')
    }

    // Media
    const img = document.getElementById('storyImg')
    const vid = document.getElementById('storyVid')
    if (story.type === 'video') {
      img.classList.remove('active'); img.src = ''
      vid.src = story.media; vid.classList.add('active')
      vid.muted = false          // ✅ unmute — original video sound
      vid.volume = 1.0
      // ✅ apply saved filter (Phase 1 editor) as CSS on the video element
      vid.style.filter = buildVideoFilterCss(story.edit)
      vid.play().catch(() => {
        // autoplay blocked — try muted first then unmute
        vid.muted = true
        vid.play().then(() => { vid.muted = false }).catch(() => {})
      })
      vid.onended = nextStory
    } else {
      vid.classList.remove('active'); vid.pause(); vid.src = ''
      vid.style.filter = ''
      img.src = story.media; img.classList.add('active')
    }

    // ✅ Render text/sticker/draw overlays saved with the story (video edits)
    renderStoryEditOverlay(story)

    // Caption
    const cap = document.getElementById('storyCapOverlay')
    if (story.caption) { cap.innerText = story.caption; cap.classList.add('active') }
    else cap.classList.remove('active')

    // ── MUSIC: play story music ──
    if (story.music) {
      showMusicSticker(story.music)
      playStoryMusic(story.music)
    } else {
      hideMusicSticker()
    }

    buildProgressBars(group.stories.length, viewerStoryIdx)
    startProgress(story.type === 'video' ? null : STORY_DURATION)
  }

  // ══════════════════════════════════════════════════════
  // MUSIC PLAYBACK IN VIEWER
  // ══════════════════════════════════════════════════════
  function playStoryMusic(music) {
    if (!music) return

    if (music.source === 'youtube' && music.videoId) {
      playYouTubeMusic(music.videoId)
    } else if (music.source === 'jamendo' && music.audioUrl) {
      playJamendoMusic(music.audioUrl)
    }
  }

  function stopStoryMusic() {
    // Stop YouTube
    try {
      if (musicPlayer && typeof musicPlayer.stopVideo === 'function') {
        musicPlayer.stopVideo()
      }
    } catch (e) {}

    // Stop Jamendo
    const audioEl = document.getElementById('jamendoAudioEl')
    if (audioEl) { audioEl.pause(); audioEl.src = '' }
  }

  function pauseStoryMusic() {
    try {
      if (musicPlayer && typeof musicPlayer.pauseVideo === 'function') musicPlayer.pauseVideo()
    } catch (e) {}
    const audioEl = document.getElementById('jamendoAudioEl')
    if (audioEl && !audioEl.paused) audioEl.pause()
  }

  function resumeStoryMusic() {
    try {
      if (musicPlayer && typeof musicPlayer.playVideo === 'function') musicPlayer.playVideo()
    } catch (e) {}
    const audioEl = document.getElementById('jamendoAudioEl')
    if (audioEl && audioEl.src && audioEl.paused) audioEl.play().catch(() => {})
  }

  function playYouTubeMusic(videoId) {
    if (window.YT && window.YT.Player) {
      // YT API ready
      if (musicPlayer) {
        try { musicPlayer.loadVideoById(videoId) }
        catch (e) { createYTPlayer(videoId) }
      } else {
        createYTPlayer(videoId)
      }
    } else {
      // YT API not ready yet — wait
      window.onYouTubeIframeAPIReady = () => createYTPlayer(videoId)
    }
  }

  function createYTPlayer(videoId) {
    try {
      musicPlayer = new window.YT.Player('ytPlayer', {
        width:  '1',
        height: '1',
        videoId,
        playerVars: {
          autoplay:       1,
          controls:       0,
          disablekb:      1,
          fs:             0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline:    1
        },
        events: {
          onReady: (e) => { try { e.target.setVolume(80); e.target.playVideo() } catch (err) {} }
        }
      })
    } catch (e) {
      console.error('[Music] YT player create error:', e)
    }
  }

  function playJamendoMusic(audioUrl) {
    const audioEl = document.getElementById('jamendoAudioEl')
    if (!audioEl) return
    audioEl.src    = audioUrl
    audioEl.volume = 0.8
    audioEl.play().catch(e => console.error('[Music] Jamendo play error:', e))
  }

  function showMusicSticker(music) {
    const sticker = document.getElementById('storyMusicSticker')
    const title   = document.getElementById('storyMusicStickerTitle')
    const artist  = document.getElementById('storyMusicStickerArtist')
    if (!sticker) return
    title.textContent  = music.title  || ''
    artist.textContent = music.artist || ''
    sticker.style.display = 'flex'
  }

  function hideMusicSticker() {
    const sticker = document.getElementById('storyMusicSticker')
    if (sticker) sticker.style.display = 'none'
  }

  // ══════════════════════════════════════════════════════
  // PROGRESS + PAUSE/RESUME (music integrated)
  // ══════════════════════════════════════════════════════
  function buildProgressBars(count, cur) {
    const wrap = document.getElementById('storyProgressBars')
    wrap.innerHTML = ''
    for (let i = 0; i < count; i++) {
      const t = document.createElement('div'); t.className = 'story-prog-track'
      const f = document.createElement('div'); f.className = 'story-prog-fill'
      if (i < cur) f.classList.add('done')
      if (i > cur) f.classList.add('empty')
      t.appendChild(f); wrap.appendChild(t)
    }
  }

  function startProgress(duration) {
    isPaused = false
    if (!duration) return
    progStart = Date.now()
    const fills = document.querySelectorAll('#storyProgressBars .story-prog-fill')
    const fill  = fills[viewerStoryIdx]
    if (!fill) return
    clearInterval(progTimer)
    progTimer = setInterval(() => {
      if (isPaused) return
      const pct = Math.min(((Date.now() - progStart) / duration) * 100, 100)
      fill.style.width = pct + '%'
      if (pct >= 100) nextStory()
    }, 40)
  }

  function stopProgress() { clearInterval(progTimer); progTimer = null }

  function pauseStory() {
    isPaused = true
    const vid = document.getElementById('storyVid')
    if (vid.classList.contains('active')) vid.pause()
    pauseStoryMusic()   // ← pause music
  }

  function resumeStory() {
    if (!isPaused) return
    isPaused = false
    const vid = document.getElementById('storyVid')
    if (vid.classList.contains('active')) vid.play().catch(() => {})
    resumeStoryMusic()  // ← resume music
    const fills = document.querySelectorAll('#storyProgressBars .story-prog-fill')
    const fill  = fills[viewerStoryIdx]
    if (fill) {
      const done = parseFloat(fill.style.width || '0')
      progStart = Date.now() - (done / 100) * STORY_DURATION
    }
  }

  function nextStory() {
    stopProgress()
    stopStoryMusic()    // ← stop before next
    const group = allStories[viewerUserIdx]
    if (!group) { closeViewer(); return }
    if (viewerStoryIdx < group.stories.length - 1) { viewerStoryIdx++; loadCurrentStory() }
    else if (viewerUserIdx < allStories.length - 1) { viewerUserIdx++; viewerStoryIdx = 0; loadCurrentStory() }
    else closeViewer()
  }

  function prevStory() {
    stopProgress()
    stopStoryMusic()    // ← stop before prev
    if (viewerStoryIdx > 0) { viewerStoryIdx--; loadCurrentStory() }
    else if (viewerUserIdx > 0) {
      viewerUserIdx--
      viewerStoryIdx = allStories[viewerUserIdx].stories.length - 1
      loadCurrentStory()
    } else loadCurrentStory()
  }

  async function deleteCurrentStory() {
    const btn = document.getElementById('storyDeleteBtn')
    const id  = btn.dataset.storyId
    if (!id || !confirm('Delete this story?')) return
    try {
      await fetch(BACKEND_URL + '/stories/' + id, { method: 'DELETE' })
      closeViewer()
      await fetchStories()
    } catch (e) { alert('Delete failed ⚠️') }
  }

  // ══════════════════════════════════════════════════════
  // VIDEO EDIT OVERLAY (Phase 1 editor data — text/sticker/draw/filter)
  // Only used for video stories, since image edits are already
  // baked into the uploaded image itself.
  // ══════════════════════════════════════════════════════
  const STORY_FILTER_CSS_MAP = {
    none:      '',
    clarendon: 'brightness(1.1) contrast(1.2) saturate(1.35)',
    gingham:   'brightness(1.05) hue-rotate(-10deg) sepia(0.08)',
    moon:      'grayscale(1) brightness(1.1) contrast(1.1)',
    lark:      'brightness(1.08) contrast(0.92) saturate(1.1) sepia(0.05)',
    reyes:     'brightness(1.1) contrast(0.9) saturate(0.8) sepia(0.22)',
    juno:      'brightness(1.08) contrast(1.1) saturate(1.3) hue-rotate(5deg)',
    slumber:   'brightness(0.95) saturate(0.85) sepia(0.2)',
    crema:     'brightness(1.05) contrast(0.95) saturate(0.9) sepia(0.15)',
    ludwig:    'brightness(1.05) contrast(1.08) saturate(1.1)',
    aden:      'brightness(1.05) hue-rotate(-20deg) saturate(0.9) sepia(0.15)',
    perpetua:  'brightness(1.05) contrast(1.1) saturate(0.8) sepia(0.1)'
  }

  function buildVideoFilterCss(edit) {
    if (!edit) return ''
    const base = STORY_FILTER_CSS_MAP[edit.filter] || ''
    const adj  = edit.adjust || {}
    const parts = [
      base,
      `brightness(${adj.brightness ?? 100}%)`,
      `contrast(${adj.contrast ?? 100}%)`,
      (adj.blur && adj.blur > 0) ? `blur(${adj.blur}px)` : ''
    ].filter(Boolean)
    return parts.join(' ')
  }

  // Tracks the active resize listener for the draw-overlay canvas so we
  // can remove it before attaching a new one — otherwise every video
  // story with drawings leaves a stale listener behind permanently.
  let storyEditResizeHandler = null

  function clearStoryEditOverlay() {
    const layer = document.getElementById('storyEditOverlayLayer')
    if (layer) layer.innerHTML = ''
    if (storyEditResizeHandler) {
      window.removeEventListener('resize', storyEditResizeHandler)
      storyEditResizeHandler = null
    }
  }

  function renderStoryEditOverlay(story) {
    // Always clear the previous overlay + its resize listener first
    clearStoryEditOverlay()

    // Ensure overlay layer exists, sitting on top of img/video, below caption/music sticker
    let layer = document.getElementById('storyEditOverlayLayer')
    if (!layer) {
      layer = document.createElement('div')
      layer.id = 'storyEditOverlayLayer'
      layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;'
      const wrap = document.getElementById('storyMediaWrap')
      if (wrap) wrap.insertBefore(layer, document.getElementById('storyCapOverlay'))
    }
    layer.innerHTML = ''

    const edit = story.edit
    if (!edit || story.type !== 'video') return  // image edits are baked in already

    // ── Draw strokes ──
    if (edit.drawStrokes && edit.drawStrokes.length) {
      const canvas = document.createElement('canvas')
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
      layer.appendChild(canvas)

      const resize = () => {
        const rect = layer.getBoundingClientRect()
        canvas.width  = rect.width
        canvas.height = rect.height
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        edit.drawStrokes.forEach(stroke => {
          if (!stroke.points || !stroke.points.length) return
          ctx.beginPath()
          ctx.strokeStyle = stroke.color
          ctx.lineWidth   = stroke.size
          ctx.lineCap     = 'round'
          ctx.lineJoin    = 'round'
          const pts = stroke.points.map(p => ({
            x: (p.xPct / 100) * canvas.width,
            y: (p.yPct / 100) * canvas.height
          }))
          ctx.moveTo(pts[0].x, pts[0].y)
          pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
          ctx.stroke()
        })
      }
      // Resize once layout settles, and again on viewport changes.
      // Store the reference so clearStoryEditOverlay() can remove it
      // the next time a story is loaded (prevents listener buildup).
      setTimeout(resize, 50)
      storyEditResizeHandler = resize
      window.addEventListener('resize', storyEditResizeHandler)
    }

    // ── Text overlays ──
    (edit.texts || []).forEach(t => {
      const el = document.createElement('div')
      el.style.cssText = `
        position:absolute;
        left:${t.xPct}%; top:${t.yPct}%;
        transform:translate(-50%,-50%);
        font-family:${t.font || 'Arial'};
        font-size:${t.size || 24}px;
        color:${t.color || '#fff'};
        background:${t.bg && t.bg !== 'none' ? t.bg : 'transparent'};
        padding:${t.bg && t.bg !== 'none' ? '4px 10px' : '0'};
        border-radius:6px;
        white-space:nowrap;
        text-shadow:0 1px 4px rgba(0,0,0,0.5);
      `
      if (t.anim && t.anim !== 'none') el.classList.add(`sv2-vidtext-anim-${t.anim}`)
      el.textContent = t.text
      layer.appendChild(el)
    })

    // ── Sticker overlays ──
    ;(edit.stickers || []).forEach(s => {
      const el = document.createElement('div')
      el.style.cssText = `
        position:absolute;
        left:${s.xPct}%; top:${s.yPct}%;
        transform:translate(-50%,-50%);
        font-size:${s.size || 48}px;
        line-height:1;
      `
      el.textContent = s.emoji
      layer.appendChild(el)
    })
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════
  function timeAgo(ts) {
    if (!ts) return ''
    const diff = Date.now() - ts
    const m = Math.floor(diff / 60000)
    const h = Math.floor(diff / 3600000)
    if (m < 1)  return 'just now'
    if (m < 60) return m + 'm ago'
    if (h < 24) return h + 'h ago'
    return Math.floor(h / 24) + 'd ago'
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

})()
