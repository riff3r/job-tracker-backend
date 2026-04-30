import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateApplicationDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MaxLength(200)
  company: string;

  @ApiProperty({ example: 'Software Engineer' })
  @IsString()
  @MaxLength(200)
  role: string;

  @ApiPropertyOptional({ example: 'https://jobs.example.com/123' })
  @IsOptional()
  @IsUrl()
  jobUrl?: string;

  @ApiPropertyOptional({ example: 'Remote' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: '$120,000 - $150,000' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  salary?: string;

  @ApiPropertyOptional({ example: 'Referred by Jane Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({ enum: ApplicationStatus, default: ApplicationStatus.WISHLIST })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiPropertyOptional({ example: '2026-04-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  appliedAt?: string;

  @ApiPropertyOptional({ example: '2026-05-07T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  followUpDate?: string;
}
