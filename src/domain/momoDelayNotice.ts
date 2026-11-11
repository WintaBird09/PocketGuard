export function momoDelayNotice(transactionDate: string | null, today: string): string | null {
  if (
    !transactionDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) ||
    transactionDate === today
  ) {
    return null;
  }
  return `This Mobile Money transaction was effected on ${transactionDate}, not today. It will be saved with its original date, ${transactionDate}.`;
}
