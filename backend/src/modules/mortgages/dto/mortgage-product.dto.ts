import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsNotEmpty, Min, MaxLength } from 'class-validator';

export class CreateMortgageProductDto {
  @ApiProperty({ description: 'Lender / bank name', example: 'Nationwide' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lender: string;

  @ApiProperty({ description: 'Product name', example: '5 Year Fixed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  productName: string;

  @ApiPropertyOptional({
    description: 'Category: residential | first-time-buyer | home-mover | remortgage | buy-to-let',
    example: 'first-time-buyer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @ApiPropertyOptional({ description: 'Rate type: fixed | tracker | discount | variable', example: 'fixed' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rateType?: string;

  @ApiProperty({ description: 'Initial (headline) rate %', example: 4.44 })
  @IsNumber()
  initialRate: number;

  @ApiPropertyOptional({ description: 'Initial period in months', example: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  initialPeriodMonths?: number;

  @ApiPropertyOptional({ description: 'Reversion (SVR) rate %', example: 7.99 })
  @IsOptional()
  @IsNumber()
  followOnRate?: number;

  @ApiPropertyOptional({ description: 'Maximum loan-to-value %', example: 90 })
  @IsOptional()
  @IsNumber()
  maxLtvPercent?: number;

  @ApiPropertyOptional({ description: 'Maximum term in years', example: 40 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxTermYears?: number;

  @ApiPropertyOptional({ description: 'Product fee (GBP, 0 = fee-free)', example: 999 })
  @IsOptional()
  @IsNumber()
  productFee?: number;

  @ApiPropertyOptional({ description: 'Repayment type: repayment | interest-only', example: 'repayment' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  repaymentType?: string;

  @ApiPropertyOptional({ description: 'Early repayment charge applies during the initial period', example: true })
  @IsOptional()
  @IsBoolean()
  ercApplies?: boolean;

  @ApiPropertyOptional({ description: 'Status', example: 'available' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({ description: 'Description / notes (used by the AI to answer clients)' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateMortgageProductDto extends CreateMortgageProductDto {}

export class UpdateStatusDto {
  @ApiProperty({ description: 'New status', example: 'withdrawn' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  status: string;
}
