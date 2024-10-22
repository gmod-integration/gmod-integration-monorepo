export class BaseClass {
  [key: string]: any;

  isValid(): boolean {
    const keys = Object.keys(this);
    for (const key of keys) {
      if (this[key] instanceof Object) {
        if (!this[key].isValid()) {
          return false;
        }
      } else {
        if (this[key] === null || this[key] === undefined) {
          return false;
        }
      }
    }
    return true;
  }

  isValidGetInformations(): { [key: string]: any } {
    const keys = Object.keys(this);
    const result: { [key: string]: any } = {};
    for (const key of keys) {
      if (this[key] instanceof Object) {
        result[key] = this[key].isValidGetInformations();
      } else {
        result[key] = !!this[key];
      }
    }
    return result;
  }
}
