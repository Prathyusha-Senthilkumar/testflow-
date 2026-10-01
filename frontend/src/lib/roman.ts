export function toRomanNumeral(value: number): string {
  if (value <= 0) return "";
  const numerals: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = value;
  let result = "";
  for (const [amount, symbol] of numerals) {
    while (remaining >= amount) {
      result += symbol;
      remaining -= amount;
    }
  }
  return result;
}

export function versionLabel(versionNumber: number): string {
  return versionNumber > 0 ? `Version ${toRomanNumeral(versionNumber)}` : "Draft";
}
