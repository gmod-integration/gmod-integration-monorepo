import { BaseClass } from './BaseClass';

export class CustomValues extends BaseClass {
  [key: string]: any;

  constructor(obj: any = {}) {
    super();
    const keys = Object.keys(obj);
    for (const key of keys) {
      this[key] = obj[key];
    }
  }

  isValid(): boolean {
    return true;
  }
}
