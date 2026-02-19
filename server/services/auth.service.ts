import { getDb } from '../database/connection';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';

export interface LoginInput {
  username: string;
  password: string;
  company_id: string;
}

export interface JwtPayload {
  userId: string;
  companyId: string;
  roleId: string;
  branchId: string | null;
  username: string;
}

export class AuthService {
  async login(input: LoginInput) {
    const db = getDb();

    const user = await db('users')
      .where({
        company_id: input.company_id,
        username: input.username,
        is_deleted: false,
        is_active: true,
      })
      .first();

    if (!user) throw new Error('Invalid username or password');

    const isValid = await bcrypt.compare(input.password, user.password_hash);
    if (!isValid) throw new Error('Invalid username or password');

    const role = await db('roles').where({ id: user.role_id }).first();

    const payload: JwtPayload = {
      userId: user.id,
      companyId: user.company_id,
      roleId: user.role_id,
      branchId: user.branch_id,
      username: user.username,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now() });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role_id: user.role_id,
        role_name: role?.name,
        branch_id: user.branch_id,
        company_id: user.company_id,
      },
    };
  }

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      throw new Error('Invalid or expired token');
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const db = getDb();
    const user = await db('users').where({ id: userId, is_deleted: false }).first();
    if (!user) throw new Error('User not found');

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) throw new Error('Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, 12);
    await db('users')
      .where({ id: userId })
      .update({ password_hash: newHash, force_password_change: false, updated_by: userId });

    return { success: true };
  }
}

export const authService = new AuthService();
