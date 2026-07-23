// ═══════════════════════════════════════════════════════════
// SHORTS FEED — Phase 2
// Full-screen vertical video feed (Instagram Reels / TikTok style)
//
// Design notes / explicit assumptions made in this build:
//
// 1. The chat input area's 😊 emoji button is NOT removed. A new
//    🎬 Shorts-entry button is ADDED alongside it instead. The spec
//    said "in place of the emoji button" — literally replacing it
//    would remove working emoji access, which the same spec's
//    FINAL RULE explicitly protects ("existing messaging" must not
//    change). If you did want a literal replacement, this is a
//    one-line change to flag and I'll fix it.
//
// 2. Channel Shorts / Related Shorts are backend-ready (Phase 1
//    already exposes /shorts/channel/:id and /shorts/related/:id)
//    but have no dedicated UI trigger yet — the spec didn't describe
//    a specific interaction for surfacing them (e.g. "tap channel
//    name"). Trending + Search are the two feeds wired into this UI
//    pass; Channel/Related are a small, clearly-scoped follow-up.
//
// 3. Double-tap-like is visual only (heart burst animation) — the
//    spec marked it "(optional)" and Phase 1's backend has no
//    "likes" storage (only saved/reposted/history), so there's
//    nothing to persist yet without inventing a new backend concept
//    that wasn't explicitly requested.
//
// 4. Repost currently only writes the repost record to Phase 1's
//    backend (owner preserved, counters). Actually publishing a
//    repost as a Story (item 8 in the original spec) needs careful,
//    additive-only changes to the already-working story.js — kept
//    as its own follow-up rather than bundled into this already
//    large UI pass.
//
// 5. Two small, narrow functions get exposed on `window` by
//    index.html for this file to use (matching the same safe
//    pattern already used for getAvatar/getNick/DEFAULT_PIC):
//      window.listenUnseenMessageCount(cb)
//      window.listenOtherUserOnlineStatus(cb)
//    Everything else here is fully self-contained.
// ═══════════════════════════════════════════════════════════

