import { z } from "zod";

import {
  CurrentContextSchema,
  GetCurrentContextInputSchema,
  UpdateTaskInputSchema,
  UpdateTaskResultSchema,
} from "@project-voyager/core";

export {
  CurrentContextSchema,
  UpdateTaskInputSchema,
  UpdateTaskResultSchema,
};

export const GetCurrentContextMcpInputSchema =
  GetCurrentContextInputSchema.default({});

// MCP permits a tools/call request to omit `arguments`. The default wrapper
// handles that case, while this shape hint lets SDK v1.29 advertise the two
// optional properties instead of an empty schema. Parsing still uses the
// default wrapper and the inner strict object.
type ZodSchemaWithShapeHint = {
  _zod: { def: { shape?: Record<string, z.ZodType> } };
};
(GetCurrentContextMcpInputSchema as unknown as ZodSchemaWithShapeHint)._zod.def.shape =
  GetCurrentContextInputSchema.shape;
