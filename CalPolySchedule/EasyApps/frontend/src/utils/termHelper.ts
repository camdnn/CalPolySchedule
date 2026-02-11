// src/utils/termHelper.ts

export interface Term {
  display: string; // "Fall 2025"
  code: string; // "2258" (PeopleSoft format: "2" + last2Year + quarterDigit)
}

// Optional: Generate terms with database codes
export const generateTerms = (): Term[] => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // PeopleSoft quarter digits: Winter=2, Spring=4, Summer=6, Fall=8
  const quarterCodes: Record<string, string> = {
    Winter: "2",
    Spring: "4",
    Summer: "6",
    Fall: "8",
  };

  const quarters = ["Winter", "Spring", "Summer", "Fall"];

  // Find current quarter index
  let startIndex = 0;
  if (currentMonth >= 0 && currentMonth < 3)
    startIndex = 0; // Winter
  else if (currentMonth >= 3 && currentMonth < 6)
    startIndex = 1; // Spring
  else if (currentMonth >= 6 && currentMonth < 8)
    startIndex = 2; // Summer
  else startIndex = 3; // Fall

  const terms: Term[] = [];

  for (let i = 0; i < 4; i++) {
    const quarterIndex = (startIndex + i) % 4;
    const quarter = quarters[quarterIndex];
    const yearsAhead = Math.floor((startIndex + i) / 4);
    const year = currentYear + yearsAhead;

    // PeopleSoft format: "2" + last 2 digits of year + quarter digit
    // e.g. Winter 2026 → "2" + "26" + "2" → "2262"
    const lastTwo = year.toString().slice(-2);
    terms.push({
      display: `${quarter} ${year}`,
      code: `2${lastTwo}${quarterCodes[quarter]}`,
    });
  }

  return terms;
};

// Helper to convert term display to code
export const termToCode = (termDisplay: string): string => {
  const [quarter, year] = termDisplay.split(" ");
  const quarterCodes: Record<string, string> = {
    Winter: "2",
    Spring: "4",
    Summer: "6",
    Fall: "8",
  };
  const lastTwo = year.slice(-2);
  return `2${lastTwo}${quarterCodes[quarter]}`;
};
