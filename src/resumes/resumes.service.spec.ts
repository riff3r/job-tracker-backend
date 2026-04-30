import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FileType } from '@prisma/client';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { ResumesService } from './resumes.service';

jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

const USER_ID = 'user-1';
const RESUME_ID = 'resume-1';

const makeFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'resume.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 1024,
  destination: './uploads/resumes',
  filename: 'uuid.pdf',
  path: './uploads/resumes/uuid.pdf',
  buffer: Buffer.from(''),
  stream: null as never,
  ...overrides,
});

const makeResume = (overrides: Record<string, unknown> = {}) => ({
  id: RESUME_ID,
  userId: USER_ID,
  label: 'My Resume',
  filePath: './uploads/resumes/uuid.pdf',
  fileType: FileType.PDF,
  version: 1,
  createdAt: new Date(),
  ...overrides,
});

const mockPrisma = {
  resume: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
};

describe('ResumesService', () => {
  let service: ResumesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ResumesService>(ResumesService);
    jest.clearAllMocks();
  });

  // ─── upload ────────────────────────────────────────────────────────────────

  describe('upload', () => {
    it('uploads a PDF and creates a resume record with version 1', async () => {
      const file = makeFile();
      const resume = makeResume();
      mockPrisma.resume.findFirst.mockResolvedValue(null);
      mockPrisma.resume.create.mockResolvedValue(resume);

      const result = await service.upload(USER_ID, file, 'My Resume');

      expect(mockPrisma.resume.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            label: 'My Resume',
            fileType: FileType.PDF,
            version: 1,
          }),
        }),
      );
      expect(result).toEqual(resume);
    });

    it('auto-increments version for same label', async () => {
      mockPrisma.resume.findFirst.mockResolvedValue({ version: 2 });
      mockPrisma.resume.create.mockResolvedValue(makeResume({ version: 3 }));

      await service.upload(USER_ID, makeFile(), 'My Resume');

      expect(mockPrisma.resume.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 3 }) }),
      );
    });

    it('throws BadRequestException when file is missing', async () => {
      await expect(service.upload(USER_ID, undefined, 'My Resume')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when label is empty', async () => {
      mockFs.unlinkSync.mockImplementation(() => {});

      await expect(service.upload(USER_ID, makeFile(), '   ')).rejects.toThrow(BadRequestException);
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('throws UnsupportedMediaTypeException for invalid file type', async () => {
      mockFs.unlinkSync.mockImplementation(() => {});

      await expect(
        service.upload(USER_ID, makeFile({ mimetype: 'image/png' }), 'My Resume'),
      ).rejects.toThrow(UnsupportedMediaTypeException);
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('trims whitespace from label', async () => {
      mockPrisma.resume.findFirst.mockResolvedValue(null);
      mockPrisma.resume.create.mockResolvedValue(makeResume());

      await service.upload(USER_ID, makeFile(), '  My Resume  ');

      expect(mockPrisma.resume.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ label: 'My Resume' }) }),
      );
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all resumes for the user', async () => {
      const resumes = [makeResume()];
      mockPrisma.resume.findMany.mockResolvedValue(resumes);

      const result = await service.findAll(USER_ID);
      expect(result).toEqual(resumes);
      expect(mockPrisma.resume.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
    });
  });

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns resume when found and owned', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(makeResume());

      const result = await service.findOne(USER_ID, RESUME_ID);
      expect(result.id).toBe(RESUME_ID);
    });

    it('throws NotFoundException when resume does not exist', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(null);

      await expect(service.findOne(USER_ID, RESUME_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when resume belongs to another user', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(makeResume({ userId: 'other-user' }));

      await expect(service.findOne(USER_ID, RESUME_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── getFilePath ───────────────────────────────────────────────────────────

  describe('getFilePath', () => {
    it('returns absolute path when file exists', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(makeResume());
      mockFs.existsSync.mockReturnValue(true);

      const result = await service.getFilePath(USER_ID, RESUME_ID);
      expect(result).toContain('uuid.pdf');
    });

    it('throws NotFoundException when file missing from disk', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(makeResume());
      mockFs.existsSync.mockReturnValue(false);

      await expect(service.getFilePath(USER_ID, RESUME_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes file and DB record, returns success message', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(makeResume());
      mockFs.unlinkSync.mockImplementation(() => {});
      mockPrisma.resume.delete.mockResolvedValue({});

      const result = await service.remove(USER_ID, RESUME_ID);

      expect(mockFs.unlinkSync).toHaveBeenCalled();
      expect(mockPrisma.resume.delete).toHaveBeenCalledWith({ where: { id: RESUME_ID } });
      expect(result.message).toBe('Resume deleted successfully');
    });

    it('proceeds with DB delete when file already gone (ENOENT)', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(makeResume());
      const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
      mockFs.unlinkSync.mockImplementation(() => { throw enoent; });
      mockPrisma.resume.delete.mockResolvedValue({});

      await expect(service.remove(USER_ID, RESUME_ID)).resolves.toBeDefined();
      expect(mockPrisma.resume.delete).toHaveBeenCalled();
    });

    it('throws InternalServerErrorException when file delete fails for other reasons', async () => {
      mockPrisma.resume.findUnique.mockResolvedValue(makeResume());
      const permErr = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      mockFs.unlinkSync.mockImplementation(() => { throw permErr; });

      await expect(service.remove(USER_ID, RESUME_ID)).rejects.toThrow(InternalServerErrorException);
      expect(mockPrisma.resume.delete).not.toHaveBeenCalled();
    });
  });
});
