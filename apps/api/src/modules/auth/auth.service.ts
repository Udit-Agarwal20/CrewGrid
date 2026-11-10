import argon2 from 'argon2';
import crypto from 'node:crypto';
import { Response } from 'express';
import { AuthRepo } from './auth.repo.js';
import { RegisterRequest, LoginRequest, PublicUser, AppError } from '@crewgrid/contracts';
import { env } from '../../config/env.js';
import { hashToken, UserDocument } from '../../middleware/session.js';

export class AuthService {
  constructor(private repo: AuthRepo = new AuthRepo()) {}

  toPublicUser(user: UserDocument): PublicUser {
    return {
      id: user._id.toHexString(),
      displayName: user.displayName,
      handle: user.handleNormalized ?? null,
      bio: user.bio,
      skills: user.skills ?? [],
      timezone: user.timezone,
      preferredHours: user.preferredHours,
      discoverable: user.discoverable ?? false
    };
  }

  async register(input: RegisterRequest): Promise<PublicUser> {
    const emailNormalized = input.email.trim().toLowerCase();

    const existing = await this.repo.findUserByEmail(emailNormalized);
    if (existing) {
      throw new AppError(409, 'VALIDATION_FAILED', 'An account with this email already exists', {
        email: 'Already registered'
      });
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19456, // 19 MiB
      timeCost: 2
    });

    const now = new Date();
    const newUser = await this.repo.createUser({
      emailNormalized,
      passwordHash,
      displayName: input.displayName.trim(),
      skills: [],
      discoverable: false,
      createdAt: now,
      updatedAt: now
    });

    return this.toPublicUser(newUser);
  }

  async login(input: LoginRequest, res: Response): Promise<{ user: PublicUser; csrfToken: string }> {
    const emailNormalized = input.email.trim().toLowerCase();

    const user = await this.repo.findUserByEmail(emailNormalized);
    if (!user) {
      // Fake hash verification to resist timing attacks
      await argon2.hash('dummy-password-timing-defense', { type: argon2.argon2id });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const isValid = await argon2.verify(user.passwordHash, input.password);
    if (!isValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // Generate random 32-byte session token and CSRF token
    const rawSessionToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawSessionToken);
    const csrfToken = crypto.randomBytes(32).toString('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.SESSION_DAYS * 24 * 60 * 60 * 1000);

    await this.repo.createSession({
      userId: user._id,
      tokenHash,
      csrfToken,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null
    });

    // Set secure HttpOnly cookie
    res.cookie(env.SESSION_COOKIE_NAME, rawSessionToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: env.SESSION_DAYS * 24 * 60 * 60 * 1000
    });

    return {
      user: this.toPublicUser(user),
      csrfToken
    };
  }

  async logout(rawToken: string | undefined, res: Response): Promise<void> {
    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      await this.repo.revokeSession(tokenHash);
    }

    res.clearCookie(env.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/'
    });
  }
}

