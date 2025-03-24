import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from 'src/openai/openai.service';
import { ConversationRepository } from './repositories/conversation.repository';
import {
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
} from 'openai/resources';
import { PrismaService } from 'src/prisma.service';
import { MessageRepository } from './repositories/message.repository';

interface ConversationState {
  currentState: string;
  stateData: {
    [key: string]: {
      completed: boolean;
      data: any;
      lastUpdated: Date;
    };
  };
}
@Injectable()
export class CareerService {
  private readonly logger = new Logger(CareerService.name);
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
  private readonly CONVERSATION_STATES = {
    INITIAL: 'initial',
    INTERESTS: 'interests',
    SKILLS: 'skills',
    CHALLENGES: 'challenges',
    ASPIRATIONS: 'aspirations',
    RECOMMENDATIONS: 'recommendations',
  };

  private readonly STATE_REQUIREMENTS = {
    [this.CONVERSATION_STATES.INITIAL]: {
      requiredKeywords: ['hi', 'hello', 'hey', 'start', 'begin'],
      minMessageLength: 1,
    },
    [this.CONVERSATION_STATES.INTERESTS]: {
      requiredKeywords: [
        'like',
        'enjoy',
        'love',
        'fun',
        'interest',
        'hobby',
        'passionate',
      ],
      minMessageLength: 10,
      requiredResponseCount: 1,
    },
    [this.CONVERSATION_STATES.SKILLS]: {
      requiredKeywords: [
        'good at',
        'skill',
        'can',
        'able',
        'capable',
        'excel',
        'best at',
      ],
      minMessageLength: 15,
      requiredResponseCount: 1,
    },
    [this.CONVERSATION_STATES.CHALLENGES]: {
      requiredKeywords: [
        'challenge',
        'difficult',
        'hard',
        'struggle',
        'trying',
        'learning',
      ],
      minMessageLength: 15,
      requiredResponseCount: 1,
    },
    [this.CONVERSATION_STATES.ASPIRATIONS]: {
      requiredKeywords: [
        'want',
        'hope',
        'dream',
        'future',
        'goal',
        'plan',
        'aspire',
      ],
      minMessageLength: 15,
      requiredResponseCount: 1,
    },
  };
  constructor(
    private openAIService: OpenAIService,
    private conversationRepository: ConversationRepository,
    private messageRepository: MessageRepository,
    private prisma: PrismaService,
  ) {}

  async handleMessage(phoneNumber: string, messageContent: string) {
    try {
      // Start a Prisma transaction to ensure data consistency

      // Clean expired sessions
      await this.cleanExpiredSessions(phoneNumber);

      // Get or create conversation
      let conversation = await this.getOrCreateConversation(phoneNumber);

      // Determine current conversation state
      const { state: conversationState } =
        await this.determineConversationState(conversation);

      // Log incoming message
      await this.logMessage(conversation.id, 'user', messageContent);

      // Process message based on state
      const response = await this.processMessageByState(
        conversation,
        messageContent,
        conversationState,
      );

      // Log assistant response
      await this.logMessage(conversation.id, 'assistant', response);

      // Update conversation timestamp
      await this.updateConversationTimestamp(conversation.id);

      return response;
    } catch (error) {
      this.logger.error(
        `Error handling message: ${error.message}`,
        error.stack,
      );
      return "I apologize, but I'm having trouble processing your message right now. Could you please try again?";
    }
  }

