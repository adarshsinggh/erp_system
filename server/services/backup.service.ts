// =============================================================
// File: server/services/backup.service.ts
// Module: Backup & Data Protection — Phase 14 (Step 49)
// Description:
//   - Trigger full/incremental pg_dump backups
//   - Encrypt backup files (AES-256)
//   - Track backup history with checksums
//   - Restore from backup
//   - List and manage backup files
// =============================================================

import { BaseService } from './base.service';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || 'erp-backup-key-32-chars-long!!!'; // 32 bytes

class BackupService extends BaseService {
  constructor() {
    super('backup_history');
  }

  /**
   * Run a database backup
   */
  async runBackup(companyId: string, userId: string, options: {
    backup_type?: 'full' | 'incremental';
    encrypt?: boolean;
  } = {}): Promise<any> {
    const { backup_type = 'full', encrypt = true } = options;

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${backup_type}_${timestamp}.sql`;
    const filePath = path.join(BACKUP_DIR, fileName);

    // Create history record (status: running)
    const [record] = await this.db('backup_history')
      .insert({
        company_id: companyId,
        backup_type,
        file_path: filePath,
        is_encrypted: encrypt,
        encryption_method: encrypt ? 'aes-256-cbc' : null,
        status: 'running',
        started_at: this.db.fn.now(),
        created_by: userId,
        updated_by: userId,
      })
      .returning('*');

    try {
      // Run pg_dump
      const dbUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/erp';
      const dumpCmd = `pg_dump "${dbUrl}" --format=custom --file="${filePath}"`;

      execSync(dumpCmd, { timeout: 300000 }); // 5 min timeout

      let finalPath = filePath;
      let fileSize = fs.statSync(filePath).size;

      // Encrypt if requested
      if (encrypt) {
        finalPath = filePath + '.enc';
        this._encryptFile(filePath, finalPath);
        fs.unlinkSync(filePath); // Remove unencrypted file
        fileSize = fs.statSync(finalPath).size;
      }

      // Calculate checksum
      const checksum = this._calculateChecksum(finalPath);

      // Update record as completed
      const [updated] = await this.db('backup_history')
        .where({ id: record.id })
        .update({
          file_path: finalPath,
          file_size: fileSize,
          checksum,
          status: 'completed',
          completed_at: this.db.fn.now(),
          updated_by: userId,
        })
        .returning('*');

      return updated;
    } catch (error: any) {
      // Mark as failed
      await this.db('backup_history')
        .where({ id: record.id })
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: this.db.fn.now(),
        });

      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  /**
   * Restore from a backup
   */
  async restoreBackup(companyId: string, backupId: string, userId: string) {
    const backup = await this.db('backup_history')
      .where({ id: backupId, company_id: companyId })
      .first();

    if (!backup) throw new Error('Backup not found');
    if (backup.status !== 'completed') throw new Error('Can only restore completed backups');
    if (!fs.existsSync(backup.file_path)) throw new Error('Backup file not found on disk');

    let restorePath = backup.file_path;

    // Decrypt if encrypted
    if (backup.is_encrypted) {
      restorePath = backup.file_path.replace('.enc', '.restore.sql');
      this._decryptFile(backup.file_path, restorePath);
    }

    try {
      // Verify checksum before restore
      const sourceChecksum = backup.is_encrypted
        ? this._calculateChecksum(backup.file_path)
        : this._calculateChecksum(restorePath);

      if (sourceChecksum !== backup.checksum) {
        throw new Error('Checksum mismatch — backup file may be corrupted');
      }

      const dbUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/erp';
      const restoreCmd = `pg_restore "${dbUrl}" --clean --if-exists --no-owner "${restorePath}"`;

      execSync(restoreCmd, { timeout: 600000 }); // 10 min timeout

      return { success: true, message: 'Database restored successfully', backup_id: backupId };
    } finally {
      // Clean up decrypted temp file
      if (backup.is_encrypted && fs.existsSync(restorePath)) {
        fs.unlinkSync(restorePath);
      }
    }
  }

  /**
   * List backup history
   */
  async listBackups(companyId: string, options: {
    status?: string;
    backup_type?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { status, backup_type, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    let query = this.db('backup_history')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (backup_type) query = query.where('backup_type', backup_type);

    const countResult = await query.clone().count('id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .leftJoin('users as u', 'backup_history.created_by', 'u.id')
      .select(
        'backup_history.*',
        'u.full_name as created_by_name'
      )
      .orderBy('backup_history.started_at', 'desc')
      .limit(limit).offset(offset);

    // Check if files still exist
    const enriched = data.map((b: any) => ({
      ...b,
      file_exists: fs.existsSync(b.file_path),
      file_size_mb: b.file_size ? (b.file_size / 1024 / 1024).toFixed(2) : null,
    }));

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Delete a backup record and file
   */
  async deleteBackup(id: string, companyId: string, userId: string) {
    const backup = await this.db('backup_history')
      .where({ id, company_id: companyId, is_deleted: false })
      .first();

    if (!backup) throw new Error('Backup not found');

    // Remove file if exists
    if (fs.existsSync(backup.file_path)) {
      fs.unlinkSync(backup.file_path);
    }

    await this.db('backup_history')
      .where({ id })
      .update({ is_deleted: true, deleted_at: this.db.fn.now(), deleted_by: userId });

    return { success: true, message: 'Backup deleted' };
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(companyId: string, backupId: string) {
    const backup = await this.db('backup_history')
      .where({ id: backupId, company_id: companyId })
      .first();

    if (!backup) throw new Error('Backup not found');

    const fileExists = fs.existsSync(backup.file_path);
    let checksumMatch = false;

    if (fileExists && backup.checksum) {
      const currentChecksum = this._calculateChecksum(backup.file_path);
      checksumMatch = currentChecksum === backup.checksum;
    }

    return {
      backup_id: backupId,
      file_exists: fileExists,
      checksum_match: checksumMatch,
      is_valid: fileExists && checksumMatch,
      file_size: fileExists ? fs.statSync(backup.file_path).size : null,
      recorded_size: backup.file_size,
    };
  }

  // ─── Private helpers ───

  private _encryptFile(inputPath: string, outputPath: string) {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    const input = fs.readFileSync(inputPath);
    const encrypted = Buffer.concat([iv, cipher.update(input), cipher.final()]);
    fs.writeFileSync(outputPath, encrypted);
  }

  private _decryptFile(inputPath: string, outputPath: string) {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const data = fs.readFileSync(inputPath);
    const iv = data.subarray(0, 16);
    const encrypted = data.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    fs.writeFileSync(outputPath, decrypted);
  }

  private _calculateChecksum(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

export const backupService = new BackupService();