import { BaseClass } from './BaseClass.js';

export class Team extends BaseClass {
  constructor(obj = {}) {
    super();
    this.id = obj.id;
    this.name = obj.name;
  }
}
