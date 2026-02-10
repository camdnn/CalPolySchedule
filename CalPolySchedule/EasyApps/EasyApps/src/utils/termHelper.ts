// src/utils/termHelper.ts

export interface Term {
  display: string; // "Fall 2025"
  code: string; // "202509"
}

// Optional: Generate terms with database codes
export const generateTerms = (): Term[] => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const quarterCodes: Record<string, string> = {
    Fall: "09",
    Winter: "01",
    Spring: "03",
    Summer: "06",
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

    terms.push({
      display: `${quarter} ${year}`,
      code: `${year}${quarterCodes[quarter]}`,
    });
  }

  return terms;
};

// Helper to convert term display to code
export const termToCode = (termDisplay: string): string => {
  const [quarter, year] = termDisplay.split(" ");
  const quarterCodes: Record<string, string> = {
    Fall: "09",
    Winter: "01",
    Spring: "03",
    Summer: "06",
  };
  return `${year}${quarterCodes[quarter]}`;
};
