import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResumesService } from './resumes.service';

const storage = diskStorage({
  destination: './uploads/resumes',
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

@ApiTags('Resumes')
@ApiBearerAuth()
@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumesService: ResumesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage }))
  @ApiOperation({ summary: 'Upload a resume (PDF or DOCX)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'label'],
      properties: {
        file: { type: 'string', format: 'binary' },
        label: { type: 'string', example: 'Software Engineer Resume' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Resume uploaded' })
  @ApiResponse({ status: 415, description: 'Unsupported file type' })
  upload(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Query('label') label: string,
  ) {
    return this.resumesService.upload(user.id, file, label ?? file.originalname);
  }

  @Get()
  @ApiOperation({ summary: 'List all resumes for the current user' })
  @ApiResponse({ status: 200, description: 'List of resumes' })
  findAll(@CurrentUser() user: User) {
    return this.resumesService.findAll(user.id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a resume file' })
  @ApiQuery({ name: 'id', description: 'Resume ID' })
  @ApiResponse({ status: 200, description: 'File stream' })
  @ApiResponse({ status: 404, description: 'Resume not found' })
  async download(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const filePath = await this.resumesService.getFilePath(user.id, id);
    res.download(filePath);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a resume' })
  @ApiResponse({ status: 200, description: 'Resume deleted' })
  @ApiResponse({ status: 404, description: 'Resume not found' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.resumesService.remove(user.id, id);
  }
}
