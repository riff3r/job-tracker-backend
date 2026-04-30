import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
};

const mockJwtService = { sign: jest.fn().mockReturnValue('access-token') };

const mockConfigService = {
  getOrThrow: jest.fn((key: string) => {
    const map: Record<string, string> = {
      JWT_SECRET: 'secret',
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
    };
    return map[key];
  }),
};

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: '$2b$12$hashedpassword',
  googleId: null,
  name: 'Test User',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockJwtService.sign.mockReturnValue('access-token');
    mockPrisma.refreshToken.create.mockResolvedValue({});
  });

  // ─── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates a user and returns token pair', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeUser());

      const result = await service.register({ email: 'test@example.com', password: 'password123', name: 'Test User' });

      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(result.accessToken).toBe('access-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.register({ email: 'test@example.com', password: 'password123', name: 'Test' }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns token pair on valid credentials', async () => {
      const user = makeUser();
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: user.email, password: 'password123' });

      expect(result.accessToken).toBe('access-token');
      expect(result.user.email).toBe(user.email);
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password does not match', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for Google-only account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: null }));

      await expect(
        service.login({ email: 'test@example.com', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── refresh ───────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('returns new token pair and rotates refresh token', async () => {
      const user = makeUser();
      mockPrisma.refreshToken.findFirst.mockResolvedValue({ id: 'rt-1', user });
      mockPrisma.refreshToken.delete.mockResolvedValue({});

      const result = await service.refresh('raw-refresh-token');

      expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-1' } });
      expect(result.accessToken).toBe('access-token');
    });

    it('throws UnauthorizedException for invalid refresh token', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── logout ────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('revokes refresh token and returns success message', async () => {
      mockPrisma.refreshToken.delete.mockResolvedValue({});

      const result = await service.logout('raw-refresh-token');

      expect(mockPrisma.refreshToken.delete).toHaveBeenCalled();
      expect(result.message).toBe('Logged out successfully');
    });

    it('does not throw when token does not exist', async () => {
      mockPrisma.refreshToken.delete.mockRejectedValue(new Error('not found'));

      await expect(service.logout('nonexistent-token')).resolves.not.toThrow();
    });
  });
});
