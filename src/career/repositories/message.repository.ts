import { Injectable } from '@nestjs/common';
import { Conversation, Message, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class MessageRepository {
  constructor(private prisma: PrismaService) {}

  createMessage(data: Prisma.MessageCreateInput): Promise<Message> {
    return this.prisma.message.create({ data });
  }

  createManyMessages(
    data: Prisma.MessageCreateManyInput[],
  ): Promise<Prisma.BatchPayload> {
    return this.prisma.message.createMany({ data });
  }
}
