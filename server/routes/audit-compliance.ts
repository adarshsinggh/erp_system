// =============================================================
// File: server/routes/audit-compliance.ts
// Module: Audit, Compliance & Data Protection — Phase 14
//
// AUDIT (Step 47):
//   GET    /api/audit/log                          — Search audit logs
//   GET    /api/audit/log/:tableName/:recordId     — Record history
//   POST   /api/audit/document-links               — Create doc link
//   GET    /api/audit/document-links/:type/:id     — Get doc links
//   GET    /api/audit/activity/:type/:id           — Activity feed
//   POST   /api/audit/notes                        — Add note
//   GET    /api/audit/notes/:type/:id              — Get notes
//   DELETE /api/audit/notes/:noteId                — Delete note
//   POST   /api/audit/attachments                  — Add attachment
//   GET    /api/audit/attachments/:type/:id        — Get attachments
//   DELETE /api/audit/attachments/:attachmentId    — Delete attachment
//   POST   /api/audit/custom-fields/definitions    — Create field def
//   GET    /api/audit/custom-fields/definitions    — List field defs
//   POST   /api/audit/custom-fields/values         — Set field value
//   GET    /api/audit/custom-fields/values/:type/:id — Get field values
//
// GST (Step 48):
//   GET    /api/gst/gstr-1/b2b                     — GSTR-1 B2B
//   GET    /api/gst/gstr-1/b2c                     — GSTR-1 B2C
//   GET    /api/gst/gstr-1/credit-notes            — GSTR-1 CN/DN
//   GET    /api/gst/gstr-3b                        — GSTR-3B summary
//   GET    /api/gst/hsn-summary                    — HSN-wise summary
//   GET    /api/gst/e-invoice-check/:invoiceId     — E-invoice readiness
//   GET    /api/gst/e-way-bill/:challanId          — E-way bill data
//
// BACKUP (Step 49):
//   POST   /api/backups/run                        — Trigger backup
//   POST   /api/backups/:id/restore                — Restore from backup
//   GET    /api/backups                            — List backups
//   GET    /api/backups/:id/verify                 — Verify integrity
//   DELETE /api/backups/:id                        — Delete backup
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { auditService } from '../services/audit.service';
import { gstComplianceService } from '../services/gst-compliance.service';
import { backupService } from '../services/backup.service';

