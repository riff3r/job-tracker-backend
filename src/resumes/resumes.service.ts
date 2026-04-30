import {
  ForbiddenException,
  Injectable,
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

@Injectable()
export class ResumesService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(
    userId: string,
    file: Express.Multer.File,
    label: string,
  ) {
    const fileType = ALLOWED_MIMETYPES[file.mimetype];
    if (!fileType) {
      fs.unlinkSync(file.path);
      throw new UnsupportedMediaTypeException('Only PDF and DOCX files are allowed');
    }

    const lastVersion = await this.prisma.resume.findFirst({
      where: { userId, label },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const version = (lastVersion?.version ?? 0) + 1;

    return this.prisma.resume.create({
      data: {
        userId,
        label,
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
      throw new ForbiddenException();
    }

    return resume;
  }

  async getFilePath(userId: string, id: string): Promise<string> {
    const resume = await this.findOne(userId, id);
    const absPath = path.resolve(resume.filePath);

    if (!fs.existsSync(absPath)) {
      throw new NotFoundException('File not found on disk');
    }

    return absPath;
  }

  async remove(userId: string, id: string) {
    const resume = await this.findOne(userId, id);

    // Delete file from disk (ignore errors if already gone)
    try {
      fs.unlinkSync(path.resolve(resume.filePath));
    } catch {
      // File may have already been removed
    }

    await this.prisma.resume.delete({ where: { id } });

    return { message: 'Resume deleted' };
  }
}
