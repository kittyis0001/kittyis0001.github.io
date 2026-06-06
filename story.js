// ═══════════════════════════════════════════════════════════
// STORY SYSTEM — Instagram Style
// ─────────────────────────────────────────────────────────
// index.html এ login success এর পরে এটা call করতে হবে:
//   showStoryBar()
// ═══════════════════════════════════════════════════════════

;(function () {
  'use strict'

  // ── Config ─────────────────────────────────────────────
  const STORY_DURATION = 5000
  const BACKEND_URL =
    typeof BACKEND !== 'undefined'
      ? BACKEND
      : 'https://chat-backend-myvs.onrender.com'

  // ── FIX: constant না — function করো
  // File load হওয়ার সময় localStorage খালি থাকে।
  // login এর পরে প্রতিটি call এ fresh value পড়তে হবে।
  function getCurrentUser() {
    return (
      localStorage.getItem('chatUser') ||
      (typeof username !== 'undefined' && username ? username : null) ||
      'unknown'
    )
  }

  // ── State ───────────────────────────────────────────────
  let allStories     = []
  let viewerUserIdx  = 0
  let viewerStoryIdx = 0
  let progTimer      = null
  let progStart      = 0
  let isPaused       = false
  let touchStartX    = 0
  let touchStartY    = 0
  let holdTimer      = null
  let viewedStoryIds = JSON.parse(
    localStorage.getItem('viewedStories') || '[]'
  )

  // ── DOM refs ────────────────────────────────────────────
  let storyBar, uploadOverlay, viewer

  // ═══════════════════════════════════════════════════════
  // PUBLIC API
  // index.html → start() function এ login success এর পরে:
  //   showStoryBar()
  // ═══════════════════════════════════════════════════════
  window.showStoryBar = function () {
    if (!storyBar) return
    storyBar.classList.add('visible') // CSS: #storyBar.visible { display:flex }
    fetchAndRenderBar()
  }

  // ═══════════════════════════════════════════════════════
  // 1. HTML INJECT
  // ═══════════════════════════════════════════════════════
  function injectHTML() {
    storyBar = document.createElement('div')
    storyBar.id = 'storyBar'
    // 'visible' class login এর পরে add হবে

    const header = document.getElementById('header')
    if (!header) return
    header.insertAdjacentElement('afterend', storyBar)

    // Upload overlay
    uploadOverlay = document.createElement('div')
    uploadOverlay.id = 'storyUploadOverlay'
    uploadOverlay.innerHTML = `
      <h2>Add to Your Story</h2>
      <img id="storyUploadPreview" class="story-upload-preview" alt="preview">
      <video id="storyUploadVideoPreview" class="story-upload-preview" muted playsinline></video>
      <textarea id="storyCaption" placeholder="Add a caption..." rows="2" maxlength="120"></textarea>
      <button class="story-upload-btn" id="storyPickFileBtn">📷 Choose Photo / Video</button>
      <input type="file" id="storyFileInput" accept="image/*,video/*" style="display:none">
      <div class="story-action-row">
        <button id="storyUploadCancelBtn">Cancel</button>
        <button id="storySubmitBtn">Share Story</button>
      </div>
    `
    document.body.appendChild(uploadOverlay)

    // Fullscreen viewer
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
        <video id="storyVid" playsinline muted></video>
        <div id="storyCapOverlay"></div>
        <div id="storyTapRight"></div>
      </div>
      <button id="storyDeleteBtn">🗑 Delete</button>
    `
    document.body.appendChild(viewer)
  }

  // ═══════════════════════════════════════════════════════
  // 2. EVENTS
  // ═══════════════════════════════════════════════════════
  function bindEvents() {
    document.getElementById('storyPickFileBtn')
      .addEventListener('click', () =>
        document.getElementById('storyFileInput').click()
      )
    document.getElementById('storyFileInput')
      .addEventListener('change', onFileSelected)
    document.getElementById('storyUploadCancelBtn')
      .addEventListener('click', closeUploadOverlay)
    document.getElementById('storySubmitBtn')
      .addEventListener('click', submitStory)
    document.getElementById('storyCloseBtn')
      .addEventListener('click', closeViewer)
    document.getElementById('storyTapLeft')
      .addEventListener('click', prevStory)
    document.getElementById('storyTapRight')
      .addEventListener('click', nextStory)
    document.getElementById('storyDeleteBtn')
      .addEventListener('click', deleteCurrentStory)

    const wrap = document.getElementById('storyMediaWrap')
    wrap.addEventListener('mousedown', () => pauseStory())
    wrap.addEventListener('mouseup', () => resumeStory())
    wrap.addEventListener(
      'touchstart',
      (e) => {
        touchStartY = e.touches[0].clientY
        touchStartX = e.touches[0].clientX
        holdTimer = setTimeout(() => pauseStory(), 150)
      },
      { passive: true }
    )
    wrap.addEventListener(
      'touchend',
      (e) => {
        clearTimeout(holdTimer)
        const dy = e.changedTouches[0].clientY - touchStartY
        const dx = e.changedTouches[0].clientX - touchStartX
        if (dy > 80 && Math.abs(dx) < 60) {
          closeViewer()
          return
        }
        resumeStory()
      },
      { passive: true }
    )
    wrap.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches[0].clientY - touchStartY > 20) clearTimeout(holdTimer)
      },
      { passive: true }
    )
  }

  // ═══════════════════════════════════════════════════════
  // 3. FETCH & RENDER BAR
  // ═══════════════════════════════════════════════════════
  async function fetchAndRenderBar() {
    try {
      const res  = await fetch(BACKEND_URL + '/stories')
      const data = await res.json()

      // FIX: array এবং {stories:[]} দুটো format handle করো
      const stories = Array.isArray(data) ? data : data.stories || []
      console.log('[Story] API response:', data)
      console.log('[Story] Stories count:', stories.length)

      allStories = groupByUser(stories)
    } catch (e) {
      console.error('[Story] fetchAndRenderBar error:', e)
      allStories = []
    }
    renderBar()
  }

  function groupByUser(stories) {
    const map = {}
    stories.forEach((s) => {
      if (!map[s.userId]) map[s.userId] = { userId: s.userId, stories: [] }
      map[s.userId].stories.push(s)
    })
    const me = getCurrentUser() // FIX: function call
    return Object.values(map).sort((a, b) =>
      a.userId === me ? -1 : b.userId === me ? 1 : 0
    )
  }

  function renderBar() {
    if (!storyBar) return
    storyBar.innerHTML = ''

    const me = getCurrentUser() // FIX: function call — fresh value
    console.log('[Story] renderBar — currentUser:', me)

    const myGroup = allStories.find((g) => g.userId === me)

    storyBar.appendChild(
      makeStoryCircle({
        userId: me,
        label: 'Your Story',
        isMe: true,
        viewed: false,
        onClick: () => {
          if (myGroup) openViewer(allStories.indexOf(myGroup))
          else openUploadOverlay()
        },
      })
    )

    allStories.forEach((group, idx) => {
      if (group.userId === me) return
      const hasUnviewed = group.stories.some(
        (s) => !viewedStoryIds.includes(s.id)
      )
      storyBar.appendChild(
        makeStoryCircle({
          userId: group.userId,
          label:
            typeof getNick === 'function' ? getNick(group.userId) : group.userId,
          isMe: false,
          viewed: !hasUnviewed,
          onClick: () => openViewer(idx),
        })
      )
    })
  }

  function makeStoryCircle({ userId, label, isMe, viewed, onClick }) {
    const wrap = document.createElement('div')
    wrap.className = 'story-item'

    const ring = document.createElement('div')
    ring.className = 'story-ring' + (viewed && !isMe ? ' viewed' : '')

    const inner = document.createElement('div')
    inner.className = 'story-ring-inner'

    const img = document.createElement('img')
    img.src = typeof getAvatar === 'function' ? getAvatar(userId) : ''
    img.onerror = () => {
      img.src = typeof DEFAULT_PIC !== 'undefined' ? DEFAULT_PIC : ''
    }
    inner.appendChild(img)
    ring.appendChild(inner)

    if (isMe) {
      const plus = document.createElement('div')
      plus.className = 'story-plus'
      plus.innerText = '+'
      ring.appendChild(plus)
    }

    const lbl = document.createElement('div')
    lbl.className = 'story-label'
    lbl.innerText = label

    wrap.appendChild(ring)
    wrap.appendChild(lbl)
    wrap.addEventListener('click', onClick)
    return wrap
  }

  // ═══════════════════════════════════════════════════════
  // 4. UPLOAD FLOW
  // ═══════════════════════════════════════════════════════
  let selectedFile = null
  let selectedFileURL = null

  function openUploadOverlay() {
    selectedFile = null
    selectedFileURL = null
    document.getElementById('storyUploadPreview').classList.remove('active')
    document.getElementById('storyUploadVideoPreview').classList.remove('active')
    document.getElementById('storyCaption').classList.remove('active')
    document.getElementById('storyCaption').value = ''
    document.getElementById('storySubmitBtn').classList.remove('active')
    document.getElementById('storyFileInput').value = ''
    uploadOverlay.classList.add('active')
  }

  function closeUploadOverlay() {
    uploadOverlay.classList.remove('active')
    const vid = document.getElementById('storyUploadVideoPreview')
    vid.pause()
    vid.src = ''
  }

  function onFileSelected(e) {
    const file = e.target.files[0]
    if (!file) return
    selectedFile = file
    selectedFileURL = URL.createObjectURL(file)

    const isVid  = file.type.startsWith('video/')
    const imgPrev = document.getElementById('storyUploadPreview')
    const vidPrev = document.getElementById('storyUploadVideoPreview')

    if (isVid) {
      imgPrev.classList.remove('active')
      imgPrev.src = ''
      vidPrev.src = selectedFileURL
      vidPrev.classList.add('active')
      vidPrev.play().catch(() => {})
    } else {
      vidPrev.classList.remove('active')
      vidPrev.src = ''
      imgPrev.src = selectedFileURL
      imgPrev.classList.add('active')
    }
    document.getElementById('storyCaption').classList.add('active')
    document.getElementById('storySubmitBtn').classList.add('active')
  }

  async function submitStory() {
    if (!selectedFile) return
    const btn = document.getElementById('storySubmitBtn')
    btn.disabled = true
    btn.innerText = 'Uploading...'

    try {
      // Step 1: media upload
      const fd = new FormData()
      fd.append('file', selectedFile)
      const upRes  = await fetch(BACKEND_URL + '/upload', { method: 'POST', body: fd })
      const upData = await upRes.json()
      if (!upData.url) throw new Error('Upload failed — no URL returned')

      // Step 2: payload build
      const me      = getCurrentUser() // FIX: function call
      const caption = document.getElementById('storyCaption').value.trim()
      const isVid   = selectedFile.type.startsWith('video/')
      const payload = {
        userId:  me,
        type:    isVid ? 'video' : 'image',
        media:   upData.url,
        caption: caption,
      }

      console.log('[Story] currentUser:', me)
      console.log('[Story] payload:', payload)

      // Guard: login না হলে block করো
      if (me === 'unknown') {
        throw new Error('Not logged in — please refresh and login again')
      }

      // Step 3: story create
      const stRes  = await fetch(BACKEND_URL + '/stories/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const stData = await stRes.json()
      console.log('[Story] create response:', stData)

      // FIX: HTTP status দেখো — success field সব backend দেয় না
      if (!stRes.ok) {
        throw new Error(
          stData.message || 'Story create failed (HTTP ' + stRes.status + ')'
        )
      }
      // success: false explicitly থাকলেই fail করো
      if (stData.success === false) {
        throw new Error(stData.message || 'Story create failed')
      }

      closeUploadOverlay()
      await fetchAndRenderBar()
    } catch (err) {
      console.error('[Story] submitStory error:', err)
      alert('Story upload failed ⚠️ ' + err.message)
    } finally {
      btn.disabled = false
      btn.innerText = 'Share Story'
    }
  }

  // ═══════════════════════════════════════════════════════
  // 5. VIEWER
  // ═══════════════════════════════════════════════════════
  function openViewer(userGroupIdx) {
    if (!allStories.length) return
    viewerUserIdx  = userGroupIdx
    viewerStoryIdx = 0
    viewer.classList.add('active')
    loadCurrentStory()
  }

  function closeViewer() {
    viewer.classList.remove('active')
    stopProgress()
    const vid = document.getElementById('storyVid')
    vid.pause()
    vid.src = ''
  }

  function loadCurrentStory() {
    stopProgress()
    const group = allStories[viewerUserIdx]
    if (!group) { closeViewer(); return }
    const story = group.stories[viewerStoryIdx]
    if (!story) { closeViewer(); return }

    // Mark viewed
    if (!viewedStoryIds.includes(story.id)) {
      viewedStoryIds.push(story.id)
      localStorage.setItem('viewedStories', JSON.stringify(viewedStoryIds))
    }

    // Header
    document.getElementById('storyViewerAvatar').src =
      typeof getAvatar === 'function' ? getAvatar(group.userId) : ''
    document.getElementById('storyViewerName').innerText =
      typeof getNick === 'function' ? getNick(group.userId) : group.userId
    document.getElementById('storyViewerTime').innerText = timeAgo(story.createdAt)

    // Delete button — FIX: getCurrentUser()
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
      vid.classList.add('active')
      vid.src = story.media
      vid.play().catch(() => {})
      vid.onended = () => nextStory()
    } else {
      vid.classList.remove('active'); vid.pause(); vid.src = ''
      img.src = story.media
      img.classList.add('active')
    }

    // Caption
    const cap = document.getElementById('storyCapOverlay')
    if (story.caption) {
      cap.innerText = story.caption
      cap.classList.add('active')
    } else {
      cap.classList.remove('active')
    }

    buildProgressBars(group.stories.length, viewerStoryIdx)
    startProgress(story.type === 'video' ? null : STORY_DURATION)
  }

  function buildProgressBars(count, currentIdx) {
    const wrap = document.getElementById('storyProgressBars')
    wrap.innerHTML = ''
    for (let i = 0; i < count; i++) {
      const track = document.createElement('div')
      track.className = 'story-prog-track'
      const fill = document.createElement('div')
      fill.className = 'story-prog-fill'
      if (i < currentIdx) fill.classList.add('done')
      if (i > currentIdx) fill.classList.add('empty')
      track.appendChild(fill)
      wrap.appendChild(track)
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
      const pct = Math.min(
        ((Date.now() - progStart) / duration) * 100,
        100
      )
      fill.style.width = pct + '%'
      if (pct >= 100) nextStory()
    }, 40)
  }

  function stopProgress() {
    clearInterval(progTimer)
    progTimer = null
  }

  function pauseStory() {
    isPaused = true
    const vid = document.getElementById('storyVid')
    if (vid.classList.contains('active')) vid.pause()
  }

  function resumeStory() {
    if (!isPaused) return
    isPaused = false
    const vid = document.getElementById('storyVid')
    if (vid.classList.contains('active')) vid.play().catch(() => {})
    const fills = document.querySelectorAll('#storyProgressBars .story-prog-fill')
    const fill  = fills[viewerStoryIdx]
    if (fill) {
      const done = parseFloat(fill.style.width || '0')
      progStart = Date.now() - (done / 100) * STORY_DURATION
    }
  }

  function nextStory() {
    stopProgress()
    const group = allStories[viewerUserIdx]
    if (!group) { closeViewer(); return }
    if (viewerStoryIdx < group.stories.length - 1) {
      viewerStoryIdx++
      loadCurrentStory()
    } else if (viewerUserIdx < allStories.length - 1) {
      viewerUserIdx++
      viewerStoryIdx = 0
      loadCurrentStory()
    } else {
      closeViewer()
    }
  }

  function prevStory() {
    stopProgress()
    if (viewerStoryIdx > 0) {
      viewerStoryIdx--
      loadCurrentStory()
    } else if (viewerUserIdx > 0) {
      viewerUserIdx--
      viewerStoryIdx = allStories[viewerUserIdx].stories.length - 1
      loadCurrentStory()
    } else {
      loadCurrentStory()
    }
  }

  async function deleteCurrentStory() {
    const btn = document.getElementById('storyDeleteBtn')
    const id  = btn.dataset.storyId
    if (!id) return
    if (!confirm('Delete this story?')) return
    try {
      await fetch(BACKEND_URL + '/stories/' + id, { method: 'DELETE' })
      closeViewer()
      await fetchAndRenderBar()
    } catch (e) {
      alert('Delete failed ⚠️')
    }
  }

  // ═══════════════════════════════════════════════════════
  // 6. MENU ITEM
  // ═══════════════════════════════════════════════════════
  function injectMenuItem() {
    const menuBox = document.getElementById('menuBox')
    if (!menuBox) return

    const profileRow = document.createElement('div')
    profileRow.id = 'menuProfileRow'

    const avWrap = document.createElement('div')
    avWrap.style.cssText =
      'width:42px;height:42px;border-radius:50%;overflow:hidden;border:2px solid #075E54;flex-shrink:0;'

    const avImg = document.createElement('img')
    avImg.id = 'menuProfileAvatar'
    avImg.style.cssText = 'width:100%;height:100%;object-fit:cover;'
    avWrap.appendChild(avImg)

    const nameCol = document.createElement('div')
    const nameTxt = document.createElement('div')
    nameTxt.id = 'menuProfileName'
    const subTxt = document.createElement('div')
    subTxt.style.cssText = 'font-size:11px;color:#888;margin-top:2px;'
    subTxt.innerText = 'Tap to add story'
    nameCol.appendChild(nameTxt)
    nameCol.appendChild(subTxt)

    profileRow.appendChild(avWrap)
    profileRow.appendChild(nameCol)
    profileRow.addEventListener('click', () => {
      menuBox.style.display = 'none'
      openUploadOverlay()
    })
    menuBox.insertBefore(profileRow, menuBox.firstChild)

    // toggleMenu override — FIX: getCurrentUser()
    const orig = window.toggleMenu
    window.toggleMenu = function () {
      orig && orig()
      const u = getCurrentUser()
      avImg.src = typeof getAvatar === 'function' ? getAvatar(u) : ''
      avImg.onerror = () => {
        avImg.src = typeof DEFAULT_PIC !== 'undefined' ? DEFAULT_PIC : ''
      }
      nameTxt.innerText = typeof getNick === 'function' ? getNick(u) : u
    }
  }

  // ═══════════════════════════════════════════════════════
  // 7. HELPERS
  // ═══════════════════════════════════════════════════════
  function timeAgo(ts) {
    if (!ts) return ''
    const m = Math.floor((Date.now() - ts) / 60000)
    if (m < 1)  return 'just now'
    if (m < 60) return m + 'm ago'
    const h = Math.floor(m / 60)
    if (h < 24) return h + 'h ago'
    return Math.floor(h / 24) + 'd ago'
  }

  // ═══════════════════════════════════════════════════════
  // 8. INIT
  // ═══════════════════════════════════════════════════════
  function init() {
    injectHTML()
    bindEvents()
    injectMenuItem()
    // fetchAndRenderBar() এখানে call করা হয় না।
    // showStoryBar() login এর পরে call হলে সেটাই fetch করবে।

    // Auto-refresh — শুধু bar visible থাকলে
    setInterval(() => {
      if (storyBar && storyBar.classList.contains('visible')) {
        fetchAndRenderBar()
      }
    }, 60000)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    setTimeout(init, 300)
  }
})()
