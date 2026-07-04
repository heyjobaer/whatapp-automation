import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsNotEmpty, Min, MaxLength } from 'class-validator';

export class CreatePropertyDto {
  @ApiProperty({ description: 'Property/listing name', example: 'Emaar Beachfront — Marina Vista' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Area / location', example: 'Dubai Marina' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  area: string;

  @ApiProperty({ description: 'Property type', example: 'Apartment' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  type: string;

  @ApiPropertyOptional({ description: 'Number of bedrooms', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ description: 'Price in AED', example: 5500000 })
  @IsOptional()
  @IsNumber()
  priceAed?: number;

  @ApiProperty({ description: 'Price in USD', example: 1500000 })
  @IsNumber()
  priceUsd: number;

  @ApiPropertyOptional({ description: 'Expected ROI percentage', example: 7.5 })
  @IsOptional()
  @IsNumber()
  roiPercent?: number;

  @ApiPropertyOptional({ description: 'Listing status', example: 'available' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({ description: 'Handover date label', example: 'Q4 2026' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  handoverDate?: string;

  @ApiPropertyOptional({ description: 'Off-plan property', example: false })
  @IsOptional()
  @IsBoolean()
  isOffplan?: boolean;

  @ApiPropertyOptional({ description: 'Developer', example: 'Emaar' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  developer?: string;

  @ApiPropertyOptional({ description: 'Description (used by the AI to answer customers)' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Brochure URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  brochureUrl?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}

export class UpdatePropertyDto extends CreatePropertyDto {}

export class UpdateStatusDto {
  @ApiProperty({ description: 'New status', example: 'reserved' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  status: string;
}
