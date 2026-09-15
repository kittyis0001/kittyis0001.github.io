/* ═══════════════════════════════════════════════════════
   firebase-messaging-sw.js
   Must be served from your site ROOT (same folder as index.html),
   e.g. https://kittyis1.online/firebase-messaging-sw.js
   ═══════════════════════════════════════════════════════ */

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js")
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js")

firebase.initializeApp({
  apiKey: "AIzaSyA4U3FPOVILcqPpWERz6aUtOwsqHgbSCEk",
  authDomain: "private-chat-318a6.firebaseapp.com",
  databaseURL: "https://private-chat-318a6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "private-chat-318a6",
  storageBucket: "private-chat-318a6.appspot.com",
  messagingSenderId: "1082000480834",
  appId: "1:1082000480834:web:1f6871c095821e865a2bdb"
})

const messaging = firebase.messaging()

const FALLBACK_ICON = "https://raw.githubusercontent.com/kittyis0001/kittyis0001.github.io/main/bg1.jpg"

// Data-only payloads give us full control over how the notification
// looks and what happens on tap — this is what the backend sends.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {}
  const type = data.type || "text"

  let body = data.preview || "New message"
  if (type === "image") body = "📷 Photo"
  else if (type === "video") body = "🎥 Video"
  else if (type === "voice") body = "🎤 Voice message"
  else if (type === "gif") body = "GIF"

  if (data.replyPreview) {
    body = "↩ " + data.replyPreview.slice(0, 40) + "\n" + body
  }

  const title = data.fromNick || "New message"
  const icon = data.avatar && data.avatar.trim() ? data.avatar : FALLBACK_ICON

  // tag + renotify: a second message from the same sender replaces the
  // previous notification instead of stacking duplicates.
  const tag = "chat-msg-" + (data.fromUser || "unknown")

  self.registration.showNotification(title, {
    body,
    icon,
    badge: FALLBACK_ICON,
    tag,
    renotify: true,
    requireInteraction: false,
    data: { msgKey: data.msgKey || "", fromUser: data.fromUser || "" }
  })
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const msgKey = (event.notification.data && event.notification.data.msgKey) || ""
  const targetUrl = self.registration.scope + (msgKey ? ("?openMsg=" + encodeURIComponent(msgKey)) : "")

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(targetUrl).catch(() => {})
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl)
    })
  )
})
