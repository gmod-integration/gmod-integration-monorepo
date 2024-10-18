import { BaseClass } from './BaseClass.js';

export class Team extends BaseClass {
  private id: any;
  private name: any;

  constructor(obj: any) {
    super();
    this.id = obj.id;
    this.name = obj.name;
  }
}
