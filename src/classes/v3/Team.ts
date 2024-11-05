import { BaseClass } from './BaseClass.js';

export interface TeamInterface {
  id: number;
  name: string;
}

export class Team extends BaseClass implements TeamInterface {
  public id: number;
  public name: string;

  constructor(obj: TeamInterface, throwMissing = true) {
    super();

    this.checkMissingAndThrow(
      obj,
      {
        id: 'number',
        name: 'string',
      },
      throwMissing,
    );

    this.id = obj.id;
    this.name = obj.name;
  }

  getName(): string {
    return this.name;
  }

  getID(): number {
    return this.id;
  }
}
