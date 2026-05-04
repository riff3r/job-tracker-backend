import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Redirect,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { User } from '@prisma/client';
import { GoogleUser } from './strategies/google.strategy';

const REFRESH_COOKIE = 'refreshToken';
// Must match JWT_REFRESH_EXPIRES_IN in .env (7d)
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // ── Cookie helpers ────────────────────────────────────────────────────────

  private get isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,            // not accessible via JS
      secure: this.isProduction, // HTTPS only in production
      sameSite: 'lax',           // CSRF protection; 'lax' allows OAuth top-level redirects
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Account created successfully')
  @ApiOperation({ summary: 'Register a new user with email and password' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...body } = await this.authService.register(dto);
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Logged in successfully')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...body } = await this.authService.login(dto);
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Token refreshed successfully')
  @ApiOperation({ summary: 'Refresh the access token using the httpOnly cookie' })
  @ApiResponse({ status: 200, description: 'New access token issued' })
  @ApiResponse({ status: 401, description: 'Refresh token invalid or expired' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies[REFRESH_COOKIE] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedException('No refresh token cookie');
    }
    const { refreshToken, ...body } = await this.authService.refresh(rawToken);
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke the refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing/invalid access token' })
  async logout(
    @CurrentUser() _user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies[REFRESH_COOKIE] as string | undefined;
    this.clearRefreshCookie(res);
    if (rawToken) {
      return this.authService.logout(rawToken);
    }
    return { message: 'Logged out successfully' };
  }

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth2 login (redirects to Google)' })
  @ApiResponse({ status: 302, description: 'Redirect to Google OAuth' })
  googleAuth(): void {
    // Passport handles the redirect
  }

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  @Redirect()
  @ApiOperation({ summary: 'Google OAuth2 callback — exchanges code for tokens' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with access token' })
  async googleCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.googleLogin(req.user as GoogleUser);
    this.setRefreshCookie(res, tokens.refreshToken);
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const url = `${frontendUrl}/auth/google/callback?accessToken=${tokens.accessToken}`;
    return { url, statusCode: HttpStatus.FOUND };
  }
}
