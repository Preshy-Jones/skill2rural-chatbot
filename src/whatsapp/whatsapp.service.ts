// src/modules/whatsapp/whatsapp.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

@Injectable()
export class WhatsappService {
  private client: Twilio;
  private fromNumber: string;
  private readonly logger = new Logger(WhatsappService.name);
  private readonly CHARACTER_LIMIT = 1600;

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    // console.log('authToken', authToken);
    // console.log('accountSid', accountSid);

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not found in environment');
    }

    this.fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER');
    this.client = new Twilio(accountSid, authToken);
  }

  async sendMessage(to: string, message: string) {
    try {
      // Split message if it exceeds character limit
      const messageParts = this.splitMessage(message);

      for (const part of messageParts) {
        await this.client.messages.create({
          body: part,
          from: 'whatsapp:+14155238886', // Twilio's test number
          to,
        });

        // Add small delay between messages if sending multiple parts
        if (messageParts.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      this.logger.log(`Test message sent to ${to}: ${message}`);
    } catch (error) {
      this.logger.error('WhatsApp Message Error:', error);
      throw new Error('Failed to send WhatsApp message');
    }
  }

  private splitMessage(message: string): string[] {
    if (message.length <= this.CHARACTER_LIMIT) {
      return [message];
    }

    const parts: string[] = [];
    let remainingMessage = message;

    while (remainingMessage.length > 0) {
      let part: string;
      if (remainingMessage.length > this.CHARACTER_LIMIT) {
        // Find last complete sentence or word within limit
        let splitIndex = remainingMessage.lastIndexOf(
          '. ',
          this.CHARACTER_LIMIT,
        );
        if (splitIndex === -1) {
          splitIndex = remainingMessage.lastIndexOf(' ', this.CHARACTER_LIMIT);
        }
        if (splitIndex === -1) {
          splitIndex = this.CHARACTER_LIMIT;
        }
        part = remainingMessage.substring(0, splitIndex);
        remainingMessage = remainingMessage.substring(splitIndex).trim();
      } else {
        part = remainingMessage;
        remainingMessage = '';
      }
      parts.push(part);
    }

    return parts;
  }
}

// // Verify webhook signature
// verifyWebhook(signature: string, url: string, params: any): boolean {
//   try {
//     return this.client.validateRequest(
//       this.configService.get<string>('TWILIO_AUTH_TOKEN'),
//       signature,
//       url,
//       params,
//     );
//   } catch (error) {
//     return false;
//   }
// }
