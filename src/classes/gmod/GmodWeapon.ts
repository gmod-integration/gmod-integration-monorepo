import { GmodWeaponInput, GmodWeaponSchema } from '../../schemas/gmod/GmodWeaponSchema.js';

export class GmodWeapon {
  public readonly class: string;
  public readonly printName: string;

  private constructor(data: GmodWeaponInput) {
    const parsed = GmodWeaponSchema.parse(data);
    this.class = parsed.class;
    this.printName = parsed.printName;
  }

  public static from(data: unknown): GmodWeapon {
    return new GmodWeapon(data as GmodWeaponInput);
  }
}
