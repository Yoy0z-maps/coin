import { AlertEngine } from './alert-engine.service';
import { NotificationModule } from '../notification/notification.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BithumbModule } from '../bithumb/bithumb.module';
import { StateModule } from '../state/state.module';
import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';
@Module({ imports: [DatabaseModule, BithumbModule, StateModule, NotificationModule], providers: [AlertService, AlertEngine], controllers: [AlertController] })
export class AlertModule {}
