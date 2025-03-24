import { Body, Controller, Post } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TestOpenAIDto } from './dto/test-open-ai.dto';

@Controller('openai')
export class OpenAIController {
  constructor(private readonly openaiService: OpenAIService) {}

  // test open ai
  @ApiOperation({
    summary: 'test open ai',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiBearerAuth()
  @Post('')
  async testOpenAI(@Body() payload: TestOpenAIDto) {
    const response = await this.openaiService.generateResponse([
      {
        role: 'system',
        content: payload.message,
      },
    ]);
    return response;
  }
}
