import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token issued at login or register' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
