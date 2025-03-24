import { Body, Controller, Post } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('whatsapp-webhook')
  async webhook(@Body() body: any) {
    return this.chatbotService.webhook(body);
  }
}

