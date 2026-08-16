import { Module } from '@nestjs/common';
import { ServerA2uiAgentModule } from '@linkops/server/a2ui-agent';
import { ServerLinksApiModule } from '@linkops/server/links-api';
import { ServerStreamApiModule } from '@linkops/server/stream-api';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [ServerLinksApiModule, ServerStreamApiModule, ServerA2uiAgentModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
