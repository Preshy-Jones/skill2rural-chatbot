import { Module } from '@nestjs/common';
import { CareerService } from './career.service';
import { CareerController } from './career.controller';
import { OpenaiModule } from 'src/openai/openai.module';
import { OpenAIService } from 'src/openai/openai.service';
import { ConversationRepository } from './repositories/conversation.repository';
import { PrismaService } from 'src/prisma.service';
import { MessageRepository } from './repositories/message.repository';

@Module({
  imports: [OpenaiModule],
  controllers: [CareerController],
  providers: [
    CareerService,
    OpenAIService,
    ConversationRepository,
    PrismaService,
    MessageRepository,
  ],
})
export class CareerModule {}
