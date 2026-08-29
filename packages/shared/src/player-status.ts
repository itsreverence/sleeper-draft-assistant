export type SleeperDepthChartStatus = {
  depthChartPosition: string | null;
  depthChartOrder: number | null;
};

export function sleeperDepthChartLabel(status: SleeperDepthChartStatus | null | undefined): string | null {
  const position = status?.depthChartPosition?.trim().toUpperCase() || null;
  const order = status?.depthChartOrder ?? null;
  if (position && order) return `${position}${order}`;
  if (position) return position;
  return order ? `#${order}` : null;
}
