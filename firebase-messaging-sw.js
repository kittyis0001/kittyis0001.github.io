importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
apiKey: "AIzaSyA4U3FPOVILcqPpWERz6aUtOwsqHgbSCEk",
authDomain: "private-chat-318a6.firebaseapp.com",
databaseURL: "https://private-chat-318a6-default-rtdb.asia-southeast1.firebasedatabase.app",
projectId: "private-chat-318a6",
storageBucket: "private-chat-318a6.appspot.com",
messagingSenderId: "1082000480834",
appId: "1:1082000480834:web:1f6871c095821e865a2bdb"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
self.registration.showNotification("New Message", {
body: payload.notification.body,
icon: "https://cdn-icons-png.flaticon.com/512/733/733585.png"
});
});
