self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'Infy', {
      body: data.body || '',
      icon: data.icon || '/logo.png',
      badge: '/logo.png',
      tag: data.tag,
      data: { url: data.url || '/' },
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Уже открытое окно: переводим его на нужный диалог и фокусируем.
      // Иначе клик просто фокусировал старый экран, и нового сообщения
      // не было видно, пока не перезайти в чат.
      for (const client of list) {
        if ('focus' in client) {
          const nav = 'navigate' in client && client.url !== new URL(url, self.location.origin).href
            ? client.navigate(url).catch(() => client)
            : Promise.resolve(client)
          return nav.then((c) => (c || client).focus())
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
