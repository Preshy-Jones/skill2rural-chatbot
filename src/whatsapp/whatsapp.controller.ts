import { Body, Controller, Post } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { CareerService } from 'src/career/career.service';
import { HandleMessageDto } from './dto/handle-message.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Whatsapp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly careerService: CareerService,
  ) {}

  @ApiOperation({
    summary: 'Handle incoming messages from WhatsApp',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiBearerAuth()
  @Post('webhook')
  async handleMessage(@Body() handleMessageDto: HandleMessageDto) {
    console.log('Received message:', handleMessageDto);

    const message = handleMessageDto.Body;
    const from = handleMessageDto.From;

    const response = await this.careerService.handleMessage(from, message);
    await this.whatsappService.sendMessage(from, response);
  }
}
