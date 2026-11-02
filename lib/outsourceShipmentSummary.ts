type OutsourceDispatch = { outsourceSentDate?: string | null };

/** Count each displayed outsourced process by its registered dispatch date. */
export function summarizeOutsourceShipments(processes: OutsourceDispatch[]) {
  const shipped = processes.filter(process => Boolean(process.outsourceSentDate?.trim())).length;
  return { shipped, unshipped: processes.length - shipped };
}
