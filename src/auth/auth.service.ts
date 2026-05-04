import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleUser } from './strategies/google.strategy';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'passwordHash'>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
      },
    });

    return this.generateTokens(user);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Please sign in with Google');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user);
  }

  async googleLogin(googleUser: GoogleUser): Promise<TokenPair> {
    let user = await this.prisma.user.findUnique({
      where: { googleId: googleUser.googleId },
    });

    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      if (user) {
        // Existing password account — link googleId
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId: googleUser.googleId },
        });
      } else {
        // Brand-new user via Google
        user = await this.prisma.user.create({
          data: {
            email: googleUser.email,
            name: googleUser.name,
            avatarUrl: googleUser.avatarUrl,
            googleId: googleUser.googleId,
          },
        });
      }
    }

    return this.generateTokens(user);
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const hashed = this.hashToken(rawRefreshToken);

    // Find and consume the token inside a transaction so that concurrent
    // requests with the same cookie can't both pass the existence check
    // before one of them deletes the record (TOCTOU race condition).
    const record = await this.prisma.$transaction(async (tx) => {
      const found = await tx.refreshToken.findFirst({
        where: { token: hashed, expiresAt: { gt: new Date() } },
        include: { user: true },
      });

      if (!found) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // deleteMany returns a count instead of throwing when the row is gone,
      // which handles the residual race window inside the transaction.
      const { count } = await tx.refreshToken.deleteMany({
        where: { id: found.id },
      });

      if (count === 0) {
        throw new UnauthorizedException('Refresh token already used');
      }

      return found;
    });

    return this.generateTokens(record.user);
  }

  async logout(rawRefreshToken: string): Promise<{ message: string }> {
    const hashed = this.hashToken(rawRefreshToken);

    await this.prisma.refreshToken
      .delete({ where: { token: hashed } })
      .catch(() => {
        // Silently ignore if token does not exist
      });

    return { message: 'Logged out successfully' };
  }

  private async generateTokens(user: User): Promise<TokenPair> {
    const payload = { sub: user.id, email: user.email };
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const expiresIn = this.configService.getOrThrow<string>('JWT_EXPIRES_IN');
    const refreshExpiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    const signOptions: JwtSignOptions = {
      secret,
      // expiresIn accepts StringValue (e.g. '15m') at runtime; cast needed for strict types
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    };
    const accessToken = this.jwtService.sign(payload, signOptions);

    // Generate raw refresh token and store its hash
    const rawToken = crypto.randomBytes(64).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + this.parseExpiry(refreshExpiresIn),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    // Purge any expired tokens for this user — fire-and-forget so it never
    // delays the login/refresh response.
    this.prisma.refreshToken
      .deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } })
      .catch(() => {/* non-critical — ignore failures */});

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _omit, ...sanitizedUser } = user;

    return { accessToken, refreshToken: rawToken, user: sanitizedUser };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);

    if (unit === 'd') return value * 24 * 60 * 60 * 1000;
    if (unit === 'm') return value * 60 * 1000;

    throw new Error(`Unsupported expiry format: ${expiry}`);
  }
}
