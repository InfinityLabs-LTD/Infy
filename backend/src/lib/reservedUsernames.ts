// Зарезервированные за системой username — пользователи не могут их занять
// (ни при регистрации, ни при смене). Сравнение без учёта регистра.
// Покрывает служебные/ролевые имена, частые маршруты и бренд.
const RESERVED = new Set<string>([
  // Служебные / системные
  'admin', 'administrator', 'root', 'superuser', 'sysadmin', 'system', 'sys',
  'moderator', 'mod', 'staff', 'team', 'official', 'owner',
  'support', 'help', 'helpdesk', 'service', 'contact', 'feedback', 'abuse',
  'security', 'postmaster', 'webmaster', 'hostmaster', 'noreply', 'no-reply',
  'test', 'testing', 'demo', 'example', 'guest', 'anonymous', 'anon', 'null', 'undefined',
  'bot', 'robot', 'daemon', 'cron', 'scheduler',
  // Бренд / продукт
  'infy', 'infyme', 'infypulse', 'pulse', 'infyai', 'ai', 'assistant',
  // Частые маршруты / разделы
  'me', 'user', 'users', 'profile', 'settings', 'account', 'accounts',
  'login', 'logout', 'register', 'signin', 'signup', 'auth', 'oauth',
  'api', 'app', 'www', 'mail', 'email', 'ftp', 'cdn', 'static', 'assets',
  'chat', 'chats', 'message', 'messages', 'call', 'calls', 'media',
  'home', 'dashboard', 'search', 'explore', 'notifications', 'about',
  'terms', 'privacy', 'legal', 'docs', 'status', 'health',
])

// true — username занят системой и недоступен пользователю.
export function isReservedUsername(username: string): boolean {
  return RESERVED.has(username.trim().toLowerCase())
}
