import type { AWS } from "@serverless/typescript";

import hello from "@functions/hello";

const serverlessConfiguration: AWS = {
  service: "lambda-dynamodb-ses-reminder",
  frameworkVersion: "3",
  plugins: ["serverless-esbuild", "serverless-deployment-bucket"],
  provider: {
    deploymentBucket: {
      name: "dev-serenity-mh-apps",
      serverSideEncryption: "aws:kms"
    },
    name: "aws",
    runtime: "nodejs14.x",
    region: "us-east-1",
    apiGateway: {
      minimumCompressionSize: 1024,
      shouldStartNameWithService: true,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      NODE_OPTIONS: "--enable-source-maps --stack-trace-limit=1000",
    },
    iam: {
      role: "standardLambdaRole0",
    },
  },
  functions: { hello },
  package: { individually: true },
  custom: {
    stage: "${env:ENVIRONMENT, 'dev'}",
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      exclude: ["aws-sdk"],
      target: "node14",
      define: { "require.resolve": undefined },
      platform: "node",
      concurrency: 10,
    },
  },
  resources: {
    Resources: {
      standardLambdaRole0: {
        Type: "AWS::IAM::Role",
        Properties: {
          Path: "/",
          RoleName: "${self:service}-remindersvc-${self:custom.stage}-role",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: {
                  Service: ["events.amazonaws.com", "lambda.amazonaws.com"],
                },
                Action: ["sts:AssumeRole"],
              },
            ],
          },
          Policies: [
            {
              PolicyName:
                "${self:service}-remindersvc-${self:custom.stage}-policy",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Resource: "*",
                    Action: ["ses:SendEmail", "ses:SendRawEmail"],
                  },
                  {
                    Effect: "Allow",
                    Resource: "*",
                    Action: [
                      "logs:CreateLogGroup",
                      "logs:CreateLogStream",
                      "logs:PutLogEvents",
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    },
  },
};

module.exports = serverlessConfiguration;
