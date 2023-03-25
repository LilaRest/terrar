// Function to concat two arrays and remove duplicates
export const concatDistinct = (arr1: string[], arr2: string[]): string[] => [...new Set([...arr1, ...arr2])];