import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { db } from '../db/index.ts';
import { memberships, users } from '../db/schema.ts';
import { and, eq } from 'drizzle-orm';
import { Role } from '../lib/permissions.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: typeof users.$inferSelect;
  activeOrganizationId?: number;
  activeMembership?: {
    id: number;
    organizationId: number;
    role: Role;
    status: string;
    customPermissions: string[];
  };
}

/**
 * Verifies the Firebase ID token from the Authorization Bearer header
 * and upserts the user record safely in PostgreSQL.
 */
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing Bearer token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    const email = decodedToken.email || `${decodedToken.uid}@ravan.local`;
    const name = decodedToken.name || email.split('@')[0];

    const upserted = await db
      .insert(users)
      .values({
        uid: decodedToken.uid,
        email,
        fullName: name,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          updatedAt: new Date(),
        },
      })
      .returning();

    req.dbUser = upserted[0];
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

/**
 * Resolves and verifies that the authenticated user is an active member
 * of the requested `x-organization-id` tenant. Never trusts client organizationId blindly.
 */
export const requireTenantMembership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rawOrgId = req.headers['x-organization-id'] || req.query.organizationId;
  const orgId = Number(rawOrgId);
  if (!orgId || !Number.isInteger(orgId) || orgId <= 0) {
    return res.status(400).json({ error: 'Missing or invalid x-organization-id header' });
  }

  try {
    const memberRows = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, orgId),
          eq(memberships.userUid, req.user.uid),
          eq(memberships.status, 'active')
        )
      )
      .limit(1);

    if (!memberRows.length) {
      return res.status(403).json({
        error: 'Forbidden: You do not have an active membership in this organization.',
      });
    }

    const m = memberRows[0];
    req.activeOrganizationId = orgId;
    req.activeMembership = {
      id: m.id,
      organizationId: m.organizationId,
      role: m.role as Role,
      status: m.status,
      customPermissions: Array.isArray(m.customPermissions) ? m.customPermissions : [],
    };
    next();
  } catch (error) {
    console.error('Failed to verify tenant membership:', error);
    return res.status(500).json({ error: 'Failed to verify tenant access.' });
  }
};

// Sliding-window rate limiter for public endpoints (Rule 12)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'anon'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait before retrying.',
      });
    }

    bucket.count += 1;
    next();
  };
}
