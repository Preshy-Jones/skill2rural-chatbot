import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { CareerService } from 'src/career/career.service';
import { CareerModule } from 'src/career/career.module';
import { OpenAIService } from 'src/openai/openai.service';
import { ConversationRepository } from 'src/career/repositories/conversation.repository';
import { PrismaService } from 'src/prisma.service';
import { MessageRepository } from 'src/career/repositories/message.repository';

@Module({
  imports: [CareerModule],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    CareerService,
    OpenAIService,
    ConversationRepository,
    PrismaService,
    MessageRepository,
  ],
})
export class WhatsappModule {}
