import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from './entities/user.entity';
import { UserRole } from './entities/role.entity';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwtSecret') || 'change-me-in-production',
    });
  }

  /** Whatever this returns is attached to `req.user`. */
  validate(payload: JwtPayload): AuthUser {
    return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
  }
}
