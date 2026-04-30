import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { QueryApplicationDto } from './dto/query-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateApplicationDto) {
    const application = await this.prisma.application.create({
      data: {
        userId,
        company: dto.company,
        role: dto.role,
        jobUrl: dto.jobUrl,
        location: dto.location ?? LocationType.ONSITE,
        salary: dto.salary,
        expectedSalary: dto.expectedSalary,
        notes: dto.notes,
        status: dto.status ?? ApplicationStatus.APPLIED,
        appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : undefined,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
      },
    });

    // Log the initial status as a creation event
    await this.prisma.activityLog.create({
      data: {
        applicationId: application.id,
        userId,
        fromStatus: null,
        toStatus: application.status,
      },
    });

    return application;
  }

  async findAll(userId: string, query: QueryApplicationDto) {
    const { status, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      deletedAt: null,
      ...(status && { status }),
      ...(search && {
        OR: [
          { company: { contains: search, mode: 'insensitive' as const } },
          { role: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(userId: string, id: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
    });

    if (!application || application.deletedAt) {
      throw new NotFoundException('Application not found');
    }

    if (application.userId !== userId) {
      throw new ForbiddenException();
    }

    return application;
  }

  async update(userId: string, id: string, dto: UpdateApplicationDto) {
    const existing = await this.findOne(userId, id);

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        ...(dto.company !== undefined && { company: dto.company }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.jobUrl !== undefined && { jobUrl: dto.jobUrl }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.salary !== undefined && { salary: dto.salary }),
        ...(dto.expectedSalary !== undefined && { expectedSalary: dto.expectedSalary }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.appliedAt !== undefined && { appliedAt: new Date(dto.appliedAt) }),
        ...(dto.followUpDate !== undefined && {
          followUpDate: new Date(dto.followUpDate),
        }),
      },
    });

    // Write activity log only when status actually changed
    if (dto.status !== undefined && dto.status !== existing.status) {
      await this.prisma.activityLog.create({
        data: {
          applicationId: id,
          userId,
          fromStatus: existing.status,
          toStatus: dto.status,
        },
      });
    }

    return updated;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);

    await this.prisma.application.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Application deleted successfully' };
  }

  async getStats(userId: string) {
    const baseWhere = { userId, deletedAt: null as null };

    const [total, thisWeek] = await this.prisma.$transaction([
      this.prisma.application.count({ where: baseWhere }),
      this.prisma.application.count({
        where: {
          ...baseWhere,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const statusGroups = await this.prisma.application.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });

    const byStatus = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count._all]),
    );

    const perWeek = await this.prisma.$queryRaw<{ week: Date; count: bigint }[]>`
      SELECT DATE_TRUNC('week', "createdAt") AS week, COUNT(*) AS count
      FROM "Application"
      WHERE "userId" = ${userId}
        AND "deletedAt" IS NULL
        AND "createdAt" >= NOW() - INTERVAL '8 weeks'
      GROUP BY week
      ORDER BY week ASC
    `;

    return {
      total,
      byStatus,
      thisWeek,
      perWeek: perWeek.map((row) => ({
        week: row.week,
        count: Number(row.count),
      })),
    };
  }

  async getActivity(userId: string, id: string) {
    await this.findOne(userId, id);

    return this.prisma.activityLog.findMany({
      where: { applicationId: id },
      orderBy: { changedAt: 'asc' },
    });
  }
}
