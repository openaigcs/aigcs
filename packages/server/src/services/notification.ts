import { getDb } from '../db/index.js'
import { notifications } from '@aigcs/core'
import { nanoid } from 'nanoid'

export function createNotification(
  userId: string,
  type: 'success' | 'error' | 'info' | 'warning',
  title: string,
  message: string,
  siteId?: string
) {
  try {
    const db = getDb()
    db.insert(notifications).values({
      id: nanoid(),
      userId,
      siteId: siteId || null,
      type,
      title,
      message,
      isRead: false,
      createdAt: new Date().toISOString()
    }).run()
  } catch (err) {
    console.error('[notification] Failed to create notification:', err)
  }
}
