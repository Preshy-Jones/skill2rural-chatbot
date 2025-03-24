import { IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class HandleMessageDto {
  @ApiProperty({
    type: String,
    description: 'The message body',
    required: true,
  })
  @IsNotEmpty()
  Body: string;

  @ApiProperty({
    type: String,
    description: 'The sender phone number',
    required: true,
  })
  @IsNotEmpty()
  From: string;
}
