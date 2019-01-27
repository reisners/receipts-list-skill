// Receipts List: Alexa Skill Lambda function

const Alexa = require('ask-sdk');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
const { google } = require('googleapis');

// Handlers ===================================================================================

const LaunchHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'LaunchRequest';
    },
    async handle(handlerInput) {
        console.log("LaunchRequest");
        const responseBuilder = handlerInput.responseBuilder;
        try {
            const attributes = await retrieveAndValidateAttributes(handlerInput);
            console.log("spreadsheetId="+attributes.spreadsheetId);
        
            var response = "Willkommen zur Belegerfassung mit " + SKILL_NAME+".";
            if (attributes.spreadsheetTitle) {
                response += " Ich habe das Spreadsheet "+attributes.spreadsheetTitle+" angelegt.";
            }
            return responseBuilder
                .speak(response)
                .reprompt(REPROMPT)
                .getResponse();
        } catch (e) {
            if (e === ERROR_MISSING_ACCOUNT_LINKING) {
                return responseBuilder
                    .speak("Zur Belegerfassung aktiviere bitte zuerst die Kontoverknüpfung.")
                    .withLinkAccountCard()
                    .getResponse();
            } else {
                throw e;
            }
        }
    }
};

const SaveReceiptHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'SaveReceipt';
    },
    async handle(handlerInput) {
        console.log("SaveReceipt dialogState="+handlerInput.requestEnvelope.request.dialogState);
        const responseBuilder = handlerInput.responseBuilder;
        try {
            const attributes = await retrieveAndValidateAttributes(handlerInput);
            console.log("spreadsheetId="+attributes.spreadsheetId);
            const request = handlerInput.requestEnvelope.request;
            const receipt = buildReceipt(request);
            const oAuth2Client = createOAuthClient(handlerInput);
            var response = "";
            if (attributes.spreadsheetTitle) {
                response += "Ich habe das Spreadsheet "+attributes.spreadsheetTitle+" angelegt. ";
            }
            response += await updateSheet(oAuth2Client, attributes.spreadsheetId, receipt)
            console.log("spreadsheet updated");
            return responseBuilder
                .speak(response+" "+ASK_FOR_MORE)
                .withShouldEndSession(false)
                .getResponse();
        } catch (e) {
            if (e === ERROR_MISSING_ACCOUNT_LINKING) {
                return responseBuilder
                    .speak("Zur Belegerfassung aktiviere bitte zuerst die Kontoverknüpfung.")
                    .withLinkAccountCard()
                    .getResponse();
            } else {
                throw e;
            }
        }
    }
};

const YesHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'Yes';
    },
    async handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;
        return responseBuilder.withShouldEndSession(false).getResponse();
    }
}

const NoHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'No';
    },
    async handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;
        return responseBuilder.speak("Bis zum nächsten Mal!").getResponse();
    }
}

const TerminationHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && (request.intent.name === 'AMAZON.StopIntent' || request.intent.name === 'AMAZON.CancelIntent');
    },
    async handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;
        return responseBuilder.speak("Bis zum nächsten Mal!").getResponse();
    }
}

const SessionEndedHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'SessionEndedRequest';
    },
    async handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

        return handlerInput.responseBuilder.getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    async handle(handlerInput, error) {
        const request = handlerInput.requestEnvelope.request;

        console.log(`Error handled: ${error.message}`);
        console.log(` Original request was ${JSON.stringify(request, null, 2)}\n`);

        return handlerInput.responseBuilder
            .speak('Bei der Belegerfassung ist ein Fehler aufgetreten. Die Session wird beendet.')
            .getResponse();
    }
};

const HelpHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.HelpIntent';
    },
    async handle(handlerInput, error) {
        const request = handlerInput.requestEnvelope.request;

        return handlerInput.responseBuilder
            .speak(HELP)
            .withShouldEndSession(false)
            .getResponse();
    }
};

const FallbackHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.FallbackIntent';
    },
    async handle(handlerInput, error) {
        const request = handlerInput.requestEnvelope.request;

        return handlerInput.responseBuilder
            .speak("Das habe ich leider nicht verstanden. Du kannst mich um Hilfe bitten.")
            .withShouldEndSession(false)
            .getResponse();
    }
};


