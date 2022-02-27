import schema from "./schema";
import { handlerPath } from "@libs/handler-resolver";

export default {
  handler: `${handlerPath(__dirname)}/handler.main`,
  events: [
    {
      http: {
        method: "post",
        path: "hello",
        request: {
          schemas: {
            "application/json": schema,
          },
        },
      },
    },
    {
      schedule: {
        // Once at 3:15 PM UTC every day (7:15 AM PST).
        rate: ["cron(15 15 * * ? *)"],
        input: {
          name: "Mark Fowler",
        },
      },
    },
  ],
};
