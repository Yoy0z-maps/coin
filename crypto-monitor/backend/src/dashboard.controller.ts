import { Controller, Get, Res } from '@nestjs/common';
import { join } from 'node:path';
@Controller()
export class DashboardController {
  @Get()
  index(@Res() response: { sendFile: (path: string) => void }) {
    response.sendFile(join(__dirname, '../public/index.html'));
  }
}
