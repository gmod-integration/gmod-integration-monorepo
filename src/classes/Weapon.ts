import { WeaponInput, WeaponSchema } from '../schemas/WeaponSchema.js';

export class Weapon {
  public readonly class: string;
  public readonly printName: string;

  private constructor(data: WeaponInput) {
    WeaponSchema.parse(data);
    this.class = data.class;
    this.printName = data.printName;
  }

  public static from(data: unknown): Weapon {
    return new Weapon(data as WeaponInput);
  }
}
