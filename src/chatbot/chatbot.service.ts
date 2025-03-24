import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatbotService {
  async webhook(body: any) {
    console.log(body);
    return { status: 'ok' };
  }
}
