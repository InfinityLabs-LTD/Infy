import { AxiosError } from 'axios'

// Человекочитаемые сообщения об ошибках на русском, по коду ошибки бэкенда.
// Бэкенд отдаёт { error: { code, message } } — message на английском,
// поэтому переводим по стабильному code.
const MESSAGES: Record<string, string> = {
  // Auth
  AUTH_USER_NOT_FOUND:      'Неверное имя пользователя или пароль',
  AUTH_INVALID_PASSWORD:    'Неверное имя пользователя или пароль',
  AUTH_USERNAME_TAKEN:      'Это имя пользователя уже занято',
  AUTH_EMAIL_TAKEN:         'Этот email уже используется',
  AUTH_TOKEN_EXPIRED:       'Сессия истекла. Войдите снова',
  AUTH_TOKEN_INVALID:       'Недействительный токен. Войдите снова',
  AUTH_SESSION_REVOKED:     'Сессия была завершена. Войдите снова',
  AUTH_SESSION_NOT_FOUND:   'Сессия не найдена',
  AUTH_UNAUTHORIZED:        'Требуется авторизация',
  AUTH_FORBIDDEN:           'Недостаточно прав',
  AUTH_RESET_TOKEN_INVALID: 'Ссылка восстановления недействительна или истекла',
  AUTH_CURRENT_PASSWORD_WRONG: 'Текущий пароль введён неверно',
  AUTH_SAME_PASSWORD:       'Новый пароль должен отличаться от текущего',

  // Profile
  PROFILE_USERNAME_INVALID:    'Имя пользователя может содержать только строчные латинские буквы, цифры и подчёркивание',
  PROFILE_AVATAR_TOO_LARGE:    'Аватар должен быть меньше 5 МБ',
  PROFILE_AVATAR_INVALID_TYPE: 'Аватар должен быть в формате JPEG, PNG, GIF или WebP',

  // Chat
  CHAT_SELF:           'Нельзя начать чат с самим собой',
  CHAT_NOT_FOUND:      'Чат не найден',
  CHAT_NOT_MEMBER:     'Вы не участник этого чата',
  USER_NOT_FOUND:      'Пользователь не найден',
  MESSAGE_EMPTY:       'Сообщение не может быть пустым',
  MESSAGE_NOT_FOUND:   'Сообщение не найдено',
  MESSAGE_FORBIDDEN:   'Нельзя изменить чужое сообщение',
  MESSAGE_NOT_EDITABLE:'Можно редактировать только текстовые сообщения',
  REPLY_TARGET_INVALID:'Сообщение, на которое вы отвечаете, не найдено',
  REACTION_LIMIT:      'Можно поставить не более 3 реакций на сообщение',

  // Calls
  CALL_ALREADY_ACTIVE:   'Звонок уже идёт',
  CALL_GROUP_UNSUPPORTED:'Групповые звонки пока не поддерживаются',
  CALL_NO_PARTNER:       'Собеседник недоступен',

  // Media
  MEDIA_UNSUPPORTED_TYPE: 'Этот тип файла не поддерживается',
  MEDIA_TOO_LARGE:        'Файл слишком большой',
  MEDIA_UPLOAD_FAILED:    'Не удалось загрузить файл',

  // AI
  AI_DISABLED: 'ИИ-функции временно недоступны',

  // Rate limit
  RATE_LIMIT_EXCEEDED: 'Слишком много запросов. Попробуйте позже',
}

const FALLBACK = 'Что-то пошло не так. Попробуйте ещё раз'

export function translateError(error: unknown): string {
  if (error instanceof AxiosError) {
    // Нет ответа от сервера — проблема сети.
    if (!error.response) return 'Нет соединения с сервером. Проверьте интернет'
    const code = error.response.data?.error?.code
    if (typeof code === 'string' && MESSAGES[code]) return MESSAGES[code]
    const msg = error.response.data?.error?.message
    if (typeof msg === 'string' && msg) return msg
    if (error.response.status === 429) return MESSAGES.RATE_LIMIT_EXCEEDED
  }
  return FALLBACK
}
