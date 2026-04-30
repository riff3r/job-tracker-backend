import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { QueryApplicationDto } from './dto/query-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@ApiTags('Applications')
@ApiBearerAuth()
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new job application' })
  @ApiResponse({ status: 201, description: 'Application created' })
  create(@CurrentUser() user: User, @Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all job applications (with filtering & pagination)' })
  @ApiResponse({ status: 200, description: 'Paginated list of applications' })
  findAll(@CurrentUser() user: User, @Query() query: QueryApplicationDto) {
    return this.applicationsService.findAll(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single job application' })
  @ApiResponse({ status: 200, description: 'Application details' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.applicationsService.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a job application' })
  @ApiResponse({ status: 200, description: 'Application updated' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applicationsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a job application' })
  @ApiResponse({ status: 200, description: 'Application deleted' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.applicationsService.remove(user.id, id);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Get status-change history for an application' })
  @ApiResponse({ status: 200, description: 'Activity log entries' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  getActivity(@CurrentUser() user: User, @Param('id') id: string) {
    return this.applicationsService.getActivity(user.id, id);
  }
}
