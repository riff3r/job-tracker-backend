import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ResponseMessage('Profile fetched successfully')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  getProfile(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  @ResponseMessage('Profile updated successfully')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateUserDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete the current user account' })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  deleteAccount(@CurrentUser() user: User) {
    return this.usersService.deleteAccount(user.id);
  }
}
