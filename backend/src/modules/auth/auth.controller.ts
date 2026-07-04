import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, CreateUserDto, UpdateUserDto } from './dto';
import { Public, RequireRole, CurrentUser } from './decorators/auth.decorators';
import { UserRole } from './entities/role.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Log in with email & password, returns a JWT' })
  @ApiResponse({ status: 201, description: 'Authenticated; returns { token, user }' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  me(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  // ===== User management (SUPER_ADMIN only) =====

  @Get('users')
  @ApiBearerAuth()
  @RequireRole(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all users (SUPER_ADMIN)' })
  listUsers() {
    return this.authService.listUsers();
  }

  @Post('users')
  @ApiBearerAuth()
  @RequireRole(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a user with a role (SUPER_ADMIN)' })
  createUser(@Body() dto: CreateUserDto) {
    return this.authService.createUser(dto);
  }

  @Patch('users/:id')
  @ApiBearerAuth()
  @RequireRole(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a user (name/role/password/isActive) (SUPER_ADMIN)' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.authService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @ApiBearerAuth()
  @RequireRole(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a user (SUPER_ADMIN)' })
  async deleteUser(@Param('id') id: string, @CurrentUser('id') actingUserId: string) {
    await this.authService.deleteUser(id, actingUserId);
    return { deleted: true };
  }
}
