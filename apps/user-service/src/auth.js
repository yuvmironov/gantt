import { createHash, randomBytes } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { status } from '@grpc/grpc-js';

const SESSION_ABSOLUTE_MS = 60 * 60 * 1000;
const SESSION_IDLE_MS = 10 * 60 * 1000;
const REMEMBER_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const REMEMBER_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE = '__Host-session';
const REMEMBER_COOKIE = '__Host-remember';
const CSRF_COOKIE = '__Host-csrf';

function grpcError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function mapDbError(error) {
  if (error.code === '23505') {
    return grpcError(status.ALREADY_EXISTS, 'email_taken');
  }
  if (error.message === 'session_limit_reached') {
    return grpcError(status.ABORTED, 'session_limit_reached');
  }
  return error;
}

function randomToken() {
  return randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toTimestamp(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  const milliseconds = date.getTime();
  if (Number.isNaN(milliseconds)) return undefined;
  return {
    seconds: String(Math.floor(milliseconds / 1000)),
    nanos: (milliseconds % 1000) * 1_000_000,
  };
}

function toProjectRole(role) {
  return (
    {
      project_owner: 'PROJECT_ROLE_OWNER',
      project_manager: 'PROJECT_ROLE_MANAGER',
      project_editor: 'PROJECT_ROLE_EDITOR',
      project_participant: 'PROJECT_ROLE_PARTICIPANT',
      project_viewer: 'PROJECT_ROLE_VIEWER',
    }[role] ?? 'PROJECT_ROLE_UNSPECIFIED'
  );
}

function toMembership(row) {
  return {
    id: row.id,
    project_id: row.project_id,
    user_id: row.user_id,
    role: toProjectRole(row.role_code),
    status: row.status,
    invited_at: toTimestamp(row.invited_at),
    joined_at: toTimestamp(row.joined_at),
    revoked_at: toTimestamp(row.revoked_at),
    revoked_reason: row.revoked_reason ?? '',
  };
}

function toUser(row, roles) {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    last_name: row.last_name ?? '',
    first_name: row.first_name ?? '',
    middle_name: row.middle_name ?? '',
    position: row.position ?? '',
    status: row.status === 'blocked' ? 'USER_STATUS_BLOCKED' : 'USER_STATUS_ACTIVE',
    email_verified: Boolean(row.email_verified_at),
    email_verified_at: toTimestamp(row.email_verified_at),
    timezone: row.timezone,
    locale: row.locale,
    global_roles: roles.filter((role) => role === 'app_admin').map(() => 'GLOBAL_ROLE_APP_ADMIN'),
    last_login_at: toTimestamp(row.last_login_at),
    created_at: toTimestamp(row.created_at),
    updated_at: toTimestamp(row.updated_at),
  };
}

