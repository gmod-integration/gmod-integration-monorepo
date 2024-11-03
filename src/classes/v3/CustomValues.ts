import { BaseClass } from './BaseClass.js';

export interface CustomValuesInterface {
  [key: string]: string;
}

export class CustomValues extends BaseClass implements CustomValuesInterface {
  [key: string]: any;

  constructor(obj: CustomValuesInterface) {
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
