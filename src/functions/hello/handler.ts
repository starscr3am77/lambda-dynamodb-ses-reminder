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
  CreateTemplateResponse,
  SendEmailCommand,
  SendEmailCommandInput,
  SESClient,
} from "@aws-sdk/client-ses";
import { marshall } from "@aws-sdk/util-dynamodb";

import schema from "./schema";

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const sesClient = new SESClient({ region: process.env.AWS_REGION });

const EXPIRATION_DAYS_THRESHOLD = 30;

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

async function getAccountName(uid) {
  //console.log("aid: " + uid);
  const params: QueryCommandInput = {
    TableName: "Accounts",
    IndexName: "UID-index",
    KeyConditionExpression: "#uid = :uid",
    ExpressionAttributeNames: {
      "#uid": "UID",
    },
    ExpressionAttributeValues: marshall({
      ":uid": uid
    }),
  };
  try {
    const results = await client.send(new QueryCommand(params));
    return results;
  } catch (err) {
    return err;
  }
}

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
    //console.info(`Approvals expiring: ${JSON.stringify(approvalsExpiring)}`);

    // Then send to SES for any found close to expiring.
    await asyncForEach(
      approvalsExpiring,
      //const acc_name = await getAccountName(approvalsExpiring.UID.S);
      async (approval: { [key: string]: AttributeValue }) => {
        const acc_name = await getAccountName(approval.AID.S);
        //console.log(acc_name);
        //console.log(acc_name.Items[0].AccountName.S);
        //console.log(approval);

        //var sesParams = {};

        switch (approval.ApprovalFacility.S) {
          case "Trail, BC":
            //console.log("Trail, BC");
            var sesParams: SendEmailCommandInput = {
              Destination: {
                ToAddresses: ["shaunn@retrievtech.com"],
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
              Source: "no-reply@retrievtech.cloud",
            };
            break;
          default:
            //console.log("Lancaster, OH");
            var sesParams: SendEmailCommandInput = {
              Destination: {
                ToAddresses: ["shaunn@retrievtech.com"],
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
              Source: "no-reply@retrievtech.cloud",
            };
        }     

        sesParams.Message.Body.Html.Data = //`<html><body>Account: ${acc_name.Items[0].AccountName.S}<br/>Facility: ${approval.ApprovalFacility.S}<br/>Author: ${approval.Author.S}</br>Expires: ${approval.ApprovalExpires.S}</body></html>` //JSON.stringify(approval)
          sesParams.Message.Body.Html.Data.replace(
            "APPROVAL_PLACEHOLDER",
            //JSON.stringify(approval)
            `<html><body>Account: ${acc_name.Items[0].AccountName.S}<br/>Facility: ${approval.ApprovalFacility.S}<br/>Author: ${approval.Author.S}</br>Expires: ${approval.ApprovalExpires.S}</body></html>`
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
