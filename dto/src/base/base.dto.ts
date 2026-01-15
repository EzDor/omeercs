import 'reflect-metadata';

export abstract class BaseDto {
  declare id: string;
  declare createdAt?: Date;
  declare updatedAt?: Date;
}
