import { Injectable } from '@nestjs/common';
import { Conversation, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class ConversationRepository {
  constructor(private prisma: PrismaService) {}

  createConversation(
    data: Prisma.ConversationCreateInput,
  ): Promise<Conversation> {
    return this.prisma.conversation.create({ data });
  }

  findUniqueConversation(
    where: Prisma.ConversationWhereUniqueInput,
  ): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({ where });
  }

  updateConversation(params: {
    where: Prisma.ConversationWhereUniqueInput;
    data: Prisma.ConversationUpdateInput;
  }): Promise<Conversation | null> {
    return this.prisma.conversation.update(params);
  }
}
