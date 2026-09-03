self.addEventListener('install', (e) => {
  console.log('[Service Worker] Installed');
});

self.addEventListener('fetch', (e) => {
  // Offline သုံးလို့ရအောင် သို့မဟုတ် Cache လုပ်ရန်
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});