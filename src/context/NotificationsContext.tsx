import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { UserNotificationRow } from '../types/database'
import { useAuth } from './AuthContext'

export type NotificationType = 'success' | 'warning' | 'info' | 'error'

export interface Notification {
  id: string
  clientId: string | null
  type: NotificationType
  title: string
  message: string
  read: boolean
  timestamp: Date
}

interface NotifContextType {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  addNotification: (n: Omit<Notification, 'id' | 'clientId' | 'read' | 'timestamp'>) => void
  upsertSystemNotification: (
    id: string,
    n: Omit<Notification, 'id' | 'clientId' | 'timestamp' | 'read'> & { read?: boolean },
  ) => void
  removeNotification: (id: string) => void
  markAllRead: () => void
  markRead: (id: string) => void
  clearAll: () => void
}

const NotifContext = createContext<NotifContextType | undefined>(undefined)
const MAX_NOTIFICATIONS = 80

function toNotification(row: UserNotificationRow): Notification {
  return {
    id: row.id,
    clientId: row.client_id,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read,
    timestamp: new Date(row.timestamp),
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!session) {
      setNotifications([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('timestamp', { ascending: false })
      .limit(MAX_NOTIFICATIONS)

    if (!error) {
      setNotifications(((data as UserNotificationRow[] | null) ?? []).map(toNotification))
    }
    setLoading(false)
  }, [session])

  useEffect(() => {
    void fetchNotifications()
  }, [fetchNotifications])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  const addNotification = useCallback(
    (n: Omit<Notification, 'id' | 'clientId' | 'read' | 'timestamp'>) => {
      if (!session) return
      const nowIso = new Date().toISOString()
      const optimistic: Notification = {
        id: crypto.randomUUID(),
        clientId: null,
        type: n.type,
        title: n.title,
        message: n.message,
        read: false,
        timestamp: new Date(nowIso),
      }

      setNotifications((prev) =>
        [optimistic, ...prev]
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, MAX_NOTIFICATIONS),
      )

      void supabase.from('user_notifications').insert({
        user_id: session.user.id,
        type: n.type,
        title: n.title,
        message: n.message,
        read: false,
        timestamp: nowIso,
      } as never)
    },
    [session],
  )

  const upsertSystemNotification = useCallback(
    (
      id: string,
      n: Omit<Notification, 'id' | 'clientId' | 'timestamp' | 'read'> & { read?: boolean },
    ) => {
      if (!session) return
      const nowIso = new Date().toISOString()

      setNotifications((prev) => {
        const found = prev.find((item) => item.clientId === id)
        if (!found) {
          const created: Notification = {
            id: crypto.randomUUID(),
            clientId: id,
            type: n.type,
            title: n.title,
            message: n.message,
            read: n.read ?? false,
            timestamp: new Date(nowIso),
          }
          return [created, ...prev]
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, MAX_NOTIFICATIONS)
        }

        const contentChanged =
          found.title !== n.title ||
          found.message !== n.message ||
          found.type !== n.type ||
          found.read !== (n.read ?? found.read)
        if (!contentChanged) return prev

        return prev
          .map((item) =>
            item.clientId === id
              ? {
                  ...item,
                  type: n.type,
                  title: n.title,
                  message: n.message,
                  read: n.read ?? false,
                  timestamp: new Date(nowIso),
                }
              : item,
          )
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, MAX_NOTIFICATIONS)
      })

      void supabase.from('user_notifications').upsert(
        {
          user_id: session.user.id,
          client_id: id,
          type: n.type,
          title: n.title,
          message: n.message,
          read: n.read ?? false,
          timestamp: nowIso,
        } as never,
        { onConflict: 'user_id,client_id' },
      )
    },
    [session],
  )

  const removeNotification = useCallback(
    (id: string) => {
      if (!session) return
      setNotifications((prev) => prev.filter((n) => n.id !== id && n.clientId !== id))
      void supabase
        .from('user_notifications')
        .delete()
        .eq('user_id', session.user.id)
        .or(`id.eq.${id},client_id.eq.${id}`)
    },
    [session],
  )

  const markRead = useCallback(
    (id: string) => {
      if (!session) return
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
      void supabase
        .from('user_notifications')
        .update({ read: true } as never)
        .eq('user_id', session.user.id)
        .eq('id', id)
    },
    [session],
  )

  const markAllRead = useCallback(() => {
    if (!session) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    void supabase.from('user_notifications').update({ read: true } as never).eq('user_id', session.user.id)
  }, [session])

  const clearAll = useCallback(() => {
    if (!session) return
    setNotifications([])
    void supabase.from('user_notifications').delete().eq('user_id', session.user.id)
  }, [session])

  return (
    <NotifContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
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
