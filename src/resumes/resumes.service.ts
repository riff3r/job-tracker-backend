import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { FileType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_MIMETYPES: Record<string, FileType> = {
  'application/pdf': FileType.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    FileType.DOCX,
};

const UPLOADS_BASE = path.resolve('./uploads/resumes');

@Injectable()
export class ResumesService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(
    userId: string,
    file: Express.Multer.File | undefined,
    label: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!label || label.trim().length === 0) {
      fs.unlinkSync(file.path);
      throw new BadRequestException('Label is required');
    }

    const fileType = ALLOWED_MIMETYPES[file.mimetype];
    if (!fileType) {
      fs.unlinkSync(file.path);
      throw new UnsupportedMediaTypeException('Only PDF and DOCX files are allowed');
    }

    const lastVersion = await this.prisma.resume.findFirst({
      where: { userId, label: label.trim() },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const version = (lastVersion?.version ?? 0) + 1;

    return this.prisma.resume.create({
      data: {
        userId,
        label: label.trim(),
        filePath: file.path,
        fileType,
        version,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.resume.findMany({
      where: { userId },
      orderBy: [{ label: 'asc' }, { version: 'desc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const resume = await this.prisma.resume.findUnique({ where: { id } });

    if (!resume) {
      throw new NotFoundException('Resume not found');
    }

    if (resume.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return resume;
  }

  async getFilePath(userId: string, id: string): Promise<string> {
    const resume = await this.findOne(userId, id);
    const absPath = path.resolve(resume.filePath);

    // Guard against path traversal — resolved path must stay within uploads dir
    if (!absPath.startsWith(UPLOADS_BASE + path.sep) && absPath !== UPLOADS_BASE) {
      throw new ForbiddenException('Access denied');
    }

    if (!fs.existsSync(absPath)) {
      throw new NotFoundException('File not found on disk');
    }

    return absPath;
  }

  async remove(userId: string, id: string) {
    const resume = await this.findOne(userId, id);
    const absPath = path.resolve(resume.filePath);

    try {
      fs.unlinkSync(absPath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        // File exists but couldn't be deleted — do not delete the DB record
        throw new InternalServerErrorException('Failed to delete resume file');
      }
    }

    await this.prisma.resume.delete({ where: { id } });

    return { message: 'Resume deleted' };
  }
}
