import { Module } from '@nestjs/common';
import { ServerLinksApiModule } from '@linkops/server/links-api';
import { ServerStreamApiModule } from '@linkops/server/stream-api';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [ServerLinksApiModule, ServerStreamApiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
