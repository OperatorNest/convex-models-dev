import { defineApp } from "convex/server";
import modelsDev from "@operatornest/convex-models-dev/convex.config.js";

const app = defineApp();
app.use(modelsDev);

export default app;
