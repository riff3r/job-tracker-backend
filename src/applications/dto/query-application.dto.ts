import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryApplicationDto {
  @ApiPropertyOptional({ enum: ApplicationStatus })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiPropertyOptional({ example: 'Google', description: 'Search by company or role' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  search?: string;

  @ApiPropertyOptional({
    example: '2026-05-07T00:00:00.000Z',
    description: 'Return applications with followUpDate on or before this date',
  })
  @IsOptional()
  @IsDateString()
  followUpDateBefore?: string;

  @ApiPropertyOptional({
    example: '2026-04-30T00:00:00.000Z',
    description: 'Return applications with followUpDate on or after this date',
  })
  @IsOptional()
  @IsDateString()
  followUpDateAfter?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
