exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return jsonResponse(500, { error: "Missing MERCADO_PAGO_ACCESS_TOKEN" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const title = String(payload.title || "Torneo Black Dog").slice(0, 120);
  const unitPrice = Number(payload.unit_price || payload.unitPrice || 0);
  const quantity = Number.parseInt(payload.quantity || 1, 10);

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return jsonResponse(400, { error: "unit_price must be greater than 0" });
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://torneoarcade.netlify.app";
  const preferenceBody = {
    items: [
      {
        title,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit_price: unitPrice,
        currency_id: "ARS",
      },
    ],
    back_urls: {
      success: `${siteUrl}/viewer.html?payment=success`,
      pending: `${siteUrl}/viewer.html?payment=pending`,
      failure: `${siteUrl}/viewer.html?payment=failure`,
    },
    auto_return: "approved",
    metadata: {
      ranking_id: String(payload.rankingId || "black-dog"),
      user_uid: String(payload.userUid || ""),
    },
  };

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferenceBody),
  });

  const data = await response.json();
  if (!response.ok) {
    return jsonResponse(response.status, { error: "Mercado Pago error", details: data });
  }

  return jsonResponse(200, {
    id: data.id,
    init_point: data.init_point,
    sandbox_init_point: data.sandbox_init_point,
  });
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