export async function auditComplianceRoutes(server: FastifyInstance) {

  // ═══════════════════════════════════════════════════════════
  // AUDIT — Step 47
  // ═══════════════════════════════════════════════════════════

  server.get('/audit/log', { preHandler: [authenticate] }, async (request) => {
    const { table_name, action, user_id, date_from, date_to, page, limit } = request.query as any;
    const result = await auditService.searchAuditLog(request.user!.companyId, {
      table_name, action, user_id, date_from, date_to,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return { success: true, ...result };
  });

  server.get('/audit/log/:tableName/:recordId', { preHandler: [authenticate] }, async (request) => {
    const { tableName, recordId } = request.params as any;
    const { page, limit } = request.query as any;
    const result = await auditService.getRecordHistory(request.user!.companyId, tableName, recordId, {
      page: page ? parseInt(page, 10) : 1, limit: limit ? parseInt(limit, 10) : 50,
    });
    return { success: true, ...result };
  });

  server.post('/audit/document-links', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const link = await auditService.createDocumentLink(
        request.user!.companyId, request.body as any, request.user!.userId
      );
      return reply.code(201).send({ success: true, data: link });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.get('/audit/document-links/:type/:id', { preHandler: [authenticate] }, async (request) => {
    const { type, id } = request.params as any;
    const data = await auditService.getDocumentLinks(request.user!.companyId, type, id);
    return { success: true, data };
  });

  server.get('/audit/activity/:type/:id', { preHandler: [authenticate] }, async (request) => {
    const { type, id } = request.params as any;
    const { page, limit } = request.query as any;
    const result = await auditService.getActivityFeed(request.user!.companyId, type, id, {
      page: page ? parseInt(page, 10) : 1, limit: limit ? parseInt(limit, 10) : 50,
    });
    return { success: true, ...result };
  });

  // Notes
  server.post('/audit/notes', { preHandler: [authenticate] }, async (request, reply) => {
    const note = await auditService.addNote(request.user!.companyId, request.body as any, request.user!.userId);
    return reply.code(201).send({ success: true, data: note });
  });

  server.get('/audit/notes/:type/:id', { preHandler: [authenticate] }, async (request) => {
    const { type, id } = request.params as any;
    const data = await auditService.getNotes(request.user!.companyId, type, id);
    return { success: true, data };
  });

  server.delete('/audit/notes/:noteId', { preHandler: [authenticate] }, async (request) => {
    const { noteId } = request.params as any;
    await auditService.deleteNote(noteId, request.user!.companyId, request.user!.userId);
    return { success: true, message: 'Note deleted' };
  });

  // Attachments
  server.post('/audit/attachments', { preHandler: [authenticate] }, async (request, reply) => {
    const att = await auditService.addAttachment(request.user!.companyId, request.body as any, request.user!.userId);
    return reply.code(201).send({ success: true, data: att });
  });

  server.get('/audit/attachments/:type/:id', { preHandler: [authenticate] }, async (request) => {
    const { type, id } = request.params as any;
    const data = await auditService.getAttachments(request.user!.companyId, type, id);
    return { success: true, data };
  });

  server.delete('/audit/attachments/:attachmentId', { preHandler: [authenticate] }, async (request) => {
    const { attachmentId } = request.params as any;
    await auditService.deleteAttachment(attachmentId, request.user!.companyId, request.user!.userId);
    return { success: true, message: 'Attachment deleted' };
  });

  // Custom Fields
  server.post('/audit/custom-fields/definitions', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const def = await auditService.createFieldDefinition(
        request.user!.companyId, request.body as any, request.user!.userId
      );
      return reply.code(201).send({ success: true, data: def });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.get('/audit/custom-fields/definitions', { preHandler: [authenticate] }, async (request) => {
    const { entity_type } = request.query as any;
    const data = await auditService.getFieldDefinitions(request.user!.companyId, entity_type);
    return { success: true, data };
  });

  server.post('/audit/custom-fields/values', { preHandler: [authenticate] }, async (request, reply) => {
    const val = await auditService.setFieldValue(request.user!.companyId, request.body as any, request.user!.userId);
    return reply.code(201).send({ success: true, data: val });
  });

  server.get('/audit/custom-fields/values/:type/:id', { preHandler: [authenticate] }, async (request) => {
    const { type, id } = request.params as any;
    const data = await auditService.getFieldValues(request.user!.companyId, type, id);
    return { success: true, data };
  });

  // ═══════════════════════════════════════════════════════════
  // GST COMPLIANCE — Step 48
  // ═══════════════════════════════════════════════════════════

  /** Common: extract month & year from query params */
  function getPeriod(query: any) {
    const month = parseInt(query.month, 10);
    const year = parseInt(query.year, 10);
    if (!month || !year || month < 1 || month > 12) throw new Error('Valid month (1-12) and year required');
    return { month, year };
  }

  server.get('/gst/gstr-1/b2b', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const period = getPeriod(request.query);
      const data = await gstComplianceService.gstr1B2B(request.user!.companyId, period);
      return { success: true, report: 'gstr1_b2b', period, data };
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }); }
  });

  server.get('/gst/gstr-1/b2c', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const period = getPeriod(request.query);
      const data = await gstComplianceService.gstr1B2C(request.user!.companyId, period);
      return { success: true, report: 'gstr1_b2c', period, data };
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }); }
  });

  server.get('/gst/gstr-1/credit-notes', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const period = getPeriod(request.query);
      const data = await gstComplianceService.gstr1CreditNotes(request.user!.companyId, period);
      return { success: true, report: 'gstr1_credit_notes', period, data };
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }); }
  });

  server.get('/gst/gstr-3b', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const period = getPeriod(request.query);
      const data = await gstComplianceService.gstr3BSummary(request.user!.companyId, period);
      return { success: true, report: 'gstr_3b', data };
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }); }
  });

  server.get('/gst/hsn-summary', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const period = getPeriod(request.query);
      const data = await gstComplianceService.hsnSummary(request.user!.companyId, period);
      return { success: true, report: 'hsn_summary', period, data };
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }); }
  });

  server.get('/gst/e-invoice-check/:invoiceId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { invoiceId } = request.params as any;
      const data = await gstComplianceService.eInvoiceReadiness(request.user!.companyId, invoiceId);
      return { success: true, data };
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }); }
  });

  server.get('/gst/e-way-bill/:challanId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { challanId } = request.params as any;
      const data = await gstComplianceService.eWayBillData(request.user!.companyId, challanId);
      return { success: true, data };
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }); }
  });

  // ═══════════════════════════════════════════════════════════
  // BACKUP — Step 49
  // ═══════════════════════════════════════════════════════════

  server.post('/backups/run', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as { backup_type?: string; encrypt?: boolean } || {};
      const result = await backupService.runBackup(request.user!.companyId, request.user!.userId, {
        backup_type: (body.backup_type as any) || 'full',
        encrypt: body.encrypt ?? true,
      });
      return reply.code(201).send({ success: true, data: result, message: 'Backup completed' });
    } catch (e: any) { return reply.code(500).send({ success: false, error: e.message }); }
  });

  server.post('/backups/:id/restore', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as any;
      const result = await backupService.restoreBackup(request.user!.companyId, id, request.user!.userId);
      return { success: true, data: result };
    } catch (e: any) { return reply.code(500).send({ success: false, error: e.message }); }
  });

  server.get('/backups', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { status, backup_type, page, limit } = request.query as any;
      const result = await backupService.listBackups(request.user!.companyId, {
        status, backup_type,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
      });
      return { success: true, ...result };
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

  server.get('/backups/:id/verify', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as any;
      const data = await backupService.verifyBackup(request.user!.companyId, id);
      return { success: true, data };
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }); }
  });

  server.delete('/backups/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as any;
      await backupService.deleteBackup(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Backup deleted' };
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }); }
  });
}