// 2. Constants

const SKILL_NAME = 'Receipts List';

const TITLE = SKILL_NAME;

const TABLE_NAME = 'receipts-list-spreadsheet-id-table';

const RANGE = 'A1:D';

const ASK_FOR_MORE = 'Möchtest du noch einen Beleg speichern?';

const REPROMPT = 'Sage zum Beispiel: Speichere Einkauf von Medikamenten bei Apotheke am letzten Samstag für vier Euro.';

const HELP = 'Mit Receipts List speichere ich die Einkaufsbelege, die du mir diktierst, in einem Google Spreadsheet ab. Ich lege dieses Spreadsheet für dich in deinem Google Drive an. Um nun einen Beleg abzuspeichern, '+REPROMPT;

const ERROR_MISSING_ACCOUNT_LINKING = 'ErrorMissingAccountLinking';

// 3. Helper Functions ==========================================================================

async function retrieveAndValidateAttributes(handlerInput) {
    const oAuth2Client = createOAuthClient(handlerInput);

    const attributesManager = handlerInput.attributesManager;
    const attributes = await retrieveAttributes(attributesManager, oAuth2Client);
    if (!attributes.spreadsheetId) {
        throw new Error("should not occur");
    }
    console.log("now validating spreadsheet "+attributes.spreadsheetId);
    try {
        await validateSpreadsheetId(oAuth2Client, TITLE, attributes.spreadsheetId);
    } catch (err) {
        console.log("validation of spreadsheet "+attributes.spreadsheetId+" failed: ", err);
        // the spreadsheet with spreadsheetId is broken
        // remove the spreadsheetId from session and persistent attributes
        attributesManager.setSessionAttributes({});
        attributesManager.setPersistentAttributes({});
        await attributesManager.savePersistentAttributes();
        // now start over (builing a fresh spreadsheet)
        return retrieveAndValidateAttributes(handlerInput);
    }

    return attributes;
}

async function retrieveAttributes(attributesManager, oAuth2Client) {
    const sessionAttributes = attributesManager.getSessionAttributes();

    if (sessionAttributes.spreadsheetId) {
        console.log("found sessionAttributes.spreadsheetId="+sessionAttributes.spreadsheetId);
        return sessionAttributes;
    }

    const attributes = await attributesManager.getPersistentAttributes() || {};
    console.log("retrieved persistent attributes: "+JSON.stringify(attributes));

    if (!attributes.spreadsheetId) {
        console.log("no spreadsheetId found - building new spreadsheet");
        attributes.spreadsheetTitle = TITLE + " " + timestamp();
        attributes.spreadsheetId = await buildSpreadsheet(oAuth2Client, attributes.spreadsheetTitle);
        const newSessionAttributes = { spreadsheetId: attributes.spreadsheetId };
        attributesManager.setSessionAttributes(newSessionAttributes);
        attributesManager.setPersistentAttributes(newSessionAttributes);
        await attributesManager.savePersistentAttributes();
        console.log("session attributes persisted: "+JSON.stringify(newSessionAttributes));
    } else {
        console.log("got spreadsheetId "+attributes.spreadsheetId);
    }

    return attributes;
}

function timestamp() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0"+(d.getMonth()+1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

function createOAuthClient(handlerInput) {
    const session = handlerInput.requestEnvelope.session;
    if (!session.user.accessToken) {
        throw ERROR_MISSING_ACCOUNT_LINKING;
    }
    const accessToken = session.user.accessToken;
    const oAuth2Client = new google.auth.OAuth2();
    oAuth2Client.setCredentials({access_token: accessToken});
    return oAuth2Client;
}

const getCircularReplacer = () => {
    const seen = new WeakSet();
    return (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return;
        }
        seen.add(value);
      }
      return value;
    };
  };

function buildReceipt(request) {
    const shop = extractSlotValue(request.intent.slots.SHOP);
    const date = request.intent.slots.DATE.value;
    const category = extractSlotValue(request.intent.slots.CATEGORY);

    const amount = request.intent.slots.AMOUNT_EUROS.value ? parseFloat(request.intent.slots.AMOUNT_EUROS.value) : 0;

    console.log("amount="+amount);

    return {
        date: date,
        shop: shop,
        amount: amount,
        category: category
    };
}

