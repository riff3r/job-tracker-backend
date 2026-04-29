import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const expiresIn = configService.getOrThrow<string>('JWT_EXPIRES_IN');
        return {
          secret: configService.getOrThrow<string>('JWT_SECRET'),
          signOptions: {
            // ConfigService returns string; cast needed for @nestjs/jwt's ms.StringValue brand
            expiresIn: expiresIn as unknown as JwtModuleOptions['signOptions'] extends infer O
              ? O extends { expiresIn?: infer E }
                ? E
                : never
              : never,
          },
        };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

