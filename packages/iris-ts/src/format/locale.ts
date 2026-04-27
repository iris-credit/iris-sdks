type LocaleSymbols = {
  decimalSymbol: string;
  groupSymbol: string;
  locale: string;
};

export type LocaleParts = LocaleSymbols & {
  value: string;
};

const _convertEnNumStrToLocale = (numStr: string, localSymbols: LocaleSymbols) => {
  return numStr
    .replaceAll(",", "#TEMP#")
    .replaceAll(".", localSymbols.decimalSymbol)
    .replaceAll("#TEMP#", localSymbols.groupSymbol);
};

export const getLocaleSymbols = (locale: string): LocaleSymbols => {
  let formatter: Intl.NumberFormat;
  const formatterOptions = {
    useGrouping: true,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  };

  try {
    formatter = new Intl.NumberFormat(locale, formatterOptions);
  } catch {
    formatter = new Intl.NumberFormat("en-US", formatterOptions);
  }

  const parts = formatter.formatToParts(12345.6);

  const decimalSymbol = parts.find((part) => part.type === "decimal")!.value;
  const groupSymbol = parts.find((part) => part.type === "group")!.value;

  return { decimalSymbol, groupSymbol, locale };
};

export const getEffectiveLocale = () => {
  if (typeof window !== "undefined") {
    try {
      const locale = navigator?.language || document?.documentElement?.lang || "en-US";
      new Intl.NumberFormat(locale);
      return locale;
    } catch {
      return "en-US";
    }
  }
  return "en-US";
};

export const convertNumStrToLocal = (numStr: string, from: string, to: string) => {
  const fromSymbols = getLocaleSymbols(from);
  const toSymbols = getLocaleSymbols(to);

  return numStr
    .replaceAll(fromSymbols.groupSymbol, "#GROUP#")
    .replaceAll(fromSymbols.decimalSymbol, "#DECIMAL#")
    .replaceAll("#GROUP#", toSymbols.groupSymbol)
    .replaceAll("#DECIMAL#", toSymbols.decimalSymbol);
};

export const convertNumStrFromEffectiveTo = (numStr: string, to: string) => {
  const from = getEffectiveLocale();
  return convertNumStrToLocal(numStr, from, to);
};

export const getEnUSNumberToLocalParts = (numStr: string, locale?: string): LocaleParts => {
  const _locale = locale || getEffectiveLocale();
  const localSymbols = getLocaleSymbols(_locale);
  const value = _convertEnNumStrToLocale(numStr, localSymbols);

  return { ...localSymbols, value };
};
