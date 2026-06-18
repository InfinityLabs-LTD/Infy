// Обновляемся сразу, не дожидаясь закрытия всех вкладок — иначе у пользователя
// продолжал работать старый SW (старый переход по уведомлению, старая иконка).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()

  // Пользовательские настройки уведомлений приходят в payload (per-user):
  //   popup   — показывать ли всплывающее уведомление вообще
  //   sound   — звук (silent = !sound)
  //   vibrate — вибрация
  // Если поля нет — считаем включённым (обратная совместимость).
  const popup = data.popup !== false
  const sound = data.sound !== false
  const vibrate = data.vibrate !== false

  if (!popup) return  // уведомления-баннеры отключены пользователем

  event.waitUntil(
    self.registration.showNotification(data.title || 'Infy', {
      body: data.body || '',
      icon: data.icon || '/logo.png',
      badge: '/logo.png',
      tag: data.tag,
      data: { url: data.url || '/' },
      renotify: true,
      silent: !sound,
      vibrate: vibrate ? [200, 100, 200] : [],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.url || '/'
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Ищем уже открытое окно приложения (PWA или вкладку). Переводим его на
      // нужный диалог и фокусируем — без этого клик открывал список чатов, а
      // нового сообщения не было видно, пока не перезайти.
      const client = list.find((c) => 'focus' in c)
      if (client) {
        const samePage = client.url === target
        if (!samePage && 'navigate' in client) {
          return client.navigate(target).then((c) => (c || client).focus()).catch(() => client.focus())
        }
        return client.focus()
      }
      // Окон нет — открываем новое. В установленной PWA openWindow открывает
      // именно в окне приложения.
      if (clients.openWindow) return clients.openWindow(target)
    })
  )
})
