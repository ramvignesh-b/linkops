import { Module } from '@nestjs/common';
import { ServerLinksApiModule } from '@linkops/server/links-api';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [ServerLinksApiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
