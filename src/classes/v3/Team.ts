import { BaseClass } from './BaseClass';

export class Team extends BaseClass {
  public id: any;
  public name: any;

  constructor(obj: any) {
    super();
    this.id = obj.id;
    this.name = obj.name;
  }
}
