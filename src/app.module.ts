import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatbotModule } from './chatbot/chatbot.module';
import { OpenaiModule } from './openai/openai.module';
import { CareerModule } from './career/career.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ChatbotModule,
    OpenaiModule,
    CareerModule,
    WhatsappModule,
    ConfigModule.forRoot({
      // load: [configuration],
      isGlobal: true,
      cache: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
