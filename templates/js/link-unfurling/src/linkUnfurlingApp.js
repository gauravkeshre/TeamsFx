const { TeamsActivityHandler, CardFactory } = require("botbuilder");
const helloWorldCard = require("./adaptiveCards/helloWorldCard.json");

class LinkUnfurlingApp extends TeamsActivityHandler {
  // Link Unfurling.
  handleTeamsAppBasedLinkQuery(context, query) {
    const previewCard = CardFactory.thumbnailCard("Preview Card", query.url, [
      "https://raw.githubusercontent.com/microsoft/botframework-sdk/master/icon.png",
    ]);

    const attachment = { ...CardFactory.adaptiveCard(helloWorldCard), preview: previewCard };

    return {
      composeExtension: {
        type: "result",
        attachmentLayout: "list",
        attachments: [attachment],
        suggestedActions: {
          actions: [
            {
              title: "default",
              type: "setCachePolicy",
              value: '{"type":"no-cache"}',
            },
          ],
        },
      },
    };
  }

  // Zero Install Link Unfurling
  handleTeamsAnonymousAppBasedLinkQuery(context, query) {
    // When the returned card is an adaptive card, the previewCard property of the attachment is required.
    const previewCard = CardFactory.thumbnailCard("Preview Card", query.url, [
      "https://raw.githubusercontent.com/microsoft/botframework-sdk/master/icon.png",
    ]);

    const attachment = { ...CardFactory.adaptiveCard(helloWorldCard), preview: previewCard };

    return {
      composeExtension: {
        type: "result",
        attachmentLayout: "list",
        attachments: [attachment],
        suggestedActions: {
          actions: [
            {
              title: "default",
              type: "setCachePolicy",
              value: '{"type":"no-cache"}',
            },
          ],
        },
      },
    };
  }
}
module.exports.LinkUnfurlingApp = LinkUnfurlingApp;
