// Receipts List: Alexa Skill Lambda function

const Alexa = require('ask-sdk-core');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
const { google } = require('googleapis');


// Handlers ===================================================================================

const LaunchHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const responseBuilder = handlerInput.responseBuilder;

        const requestAttributes = attributesManager.getRequestAttributes();
        const speechOutput = `${requestAttributes.t('WELCOME')} ${requestAttributes.t('HELP')}`;
        return responseBuilder
            .speak(speechOutput)
            .reprompt(speechOutput)
            .getResponse();
    },
};

const SaveReceiptHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'SaveReceipt';
    },
    handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;

        if (request.user.accessToken) {
            const accessToken = request.user.accessToken;
            const shop = extractSlotValue(request.intent.slots.SHOP);
            const date = request.intent.slots.DATE.value;
            const category = extractSlotValue(request.intent.slots.CATEGORY);
    
            const amount_euros = request.intent.slots.AMOUNT_EUROS.value ? parseInt(request.intent.slots.AMOUNT_EUROS.value) : 0;
            const amount_cents = request.intent.slots.AMOUNT_CENTS.value ? parseInt(request.intent.slots.AMOUNT_CENTS.value) : 0;
            const amount = amount_euros + amount_cents/100.0;
    
            console.log("amount_euros="+amount_euros+", amount_cents="+amount_cents+", amount="+amount);
    
            const oAuth2Client = new google.auth.OAuth2();
            oAuth2Client.setCredentials({access_token: accessToken});
          
            return updateSheet(oAuth2Client, date, shop, amount, category)
                .then(function(response) {
                    return responseBuilder.speak(response).getResponse();
                });
        } else {
            return responseBuilder.speak("Zur Belegerfassung aktiviere bitte zuerst die Kontoverknüpfung.").getResponse();
        }
    },
};

const AboutHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'AboutIntent';
    },
    handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const responseBuilder = handlerInput.responseBuilder;

        const requestAttributes = attributesManager.getRequestAttributes();

        return responseBuilder
            .speak(requestAttributes.t('ABOUT'))
            .getResponse();
    },
};

const HelpHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const responseBuilder = handlerInput.responseBuilder;

        const requestAttributes = attributesManager.getRequestAttributes();
        return responseBuilder
            .speak(requestAttributes.t('HELP'))
            .reprompt(requestAttributes.t('HELP'))
            .getResponse();
    },
};

const SessionEndedHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

        return handlerInput.responseBuilder.getResponse();
    },
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const request = handlerInput.requestEnvelope.request;

        console.log(`Error handled: ${error.message}`);
        console.log(` Original request was ${JSON.stringify(request, null, 2)}\n`);

        return handlerInput.responseBuilder
            .speak('Sorry, I can\'t understand the command. Please say again.')
            .reprompt('Sorry, I can\'t understand the command. Please say again.')
            .getResponse();
    },
};


// 2. Constants

const SKILL_NAME = 'Receipts List';

const spreadsheetId = '1vWmEGdj8VS0tfqwSl8WCbIPonpcjMsNKb7H0nWeMAAg';
const range = 'Bills!A2:D';

// 3. Helper Functions ==========================================================================

async function updateSheet(auth, date, shop, amount, category) {
    return new Promise( (resolve, reject) => {
        const sheets = google.sheets({version: 'v4', auth});
        sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [
                [date, shop, amount, category]
                ]
            },
        }, (err, result) => {
            if (err) {
                // Handle error.
                console.log(err);
                reject("Beim Speichern des Einkaufsbelegs ist ein Fehler aufgetreten.");
            } else {
                resolve("Ich habe "+shop+" "+date+" gespeichert.");
            }
        });  
    });
}
  
function extractSlotValue(slot) {
    console.log("slot="+JSON.stringify(slot));
    return slot.resolutions.resolutionsPerAuthority[0].values ? slot.resolutions.resolutionsPerAuthority[0].values[0].value.name : slot.value;
}

// 4. Export =====================================================================================

const skillBuilder = Alexa.SkillBuilders.custom();
exports.handler = skillBuilder
    .addRequestHandlers(
        LaunchHandler,
        SaveReceiptHandler,
        AboutHandler,
        HelpHandler,
        SessionEndedHandler
    )
    .addErrorHandlers(ErrorHandler)
    .lambda();