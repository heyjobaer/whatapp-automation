import { IsEmail, IsString, IsNotEmpty, MinLength, MaxLength, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../entities/role.entity';

export class CreateUserDto {
  @ApiProperty({ example: 'operator@openwa.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'strong-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @ApiProperty({ example: 'Jane Operator' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: UserRole, example: UserRole.ADMIN })
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jane Operator' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: 'new-strong-password', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
