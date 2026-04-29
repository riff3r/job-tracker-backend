import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleUser {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(configService: ConfigService) {
    const clientID =
      configService.get<string>('GOOGLE_CLIENT_ID') || 'PLACEHOLDER_CLIENT_ID';
    const clientSecret =
      configService.get<string>('GOOGLE_CLIENT_SECRET') ||
      'PLACEHOLDER_CLIENT_SECRET';
    const callbackURL =
      configService.get<string>('GOOGLE_CALLBACK_URL') ||
      'http://localhost:3000/v1/auth/google/callback';

    super({ clientID, clientSecret, callbackURL, scope: ['email', 'profile'] });

    if (!configService.get<string>('GOOGLE_CLIENT_ID')) {
      this.logger.warn(
        'GOOGLE_CLIENT_ID is not set. Google OAuth routes will not work.',
      );
    }
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value ?? '';
    const name =
      profile.displayName ??
      `${profile.name?.givenName ?? ''} ${profile.name?.familyName ?? ''}`.trim();
    const avatarUrl = profile.photos?.[0]?.value ?? null;

    const googleUser: GoogleUser = {
      googleId: profile.id,
      email,
      name,
      avatarUrl,
    };

    done(null, googleUser);
  }
}
