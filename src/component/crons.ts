import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

crons.interval("sync models.dev catalog", { hours: 1 }, internal.sync.tick, {});

export default crons;