  private async logMessage(
    conversationId: number,
    role: string,
    content: string,
  ) {
    await this.prisma.message.create({
      data: {
        role,
        content,
        conversationId,
      },
    });
  }
  private async getConversationHistory(conversationId: number) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async updateConversationTimestamp(conversationId: number) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
  }

  private async getOrCreateConversation(phoneNumber: string) {
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        phoneNumber,
        isActive: true,
        lastMessageAt: {
          gte: new Date(Date.now() - this.SESSION_TIMEOUT),
        },
      },
      include: { messages: true },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          phoneNumber,
          messages: {
            create: {
              role: 'system',
              content: `You are Rafiki, a friendly career counselor bot. You guide users through a conversation about their career interests and aspirations. You ask one question at a time and wait for responses. You maintain a warm, encouraging tone and provide specific examples to help users understand what you're asking.`,
            },
          },
        },
        include: { messages: true },
      });
    }

    return conversation;
  }

  private async processMessageByState(
    conversation: any,
    messageContent: string,
    conversationState: ConversationState,
  ): Promise<string> {
    const { currentState } = conversationState;

    // Get all messages for context
    const conversationHistory = await this.getConversationHistory(
      conversation.id,
    );

    let formattedConversationHistory =
      this.formatMessagesForContext(conversationHistory);

    console.log('formatted conversation history');

    // Format messages for OpenAI
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.getSystemPromptForState(
          currentState,
          conversationState.stateData,
        ),
      },
      ...formattedConversationHistory,
      {
        role: 'user',
        content: messageContent,
      },
    ];

    // Generate response using OpenAI
    const response = await this.openAIService.generateResponse(messages);

    console.log('response: ', response);

    // Check if we need to move to next state
    if (
      await this.shouldMoveToNextState(
        conversationState,
        messageContent,
        conversation.id,
      )
    ) {
      const nextStatePrompt = await this.getNextStatePrompt(conversationState);
      return `${response}\n\n${nextStatePrompt}`;
    }

    return response;
  }

  private getSystemPromptForState(
    currentState: string,
    stateData: any,
  ): string {
    const basePrompt = `You are Rafiki, a friendly career counselor bot. You are currently in the ${currentState} stage of the conversation.`;

    const statePrompts = {
      [this.CONVERSATION_STATES.INITIAL]:
        `${basePrompt} Warmly welcome the user and introduce yourself.`,
      [this.CONVERSATION_STATES.INTERESTS]:
        `${basePrompt} Focus on understanding their interests and passions. Ask follow-up questions if their response isn't detailed enough.`,
      [this.CONVERSATION_STATES.SKILLS]:
        `${basePrompt} Explore their skills and talents. Reference their previously mentioned interests when relevant.`,
      [this.CONVERSATION_STATES.CHALLENGES]:
        `${basePrompt} Sensitively discuss their challenges and areas for growth. Be encouraging and supportive.`,
      [this.CONVERSATION_STATES.ASPIRATIONS]:
        `${basePrompt} Help them explore their future goals and dreams. Connect their aspirations to their interests and skills.`,
      [this.CONVERSATION_STATES.RECOMMENDATIONS]:
        `${basePrompt} Provide personalized career recommendations based on all previous responses.`,
    };

    return statePrompts[currentState] || basePrompt;
  }

  private formatMessagesForContext(
    history: any[],
  ): ChatCompletionMessageParam[] {
    // Only include the last 20 messages for context to avoid token limits
    return history.slice(-20).map((msg) => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));
  }

  private async shouldMoveToNextState(
    conversationState: ConversationState,
    messageContent: string,
    conversationId: number,
  ): Promise<boolean> {
    const currentStateData =
      conversationState.stateData[conversationState.currentState];

    // If state is already complete, no need to check again

    console.log('conversationState', conversationState);

    console.log('completed reached shouldMoveToNextState', currentStateData);

    if (currentStateData.completed) {
      return true;
    }

    console.log('completed passed: shouldMoveToNextState out');

    // Check if current message completes the state
    const isComplete = await this.analyzeMessageCompleteness(
      messageContent,
      conversationState.currentState,
    );

    if (isComplete) {
      console.log('completed reached: shouldMoveToNextState if isCompleted');

      // Update state completion status
      conversationState.stateData[conversationState.currentState].completed =
        true;
      console.log('completed passed: shouldMoveToNextState if isCompleted');
      await this.storeState(conversationId, conversationState);
      return true;
    }

    return false;
  }

  private async analyzeMessageCompleteness(
    message: string,
    state: string,
  ): Promise<boolean> {
    const requirements = this.STATE_REQUIREMENTS[state];
    if (!requirements) return true;

    const messageContent = message.toLowerCase();

    // Basic requirement checks
    const hasRequiredKeywords = requirements.requiredKeywords.some((keyword) =>
      messageContent.includes(keyword),
    );
    const meetsLengthRequirement =
      messageContent.length >= requirements.minMessageLength;

    // Deep content analysis using OpenAI
    const isRelevant = await this.analyzeMessageRelevance(
      messageContent,
      state,
    );

    return hasRequiredKeywords && meetsLengthRequirement && isRelevant;
  }

  private async getNextStatePrompt(
    conversationState: ConversationState,
  ): Promise<string> {
    console.log('next state prompt ran', conversationState);

    const nextState = this.getNextState(conversationState.currentState);
    if (!nextState) {
      return 'Thank you for sharing all of that with me. Would you like to hear my career recommendations based on our conversation?';
    }

    const statePrompts = {
      [this.CONVERSATION_STATES.INTERESTS]:
        "Now, I'd love to know more about what you're really good at. What skills or talents do you have that others notice?",
      [this.CONVERSATION_STATES.SKILLS]:
        "Thank you for sharing your skills! Could you tell me about any challenges you face or areas where you'd like to improve?",
      [this.CONVERSATION_STATES.CHALLENGES]:
        "I appreciate your honesty about challenges. Let's talk about your dreams - what kind of impact would you like to make in the world?",
      [this.CONVERSATION_STATES.ASPIRATIONS]:
        "Great! Let me analyze everything you've shared to provide some personalized career recommendations.",
    };

    return statePrompts[nextState] || '';
  }

  private async getMessagesSinceLastTransition(conversationId: number) {
    const lastTransition = await this.prisma.stateTransition.findFirst({
      where: { conversationId },
      orderBy: { timestamp: 'desc' },
    });

    return this.prisma.message.findMany({
      where: {
        conversationId,
        createdAt: { gte: lastTransition?.timestamp || new Date(0) },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async analyzeCurrentState(
    state: ConversationState,
    messages: any[],
    conversationId: number,
  ) {
    const updatedState = { ...state };
    const currentState = updatedState.currentState;

    const isComplete = await this.analyzeMessageCompleteness(
      messages[messages.length - 1]?.content || '',
      currentState,
    );

    updatedState.stateData[currentState] = {
      completed: isComplete,
      data: { lastChecked: new Date() },
      lastUpdated: new Date(),
    };

    if (isComplete) {
      return this.progressToNextState(updatedState, conversationId);
    }

    return updatedState;
  }

  // This method now includes conversationId in its return type
  // private async determineConversationState(
  //   conversation: any,
  // ): Promise<{ state: ConversationState; conversationId: number }> {
  //   const messages = conversation.messages;
  //   let currentState = await this.getStoredState(conversation.id);

  //   if (!currentState) {
  //     currentState = this.initializeState();
  //   }

  //   // Get non-system messages grouped by state
  //   const stateMessages = this.groupMessagesByState(messages);

  //   console.log("stateMessages: ", stateMessages);
  //   console.log("currentState before analyzeAndUpdateState: ", currentState);

  //   // Update state data based on messages
  //   currentState = await this.analyzeAndUpdateState(
  //     currentState,
  //     stateMessages,
  //   );

  //   console.log("currentState after analyzeAndUpdateState: ", currentState);

  //   const isStateComplete = this.isStateComplete(currentState);
  //   // Determine if current state is complete and should move to next
  //   if (isStateComplete) {
  //     currentState = await this.progressToNextState(
  //       currentState,
  //       conversation.id,
  //     );
  //   }

  //   console.log("is state complete: ", isStateComplete);

  //   // Store updated state
  //   await this.storeState(conversation.id, currentState);

  //   console.log("conversation.id: ", conversation.id);

  //   return {
  //     state: currentState,
  //     conversationId: conversation.id,
  //   };
  // }

  private async determineConversationState(conversation: any) {
    let currentState =
      (await this.getStoredState(conversation.id)) || this.initializeState();

    // Get messages since last state transition
    const messages = await this.getMessagesSinceLastTransition(conversation.id);

    // Analyze only current state's messages
    currentState = await this.analyzeCurrentState(
      currentState,
      messages,
      conversation.id,
    );

    // Store updated state
    await this.storeState(conversation.id, currentState);

    return { state: currentState, conversationId: conversation.id };
  }

  private initializeState(): ConversationState {
    return {
      currentState: this.CONVERSATION_STATES.INITIAL,
      stateData: Object.values(this.CONVERSATION_STATES).reduce(
        (acc, state) => {
          acc[state] = {
            completed: false,
            data: null,
            lastUpdated: new Date(),
          };
          return acc;
        },
        {},
      ),
    };
  }

  private async getStoredState(
    conversationId: number,
  ): Promise<ConversationState | null> {
    const storedState = await this.prisma.conversationState.findUnique({
      where: { conversationId },
    });
    return storedState ? JSON.parse(storedState.stateData) : null;
  }

  private async storeState(conversationId: number, state: ConversationState) {
    await this.prisma.conversationState.upsert({
      where: { conversationId },
      update: {
        stateData: JSON.stringify(state),
        updatedAt: new Date(),
      },
      create: {
        conversationId,
        stateData: JSON.stringify(state),
      },
    });
  }

  private groupMessagesByState(messages: any[]): { [key: string]: any[] } {
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    const stateMessages: { [key: string]: any[] } = {};

    let currentState = this.CONVERSATION_STATES.INITIAL;
    console.log('nonSystemMessages: ', nonSystemMessages);

    nonSystemMessages.forEach((message) => {
      if (!stateMessages[currentState]) {
        stateMessages[currentState] = [];
      }

      stateMessages[currentState].push(message);

      // Determine if message completes current state
      if (this.isMessageComplete(message, currentState)) {
        const nextState = this.getNextState(currentState);
        if (nextState) {
          currentState = nextState;
        }
      }
    });

    return stateMessages;
  }

  private async analyzeAndUpdateState(
    currentState: ConversationState,
    stateMessages: { [key: string]: any[] },
  ): Promise<ConversationState> {
    const updatedState = { ...currentState };

    console.log('entries messages', Object.entries(stateMessages));

    for (const [state, messages] of Object.entries(stateMessages)) {
      const stateRequirements = this.STATE_REQUIREMENTS[state];
      if (!stateRequirements) continue;

      const lastMessage = messages[messages.length - 1];
      const messageContent = lastMessage.content.toLowerCase();

      // Check if message meets state requirements
      const hasRequiredKeywords = stateRequirements.requiredKeywords.some(
        (keyword) => messageContent.includes(keyword),
      );
      const meetsLengthRequirement =
        messageContent.length >= stateRequirements.minMessageLength;
      const hasRequiredResponses =
        messages.length >= (stateRequirements.requiredResponseCount || 1);

      // Use OpenAI to analyze message relevance and completeness
      const isRelevant = await this.analyzeMessageRelevance(
        messageContent,
        state,
      );

      updatedState.stateData[state] = {
        completed:
          hasRequiredKeywords &&
          meetsLengthRequirement &&
          hasRequiredResponses &&
          isRelevant,
        data: {
          lastMessage: messageContent,
          messageCount: messages.length,
          hasRequiredKeywords,
          meetsLengthRequirement,
          isRelevant,
        },
        lastUpdated: new Date(),
      };
    }

    return updatedState;
  }

  // private async analyzeMessageRelevance(
  //   message: string,
  //   state: string,
  // ): Promise<boolean> {
  //   const prompt: ChatCompletionSystemMessageParam = {
  //     role: "system",
  //     content: `Analyze if the following message is a relevant and complete response for the '${state}' stage of a career counseling conversation. Consider: 1) Is it on topic? 2) Does it provide meaningful information? 3) Is it detailed enough? Respond with true or false only.`,
  //   };

  //   const userMessage: ChatCompletionUserMessageParam = {
  //     role: "user",
  //     content: message,
  //   };

  //   const messages: ChatCompletionMessageParam[] = [prompt, userMessage];

  //   const response = await this.openAIService.generateResponse(messages);
  //   console.log("state before analyzeMessageRelevance", state);
  //   console.log("message relavance", response);

  //   return response.toLowerCase().includes("true");
  // }

  private async analyzeMessageRelevance(
    message: string,
    state: string,
  ): Promise<boolean> {
    const prompt: ChatCompletionSystemMessageParam = {
      role: 'system',
      content: `Analyze if the following message is relevant for the '${state}' stage. Respond ONLY with "true" or "false" with no punctuation.`,
    };

    const response = await this.openAIService.generateResponse([
      prompt,
      {
        role: 'user',
        content: message,
      },
    ]);

    // More robust check
    return response.trim().toLowerCase().startsWith('true');
  }

  private isStateComplete(state: ConversationState): boolean {
    const currentStateData = state.stateData[state.currentState];
    return currentStateData && currentStateData.completed;
  }

  // Update any methods that were using conversationState.conversationId
  private async progressToNextState(
    currentState: ConversationState,
    conversationId: number,
  ): Promise<ConversationState> {
    const nextState = this.getNextState(currentState.currentState);
    if (nextState) {
      currentState.currentState = nextState;
      // Log state transition
      await this.prisma.stateTransition.create({
        data: {
          conversationId,
          fromState: currentState.currentState,
          toState: nextState,
          timestamp: new Date(),
        },
      });
    }
    return currentState;
  }

  private getNextState(currentState: string): string | null {
    const states = Object.values(this.CONVERSATION_STATES);
    const currentIndex = states.indexOf(currentState);
    return currentIndex < states.length - 1 ? states[currentIndex + 1] : null;
  }

  private isMessageComplete(message: any, state: string): boolean {
    const requirements = this.STATE_REQUIREMENTS[state];
    if (!requirements) return true;

    const content = message.content.toLowerCase();
    return (
      requirements.requiredKeywords.some((keyword) =>
        content.includes(keyword),
      ) && content.length >= requirements.minMessageLength
    );
  }

  // async getConversationHistory(phoneNumber: string) {
  //   return this.prisma.conversation.({
  //     where: { phoneNumber },
  //     include: {
  //       Message: {
  //         orderBy: { createdAt: "asc" },
  //       },
  //     },
  //   });
  // }

  // async deleteConversation(phoneNumber: string) {
  //   return this.prisma.conversation.delete({
  //     where: { phoneNumber },
  //   });
  // }

  private async cleanExpiredSessions(phoneNumber: string) {
    const expiryDate = new Date(Date.now() - this.SESSION_TIMEOUT);

    await this.prisma.conversation.updateMany({
      where: {
        isActive: true,
        lastMessageAt: {
          lt: expiryDate,
        },
        phoneNumber,
      },
      data: {
        isActive: false,
      },
    });
  }

  private async generateStateBasedResponse(
    state: string,
    userMessage: string,
    conversation: any,
  ): Promise<string> {
    const statePrompts = {
      [this.CONVERSATION_STATES.INITIAL]:
        `Hi there! My name is Rafiki, and I'm your career buddy 😊 I'm so excited to meet you and help you figure out what you might love to do. Let's start by talking about the things you like the most. What's something you really enjoy or always have fun doing?

Hint: What do you love to do and get really excited about? Is there something you always pay attention to, like drawing, playing games, or learning about something fun?`,

      [this.CONVERSATION_STATES.INTERESTS]:
        `Great to learn about your interests! Now tell me what are you really good at? Maybe you're great at solving puzzles, or telling stories. Is there something at school or home that feels easy and fun for you?

Hint: What are your friends or family say you're awesome at? What's something you can do easily without trying too hard?`,

      [this.CONVERSATION_STATES.SKILLS]:
        `Wonderful! Now, I'd love to understand if there's anything you find challenging. Is there anything that makes some things hard for you to do?

Hint: It's okay to share what feels tricky - everyone has things they're still learning or practicing to get better at. 😊`,

      [this.CONVERSATION_STATES.CHALLENGES]:
        `Thank you for sharing that. I'm curious to learn what you want to do that makes the world better? For example, do you want to help people, make something cool, or solve problems?

Hint: What's your big idea for making things better? 🌍✨`,

      [this.CONVERSATION_STATES.ASPIRATIONS]:
        await this.generateCareerRecommendations(conversation),
    };

    return (
      statePrompts[state] ||
      "I'm processing everything you've shared with me. Would you like to hear my career recommendations?"
    );
  }

  private async generateCareerRecommendations(
    conversation: any,
  ): Promise<string> {
    const messages = conversation.Message.map((msg) => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    messages.push({
      role: 'system',
      content:
        'Based on all the information shared, provide 2-3 specific career recommendations. Include why each career might be a good fit and suggest one specific next step for each career path.',
    });

    return this.openAIService.generateResponse(messages);
  }
}
