import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TelegramService } from './telegram.service';

interface SendNotificationBody {
  chatId?: string | number;
  message?: string;
}

const MAX_MESSAGE_LENGTH = 4096; // Telegram's per-message limit

@Controller('api/telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(@Body() body: SendNotificationBody) {
    const chatId = body?.chatId === undefined || body?.chatId === null ? '' : String(body.chatId).trim();
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!/^-?\d+$/.test(chatId)) {
      throw new BadRequestException('"chatId" must be a numeric Telegram chat ID, e.g. 123456789.');
    }

    if (!message) {
      throw new BadRequestException('"message" is required.');
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `"message" must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      );
    }

    try {
      const messageId = await this.telegramService.sendNotification(chatId, message);
      return { ok: true, messageId };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown Telegram API error';
      throw new BadGatewayException(`Telegram could not deliver the message: ${reason}`);
    }
  }

  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Bot username and public t.me link, used by the "Connect Telegram" button. */
  @Get('bot')
  async bot(): Promise<{ username: string; deepLink: string }> {
    try {
      return await this.telegramService.getBotInfo();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown Telegram API error';
      throw new ServiceUnavailableException(`Telegram bot is not reachable yet: ${reason}`);
    }
  }

  /** Starts a one-time linking handshake. */
  @Post('link')
  @HttpCode(HttpStatus.OK)
  async createLink() {
    try {
      return await this.telegramService.createConnectLink();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown Telegram API error';
      throw new ServiceUnavailableException(`Could not create a connect link: ${reason}`);
    }
  }

  /** Polled by the UI until the user presses Start in Telegram. */
  @Get('link/:code')
  linkStatus(@Param('code') code: string) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
      throw new BadRequestException('Invalid connect code.');
    }
    return this.telegramService.getLinkStatus(code);
  }
}