;(function () {
  'use strict'

  const BACKEND_URL =
    typeof BACKEND !== 'undefined'
      ? BACKEND
      : 'https://chat-backend-myvs.onrender.com'

  const PREFETCH_THRESHOLD = 3     // start loading more when within N slides of the end
  const ACTIVE_THRESHOLD   = 0.6   // fraction of a slide visible before it counts as "active"

  // ── State ──────────────────────────────────────────────
  let allShorts        = []
  let currentIndex     = 0
  let playerInstances  = new Map()   // slideIndex -> YT.Player
  let userHasUnmuted   = false
  let currentCategory  = 'all'
  let currentSearchQuery = null      // non-null while showing search results instead of trending
  let isLoadingMore    = false
  let progressInterval = null
  let intersectionObserver = null
  let savedVideoIds    = new Set()
  let domReady         = false

  // ── YouTube IFrame API readiness — polling-based on purpose.
  // story.js also loads this same API (for story music) and directly
  // assigns window.onYouTubeIframeAPIReady when IT needs a player.
  // Only one file can "own" that single global callback slot at a
  // time, so rather than fight over it, this file polls for
  // window.YT.Player instead — works correctly no matter which file
  // initializes first, and never touches story.js. ──
  let ytApiReady = false
  let ytReadyQueue = []

  function ensureYouTubeApiLoaded() {
    if (window.YT && window.YT.Player) { ytApiReady = true; return }
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script')
      tag.id  = 'yt-iframe-api'
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    }
    const pollId = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(pollId)
        ytApiReady = true
        const queue = ytReadyQueue
        ytReadyQueue = []
        queue.forEach(cb => { try { cb() } catch (e) { console.error('[Shorts] YT ready callback error:', e) } })
      }
    }, 150)
  }

  function onYtApiReady(callback) {
    if (ytApiReady && window.YT && window.YT.Player) { callback(); return }
    ytReadyQueue.push(callback)
  }

  // ── Current user (same resolution pattern as story.js) ───
  function getCurrentUser() {
    return localStorage.getItem('chatUser') || null
  }
  function getOtherUser() {
    const me = getCurrentUser()
    if (!me) return null
    return me === 'katis1' ? 'kittyis0001' : 'katis1'
  }

  // ── Init ───────────────────────────────────────────────
  function init() {
    injectShortsHTML()
    ensureYouTubeApiLoaded()
    setupIntersectionObserver()
    bindGlobalEvents()
    domReady = true
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  // ══════════════════════════════════════════════════════
  // HTML INJECTION
  // ══════════════════════════════════════════════════════
  function injectShortsHTML() {
    if (document.getElementById('shortsFeed')) return

    const feed = document.createElement('div')
    feed.id = 'shortsFeed'
    feed.innerHTML = `
      <div class="shorts-topbar">
        <span id="shortsTopbarLabel">For You</span>
      </div>
      <button id="shortsSavedEntryBtn" title="Saved" style="position:absolute;top:12px;right:12px;z-index:6;background:rgba(0,0,0,0.35);border:none;color:white;font-size:18px;width:34px;height:34px;border-radius:50%;cursor:pointer;">🔖</button>
      <div id="shortsScroller"></div>
      <div class="shorts-empty-state">
        <div class="icon">🎬</div>
        <div class="msg" id="shortsEmptyMsg">No shorts available right now.</div>
        <button id="shortsRetryBtn">Retry</button>
      </div>
      <div id="shortsBottomNav">
        <button class="shorts-nav-btn active" id="shortsNavHome">
          <span class="shorts-nav-icon">🏠</span>
        </button>
        <button class="shorts-nav-btn" id="shortsNavSearch">
          <span class="shorts-nav-icon">🔍</span>
        </button>
        <button class="shorts-nav-btn" id="shortsNavMessage">
          <span class="shorts-nav-icon">💬</span>
          <span class="shorts-nav-badge" id="shortsUnreadBadge"></span>
        </button>
        <button class="shorts-nav-btn" id="shortsNavProfile">
          <span style="position:relative;display:inline-block;">
            <img class="shorts-nav-avatar" id="shortsNavAvatar" src="" alt="">
            <span class="shorts-nav-status-dot" id="shortsNavStatusDot"></span>
          </span>
        </button>
      </div>
    `
    document.body.appendChild(feed)

    const search = document.createElement('div')
    search.id = 'shortsSearchOverlay'
    search.innerHTML = `
      <div class="shorts-search-header">
        <button id="shortsSearchClose">✕</button>
        <input id="shortsSearchInput" type="text" placeholder="Search shorts..." autocomplete="off">
      </div>
      <div class="shorts-search-results" id="shortsSearchResults"></div>
    `
    document.body.appendChild(search)

    const saved = document.createElement('div')
    saved.id = 'shortsSavedOverlay'
    saved.innerHTML = `
      <div class="shorts-saved-header">
        <button id="shortsSavedClose">✕</button>
        <h3>Saved</h3>
      </div>
      <div class="shorts-saved-grid" id="shortsSavedGrid"></div>
    `
    document.body.appendChild(saved)

    // Additive Shorts-entry button in the chat input row (does not
    // remove/replace the emoji button — see file header note).
    const inputArea = document.getElementById('inputArea')
    if (inputArea && !document.getElementById('shortsEntryBtn')) {
      const btn = document.createElement('button')
      btn.id = 'shortsEntryBtn'
      btn.title = 'Shorts'
      btn.innerHTML = '🎬'
      btn.addEventListener('click', () => window.showShortsFeed())
      inputArea.insertBefore(btn, inputArea.firstChild)
    }
  }

  // ══════════════════════════════════════════════════════
  // EVENT BINDING
  // ══════════════════════════════════════════════════════
  function bindGlobalEvents() {
    document.getElementById('shortsRetryBtn').addEventListener('click', () => loadShortsFeed(currentCategory, true))
    document.getElementById('shortsSavedEntryBtn').addEventListener('click', openSavedOverlay)

    document.getElementById('shortsNavHome').addEventListener('click', goHome)
    document.getElementById('shortsNavSearch').addEventListener('click', openSearchOverlay)
    document.getElementById('shortsNavMessage').addEventListener('click', () => window.hideShortsFeedToChat())
    document.getElementById('shortsNavProfile').addEventListener('click', () => window.hideShortsFeedToChat())

    document.getElementById('shortsSearchClose').addEventListener('click', closeSearchOverlay)
    document.getElementById('shortsSavedClose').addEventListener('click', closeSavedOverlay)

    const searchInput = document.getElementById('shortsSearchInput')
    let searchDebounce = null
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce)
      const q = searchInput.value.trim()
      if (q.length < 2) { document.getElementById('shortsSearchResults').innerHTML = ''; return }
      searchDebounce = setTimeout(() => runSearch(q), 400)
    })
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { clearTimeout(searchDebounce); runSearch(searchInput.value.trim()) }
    })
  }

  // ══════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════
  window.showShortsFeed = function () {
    if (!domReady) { setTimeout(window.showShortsFeed, 100); return }
    document.getElementById('shortsFeed').classList.add('active')
    setNavActive('shortsNavHome')

    const me = getCurrentUser()
    if (me && allShorts.length === 0) {
      loadSavedVideoIds()
      loadShortsFeed('all', true)
      setupNavStatusAndBadge()
    } else if (allShorts.length > 0) {
      // Returning to an already-loaded feed — resume the active slide.
      playActiveSlide(currentIndex)
    }
  }

  window.hideShortsFeedToChat = function () {
    document.getElementById('shortsFeed').classList.remove('active')
    document.getElementById('shortsSearchOverlay').classList.remove('active')
    document.getElementById('shortsSavedOverlay').classList.remove('active')
    pauseAllPlayers()
  }

  function goHome() {
    document.getElementById('shortsSearchOverlay').classList.remove('active')
    document.getElementById('shortsSavedOverlay').classList.remove('active')
    setNavActive('shortsNavHome')
    if (currentSearchQuery !== null) {
      currentSearchQuery = null
      loadShortsFeed('all', true)
    } else {
      playActiveSlide(currentIndex)
    }
  }

  function setNavActive(id) {
    document.querySelectorAll('.shorts-nav-btn').forEach(b => b.classList.remove('active'))
    const btn = document.getElementById(id)
    if (btn) btn.classList.add('active')
  }

  // ══════════════════════════════════════════════════════
  // NAV STATUS DOT + UNREAD BADGE
  // (uses the two narrow window-exposed listeners from index.html)
  // ══════════════════════════════════════════════════════
  let navStatusBound = false
  function setupNavStatusAndBadge() {
    if (navStatusBound) return
    navStatusBound = true

    const avatarImg = document.getElementById('shortsNavAvatar')
    const other = getOtherUser()
    if (avatarImg && typeof window.getAvatar === 'function' && other) {
      avatarImg.src = window.getAvatar(other)
      avatarImg.onerror = () => { if (window.DEFAULT_PIC) avatarImg.src = window.DEFAULT_PIC }
    }

    if (typeof window.listenOtherUserOnlineStatus === 'function') {
      window.listenOtherUserOnlineStatus(isOnline => {
        const dot = document.getElementById('shortsNavStatusDot')
        if (dot) dot.classList.toggle('online', !!isOnline)
      })
    }

    if (typeof window.listenUnseenMessageCount === 'function') {
      window.listenUnseenMessageCount(count => {
        const badge = document.getElementById('shortsUnreadBadge')
        if (!badge) return
        if (count > 0) {
          badge.textContent = count > 9 ? '9+' : String(count)
          badge.classList.add('show')
        } else {
          badge.classList.remove('show')
        }
      })
    }
  }

  // ══════════════════════════════════════════════════════
  // FEED LOADING
  // ══════════════════════════════════════════════════════
  async function loadShortsFeed(category, reset) {
    currentCategory = category
    if (reset) {
      allShorts = []
      currentIndex = 0
      pauseAllPlayers()
      playerInstances.forEach((_, idx) => destroyPlayerForSlide(idx))
      playerInstances.clear()
      document.getElementById('shortsScroller').innerHTML = ''
    }
    showEmptyState(false)

    try {
      const res  = await fetch(`${BACKEND_URL}/shorts/trending?category=${encodeURIComponent(category)}`)
      const data = await res.json()
      const shorts = data.shorts || []
      if (!shorts.length && allShorts.length === 0) {
        showEmptyState(true, 'No shorts available right now.')
        return
      }
      appendShorts(shorts)
    } catch (e) {
      console.error('[Shorts] loadShortsFeed error:', e)
      if (allShorts.length === 0) showEmptyState(true, 'Failed to load shorts. Check your connection.')
    }
  }

  async function loadMoreShorts() {
    if (isLoadingMore) return
    isLoadingMore = true
    try {
      const endpoint = currentSearchQuery
        ? `${BACKEND_URL}/shorts/search?q=${encodeURIComponent(currentSearchQuery)}`
        : `${BACKEND_URL}/shorts/trending?category=${encodeURIComponent(currentCategory)}`
      const res  = await fetch(endpoint)
      const data = await res.json()
      appendShorts(data.shorts || [])
    } catch (e) {
      console.error('[Shorts] loadMoreShorts error:', e)
    } finally {
      isLoadingMore = false
    }
  }

  function appendShorts(newShorts) {
    const scroller = document.getElementById('shortsScroller')
    const startIdx = allShorts.length
    const existingIds = new Set(allShorts.map(s => s.videoId))
    const deduped = newShorts.filter(s => !existingIds.has(s.videoId))

    deduped.forEach((short, i) => {
      const index = startIdx + i
      allShorts.push(short)
      const slideEl = buildSlideElement(short, index)
      scroller.appendChild(slideEl)
      if (intersectionObserver) intersectionObserver.observe(slideEl)
    })

    if (startIdx === 0 && deduped.length > 0) {
      ensurePlayersForWindow(0)
      startProgressTracking(0)
      recordWatchStart(0)
    }
  }

  function showEmptyState(show, msg) {
    const el = document.querySelector('.shorts-empty-state')
    if (!el) return
    el.classList.toggle('active', show)
    if (show && msg) document.getElementById('shortsEmptyMsg').textContent = msg
  }

  // ══════════════════════════════════════════════════════
  // SLIDE RENDERING
  // ══════════════════════════════════════════════════════
  function buildSlideElement(short, index) {
    const slide = document.createElement('div')
    slide.className = 'shorts-slide'
    slide.dataset.index = index

    const avatarLetter = (short.channelTitle || '?').charAt(0)
    const avatarColor  = colorFromString(short.channelTitle || short.channelId || '')

    slide.innerHTML = `
      <div class="shorts-shimmer"><img src="${escapeAttr(short.thumbnail || '')}" alt="" loading="lazy"></div>
      <div class="shorts-player-host"></div>
      <div class="shorts-buffer-spinner"></div>
      <div class="shorts-bottom-gradient"></div>
      <div class="shorts-progress-track"><div class="shorts-progress-fill"></div></div>
      <button class="shorts-mute-btn">${userHasUnmuted ? '🔊' : '🔇'}</button>
      <div class="shorts-like-burst">❤️</div>
      <div class="shorts-info">
        <div class="shorts-avatar" style="background:${avatarColor};">${escapeHtml(avatarLetter)}</div>
        <div class="shorts-info-text">
          <div class="shorts-channel">${escapeHtml(short.channelTitle || '')}</div>
          <div class="shorts-title">${escapeHtml(short.title || '')}</div>
        </div>
      </div>
      <div class="shorts-actions">
        <button class="shorts-action-btn shorts-save-btn">
          <div class="shorts-action-icon${savedVideoIds.has(short.videoId) ? ' saved' : ''}">🔖</div>
          <span class="shorts-action-label">Save</span>
        </button>
        <button class="shorts-action-btn shorts-share-btn">
          <div class="shorts-action-icon">↗️</div>
          <span class="shorts-action-label">Share</span>
        </button>
        <button class="shorts-action-btn shorts-repost-btn">
          <div class="shorts-action-icon">🔁</div>
          <span class="shorts-action-label">Repost</span>
        </button>
      </div>
    `

    slide.querySelector('.shorts-mute-btn').addEventListener('click', e => { e.stopPropagation(); toggleMute() })
    slide.querySelector('.shorts-save-btn').addEventListener('click', e => { e.stopPropagation(); toggleSaveShort(index) })
    slide.querySelector('.shorts-share-btn').addEventListener('click', e => { e.stopPropagation(); shareShort(index) })
    slide.querySelector('.shorts-repost-btn').addEventListener('click', e => { e.stopPropagation(); repostShort(index) })

    bindDoubleTap(slide, index)

    return slide
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  function escapeAttr(str) { return escapeHtml(str) }

  function colorFromString(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 55%, 42%)`
  }

  // ══════════════════════════════════════════════════════
  // INTERSECTION OBSERVER — active-slide detection
  // ══════════════════════════════════════════════════════
  function setupIntersectionObserver() {
    const scroller = document.getElementById('shortsScroller')
    if (!scroller) return
    intersectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= ACTIVE_THRESHOLD) {
          const idx = parseInt(entry.target.dataset.index, 10)
          if (!isNaN(idx) && idx !== currentIndex) onActiveSlideChanged(idx)
        }
      })
    }, { root: scroller, threshold: [ACTIVE_THRESHOLD] })
  }

  function onActiveSlideChanged(newIndex) {
    const prevIndex = currentIndex
    currentIndex = newIndex

    const oldPlayer = playerInstances.get(prevIndex)
    if (oldPlayer && typeof oldPlayer.pauseVideo === 'function') {
      try { oldPlayer.pauseVideo() } catch (e) {}
    }

    ensurePlayersForWindow(newIndex)
    playActiveSlide(newIndex)
    startProgressTracking(newIndex)
    recordWatchStart(newIndex)

    if (allShorts.length - newIndex <= PREFETCH_THRESHOLD && !isLoadingMore) {
      loadMoreShorts()
    }
  }

  // ══════════════════════════════════════════════════════
  // PLAYER WINDOW MANAGEMENT — only prev/current/next ever
  // have a live YT.Player at once (preload + memory optimization)
  // ══════════════════════════════════════════════════════
  function ensurePlayersForWindow(centerIndex) {
    const keep = new Set([centerIndex - 1, centerIndex, centerIndex + 1].filter(i => i >= 0 && i < allShorts.length))

    for (const idx of Array.from(playerInstances.keys())) {
      if (!keep.has(idx)) destroyPlayerForSlide(idx)
    }
    keep.forEach(idx => {
      if (!playerInstances.has(idx)) createPlayerForSlide(idx)
    })
  }

  function createPlayerForSlide(index) {
    const short = allShorts[index]
    if (!short) return
    const slideEl = document.querySelector(`.shorts-slide[data-index="${index}"]`)
    if (!slideEl) return
    const hostEl = slideEl.querySelector('.shorts-player-host')
    if (!hostEl) return

    // Reserve the slot immediately (not just after the YT API
    // resolves) so a second call for the same index while we're
    // still waiting can't create a duplicate player.
    playerInstances.set(index, null)

    onYtApiReady(() => {
      if (!document.body.contains(hostEl)) { playerInstances.delete(index); return }
      if (playerInstances.get(index)) return   // already created while we waited

      const innerId = 'ytShort_' + index
      hostEl.innerHTML = `<div id="${innerId}"></div>`

      try {
        const player = new window.YT.Player(innerId, {
          videoId: short.videoId,
          playerVars: {
            autoplay: 1,
            mute: userHasUnmuted ? 0 : 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0
          },
          events: {
            onReady:       e => onPlayerReady(index, e),
            onStateChange: e => onPlayerStateChange(index, e),
            onError:       e => onPlayerError(index, e)
          }
        })
        playerInstances.set(index, player)
      } catch (e) {
        console.error('[Shorts] Failed to create player for index', index, e)
        playerInstances.delete(index)
      }
    })
  }

  function destroyPlayerForSlide(index) {
    const player = playerInstances.get(index)
    if (player && typeof player.destroy === 'function') {
      try { player.destroy() } catch (e) {}
    }
    playerInstances.delete(index)

    const slideEl = document.querySelector(`.shorts-slide[data-index="${index}"]`)
    if (slideEl) {
      const hostEl = slideEl.querySelector('.shorts-player-host')
      if (hostEl) hostEl.innerHTML = ''
      const shimmer = slideEl.querySelector('.shorts-shimmer')
      if (shimmer) shimmer.classList.remove('hidden')
    }
  }

  function pauseAllPlayers() {
    playerInstances.forEach(p => { if (p && typeof p.pauseVideo === 'function') { try { p.pauseVideo() } catch (e) {} } })
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null }
  }

  function playActiveSlide(index) {
    const player = playerInstances.get(index)
    if (player && typeof player.playVideo === 'function') {
      try { player.playVideo() } catch (e) {}
    }
  }

  // ══════════════════════════════════════════════════════
  // PLAYER EVENTS
  // ══════════════════════════════════════════════════════
  function onPlayerReady(index, e) {
    if (index === currentIndex) {
      try { e.target.playVideo() } catch (err) {}
    } else {
      try { e.target.pauseVideo() } catch (err) {}
    }
    const slideEl = document.querySelector(`.shorts-slide[data-index="${index}"]`)
    const shimmer = slideEl && slideEl.querySelector('.shorts-shimmer')
    if (shimmer) shimmer.classList.add('hidden')
  }

  function onPlayerStateChange(index, e) {
    if (!window.YT) return
    const State = window.YT.PlayerState
    const slideEl = document.querySelector(`.shorts-slide[data-index="${index}"]`)
    const spinner = slideEl && slideEl.querySelector('.shorts-buffer-spinner')

    if (spinner) spinner.classList.toggle('active', e.data === State.BUFFERING)

    // Loop the active video on end (Reels/TikTok "Replay" behavior).
    // Advancing to the next video only ever happens via an explicit
    // swipe — never automatically.
    if (e.data === State.ENDED && index === currentIndex) {
      try { e.target.seekTo(0); e.target.playVideo() } catch (err) {}
    }
  }

  function onPlayerError(index, e) {
    console.warn('[Shorts] Player error on index', index, e.data)
    if (index === currentIndex && index < allShorts.length - 1) {
      scrollToIndex(index + 1)
    }
  }

  function scrollToIndex(index) {
    const slideEl = document.querySelector(`.shorts-slide[data-index="${index}"]`)
    if (slideEl) slideEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ══════════════════════════════════════════════════════
  // PROGRESS BAR
  // ══════════════════════════════════════════════════════
  function startProgressTracking(index) {
    if (progressInterval) clearInterval(progressInterval)
    progressInterval = setInterval(() => {
      const fillEl = document.querySelector(`.shorts-slide[data-index="${index}"] .shorts-progress-fill`)
      const player = playerInstances.get(index)
      if (!fillEl || !player || typeof player.getCurrentTime !== 'function') return
      try {
        const dur = player.getDuration()
        const cur = player.getCurrentTime()
        if (dur > 0) fillEl.style.width = Math.min((cur / dur) * 100, 100) + '%'
      } catch (e) {}
    }, 200)
  }

  // ══════════════════════════════════════════════════════
  // MUTE
  // ══════════════════════════════════════════════════════
  function toggleMute() {
    userHasUnmuted = !userHasUnmuted
    document.querySelectorAll('.shorts-mute-btn').forEach(b => { b.textContent = userHasUnmuted ? '🔊' : '🔇' })
    const player = playerInstances.get(currentIndex)
    if (player) {
      try { userHasUnmuted ? player.unMute() : player.mute() } catch (e) {}
    }
  }

  // ══════════════════════════════════════════════════════
  // DOUBLE-TAP LIKE (visual only — see file header note)
  // ══════════════════════════════════════════════════════
  function bindDoubleTap(slideEl, index) {
    let lastTap = 0
    slideEl.addEventListener('click', e => {
      if (e.target.closest('.shorts-actions, .shorts-mute-btn')) return
      const now = Date.now()
      if (now - lastTap < 300) {
        showLikeBurst(slideEl)
      } else {
        toggleSlidePlayPause(index)
      }
      lastTap = now
    })
  }

  function showLikeBurst(slideEl) {
    const heart = slideEl.querySelector('.shorts-like-burst')
    if (!heart) return
    heart.classList.remove('burst')
    void heart.offsetWidth
    heart.classList.add('burst')
  }

  function toggleSlidePlayPause(index) {
    const player = playerInstances.get(index)
    if (!player || !window.YT) return
    try {
      const state = player.getPlayerState()
      if (state === window.YT.PlayerState.PLAYING) player.pauseVideo()
      else player.playVideo()
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════
  // SAVE / SHARE / REPOST — Phase 1 backend
  // ══════════════════════════════════════════════════════
  async function loadSavedVideoIds() {
    const me = getCurrentUser()
    if (!me) return
    try {
      const res  = await fetch(`${BACKEND_URL}/shorts/saved/${me}`)
      const data = await res.json()
      savedVideoIds = new Set((data.shorts || []).map(s => s.videoId))
    } catch (e) {}
  }

  async function toggleSaveShort(index) {
    const short = allShorts[index]
    const me = getCurrentUser()
    if (!short || !me) return
    const iconEl = document.querySelector(`.shorts-slide[data-index="${index}"] .shorts-save-btn .shorts-action-icon`)
    const isSaved = savedVideoIds.has(short.videoId)

    if (isSaved) {
      savedVideoIds.delete(short.videoId)
      if (iconEl) iconEl.classList.remove('saved')
      try { await fetch(`${BACKEND_URL}/shorts/saved/${me}/${short.videoId}`, { method: 'DELETE' }) } catch (e) {}
    } else {
      savedVideoIds.add(short.videoId)
      if (iconEl) iconEl.classList.add('saved')
      try {
        await fetch(`${BACKEND_URL}/shorts/saved`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: me, video: short })
        })
      } catch (e) {}
    }
  }

  async function shareShort(index) {
    const short = allShorts[index]
    if (!short) return
    const url = `https://www.youtube.com/shorts/${short.videoId}`
    try {
      if (navigator.share) {
        await navigator.share({ title: short.title || 'Short', url })
      } else {
        await navigator.clipboard.writeText(url)
        showToast('Link copied')
      }
    } catch (e) { /* user cancelled the share sheet — not an error */ }
  }

  async function repostShort(index) {
    const short = allShorts[index]
    const me = getCurrentUser()
    if (!short || !me) return
    const iconEl = document.querySelector(`.shorts-slide[data-index="${index}"] .shorts-repost-btn .shorts-action-icon`)
    if (iconEl) iconEl.classList.add('reposted')
    try {
      await fetch(`${BACKEND_URL}/shorts/repost`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: me, video: short, privacy: 'public' })
      })
      showToast('Reposted')
    } catch (e) {
      if (iconEl) iconEl.classList.remove('reposted')
      showToast('Repost failed')
    }
  }

  function showToast(msg) {
    const el = document.createElement('div')
    el.textContent = msg
    el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(20,20,20,0.92);color:white;padding:9px 20px;border-radius:20px;font-size:13px;z-index:16000;pointer-events:none;'
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 1600)
  }

  // ══════════════════════════════════════════════════════
  // WATCH HISTORY
  // ══════════════════════════════════════════════════════
  function recordWatchStart(index) {
    const short = allShorts[index]
    const me = getCurrentUser()
    if (!short || !me) return
    fetch(`${BACKEND_URL}/shorts/history`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: me, videoId: short.videoId, categoryId: short.categoryId, tags: short.tags })
    }).catch(() => {})
  }

  // ══════════════════════════════════════════════════════
  // SEARCH OVERLAY
  // ══════════════════════════════════════════════════════
  function openSearchOverlay() {
    document.getElementById('shortsSearchOverlay').classList.add('active')
    setTimeout(() => document.getElementById('shortsSearchInput').focus(), 50)
  }
  function closeSearchOverlay() {
    document.getElementById('shortsSearchOverlay').classList.remove('active')
  }

  async function runSearch(query) {
    const resultsEl = document.getElementById('shortsSearchResults')
    if (!query) { resultsEl.innerHTML = ''; return }
    resultsEl.innerHTML = '<div class="shorts-search-empty">Searching…</div>'
    try {
      const res  = await fetch(`${BACKEND_URL}/shorts/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      const results = data.shorts || []
      if (!results.length) {
        resultsEl.innerHTML = '<div class="shorts-search-empty">No results found</div>'
        return
      }
      resultsEl.innerHTML = ''
      results.forEach(short => {
        const item = document.createElement('div')
        item.className = 'shorts-search-item'
        item.innerHTML = `
          <img src="${escapeAttr(short.thumbnail || '')}" alt="" loading="lazy">
          <div class="views">▶ ${formatCount(short.viewCount)}</div>
        `
        item.addEventListener('click', () => openSearchResultInFeed(query, results, short.videoId))
        resultsEl.appendChild(item)
      })
    } catch (e) {
      resultsEl.innerHTML = '<div class="shorts-search-empty">Search failed — try again</div>'
    }
  }

  function formatCount(n) {
    n = n || 0
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
    return String(n)
  }

  function openSearchResultInFeed(query, results, tappedVideoId) {
    closeSearchOverlay()
    currentSearchQuery = query
    document.getElementById('shortsTopbarLabel').textContent = `"${query}"`

    allShorts = []
    currentIndex = 0
    pauseAllPlayers()
    playerInstances.forEach((_, idx) => destroyPlayerForSlide(idx))
    playerInstances.clear()
    document.getElementById('shortsScroller').innerHTML = ''

    appendShorts(results)

    const tappedIndex = allShorts.findIndex(s => s.videoId === tappedVideoId)
    if (tappedIndex > 0) {
      currentIndex = tappedIndex
      ensurePlayersForWindow(tappedIndex)
      startProgressTracking(tappedIndex)
      scrollToIndex(tappedIndex)
    }
  }

  // ══════════════════════════════════════════════════════
  // SAVED GRID OVERLAY
  // ══════════════════════════════════════════════════════
  async function openSavedOverlay() {
    document.getElementById('shortsSavedOverlay').classList.add('active')
    const grid = document.getElementById('shortsSavedGrid')
    grid.innerHTML = '<div class="shorts-saved-empty">Loading…</div>'

    const me = getCurrentUser()
    if (!me) { grid.innerHTML = '<div class="shorts-saved-empty">Not logged in</div>'; return }

    try {
      const res  = await fetch(`${BACKEND_URL}/shorts/saved/${me}`)
      const data = await res.json()
      const items = data.shorts || []
      if (!items.length) {
        grid.innerHTML = '<div class="shorts-saved-empty">No saved shorts yet</div>'
        return
      }
      grid.innerHTML = ''
      items.forEach(short => {
        const cell = document.createElement('div')
        cell.className = 'shorts-saved-item'
        cell.innerHTML = `<img src="${escapeAttr(short.thumbnail || '')}" alt="" loading="lazy">`
        cell.addEventListener('click', () => {
          closeSavedOverlay()
          openSearchResultInFeed(short.title || '', items, short.videoId)
          document.getElementById('shortsTopbarLabel').textContent = 'Saved'
        })
        grid.appendChild(cell)
      })
    } catch (e) {
      grid.innerHTML = '<div class="shorts-saved-empty">Failed to load saved shorts</div>'
    }
  }
  function closeSavedOverlay() {
    document.getElementById('shortsSavedOverlay').classList.remove('active')
  }

})()

