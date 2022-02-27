import type { ValidatedEventAPIGatewayProxyEvent } from "@libs/api-gateway";
import { formatJSONResponse } from "@libs/api-gateway";
import { middyfy } from "@libs/lambda";
import {
  AttributeValue,
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
} from "@aws-sdk/client-dynamodb";
import {
  SendEmailCommand,
  SendEmailCommandInput,
  SESClient,
} from "@aws-sdk/client-ses";
import { marshall } from "@aws-sdk/util-dynamodb";

import schema from "./schema";

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const sesClient = new SESClient({ region: process.env.AWS_REGION });

const EXPIRATION_DAYS_THRESHOLD = 50;

/**
 * Calculate difference in days between two dates.
 *
 * @param date1
 * @param date2
 * @returns
 */
const dateDiff = (date1: Date, date2: Date) => {
  const diffInTime = date2.getTime() - date1.getTime();
  return Math.floor(diffInTime / (1000 * 3600 * 24));
};

/**
 * More easily control the async/await behavior of AWS service calls.
 *
 * @param array
 * @param callback
 */
const asyncForEach = async (
  array: { [key: string]: AttributeValue }[],
  callback: Function
) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};

/**
 * Entry point for Lambda invocation.
 *
 * @param event
 * @returns
 */
const hello: ValidatedEventAPIGatewayProxyEvent<typeof schema> = async (
  event
) => {
  const now = new Date();
  const approvalsExpiring: { [key: string]: AttributeValue }[] = [];
  const dbParams: QueryCommandInput = {
    TableName: "Approvals",
    IndexName: "ApprovalStatus-ApprovalApproved-index",
    KeyConditionExpression: "#status = :status",
    ExpressionAttributeNames: {
      "#status": "ApprovalStatus",
    },
    ExpressionAttributeValues: marshall({
      ":status": "Approved",
    }),
  };

  const sesParams: SendEmailCommandInput = {
    Destination: {
      ToAddresses: ["mark@causeandasweat.com", "shaunn@retrievtech.com"],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: "Approval expiring: APPROVAL_PLACEHOLDER",
        },
        Text: {
          Charset: "UTF-8",
          Data: "Approval expiring: APPROVAL_PLACEHOLDER",
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: "Approval is nearing expiration",
      },
    },
    Source: "mark@causeandasweat.com",
  };

  try {
    // Determine which approvals are nearing expiration.
    const results = await client.send(new QueryCommand(dbParams));
    results.Items.forEach((element) => {
      const expiresAt = new Date(element.ApprovalExpires.S);
      const diffInDays = dateDiff(now, expiresAt);

      if (diffInDays <= EXPIRATION_DAYS_THRESHOLD) {
        approvalsExpiring.push(element);
      }
    });
    console.info(`Approvals expiring: ${JSON.stringify(approvalsExpiring)}`);

    // Then send to SES for any found close to expiring.
    await asyncForEach(
      approvalsExpiring,
      async (approval: { [key: string]: AttributeValue }) => {
        sesParams.Message.Body.Html.Data =
          sesParams.Message.Body.Html.Data.replace(
            "APPROVAL_PLACEHOLDER",
            JSON.stringify(approval)
          );
        sesParams.Message.Body.Text.Data =
          sesParams.Message.Body.Text.Data.replace(
            "APPROVAL_PLACEHOLDER",
            JSON.stringify(approval)
          );

        console.info(`Mail ready to send: ${JSON.stringify(sesParams)}`);
        const emailSent = await sesClient.send(new SendEmailCommand(sesParams));
        console.info(`Mail was sent: ${JSON.stringify(emailSent)}`);
      }
    );
  } catch (err) {
    console.error(err);
  }

  return formatJSONResponse({
    message: `Hello ${
      // @ts-ignore
      event?.body?.name || event.name
    }, welcome to the exciting Serverless world!`,
    event,
  });
};

export const main = middyfy(hello);
