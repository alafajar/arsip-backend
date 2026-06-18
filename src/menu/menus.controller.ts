import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { MenusService } from './menus.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

@Controller('menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  getTree() {
    return this.menusService.getTree();
  }

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateMenuDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.menusService.create(dto, req.user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.menusService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  deleteNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.menusService.delete(id, req.user.id);
  }
}
