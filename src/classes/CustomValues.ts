import { CustomValuesInput, CustomValuesSchema } from '../schemas/CustomValuesSchema.js';

export class CustomValues {
  [key: string]: any;

  private constructor(data: CustomValuesInput) {
    const { customValues } = CustomValuesSchema.parse(data);

    for (const key in customValues) {
      if (Object.prototype.hasOwnProperty.call(customValues, key)) {
        this[key] = customValues[key];
      }
    }
  }

  public static from(data: unknown): CustomValues {
    return new CustomValues(data as CustomValuesInput);
  }
}
