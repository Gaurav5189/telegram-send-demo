import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context, InlineKeyboard } from 'grammy';

/** The callback_data values used by the inline keyboard below. */
type ActionData = 'action_done' | 'action_snooze';

const ACTION_LABELS: Record<ActionData, string> = {
  action_done: 'Marked as done ✅',
  action_snooze: 'Snoozed ⏰',
};

function isActionData(data: string): data is ActionData {
  return data === 'action_done' || data === 'action_snooze';
}

/** Inline keyboard attached to every notification. */
function notificationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Mark Done ✅', 'action_done')
    .text('Snooze ⏰', 'action_snooze');
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token: string;
  private bot?: Bot;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('TELEGRAM_BOT_TOKEN')?.trim() ?? '';
  }

  onModuleInit(): void {
    if (!this.token) {
      throw new Error(
        'TELEGRAM_BOT_TOKEN is missing. Copy backend/.env.example to backend/.env and set the token from @BotFather.',
      );
    }

    this.bot = new Bot(this.token);
    this.registerHandlers();

    // Never leave an unhandled rejection from the polling loop.
    this.bot.catch((error) => {
      this.logger.error(`Telegram bot error: ${error.message}`, error.stack);
    });

    // bot.start() resolves only when polling stops, so it must not be awaited here.
    void this.bot
      .start({
        onStart: (me) => this.logger.log(`Telegram bot @${me.username} is polling`),
      })
      .catch((error: Error) => {
        this.logger.error(`Telegram bot failed to start: ${error.message}`);
      });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.stop();
      this.logger.log('Telegram bot stopped');
    } catch (error) {
      this.logger.error(`Telegram bot failed to stop cleanly: ${(error as Error).message}`);
    }
  }

  /** Sends `text` to `chatId` with the Mark Done / Snooze inline keyboard. */
  async sendNotification(chatId: string, text: string): Promise<number> {
    const bot = this.requireBot();

    const message = await bot.api.sendMessage(chatId, text, {
      reply_markup: notificationKeyboard(),
    });

    this.logger.log(`Notification sent to chat ${chatId} (message ${message.message_id})`);
    return message.message_id;
  }

  private requireBot(): Bot {
    if (!this.bot) {
      throw new Error('Telegram bot is not initialised yet');
    }
    return this.bot;
  }

  private registerHandlers(): void {
    const bot = this.requireBot();

    bot.command('start', async (ctx) => {
      await ctx.reply(`Welcome! Your Chat ID is: ${ctx.chat.id}`);
    });

    bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;

      // Always acknowledge, otherwise the client spins for ~30s.
      await ctx.answerCallbackQuery(
        isActionData(data) ? { text: ACTION_LABELS[data] } : undefined,
      );

      if (!isActionData(data)) return;

      await this.replaceNotificationStatus(ctx, ACTION_LABELS[data]);
    });
  }

  /**
   * Rewrites the notification in place, dropping the inline keyboard so the
   * action cannot be tapped twice.
   */
  private async replaceNotificationStatus(ctx: Context, status: string): Promise<void> {
    const original = ctx.callbackQuery?.message?.text;

    if (!original) {
      this.logger.warn('Callback query has no editable text message; skipping edit');
      return;
    }

    // Strip a status appended by an earlier tap before adding the new one.
    const base = original.split('\n\n— ')[0];

    try {
      await ctx.editMessageText(`${base}\n\n— ${status}`, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch (error) {
      // A repeated tap can hit "message is not modified"; that is harmless.
      this.logger.debug(`Could not edit notification: ${(error as Error).message}`);
    }
  }
}
