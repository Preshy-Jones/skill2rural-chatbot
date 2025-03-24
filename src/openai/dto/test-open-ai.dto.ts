import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class TestOpenAIDto {
  @ApiProperty({
    example: 'What is your name?',
    description: 'The message to send to the AI model',
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}
