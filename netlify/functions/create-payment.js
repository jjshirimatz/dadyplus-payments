
const crypto = require("node:crypto");

const AMOUNT = 4000;
const CURRENCY = "TZS";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  const reply = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod !== "POST") {
    return reply(405, {
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.ABLINER_API_KEY;
    const secret = process.env.ABLINER_WEBHOOK_SECRET;

    if (!apiKey || !secret) {
      return reply(500, {
        success: false,
        message: "Payment configuration missing"
      });
    }

    const input = JSON.parse(event.body || "{}");

    let phone = String(input.phone || "")
      .replace(/[\s-]/g, "");

    if (phone.startsWith("+255")) {
      phone = phone.slice(1);
    } else if (/^0[67]\d{8}$/.test(phone)) {
      phone = "255" + phone.slice(1);
    }

    if (!/^255[67]\d{8}$/.test(phone)) {
      return reply(400, {
        success: false,
        message: "Weka namba sahihi ya Tanzania."
      });
    }

    const reference =
      "DADY-" + crypto.randomUUID();

    const callbackUrl =
      "https://dadyplus-payments.netlify.app" +
      "/.netlify/functions/abliner-webhook";

    const body = JSON.stringify({
      amount: AMOUNT,
      method: "mobile",
      currency: CURRENCY,
      phone,
      reference,
      callback_url: callbackUrl
    });

    const timestamp = Math.floor(
      Date.now() / 1000
    ).toString();

    const signature = crypto
      .createHmac("sha256", secret)
      .update(timestamp + "." + body)
      .digest("hex");

    const response = await fetch(
      "https://abliner.net/api/v1/deposits",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Idempotency-Key": reference,
          "x-abliner-timestamp": timestamp,
          "x-abliner-signature": signature
        },
        body,
        signal: AbortSignal.timeout(20000)
      }
    );

    const result = await response.json();

    if (!response.ok || result.status !== "success") {
      return reply(response.ok ? 502 : response.status, {
        success: false,
        message: result.message ||
          "Imeshindikana kuanzisha malipo."
      });
    }

    return reply(200, {
      success: true,
      message: "Ombi la malipo limetumwa.",
      transaction_id: result.data?.id,
      reference,
      status: result.data?.status || "pending"
    });

  } catch (error) {
    console.error("Payment request error:", error.message);

    return reply(500, {
      success: false,
      message: "Tatizo la mfumo. Jaribu tena."
    });
  }
};
