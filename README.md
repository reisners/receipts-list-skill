# receipts-list-skill

Steps to deploy this Alexa skill:

 1. Add credentials to ~/.aws/credentials under profile claudia
 1. Add region eu-west-1 to ~/.aws/config under profile claudia (this is necessary to create the DynamoDB table)
 1. deploy the lambda function:

initial create:

```AWS_PROFILE=claudia claudia create --region eu-west-1 --handler skill.handler --timeout 10 --version skill```

later update:

```AWS_PROFILE=claudia AWS_SDK_LOAD_CONFIG=true claudia update --version skill```

