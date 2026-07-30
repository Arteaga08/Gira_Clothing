import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { getOverview } from "../services/overviewService.js";
import { getTimeseriesStats } from "../services/timeseriesStatsService.js";

/**
 * Overview controller — orchestrates req/res only, never touches models.
 */
const overview = asyncHandler(async (req: Request, res: Response) => {
  const data = await getOverview(req.query);
  sendResponse(res, 200, "Resumen obtenido correctamente.", data);
});

const timeseries = asyncHandler(async (req: Request, res: Response) => {
  const data = await getTimeseriesStats(req.query);
  sendResponse(res, 200, "Serie de estadísticas obtenida correctamente.", data);
});

export { overview, timeseries };
