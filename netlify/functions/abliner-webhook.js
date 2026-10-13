
const crypto = require("node:crypto");

exports.handler = async (event) => {
  const reply = (statusCode, data) => ({
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  });

  if (event.httpMethod !== "POST") {
    return reply(405, {
      success: false,
      message: "Method not allowed"
    });
  }

  const secret = process.env.ABLINER_WEBHOOK_SECRET;

  if (!secret) {
    return reply(500, {
      success: false,
      message: "Webhook configuration missing"
    });
  }

  const headers = event.headers || {};

  const timestamp = headers["x-webhook-timestamp"];
  const signature = headers["x-webhook-signature"];

  if (!timestamp || !signature) {
    return reply(401, {
      success: false,
      message: "Missing signature"
    });
  }

  const time = Number(timestamp);

  if (
    !Number.isSafeInteger(time) ||
    Math.abs(Date.now() / 1000 - time) > 300
  ) {
    return reply(401, {
      success: false,
      message: "Invalid timestamp"
    });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : Buffer.from(event.body || "", "utf8");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(Buffer.concat([
      Buffer.from(timestamp + ".", "utf8"),
      rawBody
    ]))
    .digest("hex");

  const received = String(signature).trim();

  if (!/^[a-f0-9]{64}$/i.test(received)) {
    return reply(401, {
      success: false,
      message: "Invalid signature"
    });
  }

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");

  if (
    a.length !== b.length ||
    !crypto.timingSafeEqual(a, b)
  ) {
    return reply(401, {
      success: false,
      message: "Signature verification failed"
    });
  }

  let payload;

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return reply(400, {
      success: false,
      message: "Invalid JSON"
    });
  }

  const data = payload.data || {};

  if (
    !payload.id ||
    !data.id ||
    data.type !== "deposit"
  ) {
    return reply(400, {
      success: false,
      message: "Invalid payment event"
    });
  }

  if (
    payload.event === "transaction.completed" &&
    data.status === "completed"
  ) {
    if (
      Number(data.amount) !== 4000 ||
      data.currency !== "TZS"
    ) {
      return reply(400, {
        success: false,
        message: "Payment amount mismatch"
      });
    }

    console.log("Verified completed event", {
      eventId: payload.id,
      transactionId: data.id,
      reference: data.customer_reference
    });

    // Next step:
    // Match this transaction against a saved order,
    // check its reference and expected amount,
    // and record completion in persistent storage.
  }

  if (
    payload.event === "transaction.failed" &&
    data.status === "failed"
  ) {
    console.log("Verified failed event", {
      eventId: payload.id,
      transactionId: data.id
    });
  }

  return reply(200, {
    received: true
  });
};
