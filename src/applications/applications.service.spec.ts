import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationStatus, LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

const USER_ID = 'user-1';
const APP_ID = 'app-1';

const makeApp = (overrides: Record<string, unknown> = {}) => ({
  id: APP_ID,
  userId: USER_ID,
  company: 'Acme Corp',
  role: 'Software Engineer',
  jobUrl: null,
  location: LocationType.ONSITE,
  salary: null,
  expectedSalary: null,
  notes: null,
  status: ApplicationStatus.APPLIED,
  appliedAt: null,
  followUpDate: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mockPrisma = {
  application: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  activityLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

describe('ApplicationsService', () => {
  let service: ApplicationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
    jest.clearAllMocks();
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateApplicationDto = {
      company: 'Acme Corp',
      role: 'Software Engineer',
    };

    it('creates an application with default status and location', async () => {
      const app = makeApp();
      mockPrisma.application.create.mockResolvedValue(app);
      mockPrisma.activityLog.create.mockResolvedValue({});

      const result = await service.create(USER_ID, dto);

      expect(mockPrisma.application.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          company: dto.company,
          role: dto.role,
          status: ApplicationStatus.APPLIED,
          location: LocationType.ONSITE,
        }),
      });
      expect(mockPrisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: app.id,
          userId: USER_ID,
          fromStatus: null,
          toStatus: app.status,
        }),
      });
      expect(result).toEqual(app);
    });

    it('uses provided status and location', async () => {
      const app = makeApp({ status: ApplicationStatus.INTERVIEW, location: LocationType.REMOTE });
      mockPrisma.application.create.mockResolvedValue(app);
      mockPrisma.activityLog.create.mockResolvedValue({});

      await service.create(USER_ID, {
        ...dto,
        status: ApplicationStatus.INTERVIEW,
        location: LocationType.REMOTE,
      });

      expect(mockPrisma.application.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: ApplicationStatus.INTERVIEW,
          location: LocationType.REMOTE,
        }),
      });
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated applications', async () => {
      const apps = [makeApp()];
      mockPrisma.$transaction.mockResolvedValue([apps, 1]);

      const result = await service.findAll(USER_ID, { page: 1, limit: 20 });

      expect(result).toEqual({
        items: apps,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('filters by status', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll(USER_ID, { status: ApplicationStatus.OFFER });

      const [[findManyCall]] = mockPrisma.$transaction.mock.calls;
      expect(findManyCall).toBeDefined();
    });
  });

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns application when found and owned', async () => {
      const app = makeApp();
      mockPrisma.application.findUnique.mockResolvedValue(app);

      const result = await service.findOne(USER_ID, APP_ID);
      expect(result).toEqual(app);
    });

    it('throws NotFoundException when application does not exist', async () => {
      mockPrisma.application.findUnique.mockResolvedValue(null);

      await expect(service.findOne(USER_ID, APP_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when application is soft-deleted', async () => {
      mockPrisma.application.findUnique.mockResolvedValue(makeApp({ deletedAt: new Date() }));

      await expect(service.findOne(USER_ID, APP_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when application belongs to another user', async () => {
      mockPrisma.application.findUnique.mockResolvedValue(makeApp({ userId: 'other-user' }));

      await expect(service.findOne(USER_ID, APP_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates fields and writes activity log when status changes', async () => {
      const existing = makeApp({ status: ApplicationStatus.APPLIED });
      const updated = makeApp({ status: ApplicationStatus.INTERVIEW });
      mockPrisma.application.findUnique.mockResolvedValue(existing);
      mockPrisma.application.update.mockResolvedValue(updated);
      mockPrisma.activityLog.create.mockResolvedValue({});

      const dto: UpdateApplicationDto = { status: ApplicationStatus.INTERVIEW };
      await service.update(USER_ID, APP_ID, dto);

      expect(mockPrisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromStatus: ApplicationStatus.APPLIED,
          toStatus: ApplicationStatus.INTERVIEW,
        }),
      });
    });

    it('does not write activity log when status is unchanged', async () => {
      const existing = makeApp({ status: ApplicationStatus.APPLIED });
      mockPrisma.application.findUnique.mockResolvedValue(existing);
      mockPrisma.application.update.mockResolvedValue(existing);

      await service.update(USER_ID, APP_ID, { status: ApplicationStatus.APPLIED });

      expect(mockPrisma.activityLog.create).not.toHaveBeenCalled();
    });

    it('does not write activity log when status is not in payload', async () => {
      const existing = makeApp();
      mockPrisma.application.findUnique.mockResolvedValue(existing);
      mockPrisma.application.update.mockResolvedValue(existing);

      await service.update(USER_ID, APP_ID, { company: 'New Corp' });

      expect(mockPrisma.activityLog.create).not.toHaveBeenCalled();
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes the application', async () => {
      mockPrisma.application.findUnique.mockResolvedValue(makeApp());
      mockPrisma.application.update.mockResolvedValue({});

      const result = await service.remove(USER_ID, APP_ID);

      expect(mockPrisma.application.update).toHaveBeenCalledWith({
        where: { id: APP_ID },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ message: 'Application deleted successfully' });
    });
  });

  // ─── getStats ──────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns stats with correct shape', async () => {
      mockPrisma.$transaction.mockResolvedValue([10, 3]);
      mockPrisma.application.groupBy.mockResolvedValue([
        { status: ApplicationStatus.APPLIED, _count: { _all: 7 } },
        { status: ApplicationStatus.INTERVIEW, _count: { _all: 3 } },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { week: new Date('2026-04-21'), count: BigInt(4) },
      ]);

      const result = await service.getStats(USER_ID);

      expect(result.total).toBe(10);
      expect(result.thisWeek).toBe(3);
      expect(result.byStatus).toEqual({ APPLIED: 7, INTERVIEW: 3 });
      expect(result.perWeek[0].count).toBe(4);
    });
  });

  // ─── findAll filters ───────────────────────────────────────────────────────

  describe('findAll filters', () => {
    it('passes followUpDate range filter to Prisma', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll(USER_ID, {
        followUpDateAfter: '2026-04-30T00:00:00.000Z',
        followUpDateBefore: '2026-05-07T00:00:00.000Z',
      });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── getRecentActivity ─────────────────────────────────────────────────────

  describe('getRecentActivity', () => {
    it('returns recent activity logs with application info', async () => {
      const logs = [
        {
          id: 'log-1',
          toStatus: ApplicationStatus.INTERVIEW,
          application: { id: APP_ID, company: 'Acme', role: 'Engineer' },
        },
      ];
      mockPrisma.activityLog.findMany.mockResolvedValue(logs);

      const result = await service.getRecentActivity(USER_ID, 10);

      expect(mockPrisma.activityLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, application: { deletedAt: null } },
          take: 10,
        }),
      );
      expect(result).toEqual(logs);
    });

    it('defaults to 20 items when limit is not provided', async () => {
      mockPrisma.activityLog.findMany.mockResolvedValue([]);

      await service.getRecentActivity(USER_ID);

      expect(mockPrisma.activityLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });
  });

  // ─── getActivity ───────────────────────────────────────────────────────────

  describe('getActivity', () => {
    it('returns activity logs for owned application', async () => {
      const logs = [{ id: 'log-1', toStatus: ApplicationStatus.APPLIED }];
      mockPrisma.application.findUnique.mockResolvedValue(makeApp());
      mockPrisma.activityLog.findMany.mockResolvedValue(logs);

      const result = await service.getActivity(USER_ID, APP_ID);
      expect(result).toEqual(logs);
    });

    it('throws NotFoundException for non-existent application', async () => {
      mockPrisma.application.findUnique.mockResolvedValue(null);

      await expect(service.getActivity(USER_ID, APP_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
