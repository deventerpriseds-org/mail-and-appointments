import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { validateToken } from "../middleware/validateToken";
import { getAccountConfigTable } from "../storage/tableClient";
import { getMicrosoftMessages } from "../providers/microsoft";
import { getGoogleMessages } from "../providers/google";

// Returns recent emails from the folders/labels this account has selected
// (saved via POST /config). No selection → empty list.
async function getMessages(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const tokenCtx = validateToken(req);

    const table = await getAccountConfigTable();
    let selected: string[] = [];
    try {
      const entity = await table.getEntity<{ selectedInboxes: string }>(
        tokenCtx.provider,
        tokenCtx.accountId
      );
      selected = JSON.parse(entity.selectedInboxes ?? "[]");
    } catch {
      selected = [];
    }

    if (selected.length === 0) {
      return { status: 200, jsonBody: [] };
    }

    const messages =
      tokenCtx.provider === "microsoft"
        ? await getMicrosoftMessages(tokenCtx.accessToken, selected)
        : await getGoogleMessages(tokenCtx.accessToken, selected);

    context.log(`Fetched ${messages.length} messages for ${tokenCtx.accountId}`);
    return { status: 200, jsonBody: messages };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: 401, jsonBody: { error: message } };
  }
}

app.http("getMessages", {
  methods: ["GET"],
  route: "messages",
  authLevel: "anonymous",
  handler: getMessages,
});
