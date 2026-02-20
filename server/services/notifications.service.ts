// =============================================================
// File: server/services/notifications.service.ts
// Module: Notifications — Phase 12 (Step 44)
// Description: In-app notification center
//   - List notifications for current user (unread/read/all)
//   - Mark as read / dismiss
//   - Unread count
//   - Bulk actions
//   - Create system notifications
// =============================================================

import { BaseService } from './base.service';

// ─────────────────────────────────────────────────────────────

interface CreateNotificationInput {
  user_id: string;
  title: string;
  message: string;
  notification_type?: 'alert' | 'reminder' | 'system';
  priority?: 'low' | 'normal' | 'high' | 'critical';
  reference_type?: string;
  reference_id?: string;
}

// ─────────────────────────────────────────────────────────────

class NotificationsService extends BaseService {
  constructor() {
    super('notifications');
  }

  /**
   * Get notifications for a user with filters
   */
  async listForUser(companyId: string, userId: string, options: {
    filter?: 'all' | 'unread' | 'read';
    notification_type?: string;
    priority?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { filter = 'all', notification_type, priority, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    let query = this.db('notifications')
      .where({ company_id: companyId, user_id: userId, is_dismissed: false });

    if (filter === 'unread') query = query.where('is_read', false);
    if (filter === 'read') query = query.where('is_read', true);
    if (notification_type) query = query.where('notification_type', notification_type);
    if (priority) query = query.where('priority', priority);

    const countResult = await query.clone().count('id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .clone()
      .select('*')
      .orderBy([
        { column: 'is_read', order: 'asc' },     // Unread first
        { column: 'priority', order: 'asc' },     // Critical first (alphabetical: critical < high < low < normal)
        { column: 'created_at', order: 'desc' },  // Newest first
      ])
      .limit(limit)
      .offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(companyId: string, userId: string) {
    const result = await this.db('notifications')
      .where({ company_id: companyId, user_id: userId, is_read: false, is_dismissed: false })
      .count('id as total')
      .first();

    const total = parseInt(String(result?.total || '0'), 10);

    // Breakdown by priority
    const byPriority = await this.db('notifications')
      .where({ company_id: companyId, user_id: userId, is_read: false, is_dismissed: false })
      .select('priority')
      .count('id as count')
      .groupBy('priority');

    const breakdown: Record<string, number> = {};
    for (const row of byPriority) {
      breakdown[row.priority] = parseInt(String(row.count), 10);
    }

    return { unread_count: total, by_priority: breakdown };
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(id: string, companyId: string, userId: string) {
    const notif = await this.db('notifications')
      .where({ id, company_id: companyId, user_id: userId })
      .first();

    if (!notif) throw new Error('Notification not found');

    if (notif.is_read) return notif; // Already read

    const [updated] = await this.db('notifications')
      .where({ id })
      .update({ is_read: true, read_at: this.db.fn.now(), updated_by: userId })
      .returning('*');

    return updated;
  }

  /**
   * Mark all unread notifications as read for a user
   */
  async markAllAsRead(companyId: string, userId: string) {
    const count = await this.db('notifications')
      .where({ company_id: companyId, user_id: userId, is_read: false, is_dismissed: false })
      .update({ is_read: true, read_at: this.db.fn.now(), updated_by: userId });

    return { marked_count: count };
  }

  /**
   * Dismiss a notification (soft-hide, not delete)
   */
  async dismiss(id: string, companyId: string, userId: string) {
    const notif = await this.db('notifications')
      .where({ id, company_id: companyId, user_id: userId })
      .first();

    if (!notif) throw new Error('Notification not found');

    const [updated] = await this.db('notifications')
      .where({ id })
      .update({ is_dismissed: true, is_read: true, read_at: notif.read_at || this.db.fn.now(), updated_by: userId })
      .returning('*');

    return updated;
  }

  /**
   * Dismiss all notifications for a user
   */
  async dismissAll(companyId: string, userId: string) {
    const count = await this.db('notifications')
      .where({ company_id: companyId, user_id: userId, is_dismissed: false })
      .update({ is_dismissed: true, is_read: true, read_at: this.db.fn.now(), updated_by: userId });

    return { dismissed_count: count };
  }

  /**
   * Create a notification (used by other services)
   */
  async createNotification(companyId: string, input: CreateNotificationInput, createdBy?: string) {
    return this.create({
      company_id: companyId,
      user_id: input.user_id,
      title: input.title,
      message: input.message,
      notification_type: input.notification_type || 'system',
      priority: input.priority || 'normal',
      reference_type: input.reference_type || null,
      reference_id: input.reference_id || null,
      created_by: createdBy || null,
      updated_by: createdBy || null,
    });
  }

  /**
   * Create notifications for multiple users at once
   */
  async createBulk(companyId: string, userIds: string[], data: {
    title: string;
    message: string;
    notification_type?: string;
    priority?: string;
    reference_type?: string;
    reference_id?: string;
  }, createdBy?: string) {
    const rows = userIds.map(uid => ({
      company_id: companyId,
      user_id: uid,
      title: data.title,
      message: data.message,
      notification_type: data.notification_type || 'system',
      priority: data.priority || 'normal',
      reference_type: data.reference_type || null,
      reference_id: data.reference_id || null,
      created_by: createdBy || null,
      updated_by: createdBy || null,
    }));

    if (rows.length === 0) return [];
    return this.db('notifications').insert(rows).returning('*');
  }
}

export const notificationsService = new NotificationsService();