async function validateSpreadsheetId(oAuth2Client, title, spreadsheetId) {
    await readRange(oAuth2Client, spreadsheetId);
    console.log("validated spreadsheet "+spreadsheetId);
}

async function buildSpreadsheet(oAuth2Client, title) {
    console.log("buildSpreadsheet(oAuth2Client,"+title+")");
    const spreadsheetId = await createSpreadsheet(oAuth2Client, title);
    console.log("created spreadsheetId="+spreadsheetId);
    await writeSheetHeader(oAuth2Client, spreadsheetId);
    console.log("header written");
    return spreadsheetId;
}

async function createSpreadsheet(oAuth2Client, title) {
    return new Promise( (resolve, reject) =>{
        const sheets = google.sheets('v4');
        const resource = {
            properties: {
              title: title
            }
        };
        const request = {
            resource,
            fields: 'spreadsheetId',
            auth: oAuth2Client
        };          
        sheets.spreadsheets.create(request, (err, response) => {
            if (err) {
                reject(err);
            } else {
                console.log("createSpreadsheet="+response.data.spreadsheetId);
                resolve(response.data.spreadsheetId);
            }
        })        
    })
}

async function writeSheetHeader(oAuth2Client, spreadsheetId) {
    console.log("writeSheetHeader(oAuth2Client,"+spreadsheetId+")");
    return appendRecord(oAuth2Client, spreadsheetId, ["Date", "Shop", "Amount", "Category"]);
}

async function updateSheet(oAuth2Client, spreadsheetId, receipt) {
    console.log("updateSheet("+JSON.stringify(receipt)+")");
    const receiptRecord = [receipt.date, receipt.shop, receipt.amount, receipt.category];
    await appendRecord(oAuth2Client, spreadsheetId, receiptRecord);
    return "Ich habe "+receipt.date+" "+receipt.shop+" "+receipt.amount+" euro "+receipt.category+" gespeichert.";
}

function readRange(oAuth2Client, spreadsheetId) {
    var request = {
        spreadsheetId: spreadsheetId,
        range: RANGE+'1',
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
        auth: oAuth2Client,
      };
    
    return new Promise( (resolve, reject) => {
        const sheets = google.sheets('v4');
        sheets.spreadsheets.values.get(request, function(err, response) {
            if (err) {
                console.log('an error occured');
                console.error(err);
                reject(err);
            } else {
                console.log('range read');
                resolve(response);
            }
        });
    });
}

function appendRecord(oAuth2Client, spreadsheetId, record) {
    console.log("appendRecord(oAuth2Client,"+spreadsheetId+","+JSON.stringify(record)+")");
    return new Promise( (resolve, reject) => {
        const sheets = google.sheets('v4');
        sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: RANGE,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [
                record
                ]
            },
            auth: oAuth2Client
        }, (err, result) => {
            console.log("appendRecord callback invoked err="+err);
            if (err) {
                // Handle error.
                console.log("an error occurred");
                console.log(err);
                reject(err);
            } else {
                console.log("record appended");
                resolve(result);
            }
        });
        console.log("append request sent");  
    });
}

function extractSlotValue(slot) {
    console.log("slot="+JSON.stringify(slot));
    return slot.resolutions.resolutionsPerAuthority[0].values ? slot.resolutions.resolutionsPerAuthority[0].values[0].value.name : slot.value;
}

// 4. Export =====================================================================================

//const skillBuilder = Alexa.SkillBuilders.custom();
const skillBuilder = Alexa.SkillBuilders.standard();

exports.handler = skillBuilder
    .addRequestHandlers(
        LaunchHandler,
        SaveReceiptHandler,
        YesHandler,
        NoHandler,
        TerminationHandler,
        HelpHandler,
        SessionEndedHandler,
        FallbackHandler
    )
    .addErrorHandlers(ErrorHandler)
    .withDynamoDbClient()
    .withTableName(TABLE_NAME)
    .withAutoCreateTable(true)
    .lambda();