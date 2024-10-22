import { BaseClass } from './BaseClass.js';

export class Team extends BaseClass {
  public id: any;
  public name: any;

  constructor(obj: any) {
    super();
    this.id = obj.id;
    this.name = obj.name;
  }
}
