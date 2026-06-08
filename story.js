// ═══════════════════════════════════════════════════════════
// STORY SYSTEM v2 — Instagram Style (Profile Ring Edition)
// ─────────────────────────────────────────────────────────
// • Story bar নেই — শুধু profile pic ring
// • Header avatar → other user story ring + click to view
// • Menu profile row → own story upload / view / delete
// ═══════════════════════════════════════════════════════════

;(function () {
  'use strict'

  const STORY_DURATION = 5000
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

  // ── Init ──────────────────────────────────────────────
  function init() {
    injectOverlays()
    bindEvents()
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
    if (!refreshInterval) {
      refreshInterval = setInterval(fetchStories, 60000)
    }
  }
  window.refreshStoryBar = function () { fetchStories() }

  // ── Inject overlays ───────────────────────────────────
  function injectOverlays() {
    if (!document.getElementById('storyUploadOverlay')) {
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
    } else {
      uploadOverlay = document.getElementById('storyUploadOverlay')
    }

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
          <video id="storyVid" playsinline muted></video>
          <div id="storyCapOverlay"></div>
          <div id="storyTapRight"></div>
        </div>
        <button id="storyDeleteBtn">🗑 Delete</button>
      `
      document.body.appendChild(viewer)
    } else {
      viewer = document.getElementById('storyViewer')
    }
  }

  // ── Bind events ───────────────────────────────────────
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

  // ── Fetch stories ─────────────────────────────────────
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

  // ── Ring CSS class apply ──────────────────────────────
  function applyRing(el, hasStory, viewed) {
    el.classList.remove('sv2-ring-active', 'sv2-ring-viewed', 'sv2-ring-none')
    if (hasStory) {
      el.classList.add(viewed ? 'sv2-ring-viewed' : 'sv2-ring-active')
    } else {
      el.classList.add('sv2-ring-none')
    }
  }

  // ── Update all rings ──────────────────────────────────
  function updateAllRings() {
    updateHeaderRing()
    updateMenuRing()
  }

  // ── Header avatar ring (other user) ──────────────────
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
      // headerAvatar এর original style ঠিক রাখো
      headerAv.style.width   = '100%'
      headerAv.style.height  = '100%'
      headerAv.style.borderRadius = '50%'
      headerAv.style.objectFit   = 'cover'
      headerAv.style.border = 'none'
      headerAv.style.display = 'block'
    }

    const me = getCurrentUser()
    const otherUserId = me === 'katis1' ? 'kittyis0001' : 'katis1'
    const otherGroup  = getGroupFor(otherUserId)
    const hasStory    = !!otherGroup
    const allViewed   = hasStory
      ? otherGroup.stories.every(s => viewedStoryIds.includes(s.id))
      : false

    applyRing(wrapper, hasStory, allViewed)

    // click → open story
    wrapper.onclick = (e) => {
      e.stopPropagation()
      if (!hasStory) return
      const idx = allStories.indexOf(otherGroup)
      if (idx !== -1) openViewer(idx)
    }
    wrapper.style.cursor = hasStory ? 'pointer' : 'default'
  }

  // ── Menu profile row ring (own story) ─────────────────
  function updateMenuRing() {
    const avWrap = document.getElementById('sv2MenuAvatarWrap')
    if (!avWrap) return

    const me       = getCurrentUser()
    const myGroup  = getGroupFor(me)
    const hasStory = !!myGroup

    // Ring update
    applyRing(avWrap, hasStory, false)

    // + badge: story থাকলে hide, না থাকলে show
    const plus = document.getElementById('sv2PlusBadge')
    if (plus) plus.style.display = hasStory ? 'none' : 'flex'

    // Avatar sync — getAvatar() এর latest value নাও
    const avImg = document.getElementById('menuProfileAvatar')
    if (avImg && typeof getAvatar === 'function') {
      const pic = getAvatar(me)
      if (pic) avImg.src = pic
    }

    // Name sync — getNick() এর latest value নাও
    const nameTxt = document.getElementById('menuProfileName')
    if (nameTxt && typeof getNick === 'function') {
      const nick = getNick(me)
      nameTxt.innerText = nick || me
    }

    // avWrap click handler update (story state বদলায়)
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

  // ── Inject menu item ──────────────────────────────────
  function injectMenuItem() {
    const menuBox = document.getElementById('menuBox')
    if (!menuBox) { setTimeout(injectMenuItem, 200); return }
    if (document.getElementById('menuProfileRow')) { updateMenuRing(); return }

    // ── Row ──
    const row = document.createElement('div')
    row.id = 'menuProfileRow'
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px 12px;border-bottom:1px solid #f0f0f0;-webkit-tap-highlight-color:transparent;'

    // ── Avatar wrapper (ring এখানে) ──
    const avWrap = document.createElement('div')
    avWrap.id = 'sv2MenuAvatarWrap'
    avWrap.className = 'sv2-avatar-wrap'
    avWrap.style.cssText = 'position:relative;flex-shrink:0;cursor:pointer;'

    const avImg = document.createElement('img')
    avImg.id = 'menuProfileAvatar'
    avImg.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;'
    // DEFAULT_PIC fallback — getAvatar later called in updateMenuRing
    avImg.src = typeof DEFAULT_PIC !== 'undefined' ? DEFAULT_PIC : ''
    avImg.onerror = () => {
      if (typeof DEFAULT_PIC !== 'undefined') avImg.src = DEFAULT_PIC
    }
    avWrap.appendChild(avImg)

    // ── Instagram style + badge (bottom-right, small) ──
    const plus = document.createElement('div')
    plus.id = 'sv2PlusBadge'
    plus.style.cssText = [
      'position:absolute',
      'bottom:0px',
      'right:0px',
      'width:18px',
      'height:18px',
      'background:#0095f6',
      'border-radius:50%',
      'border:2px solid #fff',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-size:13px',
      'color:white',
      'font-weight:bold',
      'line-height:1',
      'pointer-events:none',
      'z-index:3'
    ].join(';')
    plus.innerText = '+'
    avWrap.appendChild(plus)

    // ── Name column ──
    const nameCol = document.createElement('div')
    nameCol.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;'

    const nameTxt = document.createElement('div')
    nameTxt.id = 'menuProfileName'
    nameTxt.style.cssText = 'font-weight:bold;font-size:14px;color:#111;'
    nameTxt.innerText = ''   // updateMenuRing এ set হবে

    // ── "Upload Story" text — সবসময় visible, সবসময় upload খোলে ──
    const uploadTxt = document.createElement('div')
    uploadTxt.id = 'sv2UploadStoryTxt'
    uploadTxt.style.cssText = 'font-size:11px;color:#0095f6;cursor:pointer;font-weight:500;'
    uploadTxt.innerText = 'Upload Story'
    uploadTxt.addEventListener('click', (e) => {
      e.stopPropagation()
      const mb = document.getElementById('menuBox')
      if (mb) mb.style.display = 'none'
      openUploadOverlay()   // সবসময় upload — story থাকুক বা না থাকুক
    })

    nameCol.appendChild(nameTxt)
    nameCol.appendChild(uploadTxt)

    row.appendChild(avWrap)
    row.appendChild(nameCol)
    menuBox.insertBefore(row, menuBox.firstChild)

    // ── toggleMenu override — menu খোলার সাথে সাথে sync ──
    const origToggle = window.toggleMenu
    window.toggleMenu = function () {
      origToggle && origToggle()
      updateMenuRing()  // avatar + name + ring সব sync
    }

    // ── প্রথমবার render — getNick/getAvatar ready না হলে retry ──
    function tryFirstRender() {
      const u    = getCurrentUser()
      const nick = typeof getNick   === 'function' ? getNick(u)   : ''
      const pic  = typeof getAvatar === 'function' ? getAvatar(u) : ''
      if (nick) {
        nameTxt.innerText = nick
      } else {
        // nick এখনো ready না — 300ms পরে retry
        setTimeout(tryFirstRender, 300)
      }
      if (pic) avImg.src = pic
      updateMenuRing()
    }
    tryFirstRender()
  }
  injectMenuItem()

  // ── Upload flow ───────────────────────────────────────
  let selectedFile = null

  function openUploadOverlay() {
    selectedFile = null
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
    vid.pause(); vid.src = ''
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
  }

  async function submitStory() {
    if (!selectedFile) return
    const btn = document.getElementById('storySubmitBtn')
    btn.disabled = true; btn.innerText = 'Uploading...'
    try {
      const fd = new FormData(); fd.append('file', selectedFile)
      const upRes  = await fetch(BACKEND_URL + '/upload', { method: 'POST', body: fd })
      const upData = await upRes.json()
      if (!upData.url) throw new Error('Upload failed — no URL')

      const me = getCurrentUser()
      if (me === 'unknown') throw new Error('Not logged in')
      const caption = document.getElementById('storyCaption').value.trim()
      const isVid   = selectedFile.type.startsWith('video/')
      const payload = { userId: me, type: isVid ? 'video' : 'image', media: upData.url, caption }

      const stRes  = await fetch(BACKEND_URL + '/stories/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

  // ── Viewer ────────────────────────────────────────────
  function openViewer(idx) {
    if (!allStories.length || idx < 0) return
    viewerUserIdx = idx; viewerStoryIdx = 0
    viewer.classList.add('active')
    loadCurrentStory()
  }

  function closeViewer() {
    viewer.classList.remove('active')
    stopProgress()
    const vid = document.getElementById('storyVid')
    vid.pause(); vid.src = ''
    updateAllRings()
  }

  function loadCurrentStory() {
    stopProgress()
    const group = allStories[viewerUserIdx]
    if (!group) { closeViewer(); return }
    const story = group.stories[viewerStoryIdx]
    if (!story) { closeViewer(); return }

    if (!viewedStoryIds.includes(story.id)) {
      viewedStoryIds.push(story.id)
      localStorage.setItem('viewedStories', JSON.stringify(viewedStoryIds))
    }

    document.getElementById('storyViewerAvatar').src =
      typeof getAvatar === 'function' ? getAvatar(group.userId) : ''
    document.getElementById('storyViewerName').innerText =
      typeof getNick === 'function' ? getNick(group.userId) : group.userId
    document.getElementById('storyViewerTime').innerText = timeAgo(story.createdAt)

    const deleteBtn = document.getElementById('storyDeleteBtn')
    if (group.userId === getCurrentUser()) {
      deleteBtn.classList.add('active')
      deleteBtn.dataset.storyId = story.id
    } else {
      deleteBtn.classList.remove('active')
    }

    const img = document.getElementById('storyImg')
    const vid = document.getElementById('storyVid')
    if (story.type === 'video') {
      img.classList.remove('active'); img.src = ''
      vid.src = story.media; vid.classList.add('active')
      vid.play().catch(() => {}); vid.onended = nextStory
    } else {
      vid.classList.remove('active'); vid.pause(); vid.src = ''
      img.src = story.media; img.classList.add('active')
    }

    const cap = document.getElementById('storyCapOverlay')
    if (story.caption) { cap.innerText = story.caption; cap.classList.add('active') }
    else cap.classList.remove('active')

    buildProgressBars(group.stories.length, viewerStoryIdx)
    startProgress(story.type === 'video' ? null : STORY_DURATION)
  }

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
    if (viewerStoryIdx < group.stories.length - 1) { viewerStoryIdx++; loadCurrentStory() }
    else if (viewerUserIdx < allStories.length - 1) { viewerUserIdx++; viewerStoryIdx = 0; loadCurrentStory() }
    else closeViewer()
  }

  function prevStory() {
    stopProgress()
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

})()
