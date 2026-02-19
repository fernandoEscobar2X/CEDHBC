import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type NotificationType = 'success' | 'warning' | 'info' | 'error'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  timestamp: Date
}

interface SerializedNotification extends Omit<Notification, 'timestamp'> {
  timestamp: string
}

interface NotifContextType {
  notifications: Notification[]
  unreadCount: number
  addNotification: (n: Omit<Notification, 'id' | 'read' | 'timestamp'>) => void
  upsertSystemNotification: (
    id: string,
    n: Omit<Notification, 'id' | 'timestamp' | 'read'> & { read?: boolean },
  ) => void
  removeNotification: (id: string) => void
  markAllRead: () => void
  markRead: (id: string) => void
  clearAll: () => void
}

const NotifContext = createContext<NotifContextType | undefined>(undefined)
const NOTIFICATIONS_STORAGE_KEY = 'cedhbc_notifications'
const MAX_NOTIFICATIONS = 80

function toSerialized(items: Notification[]): SerializedNotification[] {
  return items.map((item) => ({ ...item, timestamp: item.timestamp.toISOString() }))
}

function fromSerialized(items: SerializedNotification[]): Notification[] {
  return items.map((item) => ({ ...item, timestamp: new Date(item.timestamp) }))
}

function loadNotifications(): Notification[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SerializedNotification[]
    if (!Array.isArray(parsed)) return []
    return fromSerialized(parsed)
      .filter((item) => item.id && item.title && item.message)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, MAX_NOTIFICATIONS)
  } catch {
    return []
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(() => loadNotifications())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(toSerialized(notifications)))
  }, [notifications])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  const addNotification = useCallback((n: Omit<Notification, 'id' | 'read' | 'timestamp'>) => {
    const notification: Notification = {
      ...n,
      id: crypto.randomUUID(),
      read: false,
      timestamp: new Date(),
    }

    setNotifications((prev) =>
      [notification, ...prev]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, MAX_NOTIFICATIONS),
    )
  }, [])

  const upsertSystemNotification = useCallback(
    (id: string, n: Omit<Notification, 'id' | 'timestamp' | 'read'> & { read?: boolean }) => {
      setNotifications((prev) => {
        const found = prev.find((item) => item.id === id)
        const nextTimestamp = new Date()

        if (!found) {
          const created: Notification = {
            id,
            type: n.type,
            title: n.title,
            message: n.message,
            read: n.read ?? false,
            timestamp: nextTimestamp,
          }

          return [created, ...prev]
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, MAX_NOTIFICATIONS)
        }

        const contentChanged =
          found.title !== n.title || found.message !== n.message || found.type !== n.type || found.read !== (n.read ?? found.read)

        if (!contentChanged) return prev

        return prev
          .map((item) => {
            if (item.id !== id) return item
            return {
              ...item,
              type: n.type,
              title: n.title,
              message: n.message,
              read: n.read ?? false,
              timestamp: nextTimestamp,
            }
          })
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, MAX_NOTIFICATIONS)
      })
    },
    [],
  )

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => setNotifications([]), [])

  return (
    <NotifContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        upsertSystemNotification,
        removeNotification,
        markAllRead,
        markRead,
        clearAll,
      }}
    >
      {children}
    </NotifContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(NotifContext)
  if (!ctx) throw new Error('useNotifications debe usarse dentro de NotificationsProvider')
  return ctx
}