function cookie(name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [`${name}=${value}`, 'Path=/', 'Secure', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

function clearCookie(name) {
  return cookie(name, '', { maxAge: 0 });
}

function loginCookies({ sessionToken, rememberToken, csrfToken, remember }) {
  const values = [
    cookie(SESSION_COOKIE, sessionToken),
    cookie(CSRF_COOKIE, csrfToken, { httpOnly: false }),
  ];
  if (remember && rememberToken) {
    values.push(
      cookie(REMEMBER_COOKIE, rememberToken, {
        maxAge: Math.floor(REMEMBER_ABSOLUTE_MS / 1000),
      }),
    );
  }
  return values;
}

function logoutCookies() {
  return [clearCookie(SESSION_COOKIE), clearCookie(REMEMBER_COOKIE), clearCookie(CSRF_COOKIE)];
}

async function getRoles(queryable, userId) {
  const result = await queryable.query(
    'SELECT role_code FROM access.user_roles WHERE user_id = $1',
    [userId],
  );
  return result.rows.map((row) => row.role_code);
}

export async function hashPassword(password) {
  return argonHash(password);
}

export async function verifyPassword(passwordHash, password) {
  return argonVerify(passwordHash, password);
}

export function createUserImplementation({ db, devAutoVerify = false }) {
  return {
    async Register(call, callback) {
      const email = normalizeEmail(call.request.email);
      const password = String(call.request.password ?? '');
      const lastName = String(call.request.last_name ?? '').trim();
      const firstName = String(call.request.first_name ?? '').trim();
      const middleName = String(call.request.middle_name ?? '').trim();
      const displayName =
        String(call.request.display_name ?? '').trim() || `${lastName} ${firstName}`.trim();

      if (!isValidEmail(email)) {
        callback(grpcError(status.INVALID_ARGUMENT, 'invalid_email'));
        return;
      }
      if (password.length < 8 || password.length > 128) {
        callback(grpcError(status.INVALID_ARGUMENT, 'invalid_password'));
        return;
      }
      if (!lastName || !firstName || !displayName) {
        callback(grpcError(status.INVALID_ARGUMENT, 'invalid_name'));
        return;
      }

      let client;
      try {
        client = await db.connect();
        await client.query('BEGIN');
        const passwordHash = await hashPassword(password);
        const timezone = String(call.request.timezone ?? 'Europe/Moscow');
        const locale = String(call.request.locale ?? 'ru-RU');
        const emailVerifiedAt = devAutoVerify ? new Date() : null;
        const result = await client.query(
          `INSERT INTO access.users
             (email, password_hash, display_name, last_name, first_name, middle_name,
              timezone, locale, email_verified_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            email,
            passwordHash,
            displayName,
            lastName,
            firstName,
            middleName || null,
            timezone,
            locale,
            emailVerifiedAt,
          ],
        );
        const userId = result.rows[0].id;

        if (!devAutoVerify) {
          const token = randomToken();
          await client.query(
            `INSERT INTO access.email_verification_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, now() + ($3 * interval '1 millisecond'))`,
            [userId, hashToken(token), EMAIL_VERIFICATION_MS],
          );
        }

        await client.query('COMMIT');
        callback(null, {
          user_id: userId,
          requires_email_verification: !devAutoVerify,
        });
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        callback(mapDbError(error));
      } finally {
        client?.release();
      }
    },

    async VerifyEmail(call, callback) {
      const token = String(call.request.token ?? '');
      if (!token) {
        callback(grpcError(status.INVALID_ARGUMENT, 'token_required'));
        return;
      }

      let client;
      try {
        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(
          `SELECT id, user_id
           FROM access.email_verification_tokens
           WHERE token_hash = $1
             AND used_at IS NULL
             AND expires_at > now()
           FOR UPDATE`,
          [hashToken(token)],
        );
        if (result.rowCount === 0) {
          await client.query('ROLLBACK');
          callback(grpcError(status.INVALID_ARGUMENT, 'invalid_token'));
          return;
        }

        const row = result.rows[0];
        await client.query(
          `UPDATE access.email_verification_tokens
           SET used_at = now()
           WHERE id = $1`,
          [row.id],
        );
        await client.query(
          `UPDATE access.users
           SET email_verified_at = COALESCE(email_verified_at, now()),
               updated_at = now()
           WHERE id = $1`,
          [row.user_id],
        );
        await client.query('COMMIT');
        callback(null, { user_id: row.user_id, verified: true });
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        callback(mapDbError(error));
      } finally {
        client?.release();
      }
    },

    async Login(call, callback) {
      const email = normalizeEmail(call.request.email);
      const password = String(call.request.password ?? '');
      const remember = Boolean(call.request.remember_me);

      if (!email || !password) {
        callback(grpcError(status.INVALID_ARGUMENT, 'credentials_required'));
        return;
      }

      let client;
      try {
        client = await db.connect();
        await client.query('BEGIN');
        const userResult = await client.query(
          'SELECT * FROM access.users WHERE email = $1 FOR UPDATE',
          [email],
        );
        if (userResult.rowCount === 0) {
          await client.query('ROLLBACK');
          callback(grpcError(status.UNAUTHENTICATED, 'invalid_credentials'));
          return;
        }

        const user = userResult.rows[0];
        if (user.status === 'blocked') {
          await client.query('ROLLBACK');
          callback(grpcError(status.PERMISSION_DENIED, 'account_blocked'));
          return;
        }
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
          await client.query('ROLLBACK');
          callback(grpcError(status.FAILED_PRECONDITION, 'account_locked'));
          return;
        }

        const passwordMatches = await verifyPassword(user.password_hash, password);
        if (!passwordMatches) {
          let attempts = Number(user.failed_login_attempts) + 1;
          let level = Number(user.lockout_level);
          let lockedUntil = user.locked_until;
          let userStatus = user.status;

          if (attempts >= 5) {
            level = Math.min(level + 1, 3);
            attempts = 0;
            if (level >= 3) {
              userStatus = 'blocked';
              lockedUntil = null;
            } else {
              lockedUntil = new Date(Date.now() + (level === 1 ? 10 : 60) * 60 * 1000);
            }
          }

          await client.query(
            `UPDATE access.users
             SET failed_login_attempts = $1,
                 lockout_level = $2,
                 locked_until = $3,
                 status = $4,
                 updated_at = now()
             WHERE id = $5`,
            [attempts, level, lockedUntil, userStatus, user.id],
          );
          await client.query('COMMIT');
          callback(grpcError(status.UNAUTHENTICATED, 'invalid_credentials'));
          return;
        }

        if (!user.email_verified_at) {
          await client.query('ROLLBACK');
          callback(grpcError(status.PERMISSION_DENIED, 'email_not_verified'));
          return;
        }

        const sessionToken = randomToken();
        const rememberToken = remember ? randomToken() : null;
        const csrfToken = randomToken();
        const now = Date.now();
        const absoluteExpiresAt = new Date(
          now + (remember ? REMEMBER_ABSOLUTE_MS : SESSION_ABSOLUTE_MS),
        );
        const idleExpiresAt = new Date(now + (remember ? REMEMBER_IDLE_MS : SESSION_IDLE_MS));

        const sessionResult = await client.query(
          `INSERT INTO access.user_sessions
             (user_id, session_token_hash, absolute_expires_at, idle_expires_at,
              remember_token_hash, remember_absolute_expires_at, remember_idle_expires_at,
              user_agent, ip, last_seen_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           RETURNING id`,
          [
            user.id,
            hashToken(sessionToken),
            absoluteExpiresAt,
            idleExpiresAt,
            rememberToken ? hashToken(rememberToken) : null,
            remember ? absoluteExpiresAt : null,
            remember ? idleExpiresAt : null,
            String(call.request.user_agent ?? '') || null,
            String(call.request.client_ip ?? '') || null,
          ],
        );

        await client.query(
          `UPDATE access.users
           SET failed_login_attempts = 0,
               lockout_level = 0,
               locked_until = NULL,
               last_login_at = now(),
               updated_at = now()
           WHERE id = $1`,
          [user.id],
        );

        const roles = await getRoles(client, user.id);
        await client.query('COMMIT');

        callback(null, {
          user: toUser({ ...user, last_login_at: new Date() }, roles),
          session_id: sessionResult.rows[0].id,
          set_cookie: loginCookies({
            sessionToken,
            rememberToken,
            csrfToken,
            remember,
          }),
          absolute_expires_at: toTimestamp(absoluteExpiresAt),
          idle_expires_at: toTimestamp(idleExpiresAt),
          remember_expires_at: remember ? toTimestamp(absoluteExpiresAt) : undefined,
        });
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        callback(mapDbError(error));
      } finally {
        client?.release();
      }
    },

    async EnsureProjectOwner(call, callback) {
      const projectId = String(call.request.project_id ?? '');
      const ownerUserId = String(call.request.owner_user_id ?? '');
      if (!projectId || !ownerUserId) {
        callback(grpcError(status.INVALID_ARGUMENT, 'project_owner_required'));
        return;
      }

      let client;
      try {
        client = await db.connect();
        await client.query('BEGIN');
        const user = await client.query(
          'SELECT status FROM access.users WHERE id = $1 FOR UPDATE',
          [ownerUserId],
        );
        if (user.rowCount === 0) {
          await client.query('ROLLBACK');
          callback(grpcError(status.NOT_FOUND, 'user_not_found'));
          return;
        }
        if (user.rows[0].status !== 'active') {
          await client.query('ROLLBACK');
          callback(grpcError(status.PERMISSION_DENIED, 'account_blocked'));
          return;
        }

        const result = await client.query(
          `INSERT INTO access.project_memberships
             (project_id, user_id, role_code, status, joined_at)
           VALUES ($1, $2, 'project_owner', 'active', now())
           ON CONFLICT (project_id, user_id) DO UPDATE
             SET role_code = 'project_owner',
                 status = 'active',
                 joined_at = COALESCE(access.project_memberships.joined_at, now()),
                 revoked_at = NULL,
                 revoked_reason = NULL,
                 updated_at = now()
           RETURNING *`,
          [projectId, ownerUserId],
        );
        await client.query('COMMIT');
        callback(null, { membership: toMembership(result.rows[0]) });
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        callback(mapDbError(error));
      } finally {
        client?.release();
      }
    },

    async ListAccessibleProjectIds(call, callback) {
      const userId = String(call.request.user_id ?? '');
      if (!userId) {
        callback(grpcError(status.INVALID_ARGUMENT, 'user_id_required'));
        return;
      }

      try {
        const result = await db.query(
          `SELECT project_id, role_code
           FROM access.project_memberships
           WHERE user_id = $1 AND status = 'active'
           ORDER BY created_at DESC`,
          [userId],
        );
        callback(null, {
          items: result.rows.map((row) => ({
            project_id: row.project_id,
            role: toProjectRole(row.role_code),
            permissions: [],
            is_accessible: true,
          })),
        });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async GetCurrentUser(call, callback) {
      const userId = String(call.request.user_id ?? '');
      if (!userId) {
        callback(grpcError(status.INVALID_ARGUMENT, 'user_id_required'));
        return;
      }

      try {
        const result = await db.query('SELECT * FROM access.users WHERE id = $1', [userId]);
        if (result.rowCount === 0) {
          callback(grpcError(status.NOT_FOUND, 'user_not_found'));
          return;
        }
        const roles = await getRoles(db, userId);
        callback(null, { user: toUser(result.rows[0], roles) });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async ValidateSession(call, callback) {
      const sessionToken = String(call.request.session_token ?? '');
      if (!sessionToken) {
        callback(grpcError(status.UNAUTHENTICATED, 'session_required'));
        return;
      }

      try {
        const result = await db.query(
          `SELECT s.*, u.status AS user_status
           FROM access.user_sessions s
           JOIN access.users u ON u.id = s.user_id
           WHERE s.session_token_hash = $1
             AND s.revoked_at IS NULL`,
          [hashToken(sessionToken)],
        );
        if (result.rowCount === 0) {
          callback(grpcError(status.UNAUTHENTICATED, 'session_invalid'));
          return;
        }

        const session = result.rows[0];
        const now = new Date();
        if (
          new Date(session.absolute_expires_at) <= now ||
          new Date(session.idle_expires_at) <= now
        ) {
          callback(grpcError(status.UNAUTHENTICATED, 'session_expired'));
          return;
        }
        if (session.user_status !== 'active') {
          callback(grpcError(status.PERMISSION_DENIED, 'account_blocked'));
          return;
        }

        let idleExpiresAt = new Date(session.idle_expires_at);
        if (call.request.extend_idle !== false) {
          const idleMs = session.remember_token_hash ? REMEMBER_IDLE_MS : SESSION_IDLE_MS;
          idleExpiresAt = new Date(
            Math.min(now.getTime() + idleMs, new Date(session.absolute_expires_at).getTime()),
          );
          await db.query(
            `UPDATE access.user_sessions
             SET idle_expires_at = $1, last_seen_at = now()
             WHERE id = $2`,
            [idleExpiresAt, session.id],
          );
        }

        const roles = await getRoles(db, session.user_id);
        callback(null, {
          user_id: session.user_id,
          session_id: session.id,
          global_roles: roles
            .filter((role) => role === 'app_admin')
            .map(() => 'GLOBAL_ROLE_APP_ADMIN'),
          absolute_expires_at: toTimestamp(session.absolute_expires_at),
          idle_expires_at: toTimestamp(idleExpiresAt),
        });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async Logout(call, callback) {
      const sessionToken = String(call.request.session_token ?? '');
      if (sessionToken) {
        await db
          .query(
            `UPDATE access.user_sessions
             SET revoked_at = now()
             WHERE session_token_hash = $1 AND revoked_at IS NULL`,
            [hashToken(sessionToken)],
          )
          .catch(() => {});
      }
      callback(null, { set_cookie: logoutCookies() });
    },
  };
}
