// Встроенные пресеты категорий событий календаря.
// Хранятся в коде (не в БД); событие ссылается на пресет через CalendarEvent.presetKey.
export interface CategoryPreset {
  key: string
  name: string
  color: string   // hex
  icon: string    // имя иконки для фронтенда
}

export const CATEGORY_PRESETS: CategoryPreset[] = [
  { key: 'plans',     name: 'Планы',        color: '#2aabee', icon: 'calendar'  },
  { key: 'important', name: 'Значимые даты', color: '#f59e0b', icon: 'star'      },
  { key: 'birthday',  name: 'День рождения', color: '#ec4899', icon: 'gift'      },
  { key: 'meeting',   name: 'Встреча',       color: '#34d399', icon: 'users'     },
  { key: 'other',     name: 'Другое',        color: '#a78bfa', icon: 'bookmark'  },
]

const PRESET_KEYS = new Set(CATEGORY_PRESETS.map(p => p.key))

export function isValidPresetKey(key: string): boolean {
  return PRESET_KEYS.has(key)
}

export function getPreset(key: string): CategoryPreset | undefined {
  return CATEGORY_PRESETS.find(p => p.key === key)
}
