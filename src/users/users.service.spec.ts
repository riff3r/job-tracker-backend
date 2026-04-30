import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const USER_ID = 'user-1';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ─── getProfile ────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns user profile without sensitive fields', async () => {
      const user = makeUser();
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.getProfile(USER_ID);

      expect(result).toEqual(user);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateProfile ─────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('updates name', async () => {
      const updated = makeUser({ name: 'New Name' });
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.updateProfile(USER_ID, { name: 'New Name' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: { name: 'New Name' },
        }),
      );
      expect(result.name).toBe('New Name');
    });

    it('updates avatarUrl', async () => {
      const updated = makeUser({ avatarUrl: 'https://example.com/avatar.png' });
      mockPrisma.user.update.mockResolvedValue(updated);

      await service.updateProfile(USER_ID, { avatarUrl: 'https://example.com/avatar.png' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { avatarUrl: 'https://example.com/avatar.png' },
        }),
      );
    });

    it('does not include undefined fields in update', async () => {
      mockPrisma.user.update.mockResolvedValue(makeUser());

      await service.updateProfile(USER_ID, {});

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: {} }),
      );
    });
  });

  // ─── deleteAccount ─────────────────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('deletes the user and returns success message', async () => {
      mockPrisma.user.delete.mockResolvedValue({});

      const result = await service.deleteAccount(USER_ID);

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
      expect(result.message).toBe('Account deleted successfully');
    });
  });
});
